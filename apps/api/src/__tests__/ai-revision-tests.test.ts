import Fastify, {type FastifyInstance} from 'fastify';
import crypto from 'node:crypto';
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createTestDatabasePools,withTenantTransaction} from '@sos-sales/database';
import {SovereignLlmClient} from '@sos-sales/application';
import {authPlugin} from '../plugins/auth.plugin';
import {initialGuidedDraft,aiRevisionScenarios} from '@sos-sales/contracts';
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
  complete.mockReset();complete.mockResolvedValue({content:'SIMULADO — equipe encaminhada [HUMAN_HANDOFF: pedido do cliente]',model:'sim-model',provider:'nvidia'});
  await ownerPool.query("DELETE FROM guided_agent_plans WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("DELETE FROM ai_agent_version_heads WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("DELETE FROM ai_agent_versions WHERE workspace_id=$1",[workspace]);
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=false,ai_skills='{}'::jsonb,ai_provider='nvidia',ai_api_key='SIM_NVIDIA_KEY',ai_model='SIM_NVIDIA_MODEL',ai_system_prompt='Prompt anterior' WHERE id=$1",[workspace]);
});
afterAll(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await app.close();await ownerPool.end();await appPool.end();await workerPool.end();});


const prepare=async()=>{
 const r=await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:0,name:'SIMULADO Testes'}});expect(r.statusCode,r.body).toBe(200);
};
const run=(scenarioId='human',requestKey=crypto.randomUUID(),expectedRevision=1)=>app.inject({method:'POST',url:url('/tests'),headers,payload:{scenarioId,requestKey,expectedRevision}});
const review=(id:string,extra={})=>app.inject({method:'POST',url:url(`/tests/${id}/review`),headers,payload:{expectedRevision:1,expectedReviewRevision:0,verdict:'adequate',note:'SIMULADO — resposta revisada',...extra}});
describe('Revision-bound AI text tests — mock provider only',()=>{
 it('derives base, enabled and own cases without mutating source',()=>{
  const draft={...initialGuidedDraft,functions:['stock'] as ['stock'],customCases:[{id:crypto.randomUUID(),question:'SIM pergunta',expected:'SIM esperado'}]};
  const snapshot={revision:1,draft,reviews:{},approvedRevision:1,approvedBy:null,approvedAt:null};
  const result=aiRevisionScenarios({skills:{pix_charges:true,capi_tracking:true}},snapshot);
  expect(result.map(item=>item.id)).toEqual(expect.arrayContaining(['human','receipt','stock','payments','conversion',draft.customCases[0]!.id]));
  expect(draft.functions).toEqual(['stock']);expect(result.find(item=>item.id===draft.customCases[0]!.id)?.origin).toBe('company');
 });
 it('persists exact revision, distinguishes intent from actions and does not change runtime',async()=>{
  await prepare();const response=await run();expect(response.statusCode,response.body).toBe(200);const result=response.json();
  expect(result).toMatchObject({revision:1,status:'completed',needsHandoff:true,reviewRevision:0});
  expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({id:'handoff-intent',status:'passed'}),expect.objectContaining({id:'actions',status:'not_verified'})]));
  const evaluated=await review(result.id);expect(evaluated.statusCode,evaluated.body).toBe(200);expect(evaluated.json().qualityReview.verdict).toBe('adequate');
  expect(evaluated.json().checks.find((item:any)=>item.id==='actions').status).toBe('not_verified');
  expect((await review(result.id)).statusCode).toBe(409);
  const stored=(await ownerPool.query('SELECT ai_receptionist_enabled,ai_system_prompt FROM workspaces WHERE id=$1',[workspace])).rows[0];expect(stored).toEqual({ai_receptionist_enabled:false,ai_system_prompt:'Prompt anterior'});
  expect(JSON.stringify(result)).not.toContain('SIM_NVIDIA_KEY');
 });
 it('reuses a request and refuses different payload, unknown scenarios and stale revisions',async()=>{
  await prepare();const key=crypto.randomUUID();const first=await run('human',key);const second=await run('human',key);
  expect(second.json().id).toBe(first.json().id);expect(complete).toHaveBeenCalledTimes(1);
  expect((await run('receipt',key)).statusCode).toBe(409);expect((await run('invented')).statusCode).toBe(400);
  await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:1,name:'SIM nova'}});
  expect((await run()).statusCode).toBe(409);expect((await review(first.json().id)).statusCode).toBe(409);
 });
 it('does not duplicate concurrent requests or allow review of an older case run',async()=>{
  await prepare();let resolve!:(value:any)=>void;complete.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const key=crypto.randomUUID(),pending=run('human',key);void pending.then(()=>{});
  for(let i=0;i<100&&!resolve;i++)await new Promise(r=>setTimeout(r,10));expect(resolve).toBeTypeOf('function');
  const repeated=await run('human',key);expect(repeated.statusCode).toBe(202);expect((await run('receipt')).statusCode).toBe(409);
  resolve({content:'SIM [HUMAN_HANDOFF: ajuda]',provider:'nvidia',model:'SIM'});const first=await pending;expect(first.json().status).toBe('completed');
  await run();expect((await review(first.json().id)).statusCode).toBe(409);expect(complete).toHaveBeenCalledTimes(2);
 });
 it('redacts provider failures, stores failed attempt and rejects its quality review',async()=>{
  await prepare();complete.mockRejectedValueOnce(new Error('SIM_NVIDIA_KEY PRIVATE_PROVIDER_BODY'));
  const response=await run();expect(response.statusCode).toBe(200);expect(response.json().status).toBe('failed');expect(response.body).not.toMatch(/SIM_NVIDIA_KEY|PRIVATE_PROVIDER_BODY/);
  expect((await review(response.json().id)).statusCode).toBe(409);
  const listing=await app.inject({url:url('/tests?revision=1'),headers});expect(listing.statusCode,listing.body).toBe(200);expect(listing.json().runs).toHaveLength(1);
 });
 it('keeps completed evidence immutable and isolated under application role',async()=>{
  await prepare();const response=await run(),id=response.json().id;
  await expect(withTenantTransaction(workspace,client=>client.query("UPDATE ai_revision_test_runs SET reply_text='forged' WHERE id=$1",[id]))).rejects.toThrow(/immutable/i);
  const foreign=await withTenantTransaction(crypto.randomUUID(),client=>client.query('SELECT id FROM ai_revision_test_runs WHERE id=$1',[id]));expect(foreign.rows).toEqual([]);
  await expect(withTenantTransaction(workspace,client=>client.query('DELETE FROM ai_revision_test_runs WHERE id=$1',[id]))).rejects.toThrow(/permission denied/i);
 });
 it('does not claim a human request passed when marker is missing, even after quality review',async()=>{
  await prepare();complete.mockResolvedValueOnce({content:'SIMULADO — vou ajudar',provider:'nvidia',model:'SIM'});
  const result=(await run()).json();expect(result.checks.find((item:any)=>item.id==='handoff-intent').status).toBe('failed');
  const evaluated=(await review(result.id)).json();expect(evaluated.checks.find((item:any)=>item.id==='handoff-intent').status).toBe('failed');
 });
 it('expires an interrupted execution without repeating its request and allows a fresh one',async()=>{
  await prepare();const id=crypto.randomUUID(),key=crypto.randomUUID();
  await ownerPool.query(`INSERT INTO ai_revision_test_runs(id,workspace_id,revision,scenario_id,title,question,expected,verifier_version,configuration_hash,request_key,actor_id,status,lease_token,lease_expires_at) VALUES($1,$2,1,'human','SIM interrupção','SIM pergunta','SIM encaminhar','SIM_VERIFIER','SIM_HASH',$3,$4,'running',$5,clock_timestamp()-interval '1 minute')`,[id,workspace,key,user,crypto.randomUUID()]);
  const expired=await run('human',key);expect(expired.json()).toMatchObject({id,status:'failed'});expect(complete).not.toHaveBeenCalled();
  const fresh=await run();expect(fresh.json().status).toBe('completed');expect(complete).toHaveBeenCalledOnce();
 });
 it('retains the original revision when configuration changes during a provider call',async()=>{
  await prepare();let resolve!:(value:any)=>void;complete.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const pending=run();void pending.then(()=>{});for(let i=0;i<100&&!resolve;i++)await new Promise(r=>setTimeout(r,10));expect(resolve).toBeTypeOf('function');
  await app.inject({method:'PUT',url:url(),headers,payload:{expectedRevision:1,name:'SIM revisão durante teste'}});
  resolve({content:'SIM [HUMAN_HANDOFF: ajuda]',provider:'nvidia',model:'SIM'});const result=(await pending).json();expect(result).toMatchObject({revision:1,status:'completed'});
  expect((await review(result.id)).statusCode).toBe(409);const current=await app.inject({url:url('/tests?revision=2'),headers});expect(current.json().runs).toEqual([]);
 });

 it('records unauthorized payment intentions as failed checks without executing a charge',async()=>{
  await prepare();complete.mockResolvedValueOnce({content:'SIM cobrança [OFFER_PIX: forged-product]',provider:'nvidia',model:'SIM'});
  const result=(await run('known')).json();expect(result.checks.find((item:any)=>item.id==='pix-permission').status).toBe('failed');expect(result.checks.find((item:any)=>item.id==='pix-source').status).toBe('failed');
  const evaluated=(await review(result.id)).json();expect(evaluated.checks.find((item:any)=>item.id==='pix-permission').status).toBe('failed');
 });

});
