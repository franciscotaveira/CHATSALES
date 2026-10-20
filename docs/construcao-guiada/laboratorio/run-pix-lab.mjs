// One-shot harness: real local PostgreSQL/RLS; injected model; no dispatcher.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireDatabase=createRequire(new URL('../../../packages/database/package.json',import.meta.url));
const { Pool }=requireDatabase('pg');
import { AiReceptionistProcessor } from './runtime/ai-receptionist.processor.js';
const compose=JSON.parse(await fs.readFile(new URL('./compose.json',import.meta.url),'utf8'));
assert.equal(process.env.APP_ENV,'lab');
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/chat_sales_lab');
const env=compose.services.postgres.environment;
assert.equal(env.POSTGRES_DB,'chat_sales_lab');
const pool=new Pool({host:'postgres',port:5432,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,database:env.POSTGRES_DB,max:4});
const org=crypto.randomUUID(), ws=crypto.randomUUID(), contact=crypto.randomUUID(), channel=crypto.randomUUID(), thread=crypto.randomUUID(), product=crypto.randomUUID();
const evidence=[];
const count=async(table)=>Number((await pool.query(`SELECT count(*) AS n FROM public.${table} WHERE workspace_id=$1`,[ws])).rows[0].n);
const event={workspaceId:ws,channelInstanceId:channel,contactId:contact,threadId:thread,inboundMessageId:crypto.randomUUID(),inboundBody:'Solicitação fictícia de Pix',senderPhoneE164:'+5500000000009',recipientPhoneE164:'+5500000000008'};
let seeded=false;
try {
 await pool.query('BEGIN');
 await pool.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)',[org,'LAB descartável Pix',org]);seeded=true;
 await pool.query(`INSERT INTO workspaces(id,organization_id,name,slug,ai_receptionist_enabled,ai_api_key,ai_skills,default_pix_key,default_pix_merchant_name,default_pix_merchant_city) VALUES($1,$2,'LAB Pix executor',$3,true,'synthetic-not-a-real-key','{"pix_charges":false}','pagamento@example.invalid','LAB TESTE','LAB')`,[ws,org,ws]);
 await pool.query(`INSERT INTO contacts(id,workspace_id,phone_e164,name) VALUES($1,$2,'+5500000000009','Contato fictício executor')`,[contact,ws]);
 await pool.query(`INSERT INTO channel_instances(id,workspace_id,provider,display_name,phone_number_e164,endpoint_token_hash,status,is_active) VALUES($1,$2,'waha','Canal fictício sem provedor','+5500000000008',$3,'connected',true)`,[channel,ws,crypto.randomBytes(32).toString('hex')]);
 await pool.query(`INSERT INTO commercial_threads(id,workspace_id,channel_instance_id,contact_id,status) VALUES($1,$2,$3,$4,'active')`,[thread,ws,channel,contact]);
 await pool.query(`INSERT INTO products(id,workspace_id,retailer_id,title,description,image_url,price_cents,currency,status) VALUES($1,$2,'LAB-EXECUTOR','Produto fictício','Teste local','https://example.invalid/item.png',25000,'BRL','ACTIVE')`,[product,ws]);
 await pool.query('COMMIT');
 const model={complete:async()=>({content:`Pix pronto CODIGO-FALSO [OFFER_PIX: ${product}]`,provider:'synthetic',model:'fixture'})};
 const processor=new AiReceptionistProcessor(model);
 const blocked=await processor.processInboundMessage(pool,event);
 assert.equal(blocked.blockedPixReason,'pix_skill_disabled');assert.equal(blocked.generatedPixChargeId,null);assert.equal(await count('pix_charges'),0);
 const blockedMsg=(await pool.query(`SELECT body,metadata FROM messages WHERE workspace_id=$1 AND direction='outbound'`,[ws])).rows[0];
 assert.ok(blockedMsg.body.includes('Nenhuma cobrança'));assert.ok(!blockedMsg.body.includes('CODIGO-FALSO'));assert.equal(blockedMsg.metadata.blockedPixReason,'pix_skill_disabled');
 assert.equal((await pool.query('SELECT status FROM commercial_threads WHERE id=$1',[thread])).rows[0].status,'waiting_human');
 evidence.push({case:'disabled-real-worker-role',charges:0,handoff:true,safeReply:true,outbox:await count('outbound_commands')});
 await pool.query(`UPDATE workspaces SET ai_skills='{"pix_charges":true}' WHERE id=$1`,[ws]);
 await pool.query(`UPDATE commercial_threads SET status='active' WHERE id=$1`,[thread]);
 const allowedProcessor=new AiReceptionistProcessor({complete:async()=>({content:`Vou preparar o pagamento. [OFFER_PIX: ${product}]`,provider:'synthetic',model:'fixture'})});
 const allowed=await allowedProcessor.processInboundMessage(pool,{...event,inboundMessageId:crypto.randomUUID()});
 assert.ok(allowed.generatedPixChargeId);assert.equal(await count('pix_charges'),1);
 const charge=(await pool.query('SELECT amount_cents,product_id,status,pix_code FROM pix_charges WHERE workspace_id=$1',[ws])).rows[0];
 assert.equal(charge.amount_cents,25000);assert.equal(charge.product_id,product);assert.ok(allowed.replyText.includes(charge.pix_code));
 evidence.push({case:'enabled-real-local-pix-generation',charges:1,amountCents:charge.amount_cents,codeIncluded:true,externalDelivery:false});
 // Disable from another connection during inference; executor must reread it.
 await pool.query(`UPDATE commercial_threads SET status='active' WHERE id=$1`,[thread]);
 const changed=new AiReceptionistProcessor({complete:async()=>{await pool.query(`UPDATE workspaces SET ai_skills='{"pix_charges":false}' WHERE id=$1`,[ws]);return {content:`[OFFER_PIX: ${product}]`,provider:'synthetic',model:'fixture'};}});
 const changedResult=await changed.processInboundMessage(pool,{...event,inboundMessageId:crypto.randomUUID()});
 assert.equal(changedResult.blockedPixReason,'pix_skill_disabled');assert.equal(await count('pix_charges'),1);
 evidence.push({case:'disabled-during-inference',additionalCharges:0});
 await pool.query(`UPDATE workspaces SET ai_skills='{"pix_charges":true}' WHERE id=$1`,[ws]);
 await pool.query(`UPDATE commercial_threads SET status='active' WHERE id=$1`,[thread]);
 const handedOff=new AiReceptionistProcessor({complete:async()=>{await pool.query(`UPDATE commercial_threads SET status='waiting_human' WHERE id=$1`,[thread]);return {content:`[OFFER_PIX: ${product}]`,provider:'synthetic',model:'fixture'};}});
 const countBefore=await count('outbound_commands');
 const handedOffResult=await handedOff.processInboundMessage(pool,{...event,inboundMessageId:crypto.randomUUID()});
 assert.equal(handedOffResult.reason,'thread_unavailable_before_pix_action');assert.equal(await count('pix_charges'),1);assert.equal(await count('outbound_commands'),countBefore);
 evidence.push({case:'human-takeover-during-inference',additionalCharges:0,additionalMessages:0});
 const messageId=(await pool.query('SELECT id FROM messages WHERE workspace_id=$1 LIMIT 1',[ws])).rows[0].id;
 const guarded=await pool.connect();
 try {
   await guarded.query('BEGIN'); await guarded.query('SET ROLE sos_worker_user');
   await guarded.query("SELECT set_config('app.current_workspace_id',$1,true)",['b1111111-1111-4111-8111-111111111111']);
   let denied=false;
   try {
     await guarded.query(`INSERT INTO outbound_commands(workspace_id,channel_instance_id,thread_id,message_id,recipient_e164,body,idempotency_key,payload_fingerprint) VALUES($1,$2,$3,$4,$5,'Teste RLS',$6,$7)`,[ws,channel,thread,messageId,event.senderPhoneE164,crypto.randomUUID(),'0'.repeat(64)]);
   } catch(error) { denied=error.code==='42501'; }
   assert.ok(denied,'INSERT de outro tenant deve ser negado pelo RLS');
 } finally {await guarded.query('ROLLBACK');await guarded.query('RESET ROLE');guarded.release();}
 const privilege=(await pool.query("SELECT has_table_privilege('sos_worker_user','public.workspaces','UPDATE') AS permitted")).rows[0].permitted;
 assert.equal(privilege,false);
 evidence.push({case:'worker-cross-tenant-insert',denied:true,workerCanUpdateAiConfig:false});
} finally {
 // Fixture only; never target the user's main lab workspace.
 await pool.query('ROLLBACK');
 if(seeded) {
   await pool.query('DELETE FROM audit_events WHERE workspace_id=$1',[ws]);
   await pool.query('DELETE FROM workspaces WHERE id=$1',[ws]);
   await pool.query('DELETE FROM organizations WHERE id=$1',[org]);
 }
 await pool.end();
}
console.log('LAB_PIX_EVIDENCE='+JSON.stringify(evidence));
