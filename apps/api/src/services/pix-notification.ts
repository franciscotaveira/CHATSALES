import crypto from "node:crypto";
import type { PoolClient, PixChargeRecord } from "@sos-sales/database";

/**
 * Enqueues an automatic celebratory payment receipt message to the WhatsApp thread
 * via the transactional outbox pattern when a Pix charge is settled (Cashier or Webhook).
 */
export async function enqueuePixConfirmationMessage(
  client: PoolClient,
  workspaceId: string,
  charge: PixChargeRecord
): Promise<string | null> {
  const threadRes = await client.query<{
    channel_instance_id: string;
    provider: string;
    channel_phone: string | null;
    contact_phone: string;
  }>(
    `SELECT t.channel_instance_id, ci.provider, ci.phone_number_e164 as channel_phone, c.phone_e164 as contact_phone
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.id = t.contact_id AND c.workspace_id=t.workspace_id
     JOIN public.channel_instances ci ON ci.id = t.channel_instance_id AND ci.workspace_id=t.workspace_id
     WHERE t.id = $1 AND t.workspace_id = $2 AND ci.is_active=true AND ci.status='connected';`,
    [charge.thread_id, workspaceId]
  );

  if (!threadRes.rows[0]) return null;

  const tInfo = threadRes.rows[0];
  if(!tInfo.channel_phone||!tInfo.contact_phone)return null;
  const amountFormatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: charge.currency || "BRL",
  }).format(charge.amount_cents / 100);

  const confirmText = `🎉 *PAGAMENTO CONFIRMADO!*\n\nRecebemos a confirmação do seu Pix no valor de *${amountFormatted}*.\nPagamento referente a *${charge.title}*. A entrega ou execução do serviço seguirá o andamento do pedido.\n\nQualquer dúvida ou suporte, basta nos chamar por aqui.`;
  const idempotencyKey = `pix-confirm-${charge.id}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`pix-confirm:${workspaceId}:${charge.id}`]);
  const existing=await client.query<{message_id:string}>("SELECT message_id FROM public.outbound_commands WHERE workspace_id=$1 AND idempotency_key=$2", [workspaceId,idempotencyKey]);
  if(existing.rows[0])return existing.rows[0].message_id;
  const payloadFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId,
        channelInstanceId: tInfo.channel_instance_id,
        threadId: charge.thread_id,
        recipientPhoneE164: tInfo.contact_phone,
        body: confirmText,
        idempotencyKey,
      })
    )
    .digest("hex");

  const msgRes = await client.query<{ id: string }>(
    `INSERT INTO public.messages (
       workspace_id, channel_instance_id, thread_id, provider, direction,
       sender_e164, recipient_e164, content_type, body,
       metadata, delivery_status, status_rank
     ) VALUES (
       $1, $2, $3, $4, 'outbound',
       $5, $6, 'text', $7,
       $8::jsonb, 'queued', 0
     )
     RETURNING id;`,
    [
      workspaceId,
      tInfo.channel_instance_id,
      charge.thread_id,
      tInfo.provider,
      tInfo.channel_phone,
      tInfo.contact_phone,
      confirmText,
      JSON.stringify({
        source: "pix_confirmation",
        chargeId: charge.id,
        verificationMethod: charge.verification_method,
        amountCents: charge.amount_cents,
      }),
    ]
  );

  const outboundMessageId = msgRes.rows[0]?.id;
  if (!outboundMessageId) return null;

  await client.query(
    `INSERT INTO public.outbound_commands (
       workspace_id, channel_instance_id, thread_id, message_id,
       recipient_e164, body,
       idempotency_key, payload_fingerprint,
       status, retry_count, max_retries, next_attempt_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6,
       $7, $8,
       'pending', 0, 3, clock_timestamp()
     )
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;`,
    [
      workspaceId,
      tInfo.channel_instance_id,
      charge.thread_id,
      outboundMessageId,
      tInfo.contact_phone,
      confirmText,
      idempotencyKey,
      payloadFingerprint,
    ]
  );

  return outboundMessageId;
}
