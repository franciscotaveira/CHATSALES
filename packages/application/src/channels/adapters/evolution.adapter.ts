import type {
  ChannelSendResult,
  IChannelAdapter,
  OutboundSendParams,
} from "./channel-adapter.interface";
import type { ISigningSecretResolver } from "../services/signature-verification.service";
import {
  validateMediaUrl,
  detectMediaType,
  hasAlternativeIpFormat,
  getInternalAllowedHosts,
} from "../security/ssrf-guard";

export interface EvolutionAdapterOptions {
  readonly baseUrl?: string;
  readonly defaultApiKey?: string;
  readonly defaultInstance?: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
  readonly allowLocalTest?: boolean;
}

/**
 * Validates a target Evolution API base URL against Server-Side Request Forgery (SSRF).
 */
export function validateEvolutionBaseUrl(urlStr: string, allowLocalTest = false): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`SSRF_VIOLATION: Invalid Evolution API baseUrl: '${urlStr}'`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("SSRF_VIOLATION: Evolution API baseUrl must not contain embedded user credentials");
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();

  if (hasAlternativeIpFormat(urlStr) || hasAlternativeIpFormat(host)) {
    throw new Error(`SSRF_VIOLATION: Evolution API baseUrl '${urlStr}' uses alternative or obfuscated IP notation`);
  }

  // Cloud metadata block
  if (
    host === "169.254.169.254" ||
    host.startsWith("169.254.") ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "instance-data"
  ) {
    throw new Error(`SSRF_VIOLATION: Access to cloud metadata service '${host}' is strictly blocked.`);
  }

  // Internal Docker hostnames allowlist
  const internalAllowed = getInternalAllowedHosts();
  if (internalAllowed.includes(host)) {
    return urlStr.replace(/\/$/, "");
  }

  if (allowLocalTest) {
    if (protocol === "http:" || protocol === "https:") {
      return urlStr.replace(/\/$/, "");
    }
  }

  if (protocol !== "https:") {
    throw new Error(`SSRF_VIOLATION: Evolution API baseUrl must use HTTPS in production. Received '${protocol}' in '${urlStr}'`);
  }

  return urlStr.replace(/\/$/, "");
}

/**
 * Native Evolution API v2 Outbound Adapter for SOS Sales V3.
 * Conforms to Sovereign Kernel MCT OS v2.0 standards.
 */
export class EvolutionAdapter implements IChannelAdapter {
  readonly provider = "evolution" as const;

  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly allowLocalTest: boolean;

  constructor(options: EvolutionAdapterOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.allowLocalTest = options.allowLocalTest ?? (process.env.NODE_ENV === "test" || process.env.ALLOW_LOCAL_TEST_SERVICES === "true");
  }

  async sendMessage(
    params: OutboundSendParams,
    secretResolver: ISigningSecretResolver
  ): Promise<ChannelSendResult> {
    if (!secretResolver.useCredentials) {
      return {success:false,category:"permanent",errorCode:"CREDENTIALS_NOT_FOUND",errorMessage:"Evolution requires credentials scoped to this channel and workspace."};
    }
    try {
      const result = await secretResolver.useCredentials(params.channelInstanceId, params.workspaceId, async credentials => {
        const apiKey = typeof credentials.api_key === "string" ? credentials.api_key.trim() : "";
        const baseUrl = typeof credentials.base_url === "string" ? credentials.base_url.trim() : "";
        const instance = typeof credentials.instance_name === "string" ? credentials.instance_name.trim() : "";
        if (!apiKey || !baseUrl || !instance) return {success:false,category:"permanent",errorCode:"CREDENTIALS_NOT_FOUND",errorMessage:"Evolution requires api_key, base_url and instance_name for this channel."} as ChannelSendResult;
        return this.sendWithCredentials(params,apiKey,baseUrl,instance);
      });
      return result ?? {success:false,category:"permanent",errorCode:"CREDENTIALS_NOT_FOUND",errorMessage:"Evolution channel credentials were not found."};
    } catch (error) {
      if(params.signal?.aborted)throw error;
      return {success:false,category:"permanent",errorCode:"CREDENTIALS_NOT_FOUND",errorMessage:"Evolution channel credentials could not be resolved."};
    }
  }

  private async sendWithCredentials(params:OutboundSendParams,apiKey:string,targetBaseUrl:string,instance:string):Promise<ChannelSendResult> {
    if (!apiKey) {
      return {
        success: false,
        category: "permanent",
        errorCode: "API_KEY_REQUIRED",
        errorMessage: "Evolution API key is strictly required for outbound dispatch.",
      };
    }

    try { targetBaseUrl=validateEvolutionBaseUrl(targetBaseUrl,this.allowLocalTest); }
    catch { return {success:false,category:"permanent",errorCode:"INVALID_BASE_URL",errorMessage:"Evolution channel URL did not pass validation."}; }

    const cleanDigits = params.recipientE164.replace(/\D/g, "");

    // 2. Determine Endpoint and Payload
    let endpoint: string;
    let payload: Record<string, unknown>;

    if (params.mediaUrl) {
      try {
        validateMediaUrl(params.mediaUrl, { allowLocalTest: this.allowLocalTest });
      } catch (mediaErr: unknown) {
        return {
          success: false,
          category: "permanent",
          errorCode: "INVALID_MEDIA_URL",
          errorMessage: mediaErr instanceof Error ? mediaErr.message : "Media URL validation failed",
        };
      }

      const mediaType = detectMediaType(params.mediaUrl);
      endpoint = `${targetBaseUrl}/message/sendMedia/${encodeURIComponent(instance)}`;
      payload = {
        number: cleanDigits,
        mediatype: mediaType,
        media: params.mediaUrl,
        caption: params.body || undefined,
      };
    } else {
      endpoint = `${targetBaseUrl}/message/sendText/${encodeURIComponent(instance)}`;
      payload = {
        number: cleanDigits,
        text: params.body,
      };
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = params.signal
      ? AbortSignal.any([timeoutSignal, params.signal])
      : timeoutSignal;

    try {
      const response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });

      if (response.ok) {
        const resBody = (await response.json()) as Record<string, any>;
        const candidates = [resBody?.key?.id,resBody?.id,resBody?.messageId];
        const externalId = candidates.find(value=>typeof value === "string" && value.trim().length>0);
        if (!externalId) {
          return {success:false,category:"ambiguous",errorCode:"PROVIDER_MESSAGE_ID_MISSING",errorMessage:"Evolution responded without a valid message identifier. Check the provider before repeating the send."};
        }

        return {
          success: true,
          externalMessageId: externalId.trim(),
          sentAt: new Date(),
        };
      }

      // Handle HTTP error responses
      let errorDetails = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as Record<string, any>;
        if (errJson.response?.message || errJson.message) {
          errorDetails = String(errJson.response?.message || errJson.message);
        }
      } catch {}

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          category: "permanent",
          errorCode: "AUTHENTICATION_FAILED",
          errorMessage: `Evolution API credentials rejected: ${errorDetails}`,
        };
      }

      if (response.status === 400 || response.status === 404 || response.status === 422) {
        return {
          success: false,
          category: "permanent",
          errorCode: "RECIPIENT_OR_PAYLOAD_INVALID",
          errorMessage: `Evolution API rejected message payload: ${errorDetails}`,
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          category: "transient",
          errorCode: "RATE_LIMITED",
          errorMessage: `Evolution API rate limit exceeded: ${errorDetails}`,
          retryAfterSeconds: 30,
        };
      }

      // Server error 5xx: transient retryable
      return {
        success: false,
        category: "transient",
        errorCode: "SERVER_ERROR",
        errorMessage: `Evolution API server error: ${errorDetails}`,
        retryAfterSeconds: 15,
      };
    } catch (err: unknown) {
      if (params.signal?.aborted) {
        throw new Error(
          `FENCING_IN_FLIGHT_ABORT: Outbound dispatch aborted (${err instanceof Error ? err.message : String(err)})`
        );
      }

      return {
        success: false,
        category: "ambiguous",
        errorCode: "NETWORK_TIMEOUT_OR_FAILURE",
        errorMessage: err instanceof Error ? err.message : "Network failure communicating with Evolution API",
        retryAfterSeconds: 10,
      };
    }
  }
}
