import crypto from "node:crypto";
import type { PoolClient, PixChargeRecord } from "@sos-sales/database";
import { logger } from "@sos-sales/observability";
import { enqueuePixConfirmationMessage } from "./pix-notification";

export interface AbacatePayConfig {
  apiKey: string | null;
  webhookSecret: string | null;
  enabled: boolean;
}

export interface AbacatePayProductPayload {
  externalId: string;
  name: string;
  quantity: number;
  price: number; // in cents
  description?: string;
}

export interface AbacatePayCustomerPayload {
  name?: string;
  cellphone?: string;
  email?: string;
  taxId?: string;
}

export interface CreateBillingRequest {
  apiKey: string;
  amountCents: number;
  title: string;
  customer?: AbacatePayCustomerPayload;
  metadata?: Record<string, string>;
  returnUrl?: string;
  completionUrl?: string;
  fetchFn?: typeof fetch;
}

export interface AbacatePayBillingResult {
  id: string;
  url: string;
  amountCents: number;
  status: string;
  pixCode: string | null;
  pixQrCode: string | null;
  rawResponse: Record<string, unknown>;
}

export interface ReconcileSettlementParams {
  workspaceId: string;
  eventId: string;
  billingId: string;
  paidAmountCents?: number;
  customerData?: AbacatePayCustomerPayload;
  metadata?: Record<string, string>;
}

/**
 * Resolves workspace AbacatePay configuration with fallback to environment variables.
 */
export async function getAbacatePayConfig(
  client: PoolClient,
  workspaceId: string
): Promise<AbacatePayConfig> {
  const res = await client.query<{
    abacatepay_api_key: string | null;
    abacatepay_webhook_secret: string | null;
    abacatepay_enabled: boolean | null;
  }>(
    `SELECT abacatepay_api_key, abacatepay_webhook_secret, abacatepay_enabled
     FROM public.workspaces WHERE id = $1`,
    [workspaceId]
  );

  const row = res.rows[0];
  const apiKey = row?.abacatepay_api_key?.trim() || process.env.ABACATEPAY_API_KEY?.trim() || null;
  const webhookSecret =
    row?.abacatepay_webhook_secret?.trim() || process.env.ABACATEPAY_WEBHOOK_SECRET?.trim() || null;
  const enabled = row?.abacatepay_enabled ?? Boolean(apiKey);

  return {
    apiKey,
    webhookSecret,
    enabled,
  };
}

/**
 * Validates AbacatePay webhook authenticity using either HMAC-SHA256 signature
 * or constant-time query secret comparison. Fail-closed.
 */
export function verifyAbacatePayWebhookSignature(params: {
  secret: string;
  rawBody?: Buffer;
  signatureHeader?: string;
  querySecret?: string;
}): boolean {
  const { secret, rawBody, signatureHeader, querySecret } = params;
  if (!secret || secret.length < 8) return false;

  // 1. Query parameter token verification (timing-safe)
  if (querySecret && typeof querySecret === "string") {
    const given = Buffer.from(querySecret);
    const expected = Buffer.from(secret);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      return true;
    }
  }

  // 2. Header HMAC-SHA256 verification (X-Webhook-Signature / AbacatePay-Signature)
  if (signatureHeader && rawBody && rawBody.length > 0) {
    const cleanSig = signatureHeader.replace(/^sha256=/i, "").trim();
    if (/^[0-9a-f]{64}$/i.test(cleanSig)) {
      const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      const given = Buffer.from(cleanSig, "hex");
      const expected = Buffer.from(hmac, "hex");
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Creates a billing session / Pix charge on AbacatePay API.
 */
export async function createAbacatePayBilling(
  req: CreateBillingRequest
): Promise<AbacatePayBillingResult> {
  const fetchClient = req.fetchFn ?? fetch;
  const url = "https://api.abacatepay.com/v1/billing/create";

  const customerPayload: Record<string, string> = {};
  if (req.customer?.name) customerPayload.name = req.customer.name.slice(0, 100);
  if (req.customer?.cellphone) customerPayload.cellphone = req.customer.cellphone.slice(0, 20);
  if (req.customer?.email) customerPayload.email = req.customer.email.slice(0, 100);
  if (req.customer?.taxId) customerPayload.taxId = req.customer.taxId.replace(/\D/g, "");

  const payload = {
    frequency: "ONE_TIME",
    methods: ["PIX"],
    products: [
      {
        externalId: req.metadata?.productId || req.metadata?.proposalId || "prod_checkout",
        name: req.title.slice(0, 100),
        quantity: 1,
        price: req.amountCents,
      },
    ],
    returnUrl: req.returnUrl || "https://chat.automatizaprocessos.tech",
    completionUrl: req.completionUrl || "https://chat.automatizaprocessos.tech",
    customer: Object.keys(customerPayload).length > 0 ? customerPayload : undefined,
    metadata: req.metadata,
  };

  const response = await fetchClient(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "MCT-ChatSales-V3/AbacatePay",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, errorText }, "AbacatePay API billing creation failed");
    throw new Error(`ABACATEPAY_ERROR_${response.status}: Falha ao gerar cobrança no AbacatePay`);
  }

  const json = (await response.json()) as Record<string, any>;
  const data = json.data ?? json;

  return {
    id: String(data.id || ""),
    url: String(data.url || ""),
    amountCents: Number(data.amount || req.amountCents),
    status: String(data.status || "PENDING"),
    pixCode: data.pix?.code ?? null,
    pixQrCode: data.pix?.qrCode ?? null,
    rawResponse: json,
  };
}

/**
 * Reconciles an AbacatePay payment notification:
 * - Anti-replay and durable idempotency
 * - Updates pix_charges to PAID
 * - Updates commercial_proposals to accepted (if linked)
 * - Advances commercial_journeys to won
 * - Records commercial outcome (won)
 * - Updates contacts fiscal metadata
 * - Dispatches celebratory WhatsApp message
 * - Enqueues post-sale invoice prompt WABA command
 */
export async function reconcileAbacatePaySettlement(
  client: PoolClient,
  params: ReconcileSettlementParams
): Promise<{
  charge: PixChargeRecord;
  proposalAccepted: boolean;
  alreadySettled: boolean;
}> {
  const { workspaceId, eventId, billingId, paidAmountCents, customerData, metadata } = params;

  // Lock per billingId
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `abacate:${workspaceId}:${billingId}`,
  ]);

  // Check idempotency receipt
  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ billingId, paidAmountCents, customerData, metadata }))
    .digest("hex");

  await client.query(
    `INSERT INTO public.integration_event_receipts(workspace_id, provider, event_key, payload_hash)
     VALUES ($1, 'abacatepay', $2, $3)
     ON CONFLICT DO NOTHING RETURNING event_key`,
    [workspaceId, `${eventId}:${billingId}`, payloadHash]
  );

  // Locate the charge in pix_charges (either by gateway_charge_id or metadata.chargeId)
  let chargeRow: PixChargeRecord | undefined = (
    await client.query<PixChargeRecord>(
      `SELECT * FROM public.pix_charges
       WHERE workspace_id = $1 AND (gateway_charge_id = $2 OR id = $3::uuid)
       LIMIT 1 FOR UPDATE`,
      [
        workspaceId,
        billingId,
        metadata?.chargeId && /^[0-9a-f-]{36}$/i.test(metadata.chargeId)
          ? metadata.chargeId
          : "00000000-0000-0000-0000-000000000000",
      ]
    )
  ).rows[0];

  if (!chargeRow) {
    logger.warn({ workspaceId, billingId, metadata }, "AbacatePay charge not found in pix_charges");
    throw new Error(`COBRANCA_NOT_FOUND: Cobrança ${billingId} não encontrada no Chat Sales`);
  }

  const currentCharge: PixChargeRecord = chargeRow;

  const alreadySettled = currentCharge.status === "PAID";
  if (!alreadySettled) {
    const updated = await client.query(
      `UPDATE public.pix_charges
       SET
         status = 'PAID',
         verification_method = 'BANK_WEBHOOK',
         verified_at = clock_timestamp(),
         verification_notes = $3,
         paid_at = COALESCE(paid_at, clock_timestamp()),
         gateway_charge_id = COALESCE(gateway_charge_id, $4),
         updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [
        workspaceId,
        currentCharge.id,
        `AbacatePay billing ${billingId} (event ${eventId})`.slice(0, 200),
        billingId,
      ]
    );
    const updatedRow = updated.rows[0];
    if (updatedRow) {
      chargeRow = {
        ...currentCharge,
        ...updatedRow,
        amount_cents: Number(updatedRow.amount_cents ?? currentCharge.amount_cents),
        proposal_id: updatedRow.proposal_id ?? currentCharge.proposal_id,
      };
    }
  }

  const finalCharge: PixChargeRecord = chargeRow ?? currentCharge;

  // Record in external_payment_confirmations for durable multi-tenant financial reporting
  await client.query(
    `INSERT INTO public.external_payment_confirmations
     (workspace_id, provider, external_order_id, contact_id, amount_cents, title, status)
     VALUES ($1, 'abacatepay', $2, $3, $4, $5, 'approved')
     ON CONFLICT DO NOTHING`,
    [
      workspaceId,
      billingId,
      finalCharge.contact_id,
      paidAmountCents || finalCharge.amount_cents,
      finalCharge.title || "Cobrança AbacatePay",
    ]
  );

  let proposalAccepted = false;

  // If tied to a commercial proposal, accept it and mark outcome as won!
  if (finalCharge.proposal_id) {
    const propRes = await client.query<{
      id: string;
      status: string;
      journey_id: string | null;
      total_cents: number;
      currency: string;
    }>(
      `SELECT id, status, journey_id, total_cents, currency
       FROM public.commercial_proposals
       WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
      [workspaceId, finalCharge.proposal_id]
    );

    const prop = propRes.rows[0];
    if (prop && prop.status !== "accepted") {
      await client.query(
        `UPDATE public.commercial_proposals
         SET status = 'accepted', accepted_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, prop.id]
      );
      proposalAccepted = true;

      if (prop.journey_id) {
        await client.query(
          `UPDATE public.commercial_journeys
           SET stage = 'won', status = 'won', updated_at = clock_timestamp()
           WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, prop.journey_id]
        );

        await client.query(
          `INSERT INTO public.commercial_outcomes
           (workspace_id, journey_id, status, value_cents, currency, reason, registered_by_user_id)
           VALUES ($1, $2, 'won', $3, $4, 'Compensação automática via AbacatePay Webhook', NULL)
           ON CONFLICT DO NOTHING`,
          [workspaceId, prop.journey_id, prop.total_cents, prop.currency]
        );
      }
    }
  }

  // Enrich contact fiscal metadata if taxId or email is provided
  if (customerData?.taxId || customerData?.email) {
    await client.query(
      `UPDATE public.contacts
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{fiscal}',
         COALESCE(metadata->'fiscal', '{}'::jsonb) || jsonb_build_object(
           'cpf_cnpj', COALESCE($2::text, metadata->'fiscal'->>'cpf_cnpj'),
           'email', COALESCE($3::text, metadata->'fiscal'->>'email'),
           'enriched_via', 'abacatepay_webhook',
           'last_updated_at', clock_timestamp()
         )
       ),
       updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND id = $4`,
      [
        workspaceId,
        customerData.taxId || null,
        customerData.email || null,
        finalCharge.contact_id,
      ]
    );
  }

  // Audit event
  await client.query(
    `INSERT INTO public.audit_events (workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
     VALUES ($1, $1, 'integration', 'payment.settled.abacatepay', 'pix_charge', $2, $3::jsonb)`,
    [
      workspaceId,
      finalCharge.id,
      JSON.stringify({
        billingId,
        eventId,
        amountCents: finalCharge.amount_cents,
        proposalId: finalCharge.proposal_id ?? null,
      }),
    ]
  );

  // Send WhatsApp celebratory notification
  if (!alreadySettled) {
    try {
      await enqueuePixConfirmationMessage(client, workspaceId, finalCharge);
    } catch (notifErr) {
      logger.warn({ err: notifErr, chargeId: finalCharge.id }, "Could not enqueue WhatsApp payment confirmation message");
    }

    // Enqueue Trojan Utility post-sale flow
    try {
      const channelRes = await client.query<{ id: string }>(
        `SELECT ci.id FROM public.commercial_threads t
         JOIN public.channel_instances ci ON ci.id = t.channel_instance_id AND ci.workspace_id = t.workspace_id
         WHERE t.workspace_id = $1 AND t.id = $2 AND ci.is_active = true AND ci.status = 'connected'
         LIMIT 1`,
        [workspaceId, finalCharge.thread_id]
      );

      const channelInstanceId = channelRes.rows[0]?.id;
      if (channelInstanceId) {
        await client.query(
          `INSERT INTO public.outbound_commands (
             workspace_id, channel_instance_id, thread_id, command_type,
             payload, idempotency_key, status
           ) VALUES (
             $1, $2, $3, 'send_message',
             $4::jsonb, $5, 'pending'
           ) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
          [
            workspaceId,
            channelInstanceId,
            finalCharge.thread_id,
            JSON.stringify({
              intent: "post_sale_invoice_prompt",
              chargeId: finalCharge.id,
              proposalId: finalCharge.proposal_id ?? null,
              amountCents: finalCharge.amount_cents,
            }),
            `post-sale-abacate-${finalCharge.id}`,
          ]
        );
      }
    } catch (postSaleErr) {
      logger.warn({ err: postSaleErr, chargeId: finalCharge.id }, "Could not enqueue post-sale command");
    }
  }

  return {
    charge: finalCharge,
    proposalAccepted,
    alreadySettled,
  };
}
