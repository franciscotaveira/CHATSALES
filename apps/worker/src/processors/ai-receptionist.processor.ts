import crypto from "node:crypto";
import type { Pool } from "pg";
import {
  withWorkerTransaction,
  createPixCharge,
} from "@sos-sales/database";
import {
  buildGroundedSystemPrompt,
  parseAiResponse,
  SovereignLlmClient,
  DEFAULT_MODELS,
  type AiProvider,
  type GroundedAiConfig,
  type GroundedProduct,
  type GroundedBusinessRules,
  type GroundedFaqItem,
  type GroundedLeadContext,
} from "@sos-sales/application";
import { logger } from "@sos-sales/observability";

export interface AiReceptionistInboundEvent {
  workspaceId: string;
  channelInstanceId: string;
  contactId: string;
  threadId: string;
  inboundMessageId: string;
  inboundBody: string;
  senderPhoneE164: string;
  recipientPhoneE164: string;
}

export interface AiReceptionistResult {
  handled: boolean;
  reason?: string;
  replyText?: string;
  needsHandoff?: boolean;
  handoffReason?: string;
  generatedPixChargeId?: string | null;
  provider?: string;
  model?: string;
}

export class AiReceptionistProcessor {
  private readonly llmClient: SovereignLlmClient;

  constructor(llmClient?: SovereignLlmClient) {
    this.llmClient = llmClient || new SovereignLlmClient();
  }

  async processInboundMessage(
    pool: Pool,
    event: AiReceptionistInboundEvent,
    _workerId?: string
  ): Promise<AiReceptionistResult> {
    const {
      workspaceId,
      channelInstanceId,
      threadId,
      inboundMessageId,
      inboundBody,
      senderPhoneE164,
      recipientPhoneE164,
    } = event;

    if (!inboundBody || !inboundBody.trim()) {
      return { handled: false, reason: "empty_inbound_body" };
    }

    return await withWorkerTransaction(
      workspaceId,
      async (client) => {
        // 1. Fetch workspace AI configuration
        const wsRes = await client.query<{
          workspace_name: string | null;
          ai_receptionist_enabled: boolean | null;
          ai_agent_name: string | null;
          ai_system_prompt: string | null;
          ai_personality: string | null;
          ai_skills: Record<string, boolean> | null;
          ai_business_rules: GroundedBusinessRules | null;
          ai_faq: GroundedFaqItem[] | null;
          ai_strict_mode: boolean | null;
          ai_temperature: number | string | null;
          ai_provider: string | null;
          ai_model: string | null;
          ai_api_key: string | null;
        }>(
          `SELECT
             name as workspace_name,
             ai_receptionist_enabled,
             ai_agent_name,
             ai_system_prompt,
             ai_personality,
             ai_skills,
             ai_business_rules,
             ai_faq,
             ai_strict_mode,
             ai_temperature,
             ai_provider,
             ai_model,
             ai_api_key
           FROM public.workspaces
           WHERE id = $1;`,
          [workspaceId]
        );

        const ws = wsRes.rows[0];
        if (!ws || ws.ai_receptionist_enabled === false) {
          return { handled: false, reason: "ai_receptionist_disabled" };
        }

        // 2. Check thread status and fetch contact context
        const threadRes = await client.query<{
          status: string;
          contact_id: string | null;
          contact_name: string | null;
          phone_e164: string | null;
          opt_out: boolean | null;
        }>(
          `SELECT ct.status, ct.contact_id, c.name as contact_name, c.phone_e164, c.opt_out
           FROM public.commercial_threads ct
           LEFT JOIN public.contacts c ON c.id = ct.contact_id
           WHERE ct.workspace_id = $1 AND ct.id = $2;`,
          [workspaceId, threadId]
        );

        const currentStatus = threadRes.rows[0]?.status;
        const contactId = threadRes.rows[0]?.contact_id || event.contactId;
        const contactName = threadRes.rows[0]?.contact_name || null;
        const contactPhone = threadRes.rows[0]?.phone_e164 || senderPhoneE164;
        const isOptedOut = Boolean(threadRes.rows[0]?.opt_out);

        if (isOptedOut) {
          logger.info(
            { workspaceId, threadId, contactId },
            "AI Receptionist skipped: contact has opted out"
          );
          return { handled: false, reason: "contact_opted_out" };
        }

        if (currentStatus === "waiting_human") {
          logger.info(
            { workspaceId, threadId },
            "AI Receptionist skipped: thread is waiting_human"
          );
          return { handled: false, reason: "thread_waiting_human" };
        }

        if (currentStatus === "closed") {
          logger.info(
            { workspaceId, threadId },
            "AI Receptionist skipped: thread is closed"
          );
          return { handled: false, reason: "thread_closed" };
        }

        // 3. Resolve active provider and credentials (Nvidia NIM or OpenRouter)
        const provider: AiProvider = (ws.ai_provider as AiProvider) || "nvidia";
        const apiKey =
          ws.ai_api_key?.trim() ||
          (provider === "nvidia"
            ? process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY
            : process.env.OPENROUTER_API_KEY);

        if (!apiKey || !apiKey.trim()) {
          logger.warn(
            { workspaceId, threadId, provider },
            `AI Receptionist skipped: API key for provider '${provider}' is not configured`
          );
          return { handled: false, reason: `missing_${provider}_api_key` };
        }

        // 4. Fetch channel instance details
        const channelRes = await client.query<{
          provider: string;
          phone_number_e164: string | null;
          is_active: boolean;
        }>(
          `SELECT provider, phone_number_e164, is_active
           FROM public.channel_instances
           WHERE workspace_id = $1 AND id = $2;`,
          [workspaceId, channelInstanceId]
        );

        const channel = channelRes.rows[0];
        if (!channel || !channel.is_active) {
          return { handled: false, reason: "channel_not_active" };
        }

        // 5. Fetch CTWA Ad Hook context (Meta Click to WhatsApp Ads)
        const journeyRes = await client.query<{
          ad_headline: string | null;
          ad_body: string | null;
        }>(
          `SELECT ad_headline, ad_body FROM public.commercial_journeys
           WHERE workspace_id = $1 AND thread_id = $2 AND (ad_headline IS NOT NULL OR ad_body IS NOT NULL)
           ORDER BY created_at DESC
           LIMIT 1;`,
          [workspaceId, threadId]
        );
        const adJourney = journeyRes.rows[0];

        // 6. Fetch grounded active catalog products (Truth in Data)
        const productsRes = await client.query<{
          id: string;
          title: string;
          description: string | null;
          price_cents: number;
          category: string | null;
          badge: string | null;
        }>(
          `SELECT id, title, description, price_cents, category, badge
           FROM public.products
           WHERE workspace_id = $1 AND status = 'ACTIVE'
           ORDER BY is_featured DESC, title ASC
           LIMIT 50;`,
          [workspaceId]
        );

        const products: GroundedProduct[] = productsRes.rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          priceCents: r.price_cents,
          category: r.category,
          badge: r.badge,
        }));

        // 7. Fetch recent conversation history
        const historyRes = await client.query<{
          direction: string;
          body: string | null;
        }>(
          `SELECT direction, body
           FROM public.messages
           WHERE workspace_id = $1 AND thread_id = $2 AND body IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 10;`,
          [workspaceId, threadId]
        );

        // Reverse to chronological order
        const recentMessages = historyRes.rows.reverse();

        // 7.1 Fetch contact's recent Pix and customer journey context
        let lastPixStatus: string | null = null;
        let lastPixAmountCents: number | null = null;
        let isReturningCustomer = false;

        if (contactId) {
          const pixRes = await client.query<{ status: string; amount_cents: number }>(
            `SELECT status, amount_cents
             FROM public.pix_charges
             WHERE workspace_id = $1 AND contact_id = $2
             ORDER BY created_at DESC
             LIMIT 1;`,
            [workspaceId, contactId]
          );
          if (pixRes.rows[0]) {
            lastPixStatus = pixRes.rows[0].status;
            lastPixAmountCents = pixRes.rows[0].amount_cents;
          }

          const paidCountRes = await client.query<{ count: string }>(
            `SELECT count(*)::text as count
             FROM public.pix_charges
             WHERE workspace_id = $1 AND contact_id = $2 AND status = 'PAID';`,
            [workspaceId, contactId]
          );
          isReturningCustomer = Number(paidCountRes.rows[0]?.count || 0) > 0;
        }

        const leadContext: GroundedLeadContext = {
          contactName,
          contactPhone,
          lastPixStatus,
          lastPixAmountCents,
          isReturningCustomer,
        };

        // 8. Build grounded prompt with 6 layers, CTWA ad hook & Ignorance Protocol
        const personality = (ws.ai_personality || "cordial_comercial") as GroundedAiConfig["personality"];
        const rawBusinessRules = (ws.ai_business_rules || {}) as GroundedBusinessRules & Record<string, any>;
        const businessRules: GroundedBusinessRules = {
          ...rawBusinessRules,
          companyName: rawBusinessRules.companyName || ws.workspace_name || undefined,
        };

        const aiConfig: GroundedAiConfig = {
          name: ws.ai_agent_name || "Assistente Virtual",
          personality,
          systemPrompt: ws.ai_system_prompt || "",
          strictMode: ws.ai_strict_mode ?? true,
          businessRules,
          faq: Array.isArray(ws.ai_faq) ? ws.ai_faq : [],
          adHook: adJourney
            ? {
                headline: adJourney.ad_headline,
                body: adJourney.ad_body,
              }
            : undefined,
          leadContext,
        };

        const systemPrompt = buildGroundedSystemPrompt(aiConfig, products);

        const messagesForModel: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
        ];

        for (const msg of recentMessages) {
          if (!msg.body) continue;
          messagesForModel.push({
            role: msg.direction === "inbound" ? "user" : "assistant",
            content: msg.body,
          });
        }

        // 9. Call Sovereign LLM Client (Nvidia NIM or OpenRouter)
        const temperature =
          ws.ai_temperature !== undefined && ws.ai_temperature !== null
            ? Number(ws.ai_temperature)
            : 0.1;

        const model =
          ws.ai_model ||
          (provider === "nvidia"
            ? process.env.NVIDIA_TEMPLATE_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia
            : DEFAULT_MODELS.openrouter);

        logger.info(
          {
            workspaceId,
            threadId,
            agentName: aiConfig.name,
            provider,
            model,
            strictMode: aiConfig.strictMode,
            hasAdHook: Boolean(aiConfig.adHook),
            temperature,
            productCount: products.length,
          },
          "Invoking Sovereign LLM Receptionist completion"
        );

        const completion = await this.llmClient.complete(messagesForModel, {
          provider,
          apiKey,
          model,
          temperature,
        });

        const rawReply = completion.content;
        if (!rawReply || !rawReply.trim()) {
          return { handled: false, reason: "empty_llm_response" };
        }

        // 10. Parse response for human handoff
        const parsed = parseAiResponse(rawReply);

        if (parsed.needsHandoff) {
          await client.query(
            `UPDATE public.commercial_threads
             SET status = 'waiting_human',
                 handoff_reason = $1,
                 handoff_at = clock_timestamp(),
                 updated_at = clock_timestamp()
             WHERE workspace_id = $2 AND id = $3;`,
            [parsed.handoffReason || "Dúvida fora do catálogo/FAQ", workspaceId, threadId]
          );

          logger.info(
            {
              workspaceId,
              threadId,
              handoffReason: parsed.handoffReason,
            },
            "AI Receptionist triggered handoff with executive briefing"
          );
        }

        // 11. Handle automatic Pix generation if AI flagged OFFER_PIX
        let replyBodyToSend = parsed.cleanReplyText ? parsed.cleanReplyText.trim() : "";
        let generatedPixChargeId: string | null = null;

        if (parsed.offerPixProductId) {
          const targetProduct = products.find((p) => p.id === parsed.offerPixProductId);
          if (targetProduct) {
            try {
              const pixCharge = await createPixCharge(client, {
                workspaceId,
                threadId,
                contactId,
                productId: targetProduct.id,
                title: targetProduct.title,
                amountCents: targetProduct.priceCents,
                expiresMinutes: 30,
              });

              generatedPixChargeId = pixCharge.id;

              const reais = (targetProduct.priceCents / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              });

              const pixSnippet = `\n\n⚡ *PAGAMENTO INSTANTÂNEO VIA PIX*\n📦 *Item:* ${targetProduct.title}\n💰 *Valor:* ${reais}\n⏳ *Validade:* 30 minutos\n\n*Código Pix Copia e Cola:*\n\`\`\`\n${pixCharge.pix_code}\n\`\`\`\n_Copie o código acima e cole na opção "Pix Copia e Cola" no app do seu banco para confirmar sua vaga na hora!_`;

              replyBodyToSend = (replyBodyToSend ? `${replyBodyToSend}\n` : "") + pixSnippet;

              logger.info(
                {
                  workspaceId,
                  threadId,
                  contactId,
                  productId: targetProduct.id,
                  chargeId: pixCharge.id,
                  amountCents: targetProduct.priceCents,
                },
                "AI Receptionist generated Pix Copia e Cola for instant offer closing"
              );
            } catch (pixErr: unknown) {
              logger.warn(
                {
                  workspaceId,
                  threadId,
                  productId: targetProduct.id,
                  error: pixErr instanceof Error ? pixErr.message : String(pixErr),
                },
                "Could not generate Pix charge in AI Receptionist"
              );
            }
          }
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
              JSON.stringify({
                source: "ai_receptionist",
                agentName: aiConfig.name,
                provider: completion.provider,
                model: completion.model,
                needsHandoff: parsed.needsHandoff,
                handoffReason: parsed.handoffReason || null,
                generatedPixChargeId,
                offerPixProductId: parsed.offerPixProductId || null,
              }),
            ]
          );

          const outboundMessageId = msgRes.rows[0]!.id;

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
              needsHandoff: parsed.needsHandoff,
              hasPix: Boolean(generatedPixChargeId),
              provider: completion.provider,
              model: completion.model,
            },
            "AI Receptionist reply successfully enqueued to outbox"
          );
        }

        return {
          handled: true,
          replyText: replyBodyToSend,
          needsHandoff: parsed.needsHandoff,
          handoffReason: parsed.handoffReason,
          generatedPixChargeId,
          provider: completion.provider,
          model: completion.model,
        };
      },
      pool
    );
  }
}
