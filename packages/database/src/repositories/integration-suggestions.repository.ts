/**
 * SOS Vendas — Integration Suggestions Repository (F1.1-C Radar Hardening & Governance)
 * 
 * Provides tenant-scoped CRUD for integration suggestions with:
 * - Candidate-Suggestion link (mandatory opaque candidateRevision concurrency token)
 * - Server-owned configuration (derived moduleKey = 'radar_m01', ruleVersion = workspaces.radar_rule_version)
 * - Full governance revalidation on decision (WORKSPACE_INACTIVE, MODULE_DISABLED, RULE_VERSION_STALE)
 * - Centralized structured invalidation persistence (rejection_code + rejection_reason + state_version increment)
 * - Deep recursive canonical serialization for payload fingerprinting
 * - Governed candidates with bounded cooldown (0 respected via ??), stable cursor, and tie-breaking
 */
import type { Pool, PoolClient } from "pg";
import crypto from "node:crypto";
import {
  createCommercialAction,
  getOpenCommercialAction,
  type CommercialActionRecord,
} from "./commercial-actions.repository";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type SuggestionSource = "n8n" | "manual" | "system";
export type SuggestionType = "follow_up" | "reengagement" | "upsell" | "reminder" | "custom";
export type SuggestionPriority = "low" | "normal" | "high" | "urgent";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired" | "invalidated";

export interface OriginSnapshot {
  threadId: string;
  contactId: string;
  lastMessageAt: string;
  lastMessageId: string | null;
  threadStatus: string;
  contactOptOut: boolean;
  assignedUserId?: string | null;
  moduleKey?: string | null;
  ruleVersion?: string | null;
  reasonCode?: string | null;
  candidateRevision: string;
  snapshotRevision: string;
  [key: string]: unknown;
}

export interface IntegrationSuggestionRecord {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  payload_fingerprint: string;
  source: SuggestionSource;
  module_key: string;
  rule_version: string;
  thread_id: string | null;
  contact_id: string | null;
  suggestion_type: SuggestionType;
  title: string;
  body: string;
  draft_message: string | null;
  priority: SuggestionPriority;
  metadata: Record<string, unknown>;
  origin_snapshot: OriginSnapshot;
  status: SuggestionStatus;
  state_version: number;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSuggestionInput {
  idempotencyKey: string;
  source?: SuggestionSource;
  threadId: string;
  contactId?: string | null;
  suggestionType?: SuggestionType;
  title: string;
  body: string;
  draftMessage?: string | null;
  priority?: SuggestionPriority;
  reasonCode?: string | null;
  evidence?: Record<string, unknown> | null;
  candidateRevision: string;
  expiresAt?: string | null;
}

export interface CandidateEvidence {
  hoursSinceLastMessage: number;
  lastMessageAt: string;
  lastMessageDirection: string | null;
  lastMessageBody: string | null;
  lastMessageId: string | null;
  threadStatus: string;
  journeyId: string | null;
  journeyStage: string | null;
  journeyStatus: string | null;
}

export interface GovernedCandidateRecord {
  candidateId: string;
  threadId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  moduleKey: string;
  ruleVersion: string;
  reasonCode: string;
  evidence: CandidateEvidence;
  candidateRevision: string;
  snapshotRevision: string;
  lastMessageAt: Date;
}

// ---------------------------------------------------------------------------
// Errors & Rejection Codes
// ---------------------------------------------------------------------------

export class SuggestionIdempotencyConflictError extends Error {
  public readonly code = "IDEMPOTENCY_CONFLICT";
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(`Idempotency key '${idempotencyKey}' was already used with a different suggestion payload`);
    this.name = "SuggestionIdempotencyConflictError";
    this.idempotencyKey = idempotencyKey;
  }
}

export class InvalidCursorError extends Error {
  public readonly code = "INVALID_CURSOR";

  constructor(message: string = "Cursor de paginação malformado ou inválido") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

export type SuggestionRejectionCode =
  | "SUGGESTION_NOT_FOUND"
  | "ALREADY_DECIDED"
  | "VERSION_MISMATCH"
  | "SUGGESTION_EXPIRED"
  | "ORIGIN_THREAD_CLOSED"
  | "ORIGIN_THREAD_HANDOFF"
  | "ORIGIN_STALE_NEW_MESSAGE"
  | "ORIGIN_CONTACT_OPT_OUT"
  | "MODULE_DISABLED"
  | "COOLDOWN_ACTIVE"
  | "INVALID_SNAPSHOT"
  | "WORKSPACE_INACTIVE"
  | "RULE_VERSION_STALE"
  | "CANDIDATE_STALE";

export class SuggestionDecisionRejectionError extends Error {
  public readonly code: SuggestionRejectionCode;
  public readonly targetId: string;

  constructor(targetId: string, code: SuggestionRejectionCode, message: string) {
    super(message);
    this.name = "SuggestionDecisionRejectionError";
    this.code = code;
    this.targetId = targetId;
  }
}

export type SuggestionDecisionResult =
  | { ok: true; suggestion: IntegrationSuggestionRecord; action?: CommercialActionRecord }
  | { ok: false; code: SuggestionRejectionCode; reason: string; suggestion: IntegrationSuggestionRecord | null; action?: CommercialActionRecord };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep recursive canonical JSON serialization.
 * Objects with keys in different orders produce identical canonical strings.
 */
export function canonicalStringify(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify((val as Record<string, unknown>)[k])).join(",") + "}";
}

/**
 * Computes deterministic revision token for a candidate from its current facts.
 */
export function computeCandidateRevision(input: {
  threadId: string;
  contactId: string;
  lastMessageAtRaw: string;
  lastMessageId: string | null;
  threadStatus: string;
  contactOptOut: boolean;
  moduleKey: string;
  ruleVersion: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      canonicalStringify({
        contactId: input.contactId,
        contactOptOut: input.contactOptOut,
        lastMessageAt: input.lastMessageAtRaw,
        lastMessageId: input.lastMessageId || null,
        moduleKey: input.moduleKey,
        ruleVersion: input.ruleVersion,
        threadId: input.threadId,
        threadStatus: input.threadStatus,
      })
    )
    .digest("hex");
}

export function computeSuggestionFingerprint(input: {
  source?: SuggestionSource;
  threadId?: string | null;
  contactId?: string | null;
  suggestionType?: SuggestionType;
  title: string;
  body: string;
  draftMessage?: string | null;
  priority?: SuggestionPriority;
  expiresAt?: string | null;
  reasonCode?: string | null;
  evidence?: Record<string, unknown> | CandidateEvidence | null;
  candidateRevision?: string | null;
}): string {
  const normalized = {
    body: (input.body || "").trim(),
    candidateRevision: input.candidateRevision || null,
    contactId: input.contactId || null,
    draftMessage: input.draftMessage ? input.draftMessage.trim() : null,
    evidence: input.evidence || null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    priority: input.priority || "normal",
    reasonCode: input.reasonCode || null,
    source: input.source || "n8n",
    suggestionType: input.suggestionType || "follow_up",
    threadId: input.threadId || null,
    title: (input.title || "").trim(),
  };
  return crypto.createHash("sha256").update(canonicalStringify(normalized)).digest("hex");
}

export function encodeCursor(lastMessageAtIso: string, id: string): string {
  return Buffer.from(
    JSON.stringify({ lastMessageAt: lastMessageAtIso, id })
  ).toString("base64url");
}

export function decodeCursor(cursor: string): { lastMessageAt: string; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new InvalidCursorError();
    }
    const { lastMessageAt, id } = parsed;
    if (!lastMessageAt || typeof lastMessageAt !== "string" || isNaN(Date.parse(lastMessageAt))) {
      throw new InvalidCursorError("Data de cursor inválida");
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || typeof id !== "string" || !uuidRegex.test(id)) {
      throw new InvalidCursorError("UUID de cursor inválido");
    }
    return { lastMessageAt, id };
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw err;
    }
    throw new InvalidCursorError();
  }
}

/**
 * Centralized rejection updater: persists status, structured rejection code, human reason,
 * timestamp, and increments state_version under the caller's transaction.
 * Strictly checks status = 'pending' AND state_version = $expectedStateVersion to prevent
 * overwriting already decided records or concurrent race conditions.
 */
export async function persistSuggestionRejection(
  client: Pool | PoolClient,
  workspaceId: string,
  suggestionId: string,
  status: "invalidated" | "expired",
  code: SuggestionRejectionCode,
  reason: string,
  expectedStateVersion: number,
  decidedByUserId?: string | null
): Promise<IntegrationSuggestionRecord | null> {
  const updateRes = await client.query<IntegrationSuggestionRecord>(
    `UPDATE public.integration_suggestions
     SET status = $1,
         decided_by_user_id = COALESCE($2, decided_by_user_id),
         decided_at = clock_timestamp(),
         metadata = metadata || jsonb_build_object(
           'rejection_code', $3::text,
           'rejection_reason', $4::text,
           'invalidation_reason', $4::text,
           'rejected_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         ),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE workspace_id = $5
       AND id = $6
       AND status = 'pending'
       AND state_version = $7
     RETURNING *;`,
    [status, decidedByUserId || null, code, reason, workspaceId, suggestionId, expectedStateVersion]
  );
  return updateRes.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Suggestion CRUD & State Machine
// ---------------------------------------------------------------------------

/**
 * Creates a suggestion with candidate link verification, server-derived origin snapshot,
 * server-owned configuration (radar_m01 + workspace rule_version), and semantic idempotency.
 */
export async function createIntegrationSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateSuggestionInput
): Promise<{ suggestion: IntegrationSuggestionRecord; created: boolean }> {
  // 1. Idempotency replay check: if key already exists, verify request fingerprint and return existing row
  // without re-evaluating changing facts (e.g. intervening messages, disabled radar, or bumped rule version).
  const existingRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [workspaceId, input.idempotencyKey]
  );

  const incomingFingerprint = computeSuggestionFingerprint({
    source: input.source || "n8n",
    threadId: input.threadId || null,
    contactId: input.contactId || null,
    suggestionType: input.suggestionType || "follow_up",
    title: input.title,
    body: input.body,
    draftMessage: input.draftMessage || null,
    priority: input.priority || "normal",
    expiresAt: input.expiresAt || null,
    reasonCode: input.reasonCode || null,
    evidence: input.evidence || null,
    candidateRevision: input.candidateRevision || null,
  });

  if (existingRes.rows[0]) {
    const existing = existingRes.rows[0];
    if (!existing.payload_fingerprint || existing.payload_fingerprint !== incomingFingerprint) {
      throw new SuggestionIdempotencyConflictError(input.idempotencyKey);
    }
    return { suggestion: existing, created: false };
  }

  // 2. Validate workspace and module enablement for NEW suggestions
  const wsRes = await client.query<{
    is_active: boolean;
    radar_enabled: boolean;
    radar_rule_version: string;
    radar_cooldown_seconds: number;
  }>(
    `SELECT is_active, radar_enabled, radar_rule_version, radar_cooldown_seconds
     FROM public.workspaces
     WHERE id = $1;`,
    [workspaceId]
  );

  const ws = wsRes.rows[0];
  if (!ws || !ws.is_active) {
    throw new SuggestionDecisionRejectionError(
      workspaceId,
      "WORKSPACE_INACTIVE",
      "Workspace inativo"
    );
  }

  if (!ws.radar_enabled) {
    throw new SuggestionDecisionRejectionError(
      workspaceId,
      "MODULE_DISABLED",
      "Módulo Radar desabilitado para este workspace"
    );
  }

  // Server-owned moduleKey and ruleVersion
  const moduleKey = "radar_m01";
  const ruleVersion = ws.radar_rule_version || "1.0.0";
  const cooldownSeconds = ws.radar_cooldown_seconds ?? 86400;

  // 3. Validate origin thread and candidate revision
  if (!input.threadId) {
    throw new SuggestionDecisionRejectionError(
      workspaceId,
      "INVALID_SNAPSHOT",
      "threadId é obrigatório para sugestões do Radar"
    );
  }

  // Cooldown check for the same thread/module if cooldown > 0
  if (cooldownSeconds > 0) {
    const cooldownRes = await client.query<{
      id: string;
      idempotency_key: string;
    }>(
      `SELECT id, idempotency_key
       FROM public.integration_suggestions
       WHERE workspace_id = $1
         AND thread_id = $2
         AND module_key = $3
         AND created_at > clock_timestamp() - ($4 || ' seconds')::interval
       ORDER BY created_at DESC
       LIMIT 1;`,
      [workspaceId, input.threadId, moduleKey, cooldownSeconds]
    );

    const recentSug = cooldownRes.rows[0];
    if (recentSug && recentSug.idempotency_key !== input.idempotencyKey) {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "COOLDOWN_ACTIVE",
        "Thread em período de cooldown para este módulo"
      );
    }
  }

  // Query thread state + contact association + latest message with deterministic tie-breaking
  const threadRes = await client.query<{
    thread_id: string;
    contact_id: string;
    thread_status: string;
    last_message_at: Date;
    last_message_at_raw: string;
    contact_opt_out: boolean;
    last_message_id: string | null;
    last_msg_created_at_raw: string | null;
  }>(
    `SELECT
       t.id as thread_id,
       t.contact_id,
       t.status as thread_status,
       t.last_message_at,
       to_char(t.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_message_at_raw,
       c.opt_out as contact_opt_out,
       m.id as last_message_id,
       to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_msg_created_at_raw
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     LEFT JOIN LATERAL (
       SELECT id, created_at
       FROM public.messages
       WHERE workspace_id = t.workspace_id AND thread_id = t.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) m ON true
     WHERE t.workspace_id = $1 AND t.id = $2
     FOR UPDATE OF t;`,
    [workspaceId, input.threadId]
  );

  const row = threadRes.rows[0];
  if (!row) {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "INVALID_SNAPSHOT",
      "Thread ou contato de origem não encontrado ou inconsistente"
    );
  }

  if (input.contactId && input.contactId !== row.contact_id) {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "INVALID_SNAPSHOT",
      "Contato informado não corresponde ao contato da conversa"
    );
  }
  const verifiedContactId = row.contact_id;

  if (row.contact_opt_out) {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "ORIGIN_CONTACT_OPT_OUT",
      "Contato realizou opt-out de mensagens"
    );
  }

  if (row.thread_status === "closed") {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "ORIGIN_THREAD_CLOSED",
      "A conversa de origem está encerrada"
    );
  }

  if (row.thread_status === "waiting_human") {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "ORIGIN_THREAD_HANDOFF",
      "A conversa de origem está em controle humano / handoff"
    );
  }

  // 4. Verify Candidate Revision Link
  const lastMsgAtStr = row.last_msg_created_at_raw || row.last_message_at_raw;
  const currentCandidateRevision = computeCandidateRevision({
    threadId: row.thread_id,
    contactId: row.contact_id,
    lastMessageAtRaw: lastMsgAtStr,
    lastMessageId: row.last_message_id,
    threadStatus: row.thread_status,
    contactOptOut: row.contact_opt_out,
    moduleKey,
    ruleVersion,
  });

  if (!input.candidateRevision || input.candidateRevision !== currentCandidateRevision) {
    throw new SuggestionDecisionRejectionError(
      input.threadId,
      "CANDIDATE_STALE",
      "O candidato informado está desatualizado em relação aos fatos atuais da conversa"
    );
  }

  const originSnapshot: OriginSnapshot = {
    threadId: row.thread_id,
    contactId: row.contact_id,
    lastMessageAt: lastMsgAtStr,
    lastMessageId: row.last_message_id,
    threadStatus: row.thread_status,
    contactOptOut: row.contact_opt_out,
    moduleKey,
    ruleVersion,
    reasonCode: input.reasonCode || null,
    candidateRevision: currentCandidateRevision,
    snapshotRevision: currentCandidateRevision,
  };

  // Construct typed server metadata
  const metadata: Record<string, unknown> = {
    moduleKey,
    ruleVersion,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };

  // 5. Attempt INSERT with ON CONFLICT DO NOTHING
  const insertRes = await client.query<IntegrationSuggestionRecord>(
    `INSERT INTO public.integration_suggestions (
      workspace_id, idempotency_key, payload_fingerprint, source,
      module_key, rule_version,
      thread_id, contact_id,
      suggestion_type, title, body, draft_message,
      priority, metadata, origin_snapshot, expires_at
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'n8n'),
      $5, $6,
      $7, $8,
      COALESCE($9, 'follow_up'), $10, $11, $12,
      COALESCE($13, 'normal'), COALESCE($14, '{}'::jsonb), COALESCE($15, '{}'::jsonb), $16
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
    RETURNING *;`,
    [
      workspaceId,
      input.idempotencyKey,
      incomingFingerprint,
      input.source || "n8n",
      moduleKey,
      ruleVersion,
      input.threadId,
      verifiedContactId,
      input.suggestionType || "follow_up",
      input.title,
      input.body,
      input.draftMessage || null,
      input.priority || "normal",
      JSON.stringify(metadata),
      JSON.stringify(originSnapshot),
      input.expiresAt || null,
    ]
  );

  if (insertRes.rows[0]) {
    return { suggestion: insertRes.rows[0], created: true };
  }

  // 6. Conflict under concurrent race: fetch existing record
  const conflictRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [workspaceId, input.idempotencyKey]
  );

  const conflict = conflictRes.rows[0];
  if (!conflict) {
    throw new Error("Idempotency conflict but existing row not found — race condition or RLS violation");
  }

  // Verify semantic fingerprint (fail-closed: empty fingerprint rejects replay)
  if (!conflict.payload_fingerprint || conflict.payload_fingerprint !== incomingFingerprint) {
    throw new SuggestionIdempotencyConflictError(input.idempotencyKey);
  }

  return { suggestion: conflict, created: false };
}

/**
 * Lists suggestions for a workspace with automatic exclusion of expired suggestions.
 */
export async function listIntegrationSuggestions(
  client: Pool | PoolClient,
  workspaceId: string,
  options: {
    status?: SuggestionStatus;
    limit?: number;
    offset?: number;
    threadId?: string;
  } = {}
): Promise<{ items: IntegrationSuggestionRecord[]; total: number }> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  let whereClause = "WHERE workspace_id = $1";
  const params: unknown[] = [workspaceId];
  let paramIndex = 2;

  if (options.status) {
    if (options.status === "pending") {
      whereClause += ` AND status = 'pending' AND (expires_at IS NULL OR expires_at > clock_timestamp())`;
    } else {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }
  } else {
    whereClause += ` AND (status != 'pending' OR expires_at IS NULL OR expires_at > clock_timestamp())`;
  }

  if (options.threadId) {
    whereClause += ` AND thread_id = $${paramIndex}`;
    params.push(options.threadId);
    paramIndex++;
  }

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.integration_suggestions ${whereClause};`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const dataRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     ${whereClause}
     ORDER BY 
       CASE priority
         WHEN 'urgent' THEN 0
         WHEN 'high' THEN 1
         WHEN 'normal' THEN 2
         WHEN 'low' THEN 3
       END,
       created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`,
    [...params, limit, offset]
  );

  return { items: dataRes.rows, total };
}

/**
 * Gets the count of active, non-expired pending suggestions for a workspace.
 */
export async function countPendingSuggestions(
  client: Pool | PoolClient,
  workspaceId: string
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM public.integration_suggestions
     WHERE workspace_id = $1 
       AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > clock_timestamp());`,
    [workspaceId]
  );
  return parseInt(res.rows[0]?.count || "0", 10);
}

/**
 * Decides a suggestion with transactional origin revalidation, module governance revalidation,
 * and centralized structured persistence.
 * If rejected/invalidated, commits the updated row with structured rejection_code and rejection_reason.
 * 
 * NEVER throws inside the transaction on domain rejection; returns SuggestionDecisionResult.
 */
export async function decideSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  suggestionId: string,
  decision: {
    status: "accepted" | "dismissed";
    decidedByUserId: string;
    expectedStateVersion: number;
  }
): Promise<SuggestionDecisionResult> {
  // 1. Lock and fetch target suggestion row + workspace module config
  const sugRes = await client.query<IntegrationSuggestionRecord & {
    ws_is_active: boolean;
    radar_enabled: boolean;
    ws_rule_version: string;
  }>(
    `SELECT s.*, w.is_active as ws_is_active, w.radar_enabled, w.radar_rule_version as ws_rule_version
     FROM public.integration_suggestions s
     JOIN public.workspaces w ON w.id = s.workspace_id
     WHERE s.workspace_id = $1 AND s.id = $2
     FOR UPDATE OF s;`,
    [workspaceId, suggestionId]
  );

  const suggestion = sugRes.rows[0];
  if (!suggestion) {
    return {
      ok: false,
      code: "SUGGESTION_NOT_FOUND",
      reason: "Sugestão não encontrada no workspace",
      suggestion: null,
    };
  }

  // 2. CHECK TERMINAL STATUS FIRST!
  // An already decided suggestion (accepted, dismissed, invalidated, expired) is immutable.
  // Re-evaluation under changed workspace governance (e.g. disabled radar or bumped rule version)
  // MUST NOT overwrite an already decided suggestion.
  if (suggestion.status !== "pending") {
    let existingAction: CommercialActionRecord | null = null;
    if (suggestion.thread_id) {
      existingAction = await getOpenCommercialAction(client, workspaceId, suggestion.thread_id);
    }
    return {
      ok: false,
      code: "ALREADY_DECIDED",
      reason: `Sugestão já foi decidida anteriormente (status: ${suggestion.status})`,
      suggestion,
      action: existingAction ?? undefined,
    };
  }

  // 3. OPTIMISTIC CONCURRENCY CHECK SECOND!
  // If the client's expected state version does not match, return VERSION_MISMATCH without mutating the row.
  if (suggestion.state_version !== decision.expectedStateVersion) {
    return {
      ok: false,
      code: "VERSION_MISMATCH",
      reason: `Conflito de versão concorrente (esperado: ${decision.expectedStateVersion}, atual: ${suggestion.state_version})`,
      suggestion,
    };
  }

  // Helper for safe rejections that increments state_version and persists structured metadata
  const safeReject = async (
    status: "invalidated" | "expired",
    code: SuggestionRejectionCode,
    reason: string
  ): Promise<SuggestionDecisionResult> => {
    const inv = await persistSuggestionRejection(
      client,
      workspaceId,
      suggestionId,
      status,
      code,
      reason,
      decision.expectedStateVersion,
      decision.decidedByUserId
    );
    return {
      ok: false,
      code,
      reason,
      suggestion: inv || suggestion,
    };
  };

  // 4. Workspace & Governance revalidation
  if (!suggestion.ws_is_active) {
    return safeReject("invalidated", "WORKSPACE_INACTIVE", "Workspace inativo");
  }

  if (!suggestion.radar_enabled) {
    return safeReject("invalidated", "MODULE_DISABLED", "Módulo Radar desabilitado para este workspace");
  }

  if (suggestion.module_key !== "radar_m01") {
    return safeReject("invalidated", "MODULE_DISABLED", `Módulo '${suggestion.module_key}' não é suportado`);
  }

  if (suggestion.rule_version !== suggestion.ws_rule_version) {
    return safeReject(
      "invalidated",
      "RULE_VERSION_STALE",
      `Versão da regra '${suggestion.rule_version}' desatualizada em relação à versão ativa '${suggestion.ws_rule_version}'`
    );
  }

  // 5. Expiration check using database clock
  const expiryCheck = await client.query<{ is_expired: boolean }>(
    `SELECT (expires_at IS NOT NULL AND expires_at <= clock_timestamp()) as is_expired
     FROM public.integration_suggestions
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, suggestionId]
  );

  if (expiryCheck.rows[0]?.is_expired) {
    return safeReject(
      "expired",
      "SUGGESTION_EXPIRED",
      "Sugestão expirada pelo tempo limite e não pode mais ser aceita"
    );
  }

  // 6. Origin revalidation if accepting and thread is present
  if (decision.status === "accepted" && suggestion.thread_id) {
    const originSnap = suggestion.origin_snapshot;
    if (!originSnap || !originSnap.lastMessageAt || !originSnap.threadId) {
      return safeReject(
        "invalidated",
        "INVALID_SNAPSHOT",
        "Snapshot de origem ausente ou incompleto. Sugestão invalidada."
      );
    }

    const threadRes = await client.query<{
      status: string;
      last_message_at: Date;
      contact_id: string;
      opt_out: boolean;
      current_last_message_id: string | null;
      current_last_message_at: Date | null;
    }>(
      `SELECT t.status, t.last_message_at, t.contact_id,
              c.opt_out,
              m.id as current_last_message_id,
              m.created_at as current_last_message_at
       FROM public.commercial_threads t
       JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
       LEFT JOIN LATERAL (
         SELECT id, created_at
         FROM public.messages
         WHERE workspace_id = t.workspace_id AND thread_id = t.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) m ON true
       WHERE t.workspace_id = $1 AND t.id = $2
      FOR UPDATE OF t;`,
      [workspaceId, suggestion.thread_id]
    );

    const threadRow = threadRes.rows[0];
    if (!threadRow) {
      return safeReject(
        "invalidated",
        "ORIGIN_THREAD_CLOSED",
        "A conversa de origem não foi encontrada"
      );
    }

    if (threadRow.status === "closed") {
      return safeReject(
        "invalidated",
        "ORIGIN_THREAD_CLOSED",
        "A conversa de origem foi encerrada. Sugestão invalidada."
      );
    }

    if (threadRow.status === "waiting_human") {
      return safeReject(
        "invalidated",
        "ORIGIN_THREAD_HANDOFF",
        "A conversa está sob controle humano / handoff ativo. Sugestão não aplicável."
      );
    }

    if (threadRow.opt_out) {
      return safeReject(
        "invalidated",
        "ORIGIN_CONTACT_OPT_OUT",
        "O contato realizou opt-out de mensagens. Sugestão invalidada."
      );
    }

    // Stale check: New message arrived after snapshot
    const snapTime = new Date(originSnap.lastMessageAt).getTime();
    const currTime = threadRow.current_last_message_at ? new Date(threadRow.current_last_message_at).getTime() : 0;

    const hasNewerTime = currTime > snapTime;
    const hasDifferentId = Boolean(originSnap.lastMessageId && threadRow.current_last_message_id && threadRow.current_last_message_id !== originSnap.lastMessageId);

    if (hasNewerTime || hasDifferentId) {
      return safeReject(
        "invalidated",
        "ORIGIN_STALE_NEW_MESSAGE",
        "Uma nova mensagem foi recebida na conversa após a geração da sugestão. O operador deve avaliar o contexto recente."
      );
    }
  }

  // 7. Apply successful decision (status = accepted or dismissed)
  const updateRes = await client.query<IntegrationSuggestionRecord>(
    `UPDATE public.integration_suggestions
     SET status = $1,
         decided_by_user_id = $2,
         decided_at = clock_timestamp(),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE workspace_id = $3
       AND id = $4
       AND status = 'pending'
       AND state_version = $5
     RETURNING *;`,
    [
      decision.status,
      decision.decidedByUserId,
      workspaceId,
      suggestionId,
      decision.expectedStateVersion,
    ]
  );

  const updated = updateRes.rows[0];
  if (!updated) {
    const latestRes = await client.query<IntegrationSuggestionRecord>(
      `SELECT * FROM public.integration_suggestions WHERE workspace_id = $1 AND id = $2;`,
      [workspaceId, suggestionId]
    );
    const latest = latestRes.rows[0];
    if (latest && latest.status !== "pending") {
      let existingAction: CommercialActionRecord | null = null;
      if (latest.thread_id) {
        existingAction = await getOpenCommercialAction(client, workspaceId, latest.thread_id);
      }
      return {
        ok: false,
        code: "ALREADY_DECIDED",
        reason: `Sugestão já foi decidida anteriormente (status: ${latest.status})`,
        suggestion: latest,
        action: existingAction ?? undefined,
      };
    }
    return {
      ok: false,
      code: "VERSION_MISMATCH",
      reason: "Falha concorrente ao atualizar sugestão",
      suggestion: latest || null,
    };
  }

  // Atomically create or link open commercial action for the thread upon acceptance
  let linkedAction: CommercialActionRecord | undefined;
  if (decision.status === "accepted" && updated.thread_id) {
    const actionResult = await createCommercialAction(client, {
      workspaceId,
      threadId: updated.thread_id,
      suggestionId: updated.id,
      title: updated.title,
      description: updated.draft_message || updated.body,
      dueAt: updated.expires_at ? new Date(updated.expires_at) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      origin: "radar_suggestion",
      createdByUserId: decision.decidedByUserId,
    });
    linkedAction = actionResult.action;
  }

  return {
    ok: true,
    suggestion: updated,
    action: linkedAction,
  };
}

/**
 * Expires all suggestions past their expires_at timestamp.
 * Called by background worker (sos_worker_user).
 */
export async function expireStaleIntegrationSuggestions(
  client: Pool | PoolClient
): Promise<number> {
  const res = await client.query(
    `UPDATE public.integration_suggestions
     SET status = 'expired',
         decided_at = clock_timestamp(),
         metadata = metadata || jsonb_build_object(
           'rejection_code', 'SUGGESTION_EXPIRED',
           'rejection_reason', 'Sugestão expirada pelo tempo limite',
           'invalidation_reason', 'Sugestão expirada pelo tempo limite',
           'rejected_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         ),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at <= clock_timestamp();`
  );

  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Governed Candidate Query
// ---------------------------------------------------------------------------

export interface ListCandidatesOptions {
  minHoursSinceLastMessage?: number;
  limit?: number;
  cursor?: string;
  threadId?: string;
}

/**
 * Returns threads eligible for integration suggestions.
 * Contract guarantees:
 * - Stable cursor pagination with ID tie-breaking (throws InvalidCursorError on malformed cursor)
 * - Single identity per candidate (LATERAL joins prevent row multiplication)
 * - Structured evidence, ruleVersion, moduleKey, reasonCode, candidateRevision
 * - Strict exclusion of closed, handoff (waiting_human), opt-out contacts, and active cooldown
 * - Exclusion if workspace or radar module is disabled
 * - Bounded cooldown: 0 is respected via ?? (does not default to 86400)
 */
export async function listIntegrationCandidates(
  client: Pool | PoolClient,
  workspaceId: string,
  options: ListCandidatesOptions = {}
): Promise<{ items: GovernedCandidateRecord[]; total: number; nextCursor: string | null }> {
  // Check workspace and module enablement
  const wsRes = await client.query<{
    is_active: boolean;
    radar_enabled: boolean;
    radar_rule_version: string;
    radar_cooldown_seconds: number;
  }>(
    `SELECT is_active, radar_enabled, radar_rule_version, radar_cooldown_seconds
     FROM public.workspaces
     WHERE id = $1;`,
    [workspaceId]
  );

  const ws = wsRes.rows[0];
  if (!ws || !ws.is_active || !ws.radar_enabled) {
    return { items: [], total: 0, nextCursor: null };
  }

  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const minHours = Math.max(options.minHoursSinceLastMessage ?? 0, 0);
  const moduleKey = "radar_m01";
  const ruleVersion = ws.radar_rule_version || "1.0.0";
  const cooldownSeconds = ws.radar_cooldown_seconds ?? 86400;

  // Decode cursor if provided (throws InvalidCursorError if malformed)
  let cursorCondition = "";
  const queryParams: unknown[] = [workspaceId, minHours, cooldownSeconds, options.threadId ?? null];
  let paramIdx = 5;

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    cursorCondition = `AND (t.last_message_at, t.id) > ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
    queryParams.push(decoded.lastMessageAt, decoded.id);
    paramIdx += 2;
  }

  // Base WHERE: active or waiting_client ONLY, contacts not opted out,
  // AND no suggestion in cooldown (whether pending, accepted, or dismissed)
  const baseWhere = `
    WHERE t.workspace_id = $1
      AND t.status IN ('active', 'waiting_client')
      AND c.opt_out = false
      AND ($4::uuid IS NULL OR t.id = $4::uuid)
      AND EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600 >= $2
      AND NOT EXISTS (
        SELECT 1 FROM public.integration_suggestions s
        WHERE s.workspace_id = t.workspace_id
          AND s.thread_id = t.id
          AND s.module_key = 'radar_m01'
          AND (
            (s.status = 'pending' AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp()))
            OR
            ($3::integer > 0 AND s.created_at > clock_timestamp() - ($3 || ' seconds')::interval)
          )
      )
  `;

  // Count total eligible candidates
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     ${baseWhere};`,
    [workspaceId, minHours, cooldownSeconds, options.threadId ?? null]
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  // Fetch limit + 1 to calculate nextCursor
  const dataRes = await client.query<{
    thread_id: string;
    contact_id: string;
    contact_name: string | null;
    contact_phone: string;
    contact_opt_out: boolean;
    thread_status: string;
    last_message_at: Date;
    last_message_at_raw: string;
    last_message_id: string | null;
    last_msg_created_at_raw: string | null;
    last_message_direction: string | null;
    last_message_body: string | null;
    hours_since_last_message: number;
    journey_id: string | null;
    journey_stage: string | null;
    journey_status: string | null;
  }>(
    `SELECT 
       t.id as thread_id,
       t.contact_id,
       c.name as contact_name,
       c.phone_e164 as contact_phone,
       c.opt_out as contact_opt_out,
       t.status as thread_status,
       t.last_message_at,
       to_char(t.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_message_at_raw,
       last_msg.id as last_message_id,
       to_char(last_msg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_msg_created_at_raw,
       last_msg.direction as last_message_direction,
       last_msg.body as last_message_body,
       ROUND(EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600)::integer as hours_since_last_message,
       j.id as journey_id,
       j.stage as journey_stage,
       j.status as journey_status
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     LEFT JOIN LATERAL (
       SELECT m.id, m.direction, m.body, m.created_at
       FROM public.messages m
       WHERE m.workspace_id = t.workspace_id
         AND m.thread_id = t.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) last_msg ON true
     LEFT JOIN LATERAL (
       SELECT id, stage, status
       FROM public.commercial_journeys
       WHERE workspace_id = t.workspace_id
         AND thread_id = t.id
         AND status = 'open'
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) j ON true
     ${baseWhere}
     ${cursorCondition}
     ORDER BY t.last_message_at ASC, t.id ASC
     LIMIT $${paramIdx};`,
    [...queryParams, limit + 1]
  );

  const rows = dataRes.rows;
  const hasMore = rows.length > limit;
  const resultRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const lastItem = resultRows[resultRows.length - 1];
    if (lastItem) {
      nextCursor = encodeCursor(lastItem.last_message_at_raw, lastItem.thread_id);
    }
  }

  const items: GovernedCandidateRecord[] = resultRows.map((r) => {
    const lastMsgAtStr = r.last_msg_created_at_raw || r.last_message_at_raw;
    const candidateRevision = computeCandidateRevision({
      threadId: r.thread_id,
      contactId: r.contact_id,
      lastMessageAtRaw: lastMsgAtStr,
      lastMessageId: r.last_message_id,
      threadStatus: r.thread_status,
      contactOptOut: r.contact_opt_out,
      moduleKey,
      ruleVersion,
    });

    const reasonCode =
      r.hours_since_last_message >= 24
        ? "COLD_LEAD_REENGAGEMENT"
        : r.last_message_direction === "inbound"
        ? "UNANSWERED_CLIENT_INQUIRY"
        : "FOLLOWUP_DUE";

    return {
      candidateId: r.thread_id,
      threadId: r.thread_id,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      moduleKey,
      ruleVersion,
      reasonCode,
      evidence: {
        hoursSinceLastMessage: r.hours_since_last_message,
        lastMessageAt: r.last_message_at.toISOString(),
        lastMessageDirection: r.last_message_direction,
        lastMessageBody: r.last_message_body,
        lastMessageId: r.last_message_id,
        threadStatus: r.thread_status,
        journeyId: r.journey_id,
        journeyStage: r.journey_stage,
        journeyStatus: r.journey_status,
      },
      candidateRevision,
      snapshotRevision: candidateRevision,
      lastMessageAt: r.last_message_at,
    };
  });

  return { items, total, nextCursor };
}
