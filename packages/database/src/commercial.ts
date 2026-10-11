import type { Pool, PoolClient } from "pg";
import crypto from "node:crypto";

export type JourneyStage = "lead" | "qualified" | "proposal" | "scheduled" | "won" | "lost";
export type JourneyStatus = "open" | "won" | "lost" | "archived";
export type AttributionSource = "ctwa_meta" | "lead_ads_meta" | "tracked_link_meta" | "organic_whatsapp" | "manual_input";
export type OutcomeStatus = "won" | "lost";
export type CanonicalConversionEvent =
  | "LeadCaptured"
  | "LeadQualified"
  | "AppointmentScheduled"
  | "ProposalAccepted"
  | "PurchaseCompleted"
  | "PurchaseRefunded";
export type CapiDispatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "ACCEPTED"
  | "FAILED"
  | "NOT_APPLICABLE"
  | "SIMULATED"
  | "NOT_CONFIGURED"
  | "DISCARDED";

export interface CommercialJourneyRecord {
  id: string;
  workspace_id: string;
  contact_id: string;
  thread_id: string | null;
  assigned_user_id: string | null;
  title: string;
  stage: JourneyStage;
  status: JourneyStatus;
  attribution_source: AttributionSource;
  campaign_id: string | null;
  ad_id: string | null;
  ctwa_clid: string | null;
  estimated_value_cents: number;
  created_at: Date;
  updated_at: Date;
}

export interface CommercialOutcomeRecord {
  id: string;
  workspace_id: string;
  journey_id: string;
  status: OutcomeStatus;
  value_cents: number;
  currency: string;
  reason: string | null;
  registered_by_user_id: string;
  created_at: Date;
}

export interface ConversionEventRecord {
  id: string;
  workspace_id: string;
  journey_id: string;
  outcome_id: string | null;
  event_name: CanonicalConversionEvent;
  event_time: Date;
  value_cents: number | null;
  currency: string;
  user_data: Record<string, unknown>;
  status: CapiDispatchStatus;
  lease_token?: string | null;
  lease_expires_at?: Date | null;
  provider_receipt: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
  updated_at?: Date;
}

export interface CreateJourneyInput {
  contactId: string;
  threadId?: string | null;
  assignedUserId?: string | null;
  title?: string;
  stage?: JourneyStage;
  attributionSource?: AttributionSource;
  campaignId?: string | null;
  adId?: string | null;
  ctwaClid?: string | null;
  estimatedValueCents?: number;
}

export interface RecordOutcomeInput {
  journeyId: string;
  status: OutcomeStatus;
  valueCents: number;
  currency?: string;
  reason?: string;
  registeredByUserId: string;
  userPhoneE164?: string;
}

/**
 * Creates a commercial journey (opportunity/deal) strictly bound to tenant RLS.
 */
export async function createCommercialJourney(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateJourneyInput
): Promise<CommercialJourneyRecord> {
  const res = await client.query<CommercialJourneyRecord>(
    `INSERT INTO public.commercial_journeys (
      workspace_id, contact_id, thread_id, assigned_user_id,
      title, stage, status, attribution_source,
      campaign_id, ad_id, ctwa_clid, estimated_value_cents
    ) VALUES (
      $1, $2, $3, $4,
      COALESCE($5, 'Oportunidade Comercial'),
      COALESCE($6, 'lead'),
      'open',
      COALESCE($7, 'organic_whatsapp'),
      $8, $9, $10,
      COALESCE($11, 0)
    ) RETURNING *;`,
    [
      workspaceId,
      input.contactId,
      input.threadId || null,
      input.assignedUserId || null,
      input.title || null,
      input.stage || "lead",
      input.attributionSource || "organic_whatsapp",
      input.campaignId || null,
      input.adId || null,
      input.ctwaClid || null,
      input.estimatedValueCents || 0,
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to insert commercial journey record under tenant scope");
  }
  return row;
}

/**
 * Finds or retrieves a commercial journey by contact ID under tenant scope.
 */
export async function getJourneyByContact(
  client: Pool | PoolClient,
  workspaceId: string,
  contactId: string
): Promise<CommercialJourneyRecord | null> {
  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1 AND contact_id = $2
     ORDER BY created_at DESC
     LIMIT 1;`,
    [workspaceId, contactId]
  );
  return res.rows[0] ?? null;
}

/**
 * Retrieves a commercial journey by thread ID under tenant scope.
 */
export async function getJourneyByThread(
  client: Pool | PoolClient,
  workspaceId: string,
  threadId: string
): Promise<CommercialJourneyRecord | null> {
  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at DESC
     LIMIT 1;`,
    [workspaceId, threadId]
  );
  return res.rows[0] ?? null;
}

/**
 * Records a commercial outcome (closed deal) with real monetary value,
 * transitions the journey status, and automatically enqueues a Meta CAPI conversion event.
 */
export async function recordCommercialOutcome(
  client: Pool | PoolClient,
  workspaceId: string,
  input: RecordOutcomeInput
): Promise<{ outcome: CommercialOutcomeRecord; conversionEvent: ConversionEventRecord | null }> {
  if (!input.registeredByUserId || !input.registeredByUserId.trim()) {
    throw new Error("ACTOR_REQUIRED: Responsável pelo registro do desfecho comercial é obrigatório");
  }

  // 1. Fetch journey under tenant RLS with exclusive row lock to prevent race conditions
  const journeyRes = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
    [workspaceId, input.journeyId]
  );
  const journey = journeyRes.rows[0];
  if (!journey) {
    throw new Error(`Commercial journey ${input.journeyId} not found in workspace ${workspaceId}`);
  }

  // Idempotency & Terminality: inspect existing outcomes for this journey
  const existingOutcomeRes = await client.query<CommercialOutcomeRecord>(
    `SELECT * FROM public.commercial_outcomes 
     WHERE workspace_id = $1 AND journey_id = $2 
     ORDER BY created_at DESC LIMIT 1;`,
    [workspaceId, input.journeyId]
  );
  const existingOutcome = existingOutcomeRes.rows[0];

  if (existingOutcome) {
    const isTerminal = existingOutcome.status === "won" || existingOutcome.status === "lost";
    if (isTerminal) {
      const isStatusIdentical = existingOutcome.status === input.status;
      const isValueIdentical = Number(existingOutcome.value_cents) === input.valueCents;
      const isCurrencyIdentical = (existingOutcome.currency || "BRL") === (input.currency || "BRL");

      if (isStatusIdentical && isValueIdentical && isCurrencyIdentical) {
        // Idempotent replay: return existing outcome and associated conversion event
        const convRes = await client.query<ConversionEventRecord>(
          `SELECT * FROM public.conversion_events WHERE workspace_id = $1 AND outcome_id = $2;`,
          [workspaceId, existingOutcome.id]
        );
        return { outcome: existingOutcome, conversionEvent: convRes.rows[0] ?? null };
      }

      // Terminal conflict: status changed or values diverged
      const err = new Error(
        `Commercial journey ${input.journeyId} already reached terminal outcome '${existingOutcome.status}' (${existingOutcome.value_cents} ${existingOutcome.currency}). Divergent outcome registration with status '${input.status}' (${input.valueCents} ${input.currency || "BRL"}) is prohibited.`
      ) as Error & { code: string; status: number };
      err.code = "OUTCOME_CONFLICT";
      err.status = 409;
      throw err;
    }
  }

  if (journey.status === "won" || journey.status === "lost") {
    const err = new Error(
      `Commercial journey ${input.journeyId} is already in terminal status '${journey.status}'. Cannot register divergent outcome '${input.status}'.`
    ) as Error & { code: string; status: number };
    err.code = "OUTCOME_CONFLICT";
    err.status = 409;
    throw err;
  }

  if (input.status === "lost" && (!input.reason || !input.reason.trim())) {
    throw new Error("REASON_REQUIRED: Motivo do desfecho de perda é obrigatório");
  }

  // 2. Insert outcome
  const outcomeRes = await client.query<CommercialOutcomeRecord>(
    `INSERT INTO public.commercial_outcomes (
      workspace_id, journey_id, status, value_cents, currency, reason, registered_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;`,
    [
      workspaceId,
      input.journeyId,
      input.status,
      input.valueCents,
      input.currency || "BRL",
      input.reason ? input.reason.trim() : null,
      input.registeredByUserId.trim(),
    ]
  );
  const outcome = outcomeRes.rows[0];
  if (!outcome) {
    throw new Error("Failed to insert commercial outcome");
  }

  // 3. Update journey status and stage
  await client.query(
    `UPDATE public.commercial_journeys
     SET status = $1, stage = $1, updated_at = clock_timestamp()
     WHERE workspace_id = $2 AND id = $3;`,
    [input.status, workspaceId, input.journeyId]
  );

  // 4. Evaluate conversion policy for Meta CAPI return loop
  let conversionEvent: ConversionEventRecord | null = null;
  if (input.status === "won") {
    const eventName: CanonicalConversionEvent =
      input.valueCents > 0 ? "PurchaseCompleted" : "ProposalAccepted";

    const userData: Record<string, unknown> = {};

    // S-07: Authoritative customer phone derivation: consult contacts.phone_e164 in the workspace FIRST
    let customerPhone: string | undefined;
    let contactMeta: Record<string, any> | undefined;
    if (journey.contact_id) {
      const contactRes = await client.query<{ phone_e164: string; metadata: any }>(
        `SELECT phone_e164, metadata FROM public.contacts WHERE workspace_id = $1 AND id = $2;`,
        [workspaceId, journey.contact_id]
      );
      const row = contactRes.rows[0];
      const contactPhone = row?.phone_e164?.trim();
      contactMeta = row?.metadata;
      if (contactPhone) {
        customerPhone = contactPhone;
      }
    }

    // Fallback to caller-supplied userPhoneE164 ONLY if contact had no phone and caller provided valid E.164
    if (!customerPhone && input.userPhoneE164) {
      const trimmed = input.userPhoneE164.trim();
      if (/^\+[1-9]\d{6,14}$/.test(trimmed)) {
        customerPhone = trimmed;
      }
    }

    if (customerPhone) {
      userData.hashedPhone = crypto
        .createHash("sha256")
        .update(customerPhone.replace(/\D/g, ""))
        .digest("hex");
    }
    if (journey.ctwa_clid) {
      userData.ctwaClid = journey.ctwa_clid;
    }

    // Customer Intelligence & Recurrence update
    if (journey.contact_id) {
      const prevOrders = Number(contactMeta?.totalOrders || (contactMeta?.isRecurring ? 1 : 0));
      const newOrders = prevOrders + 1;
      const prevSpent = Number(contactMeta?.totalSpentCents || 0);
      const newSpent = prevSpent + Math.max(0, input.valueCents || 0);
      const isRecurring = newOrders > 1;

      await client.query(
        `UPDATE public.contacts
         SET metadata = metadata || $3::jsonb,
             updated_at = clock_timestamp()
         WHERE workspace_id = $1 AND id = $2;`,
        [
          workspaceId,
          journey.contact_id,
          JSON.stringify({
            isRecurring,
            totalOrders: newOrders,
            totalSpentCents: newSpent,
            lastOrderAt: new Date().toISOString(),
          }),
        ]
      );

      userData.isRecurringCustomer = isRecurring;
      userData.ordersCount = newOrders;
      userData.customerLtv = newSpent / 100;
      if (contactMeta?.email && typeof contactMeta.email === "string" && contactMeta.email.trim()) {
        userData.hashedEmail = crypto
          .createHash("sha256")
          .update(contactMeta.email.trim().toLowerCase())
          .digest("hex");
      }
    }

    const convRes = await client.query<ConversionEventRecord>(
      `INSERT INTO public.conversion_events (
        workspace_id, journey_id, outcome_id, event_name, value_cents, currency, user_data, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'QUEUED')
      RETURNING *;`,
      [
        workspaceId,
        input.journeyId,
        outcome.id,
        eventName,
        input.valueCents,
        input.currency || "BRL",
        JSON.stringify(userData),
      ]
    );
    conversionEvent = convRes.rows[0] ?? null;
  }

  return { outcome, conversionEvent };
}

/**
 * Lists all commercial journeys in the workspace for CRM / Cockpit pipelines.
 */
export async function listCommercialJourneys(
  client: Pool | PoolClient,
  workspaceId: string,
  options: { status?: JourneyStatus; limit?: number } = {}
): Promise<CommercialJourneyRecord[]> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  if (options.status) {
    const res = await client.query<CommercialJourneyRecord>(
      `SELECT * FROM public.commercial_journeys
       WHERE workspace_id = $1 AND status = $2
       ORDER BY updated_at DESC
       LIMIT $3;`,
      [workspaceId, options.status, limit]
    );
    return res.rows;
  }

  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2;`,
    [workspaceId, limit]
  );
  return res.rows;
}

/**
 * Claims a batch of queued conversion events for the CAPI dispatcher.
 * Uses atomic CTE with SKIP LOCKED and lease expiration to prevent duplicate worker dispatches.
 */
export async function claimQueuedConversionEvents(
  pool: Pool,
  options?: number | { limit?: number; leaseToken?: string; leaseDurationSeconds?: number }
): Promise<ConversionEventRecord[]> {
  const limit = typeof options === "number" ? options : (options?.limit || 10);
  const leaseToken = typeof options === "object" && options?.leaseToken ? options.leaseToken : crypto.randomUUID();
  const durationSecs = typeof options === "object" && options?.leaseDurationSeconds ? options.leaseDurationSeconds : 60;
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const res = await pool.query<ConversionEventRecord>(
    `WITH eligible AS (
       SELECT id
       FROM public.conversion_events
       WHERE status = 'QUEUED'
          OR (status = 'PROCESSING' AND lease_expires_at < now())
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE public.conversion_events ce
     SET status = 'PROCESSING',
         lease_token = $2,
         lease_expires_at = now() + make_interval(secs => $3),
         updated_at = now()
     FROM eligible
     WHERE ce.id = eligible.id
     RETURNING ce.*;`,
    [safeLimit, leaseToken, durationSecs]
  );
  return res.rows;
}

/**
 * Marks a conversion event as processed with Meta receipt or error.
 * Supports honest status tracking (ACCEPTED, FAILED, SIMULATED, NOT_CONFIGURED, DISCARDED)
 * and safely clears lease token.
 */
export async function markConversionEventResult(
  client: Pool | PoolClient,
  eventId: string,
  result: {
    success?: boolean;
    status?: "ACCEPTED" | "FAILED" | "SIMULATED" | "NOT_CONFIGURED" | "DISCARDED";
    receipt?: Record<string, unknown>;
    error?: string;
    leaseToken?: string | null;
  }
): Promise<void> {
  const finalStatus =
    result.status ||
    (result.success ? "ACCEPTED" : "FAILED");

  await client.query(
    `UPDATE public.conversion_events
     SET status = $1,
         provider_receipt = $2,
         error_message = $3,
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = now()
     WHERE id = $4
       AND status IN ('QUEUED', 'PROCESSING')
       AND ($5::text IS NULL OR lease_token IS NULL OR lease_token = $5);`,
    [
      finalStatus,
      result.receipt ? JSON.stringify(result.receipt) : null,
      result.error || null,
      eventId,
      result.leaseToken || null,
    ]
  );
}
