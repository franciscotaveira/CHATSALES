import crypto from 'node:crypto';
import {withTenantTransaction,encryptPayload,decryptPayload,parseKeyringFromEnv,type EncryptedPayload} from '@sos-sales/database';
import {DEFAULT_MODELS} from '@sos-sales/application';
import {guidedChecks,guidedScenarios,type GuidedRecord} from '@sos-sales/contracts';
import type {AiConfigInput,AiDraftConfig} from './ai-config-schema';
type DraftClient=Parameters<Parameters<typeof withTenantTransaction>[1]>[0];

export class AiDraftError extends Error {
  constructor(public status:number,message:string){super(message);}
}
type ActiveRow=Record<string,any>;
type DraftRow={revision:number;config:AiDraftConfig;key_policy:'inherit'|'draft'|'none';credential_envelope:EncryptedPayload|null;source_guided_revision:number|null;active_revision:number;guided_snapshot:GuidedRecord|null;guided_modified:boolean};
const columns=`v.revision,v.config,v.key_policy,v.credential_envelope,v.source_guided_revision,h.active_revision,v.guided_snapshot,v.guided_modified`;
const activeColumns=`name AS workspace_name,ai_receptionist_enabled,ai_agent_name,ai_system_prompt,ai_personality,ai_skills,ai_business_rules,ai_faq,ai_strict_mode,ai_temperature,ai_provider,ai_model,ai_api_key`;
function cryptoKey(){
  const ring=parseKeyringFromEnv();
  if(ring)return {key:ring.keyring,version:ring.activeVersion};
  const key=process.env.MCT_CREDENTIALS_MASTER_KEY;
  if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new AiDraftError(503,'Proteção de credenciais indisponível. Configure a chave de criptografia do servidor antes de salvar uma credencial.');
  return {key,version:1};
}
function activeConfig(row:ActiveRow):AiDraftConfig{
  const raw=row.ai_business_rules??{},objections=raw.objections??{};
  const provider=row.ai_provider==='openrouter'?'openrouter':'nvidia';
  return {enabled:row.ai_receptionist_enabled===true,name:row.ai_agent_name||'Assistente Virtual',systemPrompt:row.ai_system_prompt??'',personality:row.ai_personality||'cordial_comercial',provider,
    model:row.ai_model||DEFAULT_MODELS[provider],strictMode:row.ai_strict_mode??true,temperature:Number(row.ai_temperature??0.1),
    skills:{qualify_lead:false,catalog_offers:false,pix_charges:false,appointments:false,capi_tracking:false,...(row.ai_skills??{})},
    businessRules:{checkoutValidityMinutes:raw.checkoutValidityMinutes??15,companyName:raw.companyName||row.workspace_name||'',agentRole:raw.agentRole||'',valueProposition:raw.valueProposition||'',niche:raw.niche||'general',
      openingHours:raw.openingHours||raw.opening_hours||'',address:raw.address||'',cancellationPolicy:raw.cancellationPolicy||raw.cancellation_policy||'',paymentMethods:raw.paymentMethods||raw.payment_methods||'',generalRules:raw.generalRules||raw.general_rules||'',
      objections,ctaRule:raw.ctaRule!==false,emojiDensity:raw.emojiDensity||'moderate'},faq:Array.isArray(row.ai_faq)?row.ai_faq:[]};
}
async function load(client:DraftClient,workspaceId:string){
  const active=(await client.query<ActiveRow>(`SELECT ${activeColumns} FROM public.workspaces WHERE id=$1`,[workspaceId])).rows[0];
  if(!active)throw new AiDraftError(404,'Empresa não encontrada.');
  const draft=(await client.query<DraftRow>(`SELECT ${columns} FROM public.ai_agent_version_heads h JOIN public.ai_agent_versions v ON v.workspace_id=h.workspace_id AND v.revision=h.draft_revision WHERE h.workspace_id=$1`,[workspaceId])).rows[0]??null;
  return {active,draft};
}
function hasKey(draft:DraftRow|null,active:ActiveRow){
  return draft?.key_policy==='draft'?true:draft?.key_policy==='none'?false:!!active.ai_api_key&&(draft?.config.provider??active.ai_provider)===(active.ai_provider||'nvidia');
}
function response(active:ActiveRow,draft:DraftRow|null){
  return {success:true,activeConfig:{...activeConfig(active),hasCustomApiKey:!!active.ai_api_key},config:{...(draft?.config??activeConfig(active)),hasCustomApiKey:hasKey(draft,active)},
    version:{draftRevision:draft?.revision??0,activeRevision:draft?.active_revision??0,activeEnabled:active.ai_receptionist_enabled===true,sourceGuidedRevision:draft?.source_guided_revision??null,guidedModified:draft?.guided_modified??false}};
}
export async function getEditableAiConfig(workspaceId:string){
  return withTenantTransaction(workspaceId,async client=>{const {active,draft}=await load(client,workspaceId);return response(active,draft);});
}
async function saveWithin(client:DraftClient,workspaceId:string,actorId:string,input:AiConfigInput,sourceGuidedRevision:number|null,sourceGuidedPlan?:GuidedRecord){
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`ai-config:${workspaceId}`]);
  const {active,draft}=await load(client,workspaceId);
  if(input.expectedRevision===undefined)throw new AiDraftError(428,'Carregue a configuração e informe a revisão do rascunho antes de salvar.');
  if(input.expectedRevision!==(draft?.revision??0))throw new AiDraftError(409,'Outra revisão foi salva. Consulte a versão atual antes de salvar; seu texto foi preservado.');
  const base=draft?.config??activeConfig(active);
  const {apiKey,expectedRevision,...patch}=input;
  const config:AiDraftConfig={...base,...patch,
    skills:patch.skills?(sourceGuidedRevision===null?{...base.skills,...patch.skills}:patch.skills):base.skills,
    businessRules:patch.businessRules?{...base.businessRules,...patch.businessRules,objections:patch.businessRules.objections?{...base.businessRules?.objections,...patch.businessRules.objections}:base.businessRules?.objections}:base.businessRules};
  const changedProvider=!!patch.provider&&patch.provider!==base.provider;
  let keyPolicy=draft?.key_policy??'inherit',envelope=draft?.credential_envelope??null;
  if(changedProvider){keyPolicy='none';envelope=null;if(!patch.model)config.model=DEFAULT_MODELS[patch.provider!];}
  if(apiKey?.trim()){
    const key=cryptoKey();keyPolicy='draft';
    envelope=encryptPayload(apiKey.trim(),key.key,{keyVersion:key.version,aad:`ai-draft:${workspaceId}:${config.provider}`});
  }
  if(keyPolicy==='inherit'&&config.provider===(active.ai_provider||'nvidia')&&active.ai_api_key?.trim()){
    const key=cryptoKey();keyPolicy='draft';
    envelope=encryptPayload(active.ai_api_key.trim(),key.key,{keyVersion:key.version,aad:`ai-draft:${workspaceId}:${config.provider}`});
  }
  if(config.name!==undefined)config.name=config.name.trim();
  if(config.systemPrompt!==undefined)config.systemPrompt=config.systemPrompt.trim();
  const revision=(draft?.revision??0)+1;
  const guidedSnapshot=sourceGuidedPlan??draft?.guided_snapshot??null;
  const guidedRevision=guidedSnapshot?.revision??sourceGuidedRevision??draft?.source_guided_revision??null;
  const guidedModified=sourceGuidedPlan?false:guidedRevision!==null;
  // Track the active source without copying its credential into the version JSON.
  const activeHash=crypto.createHash('sha256').update(JSON.stringify(active)).digest('hex');
  await client.query(`INSERT INTO public.ai_agent_versions(workspace_id,revision,config,key_policy,credential_envelope,source_guided_revision,base_active_hash,created_by,guided_snapshot,guided_modified)
    VALUES($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10)`,[workspaceId,revision,JSON.stringify(config),keyPolicy,envelope?JSON.stringify(envelope):null,guidedRevision,activeHash,actorId,guidedSnapshot?JSON.stringify(guidedSnapshot):null,guidedModified]);
  await client.query(`INSERT INTO public.ai_agent_version_heads(workspace_id,draft_revision) VALUES($1,$2)
    ON CONFLICT(workspace_id) DO UPDATE SET draft_revision=EXCLUDED.draft_revision,updated_at=clock_timestamp()`,[workspaceId,revision]);
  return response(active,{revision,config,key_policy:keyPolicy,credential_envelope:envelope,source_guided_revision:guidedRevision,active_revision:draft?.active_revision??0,guided_snapshot:guidedSnapshot,guided_modified:guidedModified});
}
export async function saveAiConfigDraft(workspaceId:string,actorId:string,input:AiConfigInput){
  return withTenantTransaction(workspaceId,client=>saveWithin(client,workspaceId,actorId,input,null));
}
export async function prepareGuidedAiDraft(workspaceId:string,actorId:string,expectedRevision:number,expectedGuidedRevision:number){
  return withTenantTransaction(workspaceId,async client=>{
    const plan=(await client.query<GuidedRecord>(`SELECT revision,draft,reviews,approved_revision AS "approvedRevision",approved_by AS "approvedBy",approved_at AS "approvedAt" FROM public.guided_agent_plans WHERE workspace_id=$1 FOR SHARE`,[workspaceId])).rows[0];
    if(!plan||plan.revision!==expectedGuidedRevision||plan.approvedRevision!==plan.revision||guidedChecks(plan.draft).some(check=>!check.passed)||guidedScenarios(plan.draft).some(scenario=>!plan.reviews[scenario.id]?.trim()))throw new AiDraftError(409,'Aprove a revisão atual do plano para teste assistido antes de preparar o rascunho operacional.');
    const draft=plan.draft;
    const objective={support:"tirar dúvidas",qualify:"qualificar contatos",sell:"apoiar vendas",schedule:"solicitar agendamento"}[draft.objective];
    return saveWithin(client,workspaceId,actorId,{expectedRevision,enabled:draft.mode==='automatic',name:draft.company.slice(0,100),strictMode:true,
      systemPrompt:`Você atende ${draft.company}. Objetivo principal: ${objective}. Use somente informações confirmadas. Se faltar informação, peça esclarecimento útil e encaminhe à equipe. Não invente prazo, disponibilidade, pagamento ou ação executada. Pedido de atendimento humano exige encaminhamento. Comprovante não confirma pagamento.\nInformações confirmadas: ${draft.facts}\nCritérios de qualificação: ${draft.qualification}\nEncaminhamento: ${draft.handoff}`,
      skills:{qualify_lead:draft.functions.includes('qualify'),catalog_offers:draft.functions.includes('catalog'),pix_charges:draft.functions.includes('payments'),appointments:draft.functions.includes('appointments'),capi_tracking:false},
      businessRules:{companyName:draft.company,generalRules:draft.facts,ctaRule:false}},plan.revision,plan);
  });
}
export async function getAiSimulationBase(workspaceId:string,expectedRevision?:number){
  return withTenantTransaction(workspaceId,async client=>{
    const {active,draft}=await load(client,workspaceId);
    if(expectedRevision===undefined)return active;
    if(expectedRevision!==(draft?.revision??0))throw new AiDraftError(409,'O rascunho mudou. Carregue a versão atual antes de testar.');
    if(!draft)return active;
    const config=draft.config;
    let key:string|null=null;
    if(draft.key_policy==='inherit'&&config.provider===(active.ai_provider||'nvidia'))key=active.ai_api_key??null;
    if(draft.key_policy==='draft'&&draft.credential_envelope){
      const secret=draft.credential_envelope,keys=cryptoKey();
      try{key=decryptPayload(secret.encryptedBase64,secret.ivBase64,secret.authTagBase64,keys.key,{keyVersion:secret.keyVersion,aad:`ai-draft:${workspaceId}:${config.provider}`});}
      catch{throw new AiDraftError(503,'Não foi possível abrir a credencial do rascunho. Verifique a configuração de criptografia do servidor.');}
    }
    return {...active,ai_receptionist_enabled:config.enabled,ai_agent_name:config.name,ai_system_prompt:config.systemPrompt,ai_personality:config.personality,ai_skills:config.skills,ai_business_rules:config.businessRules,ai_faq:config.faq,ai_strict_mode:config.strictMode,ai_temperature:config.temperature,ai_provider:config.provider,ai_model:config.model,ai_api_key:key};
  });
}

export async function suspendActiveAi(workspaceId:string,actorId:string,reason:string){
  return withTenantTransaction(workspaceId,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`ai-config:${workspaceId}`]);
    const result=await client.query('UPDATE public.workspaces SET ai_receptionist_enabled=false,updated_at=clock_timestamp() WHERE id=$1 RETURNING id',[workspaceId]);
    if(!result.rows.length)throw new AiDraftError(404,'Empresa não encontrada.');
    await client.query(`INSERT INTO public.audit_events(workspace_id,actor_id,actor_type,action,resource_type,resource_id,metadata)
      VALUES($1,$2,'human','ai.suspended','workspace',$4,$3::jsonb)`,[workspaceId,actorId,JSON.stringify({reason}),workspaceId]);
    return {success:true,activeEnabled:false};
  });
}

export async function publishAiAgentVersion(
  workspaceId: string,
  actorId: string,
  expectedRevision: number
) {
  return withTenantTransaction(workspaceId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`ai-config:${workspaceId}`]);
    const { active, draft } = await load(client, workspaceId);

    if (!draft) {
      throw new AiDraftError(404, "Nenhum rascunho de IA encontrado para publicação.");
    }

    if (draft.revision !== expectedRevision) {
      throw new AiDraftError(
        409,
        `A revisão do rascunho mudou (atual: ${draft.revision}, esperado: ${expectedRevision}). Consulte a versão atual antes de publicar.`
      );
    }

    const config = draft.config;
    let apiKey: string | null = null;

    if (draft.key_policy === "inherit") {
      apiKey = config.provider === (active.ai_provider || "nvidia") ? active.ai_api_key ?? null : null;
    } else if (draft.key_policy === "draft" && draft.credential_envelope) {
      const secret = draft.credential_envelope;
      const keys = cryptoKey();
      try {
        apiKey = decryptPayload(
          secret.encryptedBase64,
          secret.ivBase64,
          secret.authTagBase64,
          keys.key,
          {
            keyVersion: secret.keyVersion,
            aad: `ai-draft:${workspaceId}:${config.provider}`,
          }
        );
      } catch {
        throw new AiDraftError(
          503,
          "Não foi possível abrir a credencial protegida do rascunho para publicação."
        );
      }
    }

    const updateResult = await client.query<ActiveRow>(
      `UPDATE public.workspaces 
       SET 
         ai_receptionist_enabled = $2,
         ai_agent_name = $3,
         ai_system_prompt = $4,
         ai_personality = $5,
         ai_skills = $6::jsonb,
         ai_business_rules = $7::jsonb,
         ai_faq = $8::jsonb,
         ai_strict_mode = $9,
         ai_temperature = $10,
         ai_provider = $11,
         ai_model = $12,
         ai_api_key = $13,
         updated_at = clock_timestamp()
       WHERE id = $1
       RETURNING ${activeColumns}`,
      [
        workspaceId,
        config.enabled === true,
        config.name || "Assistente Virtual",
        config.systemPrompt || "",
        config.personality || "cordial_comercial",
        JSON.stringify(config.skills || {}),
        JSON.stringify(config.businessRules || {}),
        JSON.stringify(config.faq || []),
        config.strictMode !== false,
        config.temperature ?? 0.1,
        config.provider || "nvidia",
        config.model,
        apiKey,
      ]
    );

    const updatedActive = updateResult.rows[0];
    if (!updatedActive) {
      throw new AiDraftError(404, "Empresa não encontrada para atualização.");
    }

    await client.query(
      `UPDATE public.ai_agent_version_heads 
       SET active_revision = $2, updated_at = clock_timestamp() 
       WHERE workspace_id = $1`,
      [workspaceId, draft.revision]
    );

    await client.query(
      `INSERT INTO public.audit_events (workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'human', 'ai.version_published', 'workspace', $1, $3::jsonb)`,
      [
        workspaceId,
        actorId,
        JSON.stringify({
          publishedRevision: draft.revision,
          sourceGuidedRevision: draft.source_guided_revision,
          provider: config.provider,
          model: config.model,
        }),
      ]
    );

    return {
      activeRevision: draft.revision,
      ...response(updatedActive, { ...draft, active_revision: draft.revision }),
    };
  });
}
