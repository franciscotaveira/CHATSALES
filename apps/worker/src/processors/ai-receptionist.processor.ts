import {writeAiReply} from "./ai-reply-writer";
import {resolveAiCapabilities,aiCapabilitySignature,parseAiCheckoutConfirmation} from '@sos-sales/contracts';
import type { Pool } from "pg";
import {
  withWorkerTransaction,
  prepareAiCheckout,confirmAiCheckout,linkAiCheckoutSummary,AiCheckoutError,
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
  checkoutRequestId?:string|null;
  blockedPixReason?: string;
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
    } = event;

    if (!inboundBody || !inboundBody.trim()) {
      return { handled: false, reason: "empty_inbound_body" };
    }

    return await withWorkerTransaction(
      workspaceId,
      async (client) => {
        // Serialize a given inbound intention before any model call or financial effect.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0));", [`ai-inbound:${workspaceId}:${inboundMessageId}`]);
        const replay=await client.query("SELECT id FROM public.outbound_commands WHERE workspace_id=$1 AND idempotency_key=$2 LIMIT 1", [workspaceId,`ai-reply-${inboundMessageId}`]);
        if(replay.rows.length) return {handled:false,reason:"inbound_already_replied"};
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
        if (!ws || ws.ai_receptionist_enabled !== true) {
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

        // A commercial opt-out blocks campaigns; it does not suppress a new inbound request.
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

        if(parseAiCheckoutConfirmation(inboundBody)){
          let replyText:string,needsHandoff=false,handoffReason:string|undefined,generatedPixChargeId:string|undefined,checkoutRequestId:string|undefined,blockedPixReason:string|undefined;
          let preparedSummary=false,checkoutMessageKind="status";
          try{const result=await confirmAiCheckout(client,{...event,contactId});replyText=result.replyText;generatedPixChargeId=result.generatedPixChargeId;checkoutRequestId=result.checkoutRequestId;preparedSummary=!generatedPixChargeId;checkoutMessageKind=preparedSummary?"summary":result.containsPixCode?"charge":"status";}
          catch(error){needsHandoff=true;blockedPixReason=error instanceof AiCheckoutError?error.reason:'checkout_confirmation_failed';handoffReason=error instanceof AiCheckoutError?error.message:'A cobrança precisa de revisão da equipe';replyText=`${handoffReason} Vou encaminhar para a equipe. Nenhuma nova cobrança foi gerada automaticamente.`;}
          const current=(await client.query<{ai_receptionist_enabled:boolean;ai_skills:Record<string,boolean>|null}>('SELECT ai_receptionist_enabled,ai_skills FROM workspaces WHERE id=$1',[workspaceId])).rows[0];
          if(current?.ai_receptionist_enabled!==true)return {handled:false,reason:'ai_disabled_before_confirmation_reply'};
          const messageId=await writeAiReply(client,event,channel,{replyText,needsHandoff,handoffReason,generatedPixChargeId,metadata:{source:'ai_receptionist',capabilitySignature:aiCapabilitySignature(current.ai_skills),capabilities:resolveAiCapabilities(current.ai_skills),agentName:ws.ai_agent_name,provider:'system',model:'confirmed-checkout',checkoutMessageKind,needsHandoff,handoffReason:handoffReason??null,generatedPixChargeId:generatedPixChargeId??null,blockedPixReason:blockedPixReason??null,checkoutRequestId:checkoutRequestId??null}});
          if(preparedSummary&&checkoutRequestId&&messageId)await linkAiCheckoutSummary(client,workspaceId,checkoutRequestId,messageId);
          return {handled:true,replyText,needsHandoff,handoffReason,generatedPixChargeId:generatedPixChargeId??null,checkoutRequestId:checkoutRequestId??null,blockedPixReason,provider:'system',model:'confirmed-checkout'};
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
        const capabilities=resolveAiCapabilities(ws.ai_skills);
        const productsRes = capabilities.readCatalog ? await client.query<{
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
        ) : {rows:[]};

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
          skills:ws.ai_skills,
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

        // 11. Handle automatic Pix generation if AI flagged OFFER_PIX
        let replyBodyToSend = parsed.cleanReplyText ? parsed.cleanReplyText.trim() : "";
        let generatedPixChargeId: string | null = null;
        let checkoutRequestId:string|null=null;
        let needsHandoff = parsed.needsHandoff;
        let handoffReason = parsed.handoffReason;
        let blockedPixReason: string | undefined;
        const blockPix = (reason: string) => {
          blockedPixReason = reason;
          needsHandoff = true;
          handoffReason = handoffReason || "Solicitação de pagamento requer atendimento humano";
          replyBodyToSend = "Vou encaminhar sua solicitação de pagamento para um atendente. Nenhuma cobrança foi gerada automaticamente.";
          logger.info({ workspaceId, threadId, reason }, "AI Pix action blocked");
        };

          // Recheck and lock the current configuration after the model returns.
          // A concurrent disable must be observed before the financial action.
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0));", [`ai-config:${workspaceId}`]);
          const actionConfigRes = await client.query<{
            ai_receptionist_enabled: boolean | null;
            ai_skills: Record<string, boolean> | null;
          }>(
            `SELECT ai_receptionist_enabled, ai_skills FROM public.workspaces WHERE id = $1;`,
            [workspaceId]
          );
          const actionConfig = actionConfigRes.rows[0];
          if (!actionConfig || actionConfig.ai_receptionist_enabled !== true) {
            return { handled: false, reason: parsed.offerPixProductId ? "ai_disabled_before_pix_action" : "ai_disabled_before_reply" };
          }
          const actionThreadRes = await client.query<{ status: string }>(
            `SELECT status FROM public.commercial_threads WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
            [workspaceId, threadId]
          );
          if (actionThreadRes.rows[0]?.status !== "active") {
            return { handled: false, reason: parsed.offerPixProductId ? "thread_unavailable_before_pix_action" : "thread_unavailable_before_reply" };
          }
        if(!parsed.offerPixProductId&&aiCapabilitySignature(actionConfig.ai_skills)!==aiCapabilitySignature(ws.ai_skills)){
          needsHandoff=true;handoffReason='As funções da IA mudaram durante o atendimento';
          replyBodyToSend='Vou encaminhar sua solicitação para a equipe confirmar as informações.';
        }
        if (parsed.offerPixProductId) {
          const supplied=products.find(product=>product.id===parsed.offerPixProductId);
          if(parsed.needsHandoff)blockPix('human_handoff');
          else if(actionConfig.ai_skills?.pix_charges!==true)blockPix('pix_skill_disabled');
          else if(aiCapabilitySignature(actionConfig.ai_skills)!==aiCapabilitySignature(ws.ai_skills))blockPix('ai_capabilities_changed');
          else if(!Number.isInteger(parsed.offerPixQuantity)||parsed.offerPixQuantity!<1||parsed.offerPixQuantity!>999)blockPix('invalid_product_quantity');
          else if(!supplied)blockPix('product_not_in_context');
          else {
            const currentProduct=await client.query<{id:string;title:string;price_cents:number}>("SELECT id,title,price_cents FROM public.products WHERE workspace_id=$1 AND id=$2 AND status='ACTIVE'",[workspaceId,supplied.id]);
            const row=currentProduct.rows[0];
            if(!row)blockPix('product_unavailable');
            else if(!Number.isSafeInteger(Number(row.price_cents))||Number(row.price_cents)<=0)blockPix('invalid_product_amount');
            else if(Number(row.price_cents)!==supplied.priceCents||row.title!==supplied.title)blockPix('product_changed_during_inference');
            else {try{
              const prepared=await prepareAiCheckout(client,{...event,contactId},row.id,parsed.offerPixQuantity!);
              checkoutRequestId=prepared.checkoutRequestId;replyBodyToSend=prepared.replyText;
            }catch(error){blockPix(error instanceof AiCheckoutError?error.reason:'checkout_preparation_failed');logger.warn({workspaceId,threadId,reason:blockedPixReason},'Could not prepare checkout confirmation');}}
          }
        }

        const outboundMessageId=await writeAiReply(client,event,channel,{replyText:replyBodyToSend,needsHandoff,handoffReason,generatedPixChargeId,metadata:{
          source:'ai_receptionist',capabilities,capabilitySignature:aiCapabilitySignature(actionConfig.ai_skills),agentName:aiConfig.name,provider:completion.provider,model:completion.model,
          needsHandoff,handoffReason:handoffReason??null,generatedPixChargeId,blockedPixReason:blockedPixReason??null,offerPixProductId:parsed.offerPixProductId??null,checkoutRequestId,checkoutMessageKind:checkoutRequestId?"summary":null,
        }});
        if(checkoutRequestId&&outboundMessageId)await linkAiCheckoutSummary(client,workspaceId,checkoutRequestId,outboundMessageId);

        return {
          handled: true,
          replyText: replyBodyToSend,
          needsHandoff,
          handoffReason,
          generatedPixChargeId,
          checkoutRequestId,
          blockedPixReason,
          provider: completion.provider,
          model: completion.model,
        };
      },
      pool
    );
  }
}
