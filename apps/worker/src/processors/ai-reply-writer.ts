import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import {logger} from '@sos-sales/observability';
import type {AiReceptionistInboundEvent} from './ai-receptionist.processor';
export async function writeAiReply(client:PoolClient,event:AiReceptionistInboundEvent,channel:{provider:string;phone_number_e164:string|null},data:{replyText:string;needsHandoff:boolean;handoffReason?:string;generatedPixChargeId?:string|null;metadata:Record<string,unknown>}){
 const {workspaceId,channelInstanceId,threadId,inboundMessageId,senderPhoneE164,recipientPhoneE164}=event;
 const replyBodyToSend=data.replyText,needsHandoff=data.needsHandoff,handoffReason=data.handoffReason,generatedPixChargeId=data.generatedPixChargeId;
 const completion={provider:data.metadata.provider,model:data.metadata.model};
 let outboundMessageId:string|null=null;
        if (needsHandoff) {
          await client.query(
            `UPDATE public.commercial_threads
             SET status = 'waiting_human',
                 handoff_reason = $1,
                 handoff_at = clock_timestamp(),
                 updated_at = clock_timestamp()
             WHERE workspace_id = $2 AND id = $3;`,
            [handoffReason || "Dúvida fora do catálogo/FAQ", workspaceId, threadId]
          );

          logger.info(
            {
              workspaceId,
              threadId,
              handoffReason: handoffReason,
            },
            "AI Receptionist triggered handoff with executive briefing"
          );
        }

        // 12. Enqueue outbound message and outbox command if there is reply text
        if (replyBodyToSend) {
          const idempotencyKey = `ai-reply-${inboundMessageId}`;
          const payloadFingerprint = crypto
            .createHash("sha256")
            .update(
              JSON.stringify({
                workspaceId,
                channelInstanceId,
                threadId,
                recipientPhoneE164: senderPhoneE164,
                body: replyBodyToSend,
                idempotencyKey,
              })
            )
            .digest("hex");

          // Insert outbound message
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
              channelInstanceId,
              threadId,
              channel.provider,
              channel.phone_number_e164 || recipientPhoneE164,
              senderPhoneE164,
              replyBodyToSend,
              JSON.stringify(data.metadata),
            ]
          );

          outboundMessageId = msgRes.rows[0]!.id;

          // Insert outbound outbox command
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
              channelInstanceId,
              threadId,
              outboundMessageId,
              senderPhoneE164,
              replyBodyToSend,
              idempotencyKey,
              payloadFingerprint,
            ]
          );

          logger.info(
            {
              workspaceId,
              threadId,
              outboundMessageId,
              idempotencyKey,
              needsHandoff,
              hasPix: Boolean(generatedPixChargeId),
              provider: completion.provider,
              model: completion.model,
            },
            "AI Receptionist reply successfully enqueued to outbox"
          );
        }

 return outboundMessageId;
}
