import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, resetTestQueueState, withTenantTransaction } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import { OutboxDispatcher } from "@sos-sales/worker";
import type { ChannelDispatchService } from "@sos-sales/application";
import type { FastifyInstance } from "fastify";

const {ownerPool,appPool,workerPool}=createTestDatabasePools();
const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let app:FastifyInstance,actor:string,org:string,token:string;
type Fixture={ws:string;channel:string;template:string;contacts:string[]};let f:Fixture;
const headers=()=>({authorization:`Bearer ${token}`});
const path=(tail:string,ws=f.ws)=>`/v1/workspaces/${ws}/${tail}`;
const payload=(fixture=f)=>({name:"SIMULADO — revisão de destinatários",channelInstanceId:fixture.channel,templateId:fixture.template,audience:{type:"ALL_CONTACTS" as const}});
async function fixture():Promise<Fixture>{
 const suffix=crypto.randomUUID();
 const ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIMULADO preparação',$2) RETURNING id",[org,suffix])).rows[0].id;
 await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,status,is_active,phone_number_e164) VALUES($1,'waha','SIMULADO sem provedor',$2,'connected',true,'+551130000000') RETURNING id",[ws,crypto.createHash('sha256').update(suffix).digest('hex')])).rows[0].id;
 const template=(await ownerPool.query("INSERT INTO message_templates(workspace_id,name,category,body_text,status,language) VALUES($1,'sim_notice','UTILITY','Olá {{1}}, mensagem simulada.','PENDING','pt_BR') RETURNING id",[ws])).rows[0].id;
 const contacts:string[]=[];
 for(let i=1;i<=3;i++)contacts.push((await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name,opt_out) VALUES($1,$2,$3,$4) RETURNING id",[ws,`+551199990000${i}`,`SIM Cliente ${i}`,i===3])).rows[0].id);
 return {ws,channel,template,contacts};
}
async function prepare(input:ReturnType<typeof payload>=payload()){
 const response=await app.inject({method:"POST",url:path("broadcasts/prepare"),headers:headers(),payload:input});expect(response.statusCode,response.body).toBe(200);return response.json();
}
async function approveTests(input:Record<string,unknown>,preparationId:string){
 const ids:string[]=[];
 for(const variant of ['A',...(input.isAbTest?['B']:[])]){
  const sent=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...input,preparedAudienceId:preparationId,testPhone:'+5511999900002',testVariant:variant}});expect(sent.statusCode,sent.body).toBe(200);ids.push(sent.json().testId);
 }
 const dispatcher=new OutboxDispatcher({masterKeyHex:key});const tasks=await dispatcher.claimBatch(workerPool,'sim-message-test',20);const send=vi.fn().mockImplementation(async()=>({success:true,externalMessageId:crypto.randomUUID(),sentAt:new Date()}));
 for(const task of tasks.filter(task=>task.idempotency_key.startsWith('btest_')))await dispatcher.dispatchItem(workerPool,task,'sim-message-test',{dispatchOutbound:send} as unknown as ChannelDispatchService);
 expect(send).toHaveBeenCalledTimes(ids.length);return ids;
}
beforeAll(async()=>{
 const suffix=crypto.randomUUID();actor=crypto.randomUUID();
 org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIMULADO revisão',$1) RETURNING id",[suffix])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM Revisor')",[actor,`sim-review-${suffix}@example.invalid`]);
 token=await new SignJWT({sub:actor,email:`sim-review-${suffix}@example.invalid`,role:"authenticated"}).setProtectedHeader({alg:"HS256"}).setIssuer("sos-sales-test").setAudience("sos-sales-api-test").setExpirationTime("1h").sign(new TextEncoder().encode("synthetic_jwt_secret_for_isolated_audit_2026"));
 app=await buildApp({masterKeyHex:key});
});
beforeEach(async()=>{await resetTestQueueState(ownerPool);f=await fixture();});
afterAll(async()=>{await app?.close();await ownerPool.end();await appPool.end();await workerPool.end();});
describe("Prepared campaign audience — real isolated database, no external send",()=>{
 it("shows included/excluded contacts without creating a campaign or command",async()=>{
  const preflight=await app.inject({url:path('broadcasts/preflight'),headers:headers()});expect(preflight.statusCode,preflight.body).toBe(200);
  expect(preflight.json().templates.find((template:{id:string})=>template.id===f.template)).toMatchObject({status:'PENDING',metaTemplateId:null});
  const preview=await prepare();expect(preview.included).toHaveLength(2);expect(preview.excluded).toHaveLength(1);expect(preview.excluded[0].reason).toContain('bloqueadas');
  expect((await ownerPool.query("SELECT count(*)::int n FROM broadcast_campaigns WHERE workspace_id=$1",[f.ws])).rows[0].n).toBe(0);
  expect((await ownerPool.query("SELECT count(*)::int n FROM outbound_commands WHERE workspace_id=$1",[f.ws])).rows[0].n).toBe(0);
 });
 it("preserves document media and resolved links from review through test and campaign",async()=>{
  const components=[{type:'HEADER',format:'DOCUMENT'},{type:'BUTTONS',buttons:[{type:'URL',text:'Pedido',url:'https://example.com/{{1}}'}]}];
  await ownerPool.query('UPDATE message_templates SET provider_components=$2::jsonb WHERE id=$1',[f.template,JSON.stringify(components)]);
  const preflight=await app.inject({url:path('broadcasts/preflight'),headers:headers()});
  expect(preflight.json().templates.find((row:{id:string})=>row.id===f.template).providerComponents).toEqual(components);
  const missing=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:payload()});
  expect(missing.statusCode,missing.body).toBe(422);
  const input={...payload(),variables:{'header:media':'https://example.com/sim.pdf','header:filename':'sim.pdf','button:0':'42'}};
  const preview=await prepare(input);
  const ids=await approveTests(input,preview.preparedAudienceId);
  const release=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...input,preparedAudienceId:preview.preparedAudienceId,approvedTestIds:ids}});
  expect(release.statusCode,release.body).toBe(200);
  const commands=await ownerPool.query('SELECT media_url,body FROM outbound_commands WHERE workspace_id=$1',[f.ws]);
  expect(commands.rows).toHaveLength(3);
  for(const command of commands.rows){expect(command.media_url).toBe('https://example.com/sim.pdf');expect(command.body).toContain('https://example.com/42');expect(command.body).toContain('Olá SIM');}
 });
 it("uses the same automatic body-name aliases in controlled tests and campaign commands without replacing scoped header fields",async()=>{
  await ownerPool.query("UPDATE message_templates SET body_text='Olá {{nome_do_cliente}} / {{primeiro_nome_cliente}} / {{1}}, data {{data}}.',header_text='Pedido {{1}}',parameter_format='NAMED' WHERE id=$1",[f.template]);
  await ownerPool.query('UPDATE contacts SET name=NULL WHERE id=$1',[f.contacts[0]]);
  const input={...payload(),variables:{data:'20/10/2026','header:1':'SIM pedido 42'}};const preview=await prepare(input);const ids=await approveTests(input,preview.preparedAudienceId);
  const release=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...input,preparedAudienceId:preview.preparedAudienceId,approvedTestIds:ids}});expect(release.statusCode,release.body).toBe(200);
  const commands=(await ownerPool.query('SELECT body FROM outbound_commands WHERE workspace_id=$1',[f.ws])).rows;expect(commands).toHaveLength(3);
  expect(commands.filter(row=>row.body.includes('Olá SIM / SIM / SIM, data 20/10/2026.'))).toHaveLength(2);
  expect(commands.filter(row=>row.body.includes('Olá cliente / cliente / cliente, data 20/10/2026.'))).toHaveLength(1);
  for(const row of commands){expect(row.body).toContain('Pedido SIM pedido 42');expect(row.body).not.toContain('{{');expect(row.body).not.toContain('[Nome do Contato]');}
 });
 it("requires a prepared review even for an otherwise valid direct request",async()=>{
  const response=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:payload()});expect(response.statusCode,response.body).toBe(422);expect(response.json().code).toBe('BROADCAST_REVIEW_REQUIRED');
 });
 it("rejects missing body variables before preparing the audience",async()=>{
  await ownerPool.query("UPDATE message_templates SET body_text='Olá {{1}}, data {{2}}.' WHERE id=$1",[f.template]);
  const missing=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:payload()});expect(missing.statusCode,missing.body).toBe(422);expect(missing.json().code).toBe('BROADCAST_VARIABLES_REQUIRED');
  const complete=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:{...payload(),variables:{'2':'20/10/2026'}}});expect(complete.statusCode,complete.body).toBe(200);
 });
 it("never adds a new matching contact after preparation and retries idempotently",async()=>{
  const preview=await prepare();await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+5511999900099','SIM Depois da revisão')",[f.ws]);
  const input={...payload(),preparedAudienceId:preview.preparedAudienceId,approvedTestIds:await approveTests(payload(),preview.preparedAudienceId)};
  const first=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:input});expect(first.statusCode,first.body).toBe(200);expect(first.json().enqueuedCount).toBe(2);
  const retry=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...input,requestKey:crypto.randomUUID()}});expect(retry.statusCode,retry.body).toBe(200);expect(retry.json().campaignId).toBe(first.json().campaignId);
  await ownerPool.query("UPDATE broadcast_preparations SET expires_at=now()-interval '1 minute' WHERE id=$1",[preview.preparedAudienceId]);
  const afterExpiry=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:input});expect(afterExpiry.statusCode,afterExpiry.body).toBe(200);expect(afterExpiry.json().campaignId).toBe(first.json().campaignId);
  const phones=(await ownerPool.query("SELECT phone_e164 FROM broadcast_recipients WHERE workspace_id=$1",[f.ws])).rows.map(row=>row.phone_e164);expect(phones).toHaveLength(2);expect(phones).not.toContain('+5511999900099');
  expect((await ownerPool.query("SELECT count(*)::int n FROM outbound_commands WHERE workspace_id=$1",[f.ws])).rows[0].n).toBe(3);
 });
 it("excludes someone who opts out between review and confirmation",async()=>{
  const preview=await prepare();await ownerPool.query("UPDATE contacts SET opt_out=true WHERE id=$1",[f.contacts[0]]);
  const response=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...payload(),preparedAudienceId:preview.preparedAudienceId,approvedTestIds:await approveTests(payload(),preview.preparedAudienceId)}});expect(response.statusCode,response.body).toBe(200);expect(response.json().totalTargeted).toBe(1);
 });
 it("rejects expired reviews, edited payloads and edited template contents",async()=>{
  let preview=await prepare();await ownerPool.query("UPDATE broadcast_preparations SET expires_at=now()-interval '1 minute' WHERE id=$1",[preview.preparedAudienceId]);
  let response=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...payload(),preparedAudienceId:preview.preparedAudienceId}});expect(response.statusCode,response.body).toBe(409);
  preview=await prepare();response=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...payload(),name:'SIM alterado',preparedAudienceId:preview.preparedAudienceId}});expect(response.statusCode,response.body).toBe(409);
  await ownerPool.query("UPDATE message_templates SET body_text='Conteúdo diferente' WHERE id=$1",[f.template]);response=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...payload(),preparedAudienceId:preview.preparedAudienceId}});expect(response.statusCode,response.body).toBe(409);
 });
 it("cannot reuse another company preparation, including through RLS",async()=>{
  const preview=await prepare();const other=await fixture();
  const response=await app.inject({method:"POST",url:path("broadcasts",other.ws),headers:headers(),payload:{...payload(other),preparedAudienceId:preview.preparedAudienceId}});expect(response.statusCode,response.body).toBe(404);
  const rows=await withTenantTransaction(other.ws,async client=>(await client.query("SELECT id FROM broadcast_preparations WHERE id=$1",[preview.preparedAudienceId])).rows);expect(rows).toHaveLength(0);
 });
 it("binds the prepared review to its reviewer even within the same company",async()=>{
  const preview=await prepare();const otherActor=crypto.randomUUID();const email=`sim-other-${otherActor}@example.invalid`;
  await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM Outro revisor')",[otherActor,email]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[f.ws,otherActor]);
  const otherToken=await new SignJWT({sub:otherActor,email,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));
  const response=await app.inject({method:'POST',url:path('broadcasts'),headers:{authorization:`Bearer ${otherToken}`},payload:{...payload(),preparedAudienceId:preview.preparedAudienceId}});expect(response.statusCode,response.body).toBe(404);
 });
 it("does not create imported contacts until the reviewed campaign is confirmed",async()=>{
  const input={...payload(),audience:{type:'IMPORT_LIST' as const,importedContacts:[{phoneE164:'+5521999900088',name:'SIM Importado'}]}};
  const prepared=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:input});expect(prepared.statusCode,prepared.body).toBe(200);
  expect((await ownerPool.query("SELECT id FROM contacts WHERE workspace_id=$1 AND phone_e164='+5521999900088'",[f.ws])).rows).toHaveLength(0);
  const response=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...input,preparedAudienceId:prepared.json().preparedAudienceId,approvedTestIds:await approveTests(input,prepared.json().preparedAudienceId)}});expect(response.statusCode,response.body).toBe(200);
  expect((await ownerPool.query("SELECT contact_id FROM broadcast_recipients WHERE workspace_id=$1",[f.ws])).rows[0].contact_id).toBeTruthy();
 });
 it("blocks a contact that leaves the selected stage after confirmation, before sending",async()=>{
  const journey=await app.inject({method:'POST',url:path('journeys'),headers:headers(),payload:{contactId:f.contacts[0],stage:'lead'}});expect(journey.statusCode,journey.body).toBe(201);
  const input={...payload(),audience:{type:'BY_STAGE' as const,stage:'LEAD'}};
  const preview=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:input});expect(preview.statusCode,preview.body).toBe(200);
  const response=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...input,preparedAudienceId:preview.json().preparedAudienceId,approvedTestIds:await approveTests(input,preview.json().preparedAudienceId)}});expect(response.statusCode,response.body).toBe(200);
  await ownerPool.query("UPDATE commercial_journeys SET stage='qualified' WHERE workspace_id=$1 AND contact_id=$2",[f.ws,f.contacts[0]]);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key});const tasks=await dispatcher.claimBatch(workerPool,'sim-reviewed-stage',20);const send=vi.fn();
  const task=tasks.find(item=>item.workspace_id===f.ws);expect(task).toBeDefined();await dispatcher.dispatchItem(workerPool,task!,'sim-reviewed-stage',{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).not.toHaveBeenCalled();expect((await ownerPool.query("SELECT status FROM broadcast_recipients WHERE workspace_id=$1",[f.ws])).rows[0].status).toBe('blocked');
 });
 it("requires provider-confirmed tests and explicit test IDs before releasing the audience",async()=>{
  const preview=await prepare();const req={...payload(),preparedAudienceId:preview.preparedAudienceId};
  let res=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:req});expect(res.statusCode,res.body).toBe(422);expect(res.json().code).toBe('BROADCAST_TEST_REQUIRED');
  const test=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...req,testPhone:'+5511999900002'}});expect(test.statusCode,test.body).toBe(200);
  res=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...req,approvedTestIds:[test.json().testId]}});expect(res.statusCode,res.body).toBe(422);
  const tests=await app.inject({url:path(`broadcasts/preparations/${preview.preparedAudienceId}/tests`),headers:headers()});expect(tests.json().tests[0]).toMatchObject({status:'pending',body:'Olá SIM, mensagem simulada.'});
  const ids=await approveTests(payload(),preview.preparedAudienceId);expect(ids).toEqual([test.json().testId]);
  res=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:req});expect(res.statusCode).toBe(422);
  res=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...req,approvedTestIds:ids}});expect(res.statusCode,res.body).toBe(200);
 });
 it("uses one test per variant, does not enroll unknown numbers and rejects blocked test contacts",async()=>{
  const preview=await prepare();const req={...payload(),preparedAudienceId:preview.preparedAudienceId};
  for(const testPhone of ['+5511999900998','+5511999900003','+551130000000'])expect((await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...req,testPhone}})).statusCode).toBe(422);
  const first=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...req,testPhone:'+5511999900002'}});expect(first.statusCode,first.body).toBe(200);
  const retry=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...req,testPhone:'+5511999900002'}});expect(retry.json().testId).toBe(first.json().testId);
  expect((await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...req,testPhone:'+5511999900001'}})).statusCode).toBe(409);
  expect((await ownerPool.query("SELECT count(*)::int n FROM outbound_commands WHERE workspace_id=$1",[f.ws])).rows[0].n).toBe(1);
  expect((await ownerPool.query("SELECT count(*)::int n FROM contacts WHERE workspace_id=$1",[f.ws])).rows[0].n).toBe(3);
 });
 it("requires both tested variants and keeps their exact variable values",async()=>{
  const b=(await ownerPool.query("INSERT INTO message_templates(workspace_id,name,category,body_text,status,language) VALUES($1,'sim_b','UTILITY','SIM B {{2}} para {{1}}','PENDING','pt_BR') RETURNING id",[f.ws])).rows[0].id;
  const req={...payload(),isAbTest:true,variantBTemplateId:b,variantBVariables:{'2':'Oferta B'}};
  const pre=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:req});expect(pre.statusCode,pre.body).toBe(200);const id=pre.json().preparedAudienceId;
  const ids=await approveTests(req,id);
  const results=await app.inject({url:path(`broadcasts/preparations/${id}/tests`),headers:headers()});expect(results.json().tests[1]).toMatchObject({variant:'B',body:'SIM B Oferta B para SIM',status:'sent'});
  const missing=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...req,preparedAudienceId:id,approvedTestIds:[ids[0]]}});expect(missing.statusCode).toBe(422);
  const complete=await app.inject({method:'POST',url:path('broadcasts'),headers:headers(),payload:{...req,preparedAudienceId:id,approvedTestIds:ids}});expect(complete.statusCode,complete.body).toBe(200);
 });
 it("blocks queued tests after the model changes, without sending stale content",async()=>{
  const pre=await prepare();const test=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...payload(),preparedAudienceId:pre.preparedAudienceId,testPhone:'+5511999900002'}});expect(test.statusCode,test.body).toBe(200);
  await ownerPool.query("UPDATE message_templates SET body_text='SIM conteúdo alterado' WHERE id=$1",[f.template]);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key});const tasks=await dispatcher.claimBatch(workerPool,'sim-stale-test',20);const send=vi.fn();
  for(const task of tasks.filter(task=>task.workspace_id===f.ws))await dispatcher.dispatchItem(workerPool,task,'sim-stale-test',{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).not.toHaveBeenCalled();const status=await app.inject({url:path(`broadcasts/preparations/${pre.preparedAudienceId}/tests`),headers:headers()});expect(status.json().tests[0].status).toBe('dead_letter');
 });

});
