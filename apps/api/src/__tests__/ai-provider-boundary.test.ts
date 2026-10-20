import Fastify, {type FastifyInstance} from 'fastify';
import crypto from 'node:crypto';
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createTestDatabasePools,withTenantTransaction} from '@sos-sales/database';
import {SovereignLlmClient,DEFAULT_MODELS} from '@sos-sales/application';
import {authPlugin} from '../plugins/auth.plugin';
import {initialGuidedDraft,guidedScenarios} from '@sos-sales/contracts';
import {aiAgentRoutes} from '../routes/ai-agent.routes';

const {ownerPool,appPool,workerPool}=createTestDatabasePools();
let app:FastifyInstance,workspace:string,user:string;
let complete:ReturnType<typeof vi.spyOn>;
const headers={authorization:'Bearer synthetic-lab-token'};
const url=(suffix='')=>`/v1/workspaces/${workspace}/ai-agent${suffix}`;
beforeAll(async()=>{
  const suffix=crypto.randomUUID();user=crypto.randomUUID();
  const org=(await ownerPool.query('INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id',['SIMULADO — provedor IA',suffix])).rows[0].id;
  workspace=(await ownerPool.query('INSERT INTO workspaces(organization_id,name,slug) VALUES($1,$2,$3) RETURNING id',[org,'SIMULADO — limite de credenciais',suffix])).rows[0].id;
  await ownerPool.query('INSERT INTO users(id,email,name) VALUES($1,$2,$3)',[user,`sim-ai-${suffix}@example.invalid`,'SIMULADO Revisor']);
  await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[workspace,user]);
  app=Fastify();
  await app.register(authPlugin,{identityProvider:{verifyToken:async()=>({id:user,email:'sim@example.invalid',role:'owner',workspaceId:workspace})} as never});
  await app.register(aiAgentRoutes);await app.ready();
  complete=vi.spyOn(SovereignLlmClient.prototype,'complete').mockResolvedValue({content:'SIMULADO — resposta textual',model:'sim-model',provider:'nvidia'});
  for(const key of ['NVIDIA_API_KEY','NVAPI_KEY','OPENROUTER_API_KEY'])vi.stubEnv(key,'');
});
beforeEach(async()=>{
  complete.mockClear();
  await ownerPool.query("DELETE FROM guided_agent_plans WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("DELETE FROM ai_agent_version_heads WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("DELETE FROM ai_agent_versions WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=false,ai_skills='{}'::jsonb,ai_provider='nvidia',ai_api_key='SIM_NVIDIA_KEY',ai_model='SIM_NVIDIA_MODEL',ai_system_prompt='Prompt anterior' WHERE id=$1",[workspace]);
});
afterAll(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await app.close();await ownerPool.end();await appPool.end();await workerPool.end();});

describe('AI provider boundaries — isolated database and replaced LLM',()=>{
  it('does not send a stored key to a different draft provider',async()=>{
    const response=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{message:'SIMULADO',draftConfig:{provider:'openrouter'}}});
    expect(response.statusCode,response.body).toBe(422);expect(complete).not.toHaveBeenCalled();
    expect(response.body).not.toContain('SIM_NVIDIA_KEY');
  });
  it('uses an explicitly supplied key and the new provider default model',async()=>{
    const response=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{message:'SIMULADO',draftConfig:{provider:'openrouter',apiKey:'SIM_OPENROUTER_KEY'}}});
    expect(response.statusCode,response.body).toBe(200);
    expect(complete.mock.calls[0]![1]).toMatchObject({provider:'openrouter',apiKey:'SIM_OPENROUTER_KEY',model:DEFAULT_MODELS.openrouter});
    expect(response.body).not.toContain('SIM_OPENROUTER_KEY');
  });
  it('does not inherit an old-provider key in the draft and preserves the active configuration',async()=>{
    const changed=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,provider:'openrouter',systemPrompt:''}});
    expect(changed.statusCode,changed.body).toBe(200);expect(changed.json().config.hasCustomApiKey).toBe(false);
    const stored=(await ownerPool.query('SELECT ai_api_key,ai_model,ai_system_prompt FROM workspaces WHERE id=$1',[workspace])).rows[0];
    expect(stored).toEqual({ai_api_key:'SIM_NVIDIA_KEY',ai_model:'SIM_NVIDIA_MODEL',ai_system_prompt:'Prompt anterior'});
    expect(changed.json().config).toMatchObject({provider:'openrouter',model:DEFAULT_MODELS.openrouter,systemPrompt:''});
    expect(changed.json().version.draftRevision).toBe(1);
  });
  it('retains the key on same-provider edits and bounds multi-turn history before invoking a model',async()=>{
    const saved=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,name:'SIMULADO IA'}});
    expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().config.hasCustomApiKey).toBe(true);
    const history=Array.from({length:17},()=>({role:'user',content:'SIMULADO'}));
    const rejected=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{message:'SIMULADO',history}});
    expect(rejected.statusCode).toBe(400);expect(complete).not.toHaveBeenCalled();
    const accepted=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{message:'SIMULADO',history:[{role:'assistant',content:'x'.repeat(3000)}]}});
    expect(accepted.statusCode,accepted.body).toBe(200);expect(complete).toHaveBeenCalledOnce();
  });
  it('requires an observed revision and serializes competing draft saves without changing runtime',async()=>{
    const missing=await app.inject({method:'PUT',url:url(),headers,payload:{enabled:true}});expect(missing.statusCode).toBe(428);
    const results=await Promise.all(['Rascunho A','Rascunho B'].map(name=>app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,name,enabled:true}})));
    expect(results.map(result=>result.statusCode).sort()).toEqual([200,409]);
    expect((await ownerPool.query('SELECT count(*)::int n FROM ai_agent_versions WHERE workspace_id=$1',[workspace])).rows[0].n).toBe(1);
    const active=(await ownerPool.query('SELECT ai_receptionist_enabled,ai_system_prompt FROM workspaces WHERE id=$1',[workspace])).rows[0];
    expect(active).toEqual({ai_receptionist_enabled:false,ai_system_prompt:'Prompt anterior'});
  });
  it('encrypts a draft credential, simulates that exact revision and never exposes the key',async()=>{
    const secret='SIM_DRAFT_CREDENTIAL_ONLY';
    const saved=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,provider:'openrouter',apiKey:secret}});
    expect(saved.statusCode,saved.body).toBe(200);expect(saved.body).not.toContain(secret);
    const stored=(await ownerPool.query('SELECT config,credential_envelope,key_policy FROM ai_agent_versions WHERE workspace_id=$1',[workspace])).rows[0];
    expect(stored.key_policy).toBe('draft');expect(stored.credential_envelope).not.toBeNull();expect(JSON.stringify(stored)).not.toContain(secret);
    const response=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{draftRevision:1,message:'SIMULADO'}});
    expect(response.statusCode,response.body).toBe(200);expect(complete.mock.calls[0]![1]).toMatchObject({apiKey:secret,provider:'openrouter'});
    const stale=await app.inject({method:'POST',url:url('/simulate'),headers,payload:{draftRevision:0,message:'SIMULADO'}});
    expect(stale.statusCode).toBe(409);
    const loaded=await app.inject({url:url(),headers});expect(loaded.body).not.toContain(secret);expect(loaded.json().activeConfig.provider).toBe('nvidia');expect(loaded.json().config.provider).toBe('openrouter');
  });
  it('keeps version rows immutable to the application and isolated by tenant',async()=>{
    await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,name:'SIM versão imutável'}});
    await expect(withTenantTransaction(workspace,client=>client.query("UPDATE ai_agent_versions SET config='{}' WHERE workspace_id=$1",[workspace]))).rejects.toThrow(/permission denied/i);
    const foreign=await withTenantTransaction(crypto.randomUUID(),client=>client.query('SELECT revision FROM ai_agent_versions WHERE workspace_id=$1',[workspace]));expect(foreign.rows).toEqual([]);
  });
  it('prepares an approved guided plan as a new draft with its criteria, without activating it',async()=>{
    const plan={...initialGuidedDraft,company:'SIM Empresa',mode:'automatic',objective:'qualify',functions:['qualify'],facts:'SIM Informações confirmadas para atendimento.',qualification:'Região atendida e necessidade confirmadas',handoff:'SIM Equipe comercial, com fila fora do expediente'};
    await ownerPool.query('INSERT INTO guided_agent_plans(workspace_id,revision,draft,reviews,approved_revision) VALUES($1,1,$2::jsonb,$3::jsonb,1)',[workspace,JSON.stringify(plan),JSON.stringify(Object.fromEntries(guidedScenarios(plan as never).map(scenario=>[scenario.id,'SIM Revisado para teste assistido'])))]);
    const prepared=await app.inject({method:'POST',url:url('/draft/from-guided'),headers,payload:{expectedRevision:0,expectedGuidedRevision:1}});
    expect(prepared.statusCode,prepared.body).toBe(200);expect(prepared.json().version).toMatchObject({draftRevision:1,sourceGuidedRevision:1,activeEnabled:false});
    expect(prepared.json().config.systemPrompt).toContain(plan.qualification);expect(prepared.json().config.enabled).toBe(true);
    expect(prepared.json().config.skills).toMatchObject({qualify_lead:true,pix_charges:false});
    expect(prepared.json().config.systemPrompt).toContain('Objetivo principal: qualificar contatos');
    const adjusted=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:1,name:'SIM ajuste após plano'}});
    expect(adjusted.statusCode,adjusted.body).toBe(200);expect(adjusted.json().version).toMatchObject({sourceGuidedRevision:1,guidedModified:true});
    await ownerPool.query('UPDATE guided_agent_plans SET revision=2,draft=jsonb_set(draft,\'{qualification}\',\'"SIM novo critério"\'::jsonb) WHERE workspace_id=$1',[workspace]);
    const snapshot=(await ownerPool.query('SELECT guided_snapshot FROM ai_agent_versions WHERE workspace_id=$1 AND revision=2',[workspace])).rows[0].guided_snapshot;
    expect(snapshot.draft.qualification).toBe(plan.qualification);
    const stale=await app.inject({method:'POST',url:url('/draft/from-guided'),headers,payload:{expectedRevision:2,expectedGuidedRevision:2}});
    expect(stale.statusCode).toBe(409);expect((await ownerPool.query('SELECT ai_receptionist_enabled FROM workspaces WHERE id=$1',[workspace])).rows[0].ai_receptionist_enabled).toBe(false);
  });
  it('suspends runtime immediately while preserving the selected draft and recording the reason',async()=>{
    await ownerPool.query('UPDATE workspaces SET ai_receptionist_enabled=true WHERE id=$1',[workspace]);
    await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,enabled:true,name:'SIM revisão preservada'}});
    const stopped=await app.inject({method:'POST',url:url('/suspend'),headers,payload:{reason:'SIM Suspensão manual para corrigir atendimento'}});
    expect(stopped.statusCode,stopped.body).toBe(200);
    const loaded=await app.inject({url:url(),headers});expect(loaded.json().config.enabled).toBe(true);expect(loaded.json().version.activeEnabled).toBe(false);
    const audit=(await ownerPool.query("SELECT metadata FROM audit_events WHERE workspace_id=$1 AND action='ai.suspended'",[workspace])).rows;
    expect(audit.some(row=>row.metadata.reason==='SIM Suspensão manual para corrigir atendimento')).toBe(true);
  });

  it('preserves unrelated rules and skills when a client patches only one setting',async()=>{
    await ownerPool.query('UPDATE workspaces SET ai_business_rules=$2::jsonb,ai_skills=$3::jsonb WHERE id=$1',[workspace,JSON.stringify({companyName:'SIM empresa',address:'SIM endereço confirmado'}),JSON.stringify({catalog_offers:true,pix_charges:true})]);
    const saved=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,businessRules:{openingHours:'SIM 9h às 18h'},skills:{pix_charges:false}}});
    expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().config.businessRules).toMatchObject({address:'SIM endereço confirmado',openingHours:'SIM 9h às 18h'});expect(saved.json().config.skills).toMatchObject({catalog_offers:true,pix_charges:false});
  });

  it('uses only the catalog permissions selected for the simulation and distinguishes billing context',async()=>{
    await ownerPool.query("INSERT INTO products(workspace_id,retailer_id,title,description,price_cents,image_url) VALUES($1,$2,'SIM_CONTEXT_ONLY','SIM contexto isolado',12345,'https://example.invalid/sim.png')",[workspace,crypto.randomUUID()]);
    const invoke=(skills?:Record<string,boolean>)=>app.inject({method:'POST',url:url('/simulate'),headers,payload:{message:'SIM pergunta',...(skills?{draftConfig:{skills}}:{})}});
    const none=await invoke();expect(none.statusCode,none.body).toBe(200);expect(none.json()).toMatchObject({matchedCatalogCount:0,capabilities:{catalogAccess:'none',pixCharges:false}});expect(JSON.stringify(complete.mock.calls.at(-1))).not.toContain('SIM_CONTEXT_ONLY');
    await ownerPool.query("UPDATE workspaces SET ai_skills='{\"catalog_offers\":true,\"pix_charges\":true}'::jsonb WHERE id=$1",[workspace]);
    const disabled=await invoke({catalog_offers:false,pix_charges:false});expect(disabled.json().matchedCatalogCount).toBe(0);expect(JSON.stringify(complete.mock.calls.at(-1))).not.toContain('SIM_CONTEXT_ONLY');
    const billing=await invoke({catalog_offers:false,pix_charges:true});expect(billing.json()).toMatchObject({matchedCatalogCount:1,capabilities:{catalogAccess:'billing',pixCharges:true}});expect(JSON.stringify(complete.mock.calls.at(-1))).toContain('SIM_CONTEXT_ONLY');
    const offers=await invoke({catalog_offers:true,pix_charges:false});expect(offers.json().capabilities.catalogAccess).toBe('offers');expect(JSON.stringify(complete.mock.calls.at(-1))).not.toContain('<fechamento_comercial_pix>');
  });

  it('creates new companies without default AI permission grants',async()=>{
    const row=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) SELECT organization_id,'SIM sem permissões',$2 FROM workspaces WHERE id=$1 RETURNING ai_skills",[workspace,crypto.randomUUID()])).rows[0];
    expect(row.ai_skills).toEqual({});
  });

});
