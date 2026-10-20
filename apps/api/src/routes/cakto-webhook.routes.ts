import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction } from "@sos-sales/database";
import { logger } from "@sos-sales/observability";

const paramsSchema = z.object({
  workspaceId: z.string().uuid(),
});

function normalizePhoneToE164(rawPhone?: string | null): string | null {
  if (!rawPhone || typeof rawPhone !== "string") return null;
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith("55")) {
    return `+${digits}`;
  }
  return `+55${digits}`;
}

function verifyCaktoSignature(
  secret: string,
  timestamp: string | undefined,
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  bodySecret: string | undefined
): boolean {
  // Method 1: Check HMAC-SHA256 signature in X-Cakto-Signature header
  if (signatureHeader) {
    if (!timestamp || !rawBody || !/^\d+$/.test(timestamp)) return false;
    const receivedSeconds = Number(timestamp);
    if (!Number.isSafeInteger(receivedSeconds) || Math.abs(Date.now() / 1000 - receivedSeconds) > 300) return false;
    const expectedPrefix = "v1=";
    const cleanSig = signatureHeader.startsWith(expectedPrefix)
      ? signatureHeader.slice(expectedPrefix.length)
      : signatureHeader;

    if (/^[0-9a-f]{64}$/i.test(cleanSig)) {
      const hmac = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest("hex");

      const givenBuf = Buffer.from(cleanSig, "hex");
      const expectedBuf = Buffer.from(hmac, "hex");

      if (givenBuf.length === expectedBuf.length && crypto.timingSafeEqual(givenBuf, expectedBuf)) {
        return true;
      }
    }
  }

  if (signatureHeader) return false;

  // Method 2: Fallback to body.secret comparison (supported by Cakto V1 and V2)
  if (bodySecret && typeof bodySecret === "string") {
    const givenBuf = Buffer.from(bodySecret);
    const expectedBuf = Buffer.from(secret);
    if (givenBuf.length === expectedBuf.length && crypto.timingSafeEqual(givenBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}

export const caktoWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/webhooks/cakto/:workspaceId", async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        type: "https://sos-sales.mct.br/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "workspaceId inválido",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const { workspaceId } = parsedParams.data;
    const rawBody = request.rawBody;
    const body = request.body as Record<string, unknown> | undefined;

    if (!body || typeof body !== "object") {
      return reply.status(400).send({
        type: "https://sos-sales.mct.br/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Corpo da requisição vazio ou inválido",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const eventName = String(body.event ?? "");
    const bodySecret = typeof body.secret === "string" ? body.secret : undefined;
    const signatureHeader = request.headers["x-cakto-signature"] as string | undefined;
    const timestampHeader = request.headers["x-cakto-timestamp"] as string | undefined;

    // Resolve workspace secret for Cakto
    const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;

    if (!expectedSecret || expectedSecret.length < 8) {
      return reply.code(503).send({ detail: "Webhook Cakto não configurado neste ambiente" });
    }
    {
      const isValid = verifyCaktoSignature(
        expectedSecret,
        timestampHeader,
        rawBody,
        signatureHeader,
        bodySecret
      );

      if (!isValid) {
        logger.warn(
          { workspaceId, eventName, correlationId: request.id },
          "Cakto webhook signature verification failed"
        );
        return reply.status(401).send({
          type: "https://sos-sales.mct.br/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Assinatura do webhook Cakto inválida",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }

    const dataObj = body.data;
    if (eventName === "purchase_approved") {
      const order = dataObj as Record<string, unknown> | undefined;
      const cents = Math.round(Number(order?.amount) * 100);
      if (!order || !String(order.id ?? "").trim() || !Number.isSafeInteger(cents) || cents <= 0) {
        return reply.code(400).send({ detail: "Compra exige identificador e valor positivo válidos" });
      }
    }
    if (!["purchase_approved", "checkout_abandonment"].includes(eventName)) {
      return reply.code(200).send({ received: true, ignored: true, event: eventName });
    }
    const eventData = dataObj as Record<string, unknown> | undefined;
    const externalId = String(eventData?.id ?? eventData?.checkoutId ?? "").trim();
    if (!externalId || externalId.length > 200) return reply.code(400).send({ detail: "Evento exige identificador estável da compra/checkout" });
    const phone = eventName === "purchase_approved"
      ? (eventData?.customer as Record<string, unknown> | undefined)?.phone
      : eventData?.customerCellphone;
    if (!normalizePhoneToE164(typeof phone === "string" ? phone : null)) return reply.code(400).send({ detail: "Telefone válido obrigatório para este evento" });
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(dataObj)).digest("hex");
    logger.info({ workspaceId, eventName, correlationId: request.id }, "Received verified Cakto webhook event");

    const outcome = await withTenantTransaction(workspaceId, async (client) => {
      const receipt = await client.query(
        `INSERT INTO public.integration_event_receipts(workspace_id,provider,event_key,payload_hash)
         VALUES ($1,'cakto',$2,$3) ON CONFLICT DO NOTHING RETURNING event_key`,
        [workspaceId, `${eventName}:${externalId}`, payloadHash]
      );
      if (!receipt.rows.length) {
        const previous = await client.query<{ payload_hash: string }>(
          "SELECT payload_hash FROM public.integration_event_receipts WHERE workspace_id=$1 AND provider='cakto' AND event_key=$2",
          [workspaceId, `${eventName}:${externalId}`]
        );
        return previous.rows[0]?.payload_hash === payloadHash ? "duplicate" : "conflict";
      }
      // 1. PURCHASE APPROVED: Advance CRM to 'won' and enqueue WhatsApp confirmation
      if (eventName === "purchase_approved" && dataObj && typeof dataObj === "object") {
        const orderData = dataObj as Record<string, unknown>;
        const orderId = String(orderData.id ?? "");
        const customer = (orderData.customer ?? {}) as Record<string, unknown>;
        const rawPhone = String(customer.phone ?? "");
        const customerName = String(customer.name ?? "Cliente");
        const customerEmail = customer.email ? String(customer.email).toLowerCase().trim() : null;
        const amountBrl = Number(orderData.amount ?? 0);
        const amountCents = Math.round(amountBrl * 100);
        const product = (orderData.product ?? {}) as Record<string, unknown>;
        const productName = String(product.name ?? "Produto");

        const phoneE164 = normalizePhoneToE164(rawPhone);
        if (!phoneE164) {
          logger.warn({ orderId, rawPhone }, "Cakto webhook: customer phone is invalid or missing");
          throw new Error("Invalid customer phone");
        }

        if (!phoneE164) throw new Error("Invalid customer phone");
        // Upsert contact
        const contactRes = await client.query<{ id: string }>(
          `INSERT INTO public.contacts (workspace_id, phone_e164, name, metadata)
           VALUES ($1, $2, $3, jsonb_build_object('email', $4::text, 'cakto_customer_id', $5::text))
           ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, contacts.name),
             metadata = contacts.metadata || EXCLUDED.metadata,
             updated_at = clock_timestamp()
           RETURNING id;`,
          [workspaceId, phoneE164, customerName, customerEmail, customer.id ? String(customer.id) : null]
        );
        const contactId = contactRes.rows[0]!.id;

        // Upsert or locate active commercial thread
        const channelRes = await client.query<{ id: string; provider: string }>(
          `SELECT id, provider FROM public.channel_instances
           WHERE workspace_id = $1 AND is_active = true
           ORDER BY created_at ASC LIMIT 1;`,
          [workspaceId]
        );
        const defaultChannel = channelRes.rows[0];

        let threadId: string | null = null;
        if (defaultChannel) {
          const threadRes = await client.query<{ id: string }>(
            `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
             VALUES ($1, $2, $3, 'active', clock_timestamp())
             ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET
               last_message_at = clock_timestamp(),
               updated_at = clock_timestamp()
             RETURNING id;`,
            [workspaceId, defaultChannel.id, contactId]
          );
          threadId = threadRes.rows[0]?.id ?? null;
        }

        // Record external financial evidence without overwriting a negotiation selected by contact.
        await client.query(`INSERT INTO public.external_payment_confirmations
          (workspace_id,provider,external_order_id,contact_id,amount_cents,title)
          VALUES ($1,'cakto',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [workspaceId,orderId,contactId,amountCents,productName]);
        await client.query(`INSERT INTO public.audit_events(workspace_id,actor_id,actor_type,action,resource_type,resource_id,metadata)
          VALUES ($1,$1,'integration','external.payment.approved','cakto_order',$2,$3::jsonb)`,
          [workspaceId,orderId,JSON.stringify({provider:"cakto",amountCents,contactId})]);

        // Enqueue automated WhatsApp confirmation if channel is active
        if (defaultChannel && threadId) {
          const receiptText = `🎉 Pagamento Confirmado!\n\nOlá, *${customerName}*! Seu pagamento de *R$ ${amountBrl.toFixed(2)}* referente a *${productName}* foi compensado com sucesso.\n\nSeja muito bem-vindo(a)! A equipe dará continuidade ao seu pedido.`;
          const receiptFingerprint = crypto.createHash("sha256").update(receiptText).digest("hex");
          const receiptIdempotencyKey = `cakto-receipt-${orderId}`;

          const msgRes = await client.query<{ id: string }>(
            `INSERT INTO public.messages (
               workspace_id, channel_instance_id, thread_id, provider, direction,
               recipient_e164, content_type, body, delivery_status, status_rank,
               metadata, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, 'outbound',
               $5, 'text', $6, 'pending', 0,
               jsonb_build_object('type', 'cakto_payment_receipt', 'order_id', $7::text),
               clock_timestamp(), clock_timestamp()
             )
             ON CONFLICT (channel_instance_id, provider_message_id) DO NOTHING
             RETURNING id;`,
            [workspaceId, defaultChannel.id, threadId, defaultChannel.provider, phoneE164, receiptText, orderId]
          );

          const msgId = msgRes.rows[0]?.id;
          if (msgId) {
            await client.query(
              `INSERT INTO public.outbound_commands (
                 workspace_id, channel_instance_id, thread_id, message_id,
                 recipient_e164, body, idempotency_key, payload_fingerprint,
                 status, retry_count, max_retries, next_attempt_at
               ) VALUES (
                 $1, $2, $3, $4,
                 $5, $6, $7, $8,
                 'pending', 0, 3, clock_timestamp()
               )
               ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;`,
              [
                workspaceId,
                defaultChannel.id,
                threadId,
                msgId,
                phoneE164,
                receiptText,
                receiptIdempotencyKey,
                receiptFingerprint,
              ]
            );
          }
        }

        logger.info(
          { workspaceId, orderId, phoneE164, amountBrl, amountCents, productName },
          "Cakto payment evidence recorded; commercial outcome remains independent"
        );
      }

      // 2. CHECKOUT ABANDONMENT: Track lead in CRM for immediate follow-up
      if (eventName === "checkout_abandonment" && dataObj && typeof dataObj === "object") {
        const abandonData = dataObj as Record<string, unknown>;
        const rawPhone = String(abandonData.customerCellphone ?? "");
        const customerName = String(abandonData.customerName ?? "Lead Checkout");
        const customerEmail = abandonData.customerEmail ? String(abandonData.customerEmail).toLowerCase().trim() : null;
        const phoneE164 = normalizePhoneToE164(rawPhone);

        if (phoneE164) {
          const contactRes = await client.query<{ id: string }>(
            `INSERT INTO public.contacts (workspace_id, phone_e164, name, metadata)
             VALUES ($1, $2, $3, jsonb_build_object('email', $4::text, 'lead_source', 'cakto_abandonment'))
             ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, contacts.name),
               updated_at = clock_timestamp()
             RETURNING id;`,
            [workspaceId, phoneE164, customerName, customerEmail]
          );
          const contactId = contactRes.rows[0]!.id;

          await client.query(
            `INSERT INTO public.commercial_journeys (
               workspace_id, contact_id, title, stage, status, attribution_source
             ) VALUES (
               $1, $2, 'Abandono de Checkout (Cakto)', 'lead', 'open', 'cakto_abandonment'
             )
             ON CONFLICT DO NOTHING;`,
            [workspaceId, contactId]
          );

          logger.info(
            { workspaceId, phoneE164, customerName },
            "Cakto checkout abandonment recorded in CRM"
          );
        }
      }
      return "processed";
    });

    if (outcome === "conflict") return reply.code(409).send({ detail: "Identificador já recebido com conteúdo diferente; revisão necessária" });
    return reply.status(200).send({
      duplicate: outcome === "duplicate",
      received: true,
      event: eventName,
      correlationId: request.id,
    });
  });
};
