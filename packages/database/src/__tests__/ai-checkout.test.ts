import crypto from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {createTestDatabasePools,withWorkerTransaction,withTenantTransaction,prepareAiCheckout,confirmAiCheckout,linkAiCheckoutSummary,type AiCheckoutContext} from '../index';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();
let ws:string,channel:string,thread:string,contact:string,product:string;
const count=async()=>(await ownerPool.query('SELECT count(*)::int n FROM pix_charges WHERE workspace_id=$1',[ws])).rows[0].n;
const worker=<T>(fn:Parameters<typeof withWorkerTransaction<T>>[1])=>withWorkerTransaction(ws,fn,workerPool);
async function inbound(body='SIM quero pagar'):Promise<AiCheckoutContext>{
 const id=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body) VALUES($1,$2,$3,'waha','inbound','+5500000000001','+5500000000000','text',$4) RETURNING id",[ws,channel,thread,body])).rows[0].id;
 return {workspaceId:ws,channelInstanceId:channel,threadId:thread,contactId:contact,inboundMessageId:id,inboundBody:body,senderPhoneE164:'+5500000000001'};
}
async function prepared(quantity=2){const ctx=await inbound();const result=await worker(client=>prepareAiCheckout(client,ctx,product,quantity));return {ctx,result,row:(await ownerPool.query('SELECT * FROM ai_checkout_requests WHERE id=$1',[result.checkoutRequestId])).rows[0]};}
async function summaryProof(id:string,body:string,sent=true){
 // Explicit synthetic transport proof, not a real provider delivery.
 const message=(await ownerPool.query("INSERT INTO messages(workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,delivery_status,provider_message_id) VALUES($1,$2,$3,'waha','outbound','+5500000000000','+5500000000001','text',$4,$5,$6) RETURNING id",[ws,channel,thread,body,sent?'sent':'queued',sent?'SIM_'+crypto.randomUUID():null])).rows[0].id;
 await ownerPool.query("INSERT INTO outbound_commands(workspace_id,channel_instance_id,thread_id,message_id,recipient_e164,body,idempotency_key,payload_fingerprint,status,external_message_id,sent_at) VALUES($1,$2,$3,$4,'+5500000000001',$5,$6,$7,$8,$9,CASE WHEN $10::boolean THEN clock_timestamp() ELSE NULL END)",[ws,channel,thread,message,body,crypto.randomUUID(),crypto.createHash('sha256').update(body).digest('hex'),sent?'sent':'pending',sent?'SIM_'+crypto.randomUUID():null,sent]);
 await worker(client=>linkAiCheckoutSummary(client,ws,id,message));
}
beforeAll(async()=>{
 const slug=crypto.randomUUID(),org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM checkout',$1) RETURNING id",[slug])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,default_pix_key,default_pix_merchant_name,default_pix_merchant_city) VALUES($1,'SIM checkout',$2,'pix-sim@example.invalid','SIM LAB','TESTE') RETURNING id",[org,slug])).rows[0].id;
 channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,status,is_active,phone_number_e164) VALUES($1,'waha','SIM canal',$2,'connected',true,'+5500000000000') RETURNING id",[ws,crypto.randomBytes(32).toString('hex')])).rows[0].id;
 contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+5500000000001','SIM cliente') RETURNING id",[ws])).rows[0].id;
 thread=(await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id,status) VALUES($1,$2,$3,'active') RETURNING id",[ws,channel,contact])).rows[0].id;
 product=(await ownerPool.query("INSERT INTO products(workspace_id,retailer_id,title,description,price_cents,image_url,stock_policy) VALUES($1,'SIM_DIGITAL','SIM item digital','SIM sem limite de vagas',12345,'https://example.invalid/sim.png','not_required') RETURNING id",[ws])).rows[0].id;
});
beforeEach(async()=>{
 await ownerPool.query('DELETE FROM ai_checkout_requests WHERE workspace_id=$1',[ws]);
 await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true,ai_skills='{\"pix_charges\":true}',ai_business_rules='{\"checkoutValidityMinutes\":15}' WHERE id=$1",[ws]);
 await ownerPool.query("UPDATE commercial_threads SET status='active' WHERE id=$1",[thread]);
 await ownerPool.query("UPDATE products SET price_cents=12345,title='SIM item digital',stock_policy='not_required',status='ACTIVE' WHERE id=$1",[product]);
});
afterAll(async()=>{await ownerPool.end();await workerPool.end();await appPool.end();});
describe('Checkout confirmation — real tenant/worker roles with synthetic transport proof',()=>{
 it('prepares terms without charging, then consumes one real inbound confirmation and preserves the valid quoted price',async()=>{
  const before=await count(),{result,row}=await prepared();expect(await count()).toBe(before);expect(result.replyText).toContain('Quantidade: 2');expect(result.replyText).toContain('CONFIRMAR '+row.confirmation_code);
  await summaryProof(row.id,result.replyText);await ownerPool.query('UPDATE products SET price_cents=15000 WHERE id=$1',[product]);
  const ctx=await inbound('CONFIRMAR '+row.confirmation_code),confirmed=await worker(client=>confirmAiCheckout(client,ctx));expect(confirmed.generatedPixChargeId).toBeTruthy();expect(await count()).toBe(before+1);
  const charge=(await ownerPool.query('SELECT amount_cents FROM pix_charges WHERE id=$1',[confirmed.generatedPixChargeId])).rows[0];expect(charge.amount_cents).toBe(24690);
  await worker(client=>confirmAiCheckout(client,ctx));expect(await count()).toBe(before+1);
  const evidence=(await ownerPool.query('SELECT status,confirmation_message_id FROM ai_checkout_requests WHERE id=$1',[row.id])).rows[0];expect(evidence).toEqual({status:'consumed',confirmation_message_id:ctx.inboundMessageId});
 });
 it('does not accept model-like or forged event consent that is absent from the stored inbound',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText);const ctx=await inbound('SIM texto sem consentimento');const before=await count();
  await expect(worker(client=>confirmAiCheckout(client,{...ctx,inboundBody:'CONFIRMAR '+row.confirmation_code}))).rejects.toMatchObject({reason:'checkout_inbound_unverified'});expect(await count()).toBe(before);
  await expect(worker(client=>confirmAiCheckout(client,{...ctx,inboundBody:'sim'}))).rejects.toMatchObject({reason:'checkout_confirmation_invalid'});
 });
 it('requires an acknowledged summary before processing the customer code',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText,false);const ctx=await inbound('CONFIRMAR '+row.confirmation_code),before=await count();
  await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_summary_not_sent'});expect(await count()).toBe(before);
 });
 it('rejects a confirmation received before the actual summary dispatch acknowledgement',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText);const ctx=await inbound('CONFIRMAR '+row.confirmation_code),before=await count();
  await ownerPool.query("UPDATE outbound_commands SET sent_at=clock_timestamp()+interval '1 minute' WHERE message_id=(SELECT summary_message_id FROM ai_checkout_requests WHERE id=$1)",[row.id]);
  await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_summary_not_sent'});expect(await count()).toBe(before);
 });
 it('keeps inventory-dependent or unavailable items for human verification',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText);await ownerPool.query("UPDATE products SET stock_policy='review_required' WHERE id=$1",[product]);const ctx=await inbound('CONFIRMAR '+row.confirmation_code),before=await count();
  await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_availability_unverified'});expect(await count()).toBe(before);
  await ownerPool.query("UPDATE products SET status='OUT_OF_STOCK' WHERE id=$1",[product]);await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_product_unavailable'});
 });
 it('rejects permission changes and human takeover before the financial effect',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText);const ctx=await inbound('CONFIRMAR '+row.confirmation_code),before=await count();
  await ownerPool.query("UPDATE workspaces SET ai_skills='{\"pix_charges\":true,\"catalog_offers\":true}' WHERE id=$1",[ws]);await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_permissions_changed'});
  await ownerPool.query("UPDATE commercial_threads SET status='waiting_human' WHERE id=$1",[thread]);await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_context_changed'});expect(await count()).toBe(before);
 });
 it('supersedes a summary and never accepts its old code',async()=>{
  const first=await prepared();await summaryProof(first.row.id,first.result.replyText);const second=await prepared(3);expect(second.row.confirmation_code).not.toBe(first.row.confirmation_code);
  const ctx=await inbound('CONFIRMAR '+first.row.confirmation_code);await expect(worker(client=>confirmAiCheckout(client,ctx))).rejects.toMatchObject({reason:'checkout_confirmation_outdated'});
 });
 it('refreshes an explicitly expired fixture and requires the new code before charging',async()=>{
  const {result,row}=await prepared();await summaryProof(row.id,result.replyText);
  // Replace only this disposable fixture with the same terms and a past expiry; no trigger bypass.
  const fixture=(await ownerPool.query('SELECT * FROM ai_checkout_requests WHERE id=$1',[row.id])).rows[0];fixture.valid_until=new Date(Date.now()-60000);
  await ownerPool.query('DELETE FROM ai_checkout_requests WHERE id=$1',[row.id]);await ownerPool.query('INSERT INTO ai_checkout_requests SELECT * FROM json_populate_record(null::ai_checkout_requests,$1::json)',[JSON.stringify(fixture)]);
  await ownerPool.query('UPDATE products SET price_cents=15000 WHERE id=$1',[product]);const ctx=await inbound('CONFIRMAR '+row.confirmation_code),before=await count();
  const fresh=await worker(client=>confirmAiCheckout(client,ctx));expect(fresh.generatedPixChargeId).toBeUndefined();expect(fresh.checkoutRequestId).not.toBe(row.id);expect(await count()).toBe(before);expect(fresh.replyText).toContain('confirme novamente');
  const updated=(await ownerPool.query('SELECT * FROM ai_checkout_requests WHERE id=$1',[fresh.checkoutRequestId])).rows[0];expect(updated.total_cents).toBe(30000);expect(updated.confirmation_code).not.toBe(row.confirmation_code);
 });
 it('does not let application callers forge consent or workers rewrite quoted terms',async()=>{
  const {row}=await prepared();await expect(withTenantTransaction(ws,client=>client.query("INSERT INTO ai_checkout_requests(workspace_id) VALUES($1)",[ws]))).rejects.toThrow(/permission denied/i);
  await expect(worker(client=>client.query('UPDATE ai_checkout_requests SET total_cents=1 WHERE id=$1',[row.id]))).rejects.toThrow(/immutable/i);
  const foreign=await withWorkerTransaction(crypto.randomUUID(),client=>client.query('SELECT id FROM ai_checkout_requests WHERE id=$1',[row.id]),workerPool);expect(foreign.rows).toEqual([]);
 });
 it('locks catalog rows without giving the worker general product write access',async()=>{
  await expect(worker(client=>client.query("UPDATE products SET stock_policy='not_required' WHERE id=$1",[product]))).rejects.toThrow(/permission denied/i);
  await expect(withTenantTransaction(ws,client=>client.query('SELECT * FROM lock_ai_checkout_product($1,$2)',[ws,product]))).rejects.toThrow(/permission denied/i);
  await expect(withWorkerTransaction(crypto.randomUUID(),client=>client.query('SELECT * FROM lock_ai_checkout_product($1,$2)',[ws,product]),workerPool)).rejects.toMatchObject({code:'42501'});
 });

});
