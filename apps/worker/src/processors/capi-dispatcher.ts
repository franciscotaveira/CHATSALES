import type { Pool, PoolClient } from "pg";
import crypto from "node:crypto";
import { logger } from "@sos-sales/observability";
import {
  claimQueuedConversionEvents,
  markConversionEventResult,
  withWorkerTransaction,
  decryptPayload,
  type ConversionEventRecord,
} from "@sos-sales/database";

export const CAPI_ERROR_CODES = [
  "CAPI_CREDENTIALS_MISSING",
  "CAPI_DATASET_ID_INVALID",
  "CAPI_SYNTHETIC_ENDPOINT_INVALID",
  "CAPI_WABA_ID_MISSING",
  "CAPI_SOURCE_THREAD_MISSING",
  "CAPI_SOURCE_CHANNEL_MISSING",
  "CAPI_CHANNEL_NOT_WABA",
  "CAPI_CHANNEL_AMBIGUOUS",
  "CAPI_DECRYPT_FAILED",
  "CAPI_DATABASE_ERROR",
  "CAPI_GRAPH_VERSION_INVALID",
  "CAPI_HTTP_4XX",
  "CAPI_HTTP_5XX",
  "CAPI_TIMEOUT",
  "CAPI_ABORTED",
  "CAPI_INVALID_RESPONSE",
  "CAPI_NOT_RECEIVED",
  "CAPI_PERSISTENCE_FAILED",
  "CAPI_UNKNOWN",
] as const;

export type CapiCanonicalErrorCode = (typeof CAPI_ERROR_CODES)[number];

export const META_GRAPH_API_ALLOWED_VERSIONS = ["v25.0", "v26.0"] as const;
export type MetaGraphApiVersion = (typeof META_GRAPH_API_ALLOWED_VERSIONS)[number];
export const META_GRAPH_API_DEFAULT_VERSION: MetaGraphApiVersion = "v26.0";

export interface GraphApiVersionResult {
  version?: MetaGraphApiVersion;
  error?: "CAPI_GRAPH_VERSION_INVALID";
}

export function resolveGraphApiVersion(configuredVersion?: string): GraphApiVersionResult {
  const version = configuredVersion || process.env.META_GRAPH_API_VERSION || META_GRAPH_API_DEFAULT_VERSION;
  if (version === "v25.0" || version === "v26.0") {
    return { version };
  }
  return { error: "CAPI_GRAPH_VERSION_INVALID" };
}

export interface SyntheticEndpointValidationResult {
  valid: boolean;
  error?: "CAPI_SYNTHETIC_ENDPOINT_INVALID";
  url?: string;
}

/**
 * Validates synthetic laboratory endpoints strictly:
 * - Must be valid URL with http or https protocol
 * - Must NOT contain embedded credentials (username/password)
 * - Hostname must be strictly local loopback (localhost, 127.0.0.1, ::1)
 */
export function validateSyntheticEndpoint(rawUrl?: string): SyntheticEndpointValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "CAPI_SYNTHETIC_ENDPOINT_INVALID" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "CAPI_SYNTHETIC_ENDPOINT_INVALID" };
  }

  // 1. Protocol must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "CAPI_SYNTHETIC_ENDPOINT_INVALID" };
  }

  // 2. Embedded credentials prohibited
  if (parsed.username || parsed.password) {
    return { valid: false, error: "CAPI_SYNTHETIC_ENDPOINT_INVALID" };
  }

  // 3. Hostname must be strictly loopback
  const hostname = parsed.hostname.toLowerCase();
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  if (!isLoopback) {
    return { valid: false, error: "CAPI_SYNTHETIC_ENDPOINT_INVALID" };
  }

  return { valid: true, url: parsed.toString() };
}

export interface CapiDispatcherOptions {
  datasetId?: string;
  accessToken?: string;
  endpointUrl?: string;
  testEventCode?: string;
  masterKeyHex?: string;
  strictTenantIsolation?: boolean;
  graphApiVersion?: string;
}

export interface CapiDispatchResult {
  eventId: string;
  status: "accepted" | "failed" | "simulated";
  fbtraceId?: string;
  error?: CapiCanonicalErrorCode;
}

export interface ProjectedCapiReceipt {
  graph_api_version?: string;
  events_received: 1;
  fbtrace_id?: string;
}

export interface SourceWabaResult {
  wabaAccountId?: string;
  error?: CapiCanonicalErrorCode;
}

export interface CapiCredentialResult {
  datasetId?: string;
  accessToken?: string;
  endpointUrl?: string;
  isSimulated?: boolean;
  error?: CapiCanonicalErrorCode;
}

export interface BusinessMessagingPayloadOptions {
  item: ConversionEventRecord;
  wabaAccountId: string;
  isLabMode: boolean;
  testEventCode?: string;
}

/**
 * Derives WABA account ID strictly through the real commercial chain:
 * conversion_event -> commercial_journey -> commercial_thread -> channel_instance -> provider_credentials -> waba_account_id
 */
export async function resolveSourceWaba(
  client: Pool | PoolClient,
  workspaceId: string,
  journeyId: string,
  masterKeyHex?: string
): Promise<SourceWabaResult> {
  let rows: any[];
  try {
    const res = await client.query(
      `SELECT
         cj.id as journey_id,
         cj.thread_id,
         ct.id as thread_record_id,
         ct.channel_instance_id,
         ci.id as channel_record_id,
         ci.provider as channel_provider,
         ci.credential_id,
         pc.id as credential_record_id,
         pc.provider as credential_provider,
         pc.account_id,
         pc.encrypted_payload,
         pc.iv,
         pc.auth_tag,
         pc.key_version,
         pc.status as credential_status
       FROM public.commercial_journeys cj
       LEFT JOIN public.commercial_threads ct
         ON ct.workspace_id = cj.workspace_id AND ct.id = cj.thread_id
       LEFT JOIN public.channel_instances ci
         ON ci.workspace_id = cj.workspace_id AND ci.id = ct.channel_instance_id
       LEFT JOIN public.provider_credentials pc
         ON pc.workspace_id = cj.workspace_id AND pc.id = ci.credential_id AND pc.status = 'ACTIVE'
       WHERE cj.workspace_id = $1 AND cj.id = $2;`,
      [workspaceId, journeyId]
    );
    rows = res.rows;
  } catch {
    return { error: "CAPI_DATABASE_ERROR" };
  }

  if (rows.length === 0) {
    return { error: "CAPI_SOURCE_THREAD_MISSING" };
  }
  if (rows.length > 1) {
    return { error: "CAPI_CHANNEL_AMBIGUOUS" };
  }

  const row = rows[0];
  if (!row.thread_id || !row.thread_record_id) {
    return { error: "CAPI_SOURCE_THREAD_MISSING" };
  }
  if (!row.channel_instance_id || !row.channel_record_id) {
    return { error: "CAPI_SOURCE_CHANNEL_MISSING" };
  }
  if (row.channel_provider !== "meta_waba") {
    return { error: "CAPI_CHANNEL_NOT_WABA" };
  }
  if (!row.credential_id || !row.credential_record_id) {
    return { error: "CAPI_WABA_ID_MISSING" };
  }

  let parsed: Record<string, unknown> = {};
  if (row.encrypted_payload) {
    const masterKey =
      masterKeyHex ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;

    if (!masterKey) {
      return { error: "CAPI_DECRYPT_FAILED" };
    }

    try {
      const decrypted = decryptPayload(
        row.encrypted_payload,
        row.iv,
        row.auth_tag,
        masterKey,
        row.key_version ? { keyVersion: row.key_version } : undefined
      );
      parsed = JSON.parse(decrypted);
    } catch {
      return { error: "CAPI_DECRYPT_FAILED" };
    }
  }

  const candidateWaba =
    typeof parsed.waba_account_id === "string" && parsed.waba_account_id.trim().length > 0
      ? parsed.waba_account_id.trim()
      : typeof parsed.waba_id === "string" && parsed.waba_id.trim().length > 0
      ? parsed.waba_id.trim()
      : undefined;

  if (!candidateWaba) {
    return { error: "CAPI_WABA_ID_MISSING" };
  }

  return { wabaAccountId: candidateWaba };
}

/**
 * Resolves CAPI credentials (dataset ID & access token) strictly from provider_credentials table.
 */
export async function resolveCapiCredential(
  client: Pool | PoolClient,
  workspaceId: string,
  options: {
    datasetId?: string;
    accessToken?: string;
    endpointUrl?: string;
    masterKeyHex?: string;
    isLabMode: boolean;
    allowGlobalFallback: boolean;
  }
): Promise<CapiCredentialResult> {
  const { datasetId, accessToken, endpointUrl, masterKeyHex, isLabMode, allowGlobalFallback } = options;

  if (isLabMode && endpointUrl) {
    const endpointValidation = validateSyntheticEndpoint(endpointUrl);
    if (!endpointValidation.valid) {
      return { error: endpointValidation.error! };
    }
  }

  let credRows: Array<{
    encrypted_payload: string;
    iv: string;
    auth_tag: string;
    key_version?: string;
    account_id: string;
  }>;

  try {
    const res = await client.query(
      `SELECT encrypted_payload, iv, auth_tag, key_version, account_id
       FROM public.provider_credentials
       WHERE workspace_id = $1 AND provider = 'meta_capi' AND status = 'ACTIVE'
       LIMIT 2;`,
      [workspaceId]
    );
    credRows = res.rows;
  } catch {
    return { error: "CAPI_DATABASE_ERROR" };
  }

  if (credRows.length > 1) {
    return { error: "CAPI_CHANNEL_AMBIGUOUS" };
  }

  const row = credRows[0];
  if (row) {
    const masterKey =
      masterKeyHex ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;

    if (!masterKey) {
      return { error: "CAPI_DECRYPT_FAILED" };
    }

    let parsed: Record<string, unknown>;
    try {
      const decrypted = decryptPayload(
        row.encrypted_payload,
        row.iv,
        row.auth_tag,
        masterKey,
        row.key_version ? { keyVersion: row.key_version } : undefined
      );
      parsed = JSON.parse(decrypted);
    } catch {
      return { error: "CAPI_DECRYPT_FAILED" };
    }

    const candidateDatasetId = parsed.dataset_id || parsed.pixel_id;
    if (candidateDatasetId) {
      const idStr = String(candidateDatasetId).trim();
      const isNumeric = /^\d{10,20}$/.test(idStr);

      if (!isNumeric) {
        return { error: "CAPI_DATASET_ID_INVALID" };
      }

      if (!parsed.access_token || typeof parsed.access_token !== "string" || !parsed.access_token.trim()) {
        return { error: "CAPI_CREDENTIALS_MISSING" };
      }

      return {
        datasetId: idStr,
        accessToken: parsed.access_token.trim(),
        endpointUrl: isLabMode && endpointUrl ? endpointUrl : undefined,
      };
    }

    return { error: "CAPI_DATASET_ID_INVALID" };
  }

  // Fallback checks strictly scoped to lab mode
  if (isLabMode) {
    if (endpointUrl) {
      return {
        datasetId: datasetId || "123456789012345",
        accessToken: accessToken || "mock_endpoint_token",
        endpointUrl,
      };
    }
    if (allowGlobalFallback && datasetId && accessToken) {
      if (!/^\d{10,20}$/.test(datasetId)) {
        return { error: "CAPI_DATASET_ID_INVALID" };
      }
      return { datasetId, accessToken };
    }
    return { isSimulated: true };
  }

  return { error: "CAPI_CREDENTIALS_MISSING" };
}

/**
 * Builds the canonical Meta Conversions API payload for WhatsApp Business Messaging conversations.
 */
export function buildBusinessMessagingPayload(
  options: BusinessMessagingPayloadOptions
): Record<string, unknown> {
  const { item, wabaAccountId, isLabMode, testEventCode } = options;

  let metaEventName = item.event_name as string;
  if (item.event_name === "PurchaseCompleted") {
    metaEventName = "Purchase";
  } else if (item.event_name === "LeadCaptured" || item.event_name === "LeadQualified") {
    metaEventName = "Lead";
  }

  const eventTimeUnix = Math.floor(new Date(item.event_time).getTime() / 1000);
  const valueFloat = item.value_cents != null ? item.value_cents / 100 : undefined;

  const userData: Record<string, unknown> = {
    whatsapp_business_account_id: wabaAccountId,
  };
  if (item.user_data?.hashedPhone) {
    userData.ph = [item.user_data.hashedPhone];
  }
  if (item.user_data?.hashedEmail) {
    userData.em = [item.user_data.hashedEmail];
  }
  if (item.user_data?.ctwaClid) {
    userData.ctwa_clid = item.user_data.ctwaClid;
  }

  const customData: Record<string, unknown> = {
    currency: item.currency || "BRL",
    ...(valueFloat !== undefined ? { value: valueFloat } : {}),
  };
  if (item.user_data?.isRecurringCustomer !== undefined) {
    customData.is_recurring_customer = item.user_data.isRecurringCustomer;
  }
  if (item.user_data?.ordersCount !== undefined) {
    customData.orders_count = item.user_data.ordersCount;
  }
  if (item.user_data?.customerLtv !== undefined) {
    customData.customer_ltv = item.user_data.customerLtv;
  }

  const eventData: Record<string, unknown> = {
    event_name: metaEventName,
    event_time: eventTimeUnix,
    event_id: item.id,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: userData,
    custom_data: customData,
  };

  const payload: Record<string, unknown> = {
    data: [eventData],
  };

  if (isLabMode && testEventCode && testEventCode.trim() !== "") {
    payload.test_event_code = testEventCode.trim();
  }

  return payload;
}

/**
 * Validates and projects the exact semantic receipt from Meta CAPI response.
 */
export function parseCapiReceipt(raw: unknown, graphApiVersion?: string): {
  receipt?: ProjectedCapiReceipt;
  error?: CapiCanonicalErrorCode;
  fbtraceId?: string;
} {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "CAPI_INVALID_RESPONSE" };
  }
  const obj = raw as Record<string, unknown>;
  const eventsReceived = Number(obj.events_received);
  if (isNaN(eventsReceived) || eventsReceived !== 1) {
    return { error: "CAPI_NOT_RECEIVED" };
  }
  const fbtraceId = obj.fbtrace_id ? String(obj.fbtrace_id) : undefined;

  const receipt: ProjectedCapiReceipt = {
    ...(graphApiVersion ? { graph_api_version: graphApiVersion } : {}),
    events_received: 1,
    ...(fbtraceId ? { fbtrace_id: fbtraceId } : {}),
  };
  return { receipt, fbtraceId };
}

/**
 * Maps raw HTTP status or exceptions to canonical allowlisted error codes.
 */
export function mapCapiError(errorOrStatus: unknown): CapiCanonicalErrorCode {
  if (typeof errorOrStatus === "number") {
    if (errorOrStatus >= 400 && errorOrStatus < 500) return "CAPI_HTTP_4XX";
    if (errorOrStatus >= 500 && errorOrStatus < 600) return "CAPI_HTTP_5XX";
    return "CAPI_UNKNOWN";
  }

  if (typeof errorOrStatus === "string") {
    if ((CAPI_ERROR_CODES as readonly string[]).includes(errorOrStatus)) {
      return errorOrStatus as CapiCanonicalErrorCode;
    }
    if (errorOrStatus.includes("400") || errorOrStatus.includes("404") || errorOrStatus.includes("403")) {
      return "CAPI_HTTP_4XX";
    }
    if (errorOrStatus.includes("500") || errorOrStatus.includes("502") || errorOrStatus.includes("503")) {
      return "CAPI_HTTP_5XX";
    }
    return "CAPI_UNKNOWN";
  }

  if (errorOrStatus instanceof Error) {
    if (errorOrStatus.name === "AbortError" || errorOrStatus.message.includes("aborted")) {
      return "CAPI_ABORTED";
    }
    if (
      errorOrStatus.name === "TimeoutError" ||
      errorOrStatus.message.toLowerCase().includes("timeout") ||
      (errorOrStatus as any).code === "ETIMEDOUT"
    ) {
      return "CAPI_TIMEOUT";
    }
    if ((CAPI_ERROR_CODES as readonly string[]).includes(errorOrStatus.message)) {
      return errorOrStatus.message as CapiCanonicalErrorCode;
    }
  }

  return "CAPI_UNKNOWN";
}

/**
 * Persists failure status to database with canonical error code and catches secondary failure with warning.
 */
export async function persistCapiFailure(
  pool: Pool,
  workspaceId: string,
  eventId: string,
  leaseToken: string | null | undefined,
  errorCode: CapiCanonicalErrorCode
): Promise<void> {
  try {
    await withWorkerTransaction(workspaceId, async (client) => {
      await markConversionEventResult(client, eventId, {
        status: "FAILED",
        error: errorCode,
        leaseToken: leaseToken ?? null,
      });
    }, pool);
  } catch {
    logger.warn(
      { eventId, workspaceId, error: "CAPI_PERSISTENCE_FAILED" },
      "Secondary persistence failure while marking conversion event as FAILED"
    );
  }
}

export class CapiDispatcher {
  private readonly datasetId?: string;
  private readonly accessToken?: string;
  private readonly endpointUrl?: string;
  private readonly testEventCode?: string;
  private readonly masterKeyHex?: string;
  private readonly strictTenantIsolation: boolean;
  private readonly graphApiVersion?: string;

  constructor(options: CapiDispatcherOptions = {}) {
    this.datasetId = options.datasetId || process.env.META_DATASET_ID || process.env.META_PIXEL_ID;
    this.accessToken = options.accessToken || process.env.META_CAPI_ACCESS_TOKEN;
    this.endpointUrl = options.endpointUrl || process.env.META_CAPI_ENDPOINT;
    this.testEventCode = options.testEventCode || process.env.META_CAPI_TEST_EVENT_CODE;
    this.graphApiVersion = options.graphApiVersion;
    this.masterKeyHex =
      options.masterKeyHex ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;
    this.strictTenantIsolation =
      options.strictTenantIsolation ??
      (process.env.STRICT_TENANT_ISOLATION === "true" ||
        process.env.NODE_ENV === "production");
  }

  async claimBatch(pool: Pool, batchSize = 10): Promise<ConversionEventRecord[]> {
    const leaseToken = crypto.randomUUID();
    return claimQueuedConversionEvents(pool, {
      limit: batchSize,
      leaseToken,
      leaseDurationSeconds: 60,
    });
  }

  async dispatchItem(
    pool: Pool,
    item: ConversionEventRecord,
    signal?: AbortSignal
  ): Promise<CapiDispatchResult> {
    const isLabMode =
      process.env.ENABLE_LAB_SYNTHETIC === "true" ||
      process.env.NODE_ENV === "test";

    const allowGlobalFallback =
      !this.strictTenantIsolation &&
      isLabMode &&
      process.env.LAB_ALLOW_GLOBAL_CAPI_FALLBACK === "true";

    // 0. Validate Graph API Version
    const versionResult = resolveGraphApiVersion(this.graphApiVersion);
    if (versionResult.error) {
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: versionResult.error }, "Invalid Meta Graph API version configured");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, versionResult.error);
      return { eventId: item.id, status: "failed", error: versionResult.error };
    }
    const effectiveGraphVersion = versionResult.version!;

    // 1. Resolve CAPI Credentials
    let credResult: CapiCredentialResult;
    try {
      credResult = await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          return resolveCapiCredential(client, item.workspace_id, {
            datasetId: this.datasetId,
            accessToken: this.accessToken,
            endpointUrl: isLabMode ? this.endpointUrl : undefined,
            masterKeyHex: this.masterKeyHex,
            isLabMode,
            allowGlobalFallback,
          });
        },
        pool
      );
    } catch {
      const errCode = "CAPI_DATABASE_ERROR";
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: errCode }, "CAPI database error during credential resolution");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
      return { eventId: item.id, status: "failed", error: errCode };
    }

    if (credResult.error) {
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: credResult.error }, "CAPI tenant credential validation failed");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, credResult.error);
      return { eventId: item.id, status: "failed", error: credResult.error };
    }

    if (credResult.isSimulated) {
      const receipt = {
        mode: "simulated_local",
        reason: "Meta CAPI credentials not configured in workspace (modo local laboratório autorizado)",
        dispatched_at: new Date().toISOString(),
      };
      await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          await markConversionEventResult(client, item.id, {
            status: "SIMULATED",
            receipt,
            leaseToken: item.lease_token,
          });
        },
        pool
      );
      return { eventId: item.id, status: "simulated" };
    }

    // 2. Resolve Source WABA from Database Chain
    let wabaResult: SourceWabaResult;
    try {
      wabaResult = await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          return resolveSourceWaba(client, item.workspace_id, item.journey_id, this.masterKeyHex);
        },
        pool
      );
    } catch {
      const errCode = "CAPI_DATABASE_ERROR";
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: errCode }, "CAPI database error during WABA resolution");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
      return { eventId: item.id, status: "failed", error: errCode };
    }

    if (wabaResult.error) {
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: wabaResult.error }, "CAPI WABA resolution failed");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, wabaResult.error);
      return { eventId: item.id, status: "failed", error: wabaResult.error };
    }

    // 3. Build Business Messaging Payload
    const payload = buildBusinessMessagingPayload({
      item,
      wabaAccountId: wabaResult.wabaAccountId!,
      isLabMode,
      testEventCode: this.testEventCode,
    });

    // 4. Dispatch HTTP Call (Custom endpointUrl blocked outside lab mode)
    // Authorization header carries Bearer token; URL contains strictly zero access_token
    let url: string;
    if (isLabMode && credResult.endpointUrl) {
      const endpointValidation = validateSyntheticEndpoint(credResult.endpointUrl);
      if (!endpointValidation.valid) {
        logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: endpointValidation.error! }, "Invalid synthetic endpoint URL");
        await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, endpointValidation.error!);
        return { eventId: item.id, status: "failed", error: endpointValidation.error! };
      }
      url = endpointValidation.url!;
    } else {
      url = `https://graph.facebook.com/${effectiveGraphVersion}/${credResult.datasetId}/events`;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credResult.accessToken}`,
        },
        body: JSON.stringify(payload),
        signal,
        redirect: "manual",
      });

      // Disallow redirects from synthetic endpoints (SSRF protection)
      if (res.status >= 300 && res.status < 400) {
        const errCode: CapiCanonicalErrorCode = "CAPI_SYNTHETIC_ENDPOINT_INVALID";
        logger.error({ eventId: item.id, workspaceId: item.workspace_id, status: res.status, error: errCode }, "Synthetic endpoint redirect disallowed");
        await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
        return { eventId: item.id, status: "failed", error: errCode };
      }

      if (!res.ok) {
        const errCode = mapCapiError(res.status);
        logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: errCode }, "Meta CAPI HTTP error response");
        await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
        return { eventId: item.id, status: "failed", error: errCode };
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        const errCode: CapiCanonicalErrorCode = "CAPI_INVALID_RESPONSE";
        logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: errCode }, "Meta CAPI invalid JSON response");
        await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
        return { eventId: item.id, status: "failed", error: errCode };
      }

      const receiptParsed = parseCapiReceipt(json, effectiveGraphVersion);
      if (receiptParsed.error) {
        logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: receiptParsed.error }, "Meta CAPI receipt validation failed");
        await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, receiptParsed.error);
        return { eventId: item.id, status: "failed", error: receiptParsed.error };
      }

      await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          await markConversionEventResult(client, item.id, {
            status: "ACCEPTED",
            receipt: receiptParsed.receipt as unknown as Record<string, unknown>,
            leaseToken: item.lease_token,
          });
        },
        pool
      );

      return {
        eventId: item.id,
        status: "accepted",
        fbtraceId: receiptParsed.fbtraceId,
      };
    } catch (err: unknown) {
      const errCode = mapCapiError(err);
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: errCode }, "Failed to dispatch Meta CAPI conversion");
      await persistCapiFailure(pool, item.workspace_id, item.id, item.lease_token, errCode);
      return {
        eventId: item.id,
        status: "failed",
        error: errCode,
      };
    }
  }
}
