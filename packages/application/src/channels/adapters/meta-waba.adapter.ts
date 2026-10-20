import type {
  ChannelSendResult,
  IChannelAdapter,
  OutboundSendParams,
} from "./channel-adapter.interface";
import type { ISigningSecretResolver } from "../services/signature-verification.service";
import { validateMediaUrl, detectMediaType } from "../security/ssrf-guard";
import { META_GRAPH_API_VERSION } from "@sos-sales/contracts";

export function parseRetryAfter(
  headerValue: string | null | undefined,
  maxLimitSeconds = 3600
): number | undefined {
  if (!headerValue || typeof headerValue !== "string") return undefined;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, maxLimitSeconds);
    }
  }
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    const diff = Math.ceil((date.getTime() - Date.now()) / 1000);
    return Math.min(Math.max(diff, 1), maxLimitSeconds);
  }
  return undefined;
}

export function extractDocumentFilename(urlStr: string): string | undefined {
  try {
    const parsed = new URL(urlStr);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    if (lastSegment) {
      const decoded = decodeURIComponent(lastSegment).trim();
      if (decoded.length > 0 && decoded.length <= 255) {
        return decoded;
      }
    }
  } catch {
    // Ignore URL parse error; will be handled by URL validation
  }
  return undefined;
}

export interface WabaMediaMetadata {
  readonly id: string;
  readonly url: string;
  readonly mimeType?: string;
  readonly sha256?: string;
  readonly fileSize?: number;
}

export interface MetaWabaAdapterOptions {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

export class MetaWabaAdapter implements IChannelAdapter {
  public readonly provider = "meta_waba" as const;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MetaWabaAdapterOptions = {}) {
    this.baseUrl = options.baseUrl || `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 15_000;
  }

  async sendMessage(
    params: OutboundSendParams,
    secretResolver: ISigningSecretResolver
  ): Promise<ChannelSendResult> {
    // 1. Check 24-hour window policy: if lastInboundMessageAt is absent (unknown) or expired (>24h),
    // free-form text must fail before external send and an approved template is strictly required.
    const isWindowOpen =
      Boolean(params.lastInboundMessageAt) &&
      Date.now() - params.lastInboundMessageAt!.getTime() <= 24 * 60 * 60 * 1000;

    if (!isWindowOpen && !params.template) {
      return {
        success: false,
        category: "permanent",
        errorCode: "OUTSIDE_24H_WINDOW_ERROR",
        errorMessage:
          "Free-form text message rejected: Customer care window is unknown or expired (>24h). An approved template is strictly required.",
      };
    }

    // 2. Resolve credentials strictly within callback (Never copy secret to outer variable)
    if (secretResolver.useWabaOutboundCredentials) {
      const result = await secretResolver.useWabaOutboundCredentials(
        params.channelInstanceId,
        params.workspaceId,
        async ({ accessToken, phoneNumberId }) => {
          return this.executeSend(params, accessToken, phoneNumberId);
        }
      );

      if (!result) {
        return {
          success: false,
          category: "permanent",
          errorCode: "CREDENTIALS_NOT_FOUND",
          errorMessage:
            "Missing required WABA credentials: both access_token and phone_number_id are mandatory (no fallback 'me')",
        };
      }

      return result;
    }

    // Fallback if useCredentials interface is provided
    if (secretResolver.useCredentials) {
      const result = await secretResolver.useCredentials(
        params.channelInstanceId,
        params.workspaceId,
        async (credentials): Promise<ChannelSendResult> => {
          const accessToken = (credentials.access_token as string) || (credentials.token as string);
          const phoneNumberId = credentials.phone_number_id
            ? String(credentials.phone_number_id)
            : undefined;

          if (!accessToken || !phoneNumberId) {
            return {
              success: false,
              category: "permanent",
              errorCode: "CREDENTIALS_NOT_FOUND",
              errorMessage:
                "Missing required WABA credentials: phone_number_id and access_token are required (no fallback 'me')",
            };
          }

          return this.executeSend(params, accessToken, phoneNumberId);
        }
      );

      return (
        result ?? {
          success: false,
          category: "permanent",
          errorCode: "CREDENTIALS_NOT_FOUND",
          errorMessage: "Failed to resolve WABA credentials from provider repository",
        }
      );
    }

    return {
      success: false,
      category: "permanent",
      errorCode: "RESOLVER_NOT_CAPABLE",
      errorMessage: "Provided secret resolver does not support WABA outbound credentials",
    };
  }

  /**
   * Resolves a Meta Cloud API media ID (e.g. from an inbound webhook) into its authenticated CDN download URL and metadata.
   * Credentials are used exclusively within the resolver callback to prevent token leakage.
   */
  async getMediaMetadata(
    mediaId: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options?: { signal?: AbortSignal }
  ): Promise<WabaMediaMetadata> {
    const trimmedId = mediaId ? String(mediaId).trim() : "";
    if (!trimmedId || !/^\d+$/.test(trimmedId)) {
      throw new Error("INVALID_MEDIA_ID: Explicit numeric mediaId is required");
    }

    const fetchMetadata = async (accessToken: string): Promise<WabaMediaMetadata> => {
      const targetUrl = `${this.baseUrl}/${trimmedId}`;
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = options?.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      let response: Response;
      try {
        response = await this.fetchFn(targetUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: combinedSignal,
        });
      } catch (err) {
        if (options?.signal?.aborted) {
          throw new Error(
            `FENCING_IN_FLIGHT_ABORT: getMediaMetadata aborted in-flight (${err instanceof Error ? err.message : String(err)})`
          );
        }
        throw new Error(
          `WABA_MEDIA_FETCH_ERROR: Network error fetching media metadata: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as { error?: { message?: string } };
          if (errBody.error?.message) {
            errMessage = errBody.error.message;
          }
        } catch {
          // non-json response
        }
        throw new Error(`WABA_MEDIA_RESOLUTION_FAILED: Meta API returned ${errMessage}`);
      }

      let data: {
        id?: string;
        url?: string;
        mime_type?: string;
        sha256?: string;
        file_size?: number;
      };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error("WABA_MEDIA_RESOLUTION_FAILED: Invalid JSON returned from Meta Graph API");
      }

      if (!data.url) {
        throw new Error("WABA_MEDIA_RESOLUTION_FAILED: Meta response did not contain download URL");
      }

      return {
        id: data.id || trimmedId,
        url: data.url,
        mimeType: data.mime_type,
        sha256: data.sha256,
        fileSize: data.file_size,
      };
    };

    if (secretResolver.useWabaOutboundCredentials) {
      const result = await secretResolver.useWabaOutboundCredentials(
        channelInstanceId,
        workspaceId,
        async ({ accessToken }) => {
          return fetchMetadata(accessToken);
        }
      );
      if (!result) {
        throw new Error("CREDENTIALS_NOT_FOUND: Failed to resolve WABA credentials for media resolution");
      }
      return result;
    }

    if (secretResolver.useCredentials) {
      const result = await secretResolver.useCredentials(
        channelInstanceId,
        workspaceId,
        async (credentials) => {
          const accessToken = (credentials.access_token as string) || (credentials.token as string);
          if (!accessToken) {
            throw new Error("CREDENTIALS_NOT_FOUND: Missing access_token for media resolution");
          }
          return fetchMetadata(accessToken);
        }
      );
      if (!result) {
        throw new Error("CREDENTIALS_NOT_FOUND: Failed to resolve WABA credentials for media resolution");
      }
      return result;
    }

    throw new Error("RESOLVER_NOT_CAPABLE: Secret resolver does not support WABA outbound credentials");
  }

  async getMediaUrl(
    mediaId: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    const metadata = await this.getMediaMetadata(
      mediaId,
      secretResolver,
      workspaceId,
      channelInstanceId,
      options
    );
    return metadata.url;
  }

  private async executeSend(
    params: OutboundSendParams,
    accessToken: string,
    phoneNumberId: string
  ): Promise<ChannelSendResult> {
    if (!phoneNumberId || !/^\d+$/.test(phoneNumberId.trim()) || phoneNumberId === "me") {
      return {
        success: false,
        category: "permanent",
        errorCode: "INVALID_PHONE_NUMBER_ID",
        errorMessage: "Explicit numeric phone_number_id is required. Fallback 'me' or non-numeric IDs are strictly prohibited.",
      };
    }

    // Determine payload structure: template, media (typed), or text
    let payload: Record<string, unknown>;

    if (params.template) {
      // Validate any media URLs in template components (e.g. header component with image/video/document link)
      if (Array.isArray(params.template.components)) {
        for (const comp of params.template.components) {
          if (comp.type === "header" && Array.isArray(comp.parameters)) {
            for (const param of comp.parameters) {
              const paramObj = param as Record<string, unknown>;
              const mediaObj = (paramObj.image || paramObj.video || paramObj.document) as
                | Record<string, unknown>
                | undefined;
              if (mediaObj && typeof mediaObj.link === "string") {
                try {
                  validateMediaUrl(mediaObj.link);
                } catch (mediaErr: unknown) {
                  return {
                    success: false,
                    category: "permanent",
                    errorCode: "INVALID_MEDIA_URL",
                    errorMessage: `Template header media URL rejected by SSRF guard: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)}`,
                  };
                }
              }
            }
          }
        }
      }

      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientE164,
        type: "template",
        template: {
          name: params.template.name,
          language: { code: params.template.language },
          components: (params.template.components || []).map(component=>({...component,...(component.index!==undefined?{index:String(component.index)}:{})})),
        },
      };
    } else if (params.mediaUrl) {
      try {
        validateMediaUrl(params.mediaUrl);
      } catch (mediaErr: unknown) {
        return {
          success: false,
          category: "permanent",
          errorCode: "INVALID_MEDIA_URL",
          errorMessage: mediaErr instanceof Error ? mediaErr.message : "Media URL validation failed",
        };
      }
      const mediaType = detectMediaType(params.mediaUrl);
      const filename =
        mediaType === "document" ? extractDocumentFilename(params.mediaUrl) : undefined;
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientE164,
        type: mediaType,
        [mediaType]: {
          link: params.mediaUrl,
          caption: mediaType !== "audio" ? params.body || undefined : undefined,
          ...(filename ? { filename } : {}),
        },
      };
    } else if (params.interactive) {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientE164,
        type: "interactive",
        interactive: {
          type: params.interactive.type,
          ...(params.interactive.header ? { header: params.interactive.header } : {}),
          body: params.interactive.body,
          ...(params.interactive.footer ? { footer: params.interactive.footer } : {}),
          action: params.interactive.action,
        },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientE164,
        type: "text",
        text: {
          preview_url: false,
          body: params.body,
        },
      };
    }

    const targetUrl = `${this.baseUrl}/${phoneNumberId}/messages`;

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = params.signal
      ? AbortSignal.any([timeoutSignal, params.signal])
      : timeoutSignal;

    try {
      const response = await this.fetchFn(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });

      if (response.ok) {
        const body = (await response.json()) as {
          messages?: Array<{ id: string }>;
        };
        const externalMessageId = body.messages?.[0]?.id;
        if (!externalMessageId) {
          return {
            success: false,
            category: "ambiguous",
            errorCode: "EMPTY_MESSAGE_ID",
            errorMessage: "Meta API returned 200 OK without a message id",
          };
        }

        return {
          success: true,
          externalMessageId,
          sentAt: new Date(),
        };
      }

      // Parse error body
      let errorBody: {
        error?: {
          message?: string;
          type?: string;
          code?: number;
          error_subcode?: number;
        };
      } = {};
      try {
        errorBody = (await response.json()) as typeof errorBody;
      } catch {
        // non-json response
      }

      const metaErrorCode = errorBody.error?.code;
      const errorMessage =
        errorBody.error?.message || `Meta Graph API error with HTTP ${response.status}`;

      // Respect Retry-After header on 429 (numeric seconds or HTTP-date, capped)
      const retryAfterSeconds = parseRetryAfter(response.headers?.get?.("retry-after"));

      // 429 or Meta rate limit code 130429
      if (response.status === 429 || metaErrorCode === 130429) {
        return {
          success: false,
          category: "transient",
          errorCode: String(metaErrorCode || 429),
          errorMessage,
          retryAfterSeconds,
        };
      }

      // Ambiguous HTTP status codes (408 Request Timeout, 425 Too Early)
      if (response.status === 408 || response.status === 425) {
        return {
          success: false,
          category: "ambiguous",
          errorCode: `HTTP_${response.status}`,
          errorMessage: `Ambiguous server status: ${response.status} ${errorMessage}`,
        };
      }

      // Transient 5xx server errors
      if (response.status >= 500) {
        return {
          success: false,
          category: "transient",
          errorCode: `HTTP_${response.status}`,
          errorMessage,
        };
      }

      // Permanent client errors (400, 401, 403, 404, 131026, 131042, etc.)
      return {
        success: false,
        category: "permanent",
        errorCode: String(metaErrorCode || response.status),
        errorMessage,
      };
    } catch (err: unknown) {
      if (params.signal?.aborted) {
        throw new Error(
          `FENCING_IN_FLIGHT_ABORT: Dispatch aborted in-flight due to lease loss or cancellation (${err instanceof Error ? err.message : String(err)})`
        );
      }
      // AbortError, TimeoutError, network socket hangup, connection reset are all AMBIGUOUS
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        category: "ambiguous",
        errorCode: "NETWORK_TIMEOUT",
        errorMessage: `Network error or timeout during Meta API dispatch: ${message}`,
      };
    }
  }
}
