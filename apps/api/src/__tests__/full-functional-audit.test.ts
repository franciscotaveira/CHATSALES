import { describe,it,expect,beforeAll,afterAll,vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools,encryptPayload,resetTestQueueState } from "@sos-sales/database";
import { SignJWT,verifyPassword } from "@sos-sales/auth";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../index";
import { OutboxDispatcher,OperationalWebhookDispatcher,AiReceptionistProcessor } from "@sos-sales/worker";
import type { ChannelDispatchService } from "@sos-sales/application";
const network=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock("@sos-sales/application",async original=>({...await original<typeof import("@sos-sales/application")>(),safeFetchWithSsrfGuard:(...args:unknown[])=>network.fetch(...args)}));
const {ownerPool,workerPool,appPool}=createTestDatabasePools();
const suffix=crypto.randomUUID();const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let app:FastifyInstance,ws:string,wsB:string,channelId:string,templateId:string,token:string,contact1:string;
const actor=crypto.randomUUID();let campaignId:string;
const headers=()=>({authorization:`Bearer ${token}`});
const path=(tail:string)=>`/v1/workspaces/${ws}/${tail}`;
const payload=(requestKey:string)=>({requestKey,name:"Campanha sintética",channelInstanceId:channelId,templateId,audience:{type:"ALL_CONTACTS"}});
async function approveTests(input:Record<string,unknown>,preparationId:string){
 const ids:string[]=[];
 for(const variant of ['A',...(input.isAbTest?['B']:[])]){
  const sent=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...input,preparedAudienceId:preparationId,testPhone:'+5511999990002',testVariant:variant}});expect(sent.statusCode,sent.body).toBe(200);ids.push(sent.json().testId);
 }
 const dispatcher=new OutboxDispatcher({masterKeyHex:key});const tasks=await dispatcher.claimBatch(workerPool,'sim-message-test',20);const send=vi.fn().mockImplementation(async()=>({success:true,externalMessageId:crypto.randomUUID(),sentAt:new Date()}));
 for(const task of tasks.filter(task=>task.idempotency_key.startsWith('btest_')))await dispatcher.dispatchItem(workerPool,task,'sim-message-test',{dispatchOutbound:send} as unknown as ChannelDispatchService);
 expect(send).toHaveBeenCalledTimes(ids.length);return ids;
}
beforeAll(async()=>{
 await resetTestQueueState(ownerPool);
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES ('Functional audit',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'Audit A',$2) RETURNING id",[org,`a-${suffix}`])).rows[0].id;
 wsB=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'Audit B',$2) RETURNING id",[org,`b-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES ($1,$2,'Audit owner')",[actor,`audit-${suffix}@example.invalid`]);
 await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'owner')",[ws,actor]);
 const credentials=encryptPayload(JSON.stringify({access_token:"synthetic-meta-token",waba_account_id:"123456",phone_number_id:"654321"}),key);
 const cid=(await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES ($1,'meta_waba',$2,$3,$4,$5,'1') RETURNING id",[ws,suffix,credentials.encryptedBase64,credentials.ivBase64,credentials.authTagBase64])).rows[0].id;
 channelId=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,credential_id,status,is_active,meta_billing_configured,phone_number_e164) VALUES ($1,'meta_waba','Audit Meta',$2,$3,'connected',true,true,'+551130000000') RETURNING id",[ws,crypto.createHash("sha256").update(suffix).digest("hex"),cid])).rows[0].id;
 for(const [i,name] of [[1,"Cliente A"],[2,"Cliente B"]] as const){const id=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES ($1,$2,$3) RETURNING id",[ws,`+551199999000${i}`,name])).rows[0].id;if(i===1)contact1=id;}
 token=await new SignJWT({sub:actor,email:`audit-${suffix}@example.invalid`,role:"authenticated"}).setProtectedHeader({alg:"HS256"}).setIssuer("sos-sales-test").setAudience("sos-sales-api-test").setExpirationTime("1h").sign(new TextEncoder().encode("synthetic_jwt_secret_for_isolated_audit_2026"));
 app=await buildApp({masterKeyHex:key});
 network.fetch.mockResolvedValue({ok:true,status:200,text:async()=>"ok",json:async()=>({data:[{id:"100200300",name:"audit_notice",category:"UTILITY",language:"pt_BR",status:"APPROVED",components:[{type:"BODY",text:"Olá {{1}}, atualização do atendimento solicitado."}]}]})});
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();vi.unstubAllEnvs();});
describe("Full functional audit — real DB, synthetic providers",()=>{
 it("GET catalog/templates/flows does not seed products or approvals",async()=>{
  for(const resource of ["products","templates","flows"]){const res=await app.inject({url:path(resource),headers:headers()});expect(res.statusCode,res.body).toBe(200);expect(res.json()[resource]).toEqual([]);}
 });
 it("local registration cannot forge Meta approval",async()=>{
  const res=await app.inject({method:"POST",url:path("templates"),headers:headers(),payload:{name:"audit_notice",category:"UTILITY",bodyText:"Texto local",status:"APPROVED",metaTemplateId:"forged-id"}});
  expect(res.statusCode,res.body).toBe(201);templateId=res.json().template.id;expect(res.json().template.status).toBe("PENDING");expect(res.json().template.metaTemplateId).toBeNull();
  const blocked=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:payload(crypto.randomUUID())});expect(blocked.statusCode,blocked.body).toBe(422);
 });
 it("sync uses provider approval for the right channel, without exposing credentials",async()=>{
  const res=await app.inject({method:"POST",url:path("templates/sync"),headers:headers(),payload:{channelId}});expect(res.statusCode,res.body).toBe(200);expect(res.json().imported).toBe(1);expect(res.body).not.toContain("synthetic-meta-token");
  const row=(await ownerPool.query("SELECT status,meta_verified_channel_id FROM message_templates WHERE id=$1",[templateId])).rows[0];expect(row.status).toBe("APPROVED");expect(row.meta_verified_channel_id).toBe(channelId);
 });
 it("queues a campaign without claiming delivery and retries without duplicates",async()=>{
  const input=payload(crypto.randomUUID());const prepared=await app.inject({method:"POST",url:path("broadcasts/prepare"),headers:headers(),payload:input});expect(prepared.statusCode,prepared.body).toBe(200);
  const req={...input,preparedAudienceId:prepared.json().preparedAudienceId,approvedTestIds:await approveTests(input,prepared.json().preparedAudienceId)};
  const first=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:req});expect(first.statusCode,first.body).toBe(200);campaignId=first.json().campaignId;expect(first.json().enqueuedCount,first.body).toBe(2);
  const second=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:req});expect(second.statusCode,second.body).toBe(200);expect(second.json().campaignId).toBe(campaignId);
  const row=(await ownerPool.query("SELECT sent_count,status FROM broadcast_campaigns WHERE id=$1",[campaignId])).rows[0];expect(row.sent_count).toBe(0);expect(row.status).toBe("queued");
  const recipients=(await ownerPool.query("SELECT status,sent_at FROM broadcast_recipients WHERE campaign_id=$1",[campaignId])).rows;expect(recipients).toHaveLength(2);expect(recipients.every(r=>r.status==='queued'&&r.sent_at===null)).toBe(true);
  expect((await ownerPool.query("SELECT count(*)::int AS n FROM outbound_commands WHERE workspace_id=$1",[ws])).rows[0].n).toBe(3);
  const conflict=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...req,name:"Outra configuração"}});expect(conflict.statusCode).toBe(409);
 });
 it("respects late opt-out and only increments sent after provider confirmation",async()=>{
  await ownerPool.query("UPDATE contacts SET opt_out=true WHERE id=$1",[contact1]);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key});const send=vi.fn().mockResolvedValue({success:true,externalMessageId:"audit-provider-message",sentAt:new Date()});
  const tasks=await dispatcher.claimBatch(workerPool,"audit-dispatch",20);expect(tasks.filter(t=>t.workspace_id===ws)).toHaveLength(2);
  for(const task of tasks.filter(t=>t.workspace_id===ws))await dispatcher.dispatchItem(workerPool,task,"audit-dispatch",{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).toHaveBeenCalledTimes(1);
  const row=(await ownerPool.query("SELECT sent_count FROM broadcast_campaigns WHERE id=$1",[campaignId])).rows[0];expect(row.sent_count).toBe(1);
  expect((await ownerPool.query("SELECT status FROM broadcast_recipients WHERE campaign_id=$1 AND contact_id=$2",[campaignId,contact1])).rows[0].status).toBe("blocked");
 });
 it("cancels pending campaign before any external send",async()=>{
  const input=payload(crypto.randomUUID());const prepared=await app.inject({method:"POST",url:path("broadcasts/prepare"),headers:headers(),payload:input});expect(prepared.statusCode,prepared.body).toBe(200);
  const result=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...input,preparedAudienceId:prepared.json().preparedAudienceId,approvedTestIds:await approveTests(input,prepared.json().preparedAudienceId)}});expect(result.statusCode,result.body).toBe(200);expect(result.json().enqueuedCount,result.body).toBe(1);const id=result.json().campaignId;
  expect((await app.inject({method:"POST",url:path(`broadcasts/${id}/cancel`),headers:headers()})).statusCode).toBe(200);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key});const send=vi.fn();const tasks=await dispatcher.claimBatch(workerPool,"audit-cancel",20);
  for(const task of tasks.filter(t=>t.workspace_id===ws))await dispatcher.dispatchItem(workerPool,task,"audit-cancel",{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).not.toHaveBeenCalled();
 });
 it("preserves terminal campaign states and makes repeat cancellation idempotent",async()=>{
  for(const status of ['completed','failed','cancelled']){
   await ownerPool.query("UPDATE broadcast_campaigns SET status=$1 WHERE id=$2",[status,campaignId]);
   const res=await app.inject({method:"POST",url:path(`broadcasts/${campaignId}/cancel`),headers:headers()});
   expect(res.statusCode,res.body).toBe(status==='cancelled'?200:409);
   expect((await ownerPool.query("SELECT status FROM broadcast_campaigns WHERE id=$1",[campaignId])).rows[0].status).toBe(status);
  }
  const absent=await app.inject({method:"POST",url:path(`broadcasts/${crypto.randomUUID()}/cancel`),headers:headers()});expect(absent.statusCode).toBe(404);
 });
 it("shared stage labels persist with optimistic concurrency",async()=>{
  let res=await app.inject({url:path("commercial/stage-labels"),headers:headers()});expect(res.statusCode,res.body).toBe(200);const version=res.json().version;
  res=await app.inject({method:"PUT",url:path("commercial/stage-labels"),headers:headers(),payload:{expectedVersion:version,labels:{lead:"Novo contato"}}});expect(res.statusCode,res.body).toBe(200);
  expect((await app.inject({url:path("commercial/stage-labels"),headers:headers()})).json().labels.lead).toBe("Novo contato");
  expect((await app.inject({method:"PUT",url:path("commercial/stage-labels"),headers:headers(),payload:{expectedVersion:version,labels:{lead:"Não sobrescrever"}}})).statusCode).toBe(409);
 });
 it("Cakto fails closed and deduplicates payment evidence without inventing a commercial win",async()=>{
  const url=`/v1/webhooks/cakto/${wsB}`;const event={event:"purchase_approved",secret:"synthetic-cakto-secret",data:{id:"audit-order",amount:50,customer:{phone:"5511988887777",name:"Cliente sintético"},product:{name:"Produto sintético"}}};
  vi.stubEnv("CAKTO_WEBHOOK_SECRET","");expect((await app.inject({method:"POST",url,payload:event})).statusCode).toBe(503);
  vi.stubEnv("CAKTO_WEBHOOK_SECRET","synthetic-cakto-secret");expect((await app.inject({method:"POST",url,payload:{...event,secret:"wrong"}})).statusCode).toBe(401);
  const first=await app.inject({method:"POST",url,payload:event});expect(first.statusCode,first.body).toBe(200);
  const duplicate=await app.inject({method:"POST",url,payload:event});expect(duplicate.statusCode,duplicate.body).toBe(200);expect(duplicate.json().duplicate).toBe(true);
  expect((await ownerPool.query("SELECT count(*)::int AS n FROM external_payment_confirmations WHERE workspace_id=$1",[wsB])).rows[0].n).toBe(1);
  expect((await ownerPool.query("SELECT count(*)::int AS n FROM commercial_journeys WHERE workspace_id=$1 AND status='won'",[wsB])).rows[0].n).toBe(0);
  const conflict=await app.inject({method:"POST",url,payload:{...event,data:{...event.data,amount:60}}});expect(conflict.statusCode,conflict.body).toBe(409);
 });
 it("webhook requires a successful test and explicit activation; operational events are durable and signed",async()=>{
  const created=await app.inject({method:"POST",url:path("webhooks"),headers:headers(),payload:{url:"https://audit.example.invalid/events",events:["lead.created"],supportsIdempotency:true}});
  expect(created.statusCode,created.body).toBe(201);const hook=created.json().webhook;expect(hook.is_active).toBe(false);
  expect((await app.inject({method:"PATCH",url:path(`webhooks/${hook.id}`),headers:headers(),payload:{is_active:true}})).statusCode).toBe(422);
  const ping=await app.inject({method:"POST",url:path(`webhooks/${hook.id}/test`),headers:headers()});expect(ping.json().success,ping.body).toBe(true);
  const activated=await app.inject({method:"PATCH",url:path(`webhooks/${hook.id}`),headers:headers(),payload:{is_active:true}});expect(activated.statusCode,activated.body).toBe(200);
  await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164) VALUES($1,'+5511999990033')",[ws]);
  const dispatcher=new OperationalWebhookDispatcher();const claims=await dispatcher.claimBatch(workerPool,"audit-webhook",20);expect(claims.filter(c=>c.workspace_id===ws)).toHaveLength(1);
  network.fetch.mockClear();expect(await dispatcher.dispatchItem(workerPool,claims.find(c=>c.workspace_id===ws)!)).toBe("delivered");
  expect(network.fetch).toHaveBeenCalledTimes(1);const [,request]=network.fetch.mock.calls[0]!;expect(request.headers["X-ChatSales-Signature-256"]).toBe(`sha256=${crypto.createHmac("sha256",hook.secret).update(request.body).digest("hex")}`);
  expect(await dispatcher.dispatchItem(workerPool,claims.find(c=>c.workspace_id===ws)!)).toBe("stale");expect(network.fetch).toHaveBeenCalledTimes(1);
  await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164) VALUES($1,'+5511999990044')",[ws]);
  expect((await app.inject({method:"PATCH",url:path(`webhooks/${hook.id}`),headers:headers(),payload:{is_active:false}})).statusCode).toBe(200);
  expect((await ownerPool.query("SELECT status FROM outbound_webhook_jobs WHERE subscription_id=$1 AND status='suspended'",[hook.id])).rows).toHaveLength(1);
  expect((await app.inject({method:"GET",url:path(`webhooks/${hook.id}/jobs`),headers:headers()})).json().jobs).toHaveLength(2);
 });



 it("webhook retries only a declared idempotent temporary failure and parks uncertain delivery",async()=>{
  const hook=(await app.inject({method:'POST',url:path('webhooks'),headers:headers(),payload:{url:'https://audit.example.invalid/retry',events:['lead.created'],supportsIdempotency:true}})).json().webhook;
  expect((await app.inject({method:'POST',url:path(`webhooks/${hook.id}/test`),headers:headers()})).json().success).toBe(true);
  expect((await app.inject({method:'PATCH',url:path(`webhooks/${hook.id}`),headers:headers(),payload:{is_active:true}})).statusCode).toBe(200);
  const dispatcher=new OperationalWebhookDispatcher();
  await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164) VALUES($1,'+5511999990055')",[ws]);
  const claim=(await dispatcher.claimBatch(workerPool,'retry-audit',20)).find(c=>c.workspace_id===ws)!;expect(claim).toBeTruthy();
  network.fetch.mockClear();network.fetch.mockResolvedValueOnce({ok:false,status:503});expect(await dispatcher.dispatchItem(workerPool,claim)).toBe('failed');
  const firstKey=network.fetch.mock.calls[0]![1].headers['Idempotency-Key'];
  await ownerPool.query("UPDATE outbound_webhook_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[claim.id]);
  const retry=(await dispatcher.claimBatch(workerPool,'retry-audit',20)).find(c=>c.id===claim.id)!;expect(retry).toBeTruthy();
  network.fetch.mockResolvedValueOnce({ok:true,status:200});expect(await dispatcher.dispatchItem(workerPool,retry)).toBe('delivered');
  expect(network.fetch.mock.calls[1]![1].headers['Idempotency-Key']).toBe(firstKey);
  await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164) VALUES($1,'+5511999990066')",[ws]);
  const uncertain=(await dispatcher.claimBatch(workerPool,'uncertain-audit',20)).find(c=>c.workspace_id===ws)!;
  network.fetch.mockRejectedValueOnce(new Error('Synthetic timeout'));expect(await dispatcher.dispatchItem(workerPool,uncertain)).toBe('uncertain');
  expect((await dispatcher.claimBatch(workerPool,'uncertain-audit',20)).some(c=>c.id===uncertain.id)).toBe(false);
  await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164) VALUES($1,'+5511999990077')",[ws]);
  const disabled=(await dispatcher.claimBatch(workerPool,'disabled-audit',20)).find(c=>c.workspace_id===ws)!;
  await app.inject({method:'PATCH',url:path(`webhooks/${hook.id}`),headers:headers(),payload:{is_active:false}});
  network.fetch.mockClear();expect(await dispatcher.dispatchItem(workerPool,disabled)).toBe('suspended');expect(network.fetch).not.toHaveBeenCalled();
 });
 it("media proxy requires a recorded message in the same company and channel",async()=>{
  network.fetch.mockClear();
  for(const query of ["mediaId=unowned-media",`wahaPath=${encodeURIComponent("/api/files/foreign/file.ogg")}`]){
    const result=await app.inject({url:path(`media/proxy?${query}&channelInstanceId=${channelId}`),headers:headers()});expect(result.statusCode,result.body).toBe(404);
  }
  expect(network.fetch).not.toHaveBeenCalled();
  const thread=(await ownerPool.query("SELECT id FROM commercial_threads WHERE workspace_id=$1 LIMIT 1",[ws])).rows[0].id;
  await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,metadata) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990002','+551130000000','image','', $4::jsonb)",[ws,channelId,thread,JSON.stringify({mediaId:"audit-owned-media"})]);
  network.fetch.mockResolvedValueOnce({ok:true,json:async()=>({url:"https://lookaside.fbsbx.com/audit-media",mime_type:"image/png"})}).mockResolvedValueOnce({ok:true,headers:new Headers(),arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer});
  const result=await app.inject({url:path(`media/proxy?mediaId=audit-owned-media&channelInstanceId=${channelId}`),headers:headers()});expect(result.statusCode,result.body).toBe(200);expect(result.headers["cache-control"]).toBe("private, no-store");
 });

 it("prepares a summary, confirms stored customer consent and creates one charge without another model call",async()=>{
  const thread=(await ownerPool.query("SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1",[ws,contact1])).rows[0].id;
  const product=(await ownerPool.query("INSERT INTO products(workspace_id,retailer_id,title,description,price_cents,image_url,stock_policy) VALUES($1,'AUDIT-AI-PIX','Produto SIMULADO','Somente teste',12500,'https://example.invalid/audit.png','not_required') RETURNING id",[ws])).rows[0].id;
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true,ai_api_key='synthetic-only',ai_skills=$2::jsonb,default_pix_key='pix-audit@example.invalid',default_pix_merchant_name='LAB SIMULADO',default_pix_merchant_city='TESTE' WHERE id=$1",[ws,JSON.stringify({pix_charges:true})]);
  await ownerPool.query("UPDATE workspaces SET ai_system_prompt='SIM_ATIVA_NAO_SUBSTITUIR' WHERE id=$1",[ws]);
  const editable=await app.inject({url:path('ai-agent'),headers:headers()});expect(editable.statusCode,editable.body).toBe(200);
  const draftSave=await app.inject({method:'PUT',url:path('ai-agent'),headers:headers(),payload:{expectedRevision:editable.json().version.draftRevision,enabled:false,systemPrompt:'SIM_RASCUNHO_NAO_PUBLICADO',skills:{pix_charges:false}}});
  expect(draftSave.statusCode,draftSave.body).toBe(200);expect(draftSave.json().version.activeEnabled).toBe(true);expect(draftSave.json().config.enabled).toBe(false);
  const inbound=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990001','+551130000000','text','Quero pagar') RETURNING id",[ws,channelId,thread])).rows[0].id;
  const complete=vi.fn().mockResolvedValue({content:`Vou preparar a cobrança. [OFFER_PIX: ${product}]`,provider:'synthetic',model:'audit'});
  const processor=new AiReceptionistProcessor({complete} as never);
  const event={workspaceId:ws,channelInstanceId:channelId,threadId:thread,contactId:contact1,inboundMessageId:inbound,inboundBody:'Quero pagar',senderPhoneE164:'+5511999990001',recipientPhoneE164:'+551130000000'};
  const first=await processor.processInboundMessage(workerPool,event);expect(first.generatedPixChargeId).toBeNull();expect(first.checkoutRequestId).toBeTruthy();
  expect((await ownerPool.query('SELECT count(*)::int n FROM pix_charges WHERE workspace_id=$1 AND product_id=$2',[ws,product])).rows[0].n).toBe(0);
  const quote=(await ownerPool.query('SELECT * FROM ai_checkout_requests WHERE id=$1',[first.checkoutRequestId])).rows[0];
  const dispatcher=new OutboxDispatcher({masterKeyHex:key}),summarySend=vi.fn().mockImplementation(async()=>({success:true,externalMessageId:'SIM_CHECKOUT_SUMMARY',sentAt:(await ownerPool.query('SELECT clock_timestamp() AS at')).rows[0].at}));
  const queued=(await dispatcher.claimBatch(workerPool,'checkout-summary-audit',20)).find(task=>task.idempotency_key===`ai-reply-${inbound}`)!;expect(queued).toBeTruthy();
  expect(await dispatcher.dispatchItem(workerPool,queued,'checkout-summary-audit',{dispatchOutbound:summarySend} as unknown as ChannelDispatchService)).toMatchObject({success:true});
  const confirmBody='CONFIRMAR '+quote.confirmation_code;
  const confirmId=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990001','+551130000000','text',$4) RETURNING id",[ws,channelId,thread,confirmBody])).rows[0].id;
  const pendingHistory=await app.inject({url:path(`threads/${thread}/checkout-requests`),headers:headers()});expect(pendingHistory.statusCode,pendingHistory.body).toBe(200);expect(pendingHistory.json().items).toEqual(expect.arrayContaining([expect.objectContaining({id:quote.id,status:'pending',summarySent:true,confirmedAt:null,chargeId:null,quantity:1,totalCents:12500})]));
  const malformedCursor=await app.inject({url:path(`threads/${thread}/checkout-requests?before=invalid`),headers:headers()});expect(malformedCursor.statusCode).toBe(400);
  const confirmation={...event,inboundMessageId:confirmId,inboundBody:confirmBody};
  const confirmed=await processor.processInboundMessage(workerPool,confirmation);expect(confirmed.generatedPixChargeId,JSON.stringify(confirmed)).toBeTruthy();expect(complete).toHaveBeenCalledTimes(1);
  const confirmedHistory=await app.inject({url:path(`threads/${thread}/checkout-requests`),headers:headers()});expect(confirmedHistory.statusCode,confirmedHistory.body).toBe(200);expect(confirmedHistory.json().items).toEqual(expect.arrayContaining([expect.objectContaining({id:quote.id,status:'consumed',chargeId:confirmed.generatedPixChargeId,confirmedAt:expect.any(String)})]));
  expect((await processor.processInboundMessage(workerPool,confirmation)).reason).toBe('inbound_already_replied');expect(complete).toHaveBeenCalledTimes(1);
  const modelContext=JSON.stringify(complete.mock.calls[0]);expect(modelContext).toContain('SIM_ATIVA_NAO_SUBSTITUIR');expect(modelContext).not.toContain('SIM_RASCUNHO_NAO_PUBLICADO');
  expect((await ownerPool.query("SELECT count(*)::int AS n FROM pix_charges WHERE workspace_id=$1 AND product_id=$2",[ws,product])).rows[0].n).toBe(1);
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1",[ws]);
 });

 it("sends the AI handoff acknowledgement while blocking an older autonomous reply",async()=>{
  const thread=(await ownerPool.query("SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1",[ws,contact1])).rows[0].id;
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true WHERE id=$1",[ws]);
  const inbound=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990001','+551130000000','text','Quero falar com humano') RETURNING id",[ws,channelId,thread])).rows[0].id;
  const complete=vi.fn().mockResolvedValue({content:'Vou encaminhar seu pedido. [HUMAN_HANDOFF: análise da equipe]',provider:'synthetic',model:'audit'});
  const result=await new AiReceptionistProcessor({complete} as never).processInboundMessage(workerPool,{workspaceId:ws,channelInstanceId:channelId,threadId:thread,contactId:contact1,inboundMessageId:inbound,inboundBody:'Quero falar com humano',senderPhoneE164:'+5511999990001',recipientPhoneE164:'+551130000000'});
  expect(result.needsHandoff).toBe(true);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key});const send=vi.fn().mockResolvedValue({success:true,externalMessageId:'synthetic-handoff-ack',sentAt:new Date()});
  const tasks=(await dispatcher.claimBatch(workerPool,'handoff-audit',20)).filter(c=>c.workspace_id===ws);expect(tasks).toHaveLength(2);
  for(const task of tasks)await dispatcher.dispatchItem(workerPool,task,'handoff-audit',{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0]![2].body).toContain('Vou encaminhar seu pedido.');
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1",[ws]);
 });


 it('blocks queued AI replies after capabilities change and retains their evidence',async()=>{
  const thread=(await ownerPool.query('SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1',[ws,contact1])).rows[0].id;
  await ownerPool.query("UPDATE commercial_threads SET status='active' WHERE id=$1",[thread]);
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true,ai_skills='{\"catalog_offers\":true}'::jsonb WHERE id=$1",[ws]);
  const inbound=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990001','+551130000000','text','SIM catálogo') RETURNING id",[ws,channelId,thread])).rows[0].id;
  const complete=vi.fn().mockResolvedValue({content:'SIM resposta anterior à alteração',provider:'synthetic',model:'audit'});
  const result=await new AiReceptionistProcessor({complete} as never).processInboundMessage(workerPool,{workspaceId:ws,channelInstanceId:channelId,threadId:thread,contactId:contact1,inboundMessageId:inbound,inboundBody:'SIM catálogo',senderPhoneE164:'+5511999990001',recipientPhoneE164:'+551130000000'});expect(result.handled).toBe(true);
  await ownerPool.query("UPDATE workspaces SET ai_skills='{}'::jsonb WHERE id=$1",[ws]);
  const dispatcher=new OutboxDispatcher({masterKeyHex:key}),send=vi.fn();const tasks=(await dispatcher.claimBatch(workerPool,'capability-audit',20)).filter(c=>c.workspace_id===ws);expect(tasks).toHaveLength(1);
  const dispatched=await dispatcher.dispatchItem(workerPool,tasks[0]!,'capability-audit',{dispatchOutbound:send} as unknown as ChannelDispatchService);expect(dispatched).toMatchObject({status:'dead_letter'});expect(send).not.toHaveBeenCalled();
  const row=(await ownerPool.query('SELECT delivery_status,metadata FROM messages WHERE id=$1',[tasks[0]!.message_id])).rows[0];expect(row.delivery_status).toBe('failed');expect(row.metadata.capabilitySignature).toBeTruthy();
  await ownerPool.query('UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1',[ws]);
 });


 it('restricts availability exemptions to administrators and resets them on item identity changes',async()=>{
  const input={retailerId:'SIM_POLICY_'+crypto.randomUUID().replace(/-/g,''),title:'SIM acesso digital',description:'SIM acesso sem limite',priceCents:5000,imageUrl:'https://example.invalid/sim.png',stockPolicy:'not_required'};
  const created=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...input,createOnly:true}});expect(created.statusCode,created.body).toBe(201);const product=created.json().product;expect(product.stockPolicy).toBe('not_required');
  const missing=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:input});expect(missing.statusCode,missing.body).toBe(428);
  await ownerPool.query("UPDATE workspace_memberships SET role='operator' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);
  try{
    const forbidden=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...input,expectedProductId:product.id,expectedUpdatedAt:product.updatedAt}});expect(forbidden.statusCode,forbidden.body).toBe(403);
    const {stockPolicy,...ordinary}=input;void stockPolicy;
    const changed=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...ordinary,title:'SIM novo item precisa de revisão',expectedProductId:product.id,expectedUpdatedAt:product.updatedAt}});expect(changed.statusCode,changed.body).toBe(201);expect(changed.json().product.stockPolicy).toBe('review_required');
  }finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
 });

 it("application credentials cannot rewrite or erase financial event evidence",async()=>{
  for(const table of ['integration_event_receipts','external_payment_confirmations']){
    for(const sql of [`DELETE FROM public.${table} WHERE false`,`UPDATE public.${table} SET workspace_id=workspace_id WHERE false`]){
      await expect(appPool.query(sql)).rejects.toMatchObject({code:'42501'});
    }
  }
 });
 it("blocks queued campaign delivery after the responsible removes the billing declaration",async()=>{
  const input=payload(crypto.randomUUID());const prepared=await app.inject({method:"POST",url:path("broadcasts/prepare"),headers:headers(),payload:input});expect(prepared.statusCode,prepared.body).toBe(200);
  const queued=await app.inject({method:"POST",url:path("broadcasts"),headers:headers(),payload:{...input,preparedAudienceId:prepared.json().preparedAudienceId,approvedTestIds:await approveTests(input,prepared.json().preparedAudienceId)}});expect(queued.statusCode,queued.body).toBe(200);
  const current=(await app.inject({url:path('channels?includeInactive=true'),headers:headers()})).json().channels.find((ch:any)=>ch.id===channelId);
  const removed=await app.inject({method:'PATCH',url:path(`channels/${channelId}/billing`),headers:headers(),payload:{expectedRevision:current.revision,metaBillingConfigured:false}});expect(removed.statusCode,removed.body).toBe(200);
  try {
  const dispatcher=new OutboxDispatcher({masterKeyHex:key}),send=vi.fn();const tasks=await dispatcher.claimBatch(workerPool,'SIM-billing-campaign-guard',50);
  for(const task of tasks.filter(t=>t.workspace_id===ws&&t.idempotency_key.startsWith('bcast_')))await dispatcher.dispatchItem(workerPool,task,'SIM-billing-campaign-guard',{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).not.toHaveBeenCalled();const recipients=(await ownerPool.query("SELECT status,error_message FROM broadcast_recipients WHERE campaign_id=$1",[queued.json().campaignId])).rows;expect(recipients.length).toBeGreaterThan(0);expect(recipients).toHaveLength(queued.json().enqueuedCount);expect(recipients.every(row=>row.status==='blocked'&&row.error_message.includes('billing not declared'))).toBe(true);expect((await ownerPool.query('SELECT status,sent_count,failed_count FROM broadcast_campaigns WHERE id=$1',[queued.json().campaignId])).rows[0]).toMatchObject({status:'partial',sent_count:0,failed_count:recipients.length});
  } finally {
  const latest=(await app.inject({url:path('channels?includeInactive=true'),headers:headers()})).json().channels.find((ch:any)=>ch.id===channelId);expect((await app.inject({method:'PATCH',url:path(`channels/${channelId}/billing`),headers:headers(),payload:{expectedRevision:latest.revision,metaBillingConfigured:true,acknowledgedDeclaration:true}})).statusCode).toBe(200);
  }
 });
 it("blocks a queued campaign test if billing is withdrawn before dispatch",async()=>{
  const input=payload(crypto.randomUUID()),prepared=await app.inject({method:'POST',url:path('broadcasts/prepare'),headers:headers(),payload:input});expect(prepared.statusCode,prepared.body).toBe(200);
  const queued=await app.inject({method:'POST',url:path('broadcasts/test'),headers:headers(),payload:{...input,preparedAudienceId:prepared.json().preparedAudienceId,testPhone:'+5511999990002',testVariant:'A'}});expect(queued.statusCode,queued.body).toBe(200);
  await ownerPool.query('UPDATE channel_instances SET meta_billing_configured=false WHERE id=$1',[channelId]);
  try {
  const dispatcher=new OutboxDispatcher({masterKeyHex:key}),send=vi.fn();const tasks=await dispatcher.claimBatch(workerPool,'SIM-billing-test-guard',50);
  for(const task of tasks.filter(t=>t.workspace_id===ws&&t.idempotency_key.startsWith('btest_')))await dispatcher.dispatchItem(workerPool,task,'SIM-billing-test-guard',{dispatchOutbound:send} as unknown as ChannelDispatchService);
  expect(send).not.toHaveBeenCalled();expect((await ownerPool.query("SELECT status FROM outbound_commands WHERE workspace_id=$1 AND idempotency_key LIKE 'btest_%' ORDER BY created_at DESC LIMIT 1",[ws])).rows[0].status).toBe('dead_letter');
  } finally { await ownerPool.query('UPDATE channel_instances SET meta_billing_configured=true WHERE id=$1',[channelId]); }
 });
 it("archives a channel without deleting message and campaign history",async()=>{
  const count=(await ownerPool.query("SELECT count(*)::int AS n FROM messages WHERE workspace_id=$1",[ws])).rows[0].n;
  const result=await app.inject({method:"DELETE",url:path(`channels/${channelId}`),headers:headers(),payload:{expectedRevision:(await app.inject({url:path("channels?includeInactive=true"),headers:headers()})).json().channels.find((ch:any)=>ch.id===channelId).revision}});expect(result.statusCode,result.body).toBe(200);expect(result.json().mode).toBe("archived");
  expect((await ownerPool.query("SELECT is_active,status FROM channel_instances WHERE id=$1",[channelId])).rows[0]).toMatchObject({is_active:false});
  expect((await ownerPool.query("SELECT count(*)::int AS n FROM messages WHERE workspace_id=$1",[ws])).rows[0].n).toBe(count);
  expect((await ownerPool.query("SELECT id FROM broadcast_campaigns WHERE id=$1",[campaignId])).rowCount).toBe(1);
 });

 it("reuses one Pix charge for concurrent creation retries and rejects changed payment terms",async()=>{
  await ownerPool.query("UPDATE workspaces SET default_pix_key='sim-payments@example.invalid',default_pix_merchant_name='SIM LAB',default_pix_merchant_city='SAO PAULO' WHERE id=$1",[ws]);
  const thread=(await ownerPool.query("SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1",[ws,contact1])).rows[0].id;
  const input={requestKey:crypto.randomUUID(),contactId:contact1,title:'SIM cobrança idempotente',amountCents:12345,expiresMinutes:60};
  const responses=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:path(`threads/${thread}/pix-charges`),headers:headers(),payload:input})));
  for(const response of responses)expect(response.statusCode,response.body).toBe(201);expect(responses[0]!.json().charge.id).toBe(responses[1]!.json().charge.id);
  const changed=await app.inject({method:'POST',url:path(`threads/${thread}/pix-charges`),headers:headers(),payload:{...input,amountCents:54321}});expect(changed.statusCode,changed.body).toBe(409);
  expect((await ownerPool.query("SELECT count(*)::int n FROM pix_creation_requests WHERE workspace_id=$1 AND request_key=$2",[ws,input.requestKey])).rows[0].n).toBe(1);
 });

 it("reuses a proposal and optional Pix under concurrent retries, rejecting changed terms",async()=>{
  await ownerPool.query("UPDATE workspaces SET default_pix_key='sim-proposals@example.invalid',default_pix_merchant_name='SIM LAB',default_pix_merchant_city='SAO PAULO' WHERE id=$1",[ws]);
  const thread=(await ownerPool.query("SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1",[ws,contact1])).rows[0].id;
  const input={requestKey:crypto.randomUUID(),contactId:contact1,title:'SIM Proposta idempotente',items:[{title:'SIM Item',unitPriceCents:12345,quantity:2}],generatePixCharge:true,expiresMinutes:60};
  const responses=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:path(`threads/${thread}/proposals`),headers:headers(),payload:input})));
  for(const response of responses)expect(response.statusCode,response.body).toBe(201);
  expect(responses[0]!.json().id).toBe(responses[1]!.json().id);expect(responses[0]!.json().pixCharge.id).toBe(responses[1]!.json().pixCharge.id);
  const changed=await app.inject({method:'POST',url:path(`threads/${thread}/proposals`),headers:headers(),payload:{...input,title:'SIM termos alterados'}});expect(changed.statusCode,changed.body).toBe(409);
  expect((await ownerPool.query("SELECT count(*)::int n FROM pix_charges WHERE workspace_id=$1 AND proposal_id=$2",[ws,responses[0]!.json().id])).rows[0].n).toBe(1);
 });

});


describe("synthetic workspace onboarding",()=>{
 it("keeps the exact initial password and existing account credentials",async()=>{
  const email=`workspace-${suffix}@example.invalid`;const initialPassword=" senha LAB ";
  const created=await app.inject({method:"POST",url:"/v1/workspaces",headers:headers(),payload:{name:`SIMULADO ${suffix}`,ownerName:"Owner LAB",ownerEmail:email,initialPassword}});
  expect(created.statusCode,created.body).toBe(201);expect(created.json().owner.tempPassword).toBe(initialPassword);
  const user=(await ownerPool.query("SELECT password_hash FROM users WHERE email=$1",[email])).rows[0];
  expect(verifyPassword(initialPassword,user.password_hash)).toBe(true);expect(verifyPassword(initialPassword.trim(),user.password_hash)).toBe(false);
  const existing=await app.inject({method:"POST",url:"/v1/workspaces",headers:headers(),payload:{name:`SIMULADO ${suffix}`,ownerName:"Owner LAB",ownerEmail:email,initialPassword:"outra senha"}});
  expect(existing.statusCode,existing.body).toBe(201);expect(existing.json().owner.tempPassword).toBeNull();expect(existing.json().owner.isExistingUser).toBe(true);
  expect((await ownerPool.query("SELECT password_hash FROM users WHERE email=$1",[email])).rows[0].password_hash).toBe(user.password_hash);
 });
 it("rejects an all-space initial password",async()=>{
  const result=await app.inject({method:"POST",url:"/v1/workspaces",headers:headers(),payload:{name:"SIMULADO invalid",ownerName:"Owner LAB",ownerEmail:`invalid-${suffix}@example.invalid`,initialPassword:"      "}});
  expect(result.statusCode,result.body).toBe(400);
 });
});


describe("opportunity concurrent edits",()=>{
 it("rejects stale stage and outcome changes without producing a commercial outcome",async()=>{
  const created=await app.inject({method:"POST",url:path("journeys"),headers:headers(),payload:{contactId:contact1,title:"SIMULADO — concorrência",stage:"lead",estimatedValueCents:150000}});
  expect(created.statusCode,created.body).toBe(201);const id=created.json().id;
  const initial=(await ownerPool.query("SELECT updated_at FROM commercial_journeys WHERE id=$1",[id])).rows[0].updated_at.toISOString();
  const first=await app.inject({method:"PATCH",url:path(`journeys/${id}/stage`),headers:headers(),payload:{stage:"qualified",expectedUpdatedAt:initial}});
  expect(first.statusCode,first.body).toBe(200);
  const staleStage=await app.inject({method:"PATCH",url:path(`journeys/${id}/stage`),headers:headers(),payload:{stage:"proposal",expectedUpdatedAt:initial}});
  expect(staleStage.statusCode,staleStage.body).toBe(409);
  const staleOutcome=await app.inject({method:"POST",url:path(`journeys/${id}/outcomes`),headers:headers(),payload:{status:"lost",valueCents:150000,reason:"SIMULADO",expectedUpdatedAt:initial}});
  expect(staleOutcome.statusCode,staleOutcome.body).toBe(409);
  expect((await ownerPool.query("SELECT count(*)::int n FROM commercial_outcomes WHERE journey_id=$1",[id])).rows[0].n).toBe(0);
  expect((await ownerPool.query("SELECT stage FROM commercial_journeys WHERE id=$1",[id])).rows[0].stage).toBe("qualified");
  const fresh=await app.inject({method:"POST",url:path(`journeys/${id}/outcomes`),headers:headers(),payload:{status:"lost",valueCents:150000,reason:"SIMULADO",expectedUpdatedAt:first.json().journey.updatedAt}});
  expect(fresh.statusCode,fresh.body).toBe(201);
 });
});


describe("commercial contact preferences",()=>{
 it("requires explicit consent evidence for resuming and preserves an audit record",async()=>{
  const missing=await app.inject({method:"PATCH",url:path(`contacts/${contact1}`),headers:headers(),payload:{optOut:false}});expect(missing.statusCode,missing.body).toBe(400);
  const evidence="SIMULADO — cliente solicitou retomada na conversa às 14h";
  const resumed=await app.inject({method:"PATCH",url:path(`contacts/${contact1}`),headers:headers(),payload:{optOut:false,consentEvidence:evidence}});expect(resumed.statusCode,resumed.body).toBe(200);expect(resumed.json().contact.optOut).toBe(false);
  const audit=(await ownerPool.query("SELECT actor_id,metadata FROM audit_events WHERE workspace_id=$1 AND resource_id=$2 AND action='contact.commercial_resumed'",[ws,contact1])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].actor_id).toBe(actor);expect(audit[0].metadata.consentEvidence).toBe(evidence);
  const blocked=await app.inject({method:"PATCH",url:path(`contacts/${contact1}`),headers:headers(),payload:{optOut:true}});expect(blocked.statusCode,blocked.body).toBe(200);
  expect((await ownerPool.query("SELECT count(*)::int n FROM audit_events WHERE workspace_id=$1 AND resource_id=$2 AND action='contact.commercial_blocked'",[ws,contact1])).rows[0].n).toBe(1);
 });
});

describe('product form safety',()=>{
 it('prevents duplicate SKU overwrite and rejects stale or deleted product edits',async()=>{
  const input={createOnly:true,retailerId:`SIM-${suffix}`,title:'SIMULADO original',description:'Descrição LAB',priceCents:150000,imageUrl:'https://example.invalid/sim.png',subtitle:'Preservar',currency:'BRL',badge:'LAB',isFeatured:true};
  const first=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:input});expect(first.statusCode,first.body).toBe(201);const p=first.json().product;
  const duplicate=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...input,title:'Não substituir'}});expect(duplicate.statusCode,duplicate.body).toBe(409);
  const {createOnly,...edit}=input;
  const updated=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...edit,title:'SIMULADO editado',expectedProductId:p.id,expectedUpdatedAt:p.updatedAt}});expect(updated.statusCode,updated.body).toBe(201);expect(updated.json().product.subtitle).toBe('Preservar');expect(updated.json().product.isFeatured).toBe(true);
  const stale=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...edit,title:'Antigo',expectedProductId:p.id,expectedUpdatedAt:p.updatedAt}});expect(stale.statusCode,stale.body).toBe(409);
  const removed=await app.inject({method:'POST',url:path('products'),headers:headers(),payload:{...edit,retailerId:`SIM-MISSING-${suffix}`,expectedProductId:crypto.randomUUID(),expectedUpdatedAt:p.updatedAt}});expect(removed.statusCode,removed.body).toBe(409);
  const rows=(await ownerPool.query('SELECT title,subtitle,is_featured FROM products WHERE workspace_id=$1 AND retailer_id=$2',[ws,input.retailerId])).rows;expect(rows).toHaveLength(1);expect(rows[0].title).toBe('SIMULADO editado');expect(rows[0].subtitle).toBe('Preservar');expect(rows[0].is_featured).toBe(true);
 });
});

describe('stage settings and template authoring',()=>{
 it('requires the current stage-label version and persists shared names',async()=>{
  const current=await app.inject({method:'GET',url:path('commercial/stage-labels'),headers:headers()});expect(current.statusCode,current.body).toBe(200);const version=current.json().version;
  const saved=await app.inject({method:'PUT',url:path('commercial/stage-labels'),headers:headers(),payload:{expectedVersion:version,labels:{lead:'SIMULADO — Primeiro contato'}}});expect(saved.statusCode,saved.body).toBe(200);
  const stale=await app.inject({method:'PUT',url:path('commercial/stage-labels'),headers:headers(),payload:{expectedVersion:version,labels:{lead:'Não substituir'}}});expect(stale.statusCode,stale.body).toBe(409);
  const read=await app.inject({method:'GET',url:path('commercial/stage-labels'),headers:headers()});expect(read.json().labels.lead).toBe('SIMULADO — Primeiro contato');
  const reset=await app.inject({method:'PUT',url:path('commercial/stage-labels'),headers:headers(),payload:{expectedVersion:saved.json().version,labels:{}}});expect(reset.statusCode,reset.body).toBe(200);expect(reset.json().labels).toEqual({});
 });
 it('does not overwrite or revoke an existing template when the new-draft name collides',async()=>{
  const before=(await ownerPool.query('SELECT name,body_text,status,meta_template_id,meta_verified_at FROM message_templates WHERE id=$1',[templateId])).rows[0];
  const duplicate=await app.inject({method:'POST',url:path('templates'),headers:headers(),payload:{name:before.name,category:'MARKETING',bodyText:'Não substituir'}});expect(duplicate.statusCode,duplicate.body).toBe(409);
  const after=(await ownerPool.query('SELECT body_text,status,meta_template_id,meta_verified_at FROM message_templates WHERE id=$1',[templateId])).rows[0];expect(after).toMatchObject({body_text:before.body_text,status:before.status,meta_template_id:before.meta_template_id,meta_verified_at:before.meta_verified_at});
  const input={createOnly:true,name:`sim_${suffix.replaceAll('-','')}`,category:'MARKETING',bodyText:'Rascunho local SIMULADO',buttons:[{type:'QUICK_REPLY',text:'Consultar'}]};
  const results=await Promise.all([app.inject({method:'POST',url:path('templates'),headers:headers(),payload:input}),app.inject({method:'POST',url:path('templates'),headers:headers(),payload:input})]);expect(results.map(r=>r.statusCode).sort()).toEqual([201,409]);expect(results.find(r=>r.statusCode===201)!.json().template.metaTemplateId).toBeNull();
 });
 it('blocks a cancelled summary and an expired Pix before external dispatch',async()=>{
  await ownerPool.query("UPDATE channel_instances SET is_active=true WHERE id=$1",[channelId]);
  const thread=(await ownerPool.query('SELECT id FROM commercial_threads WHERE workspace_id=$1 AND contact_id=$2 LIMIT 1',[ws,contact1])).rows[0].id;
  await ownerPool.query("UPDATE commercial_threads SET status='active' WHERE id=$1",[thread]);
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true,ai_skills='{\"pix_charges\":true}',ai_api_key='synthetic-only' WHERE id=$1",[ws]);
  const product=(await ownerPool.query("INSERT INTO products(workspace_id,retailer_id,title,description,price_cents,image_url,stock_policy) VALUES($1,'SIM_STALE_CHECKOUT','SIM checkout fila','Somente teste',1000,'https://example.invalid/sim.png','not_required') RETURNING id",[ws])).rows[0].id;
  const processor=new AiReceptionistProcessor({complete:vi.fn().mockResolvedValue({content:`SIM [OFFER_PIX: ${product}]`,provider:'synthetic',model:'audit'})} as never),dispatcher=new OutboxDispatcher({masterKeyHex:key});
  const send=vi.fn().mockImplementation(async()=>({success:true,externalMessageId:'SIM_'+crypto.randomUUID(),sentAt:(await ownerPool.query('SELECT clock_timestamp() AS at')).rows[0].at}));
  async function receive(body:string){const id=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'meta_waba','inbound','+5511999990001','+551130000000','text',$4) RETURNING id",[ws,channelId,thread,body])).rows[0].id;return {workspaceId:ws,channelInstanceId:channelId,threadId:thread,contactId:contact1,inboundMessageId:id,inboundBody:body,senderPhoneE164:'+5511999990001',recipientPhoneE164:'+551130000000'};}
  const initial=await receive('SIM preparar resumo cancelado'),first=await processor.processInboundMessage(workerPool,initial);expect(first.checkoutRequestId,JSON.stringify(first)).toBeTruthy();
  await ownerPool.query("UPDATE ai_checkout_requests SET status='cancelled' WHERE id=$1",[first.checkoutRequestId]);
  const cancelled=(await dispatcher.claimBatch(workerPool,'sim-stale-summary',50)).find(task=>task.idempotency_key===`ai-reply-${initial.inboundMessageId}`)!;
  expect(await dispatcher.dispatchItem(workerPool,cancelled,'sim-stale-summary',{dispatchOutbound:send} as unknown as ChannelDispatchService)).toMatchObject({status:'dead_letter'});expect(send).not.toHaveBeenCalled();
  const next=await receive('SIM preparar novo resumo'),second=await processor.processInboundMessage(workerPool,next);
  const ready=(await dispatcher.claimBatch(workerPool,'sim-live-summary',50)).find(task=>task.idempotency_key===`ai-reply-${next.inboundMessageId}`)!;
  expect(await dispatcher.dispatchItem(workerPool,ready,'sim-live-summary',{dispatchOutbound:send} as unknown as ChannelDispatchService)).toMatchObject({success:true});
  const code=(await ownerPool.query('SELECT confirmation_code FROM ai_checkout_requests WHERE id=$1',[second.checkoutRequestId])).rows[0].confirmation_code;
  const consent=await receive('CONFIRMAR '+code),confirmed=await processor.processInboundMessage(workerPool,consent);expect(confirmed.generatedPixChargeId,JSON.stringify(confirmed)).toBeTruthy();
  await ownerPool.query("UPDATE pix_charges SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[confirmed.generatedPixChargeId]);
  const expired=(await dispatcher.claimBatch(workerPool,'sim-expired-charge',50)).find(task=>task.idempotency_key===`ai-reply-${consent.inboundMessageId}`)!;
  expect(await dispatcher.dispatchItem(workerPool,expired,'sim-expired-charge',{dispatchOutbound:send} as unknown as ChannelDispatchService)).toMatchObject({status:'dead_letter'});expect(send).toHaveBeenCalledTimes(1);
  await ownerPool.query('UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1',[ws]);
 });

});
