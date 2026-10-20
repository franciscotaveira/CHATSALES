import {resolveAiCapabilities} from '@sos-sales/contracts';
import {withTenantTransaction} from '@sos-sales/database';
import {SovereignLlmClient,buildGroundedSystemPrompt,parseAiResponse,DEFAULT_MODELS,type GroundedAiConfig,type GroundedProduct,type GroundedLeadContext,type AiProvider} from '@sos-sales/application';
import {AiDraftError} from './ai-config-drafts';
import type {AiConfigInput} from './ai-config-schema';
export interface SimulationInput {message:string;history?:Array<{role:'user'|'assistant';content:string}>;draftConfig?:AiConfigInput;mockLead?:{name?:string;lastPixStatus?:'PAID'|'PENDING'|'EXPIRED';lastPixAmountCents?:number;isReturningCustomer?:boolean};}
export async function simulateAiText(workspaceId:string,ws:Record<string,any>,input:SimulationInput){
 const {message,history,draftConfig}=input;
      const skills={...(ws.ai_skills??{}),...(draftConfig?.skills??{})};
      const capabilities=resolveAiCapabilities(skills);
      const products=capabilities.readCatalog?await withTenantTransaction(workspaceId,async client=>(await client.query<{
        id:string;title:string;description:string|null;price_cents:number;category:string|null;badge:string|null;
      }>(`SELECT id,title,description,price_cents,category,badge FROM public.products WHERE workspace_id=$1 AND status='ACTIVE' ORDER BY is_featured DESC,title ASC LIMIT 50`,[workspaceId])).rows):[];

      const provider: AiProvider = (draftConfig?.provider || ws.ai_provider as AiProvider) || "nvidia";
      const apiKey =
        draftConfig?.apiKey?.trim() ||
        (provider === (ws.ai_provider || "nvidia") ? ws.ai_api_key?.trim() : undefined) ||
        (provider === "nvidia"
          ? process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY
          : process.env.OPENROUTER_API_KEY);

      if (!apiKey || !apiKey.trim()) throw new AiDraftError(422, 'A chave do provedor selecionado não está configurada.');

      const groundedProducts: GroundedProduct[] = products.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceCents: p.price_cents,
        category: p.category,
        badge: p.badge,
      }));

      const rawBusinessRules = draftConfig?.businessRules || ws.ai_business_rules || {};
      const mockLead = input.mockLead;
      const leadContext: GroundedLeadContext | undefined = mockLead
        ? {
            contactName: mockLead.name || null,
            lastPixStatus: mockLead.lastPixStatus || null,
            lastPixAmountCents: mockLead.lastPixAmountCents || null,
            isReturningCustomer: mockLead.isReturningCustomer,
          }
        : undefined;

      const aiConfig: GroundedAiConfig = {
        skills,
        name: draftConfig?.name || ws.ai_agent_name || "Assistente Virtual",
        personality: draftConfig?.personality || ws.ai_personality || "cordial_comercial",
        systemPrompt: (draftConfig?.systemPrompt !== undefined ? draftConfig.systemPrompt : ws.ai_system_prompt) || "",
        strictMode: draftConfig?.strictMode !== undefined ? draftConfig.strictMode : (ws.ai_strict_mode ?? true),
        businessRules: rawBusinessRules,
        faq: Array.isArray(draftConfig?.faq) ? draftConfig.faq : (Array.isArray(ws.ai_faq) ? ws.ai_faq : []),
        leadContext,
      };

      const rulesRecord = (aiConfig.businessRules || {}) as Record<string, string | undefined>;
      const activeRulesCount = [
        rulesRecord.openingHours || rulesRecord.opening_hours,
        rulesRecord.address,
        rulesRecord.paymentMethods || rulesRecord.payment_methods,
        rulesRecord.cancellationPolicy || rulesRecord.cancellation_policy,
        rulesRecord.generalRules || rulesRecord.general_rules,
      ].filter((v) => Boolean(v && v.trim())).length;

      const activeFaqCount = (aiConfig.faq || []).filter((f) => Boolean(f.question?.trim() && f.answer?.trim())).length;

      const systemPrompt = buildGroundedSystemPrompt(aiConfig, groundedProducts);
      const messagesForModel: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      if (history && history.length > 0) {
        for (const item of history) {
          messagesForModel.push({ role: item.role, content: item.content });
        }
      }

      messagesForModel.push({ role: "user", content: message });

      const llmClient = new SovereignLlmClient();
      const model =
        draftConfig?.model ||
        (provider === (ws.ai_provider || "nvidia") ? ws.ai_model : undefined) ||
        (provider === "nvidia"
          ? process.env.NVIDIA_TEMPLATE_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia
          : DEFAULT_MODELS.openrouter);

      const startTime = Date.now();
      const completion = await llmClient.complete(messagesForModel, {
        provider,
        apiKey,
        model,
        temperature: Number(draftConfig?.temperature ?? ws.ai_temperature ?? 0.1),
      });
      const latencyMs = Date.now() - startTime;

      const parsed = parseAiResponse(completion.content);

      return {
        success: true,
        replyText: parsed.cleanReplyText,
        needsHandoff: parsed.needsHandoff,
        handoffReason: parsed.handoffReason || null,
        offerPixProductId: parsed.offerPixProductId || null,
        offerPixQuantity:Number.isInteger(parsed.offerPixQuantity)?parsed.offerPixQuantity:null,
        matchedCatalogCount: groundedProducts.length,
        capabilities,
        groundedRulesCount: activeRulesCount,
        groundedFaqCount: activeFaqCount,
        isCustomPromptUsed: Boolean(aiConfig.systemPrompt && aiConfig.systemPrompt.trim()),
        strictMode: aiConfig.strictMode,
        provider: completion.provider,
        model: completion.model,
        latencyMs,
        catalogSnapshot:groundedProducts.map(({id,title,priceCents})=>({id,title,priceCents})),
      };
}
