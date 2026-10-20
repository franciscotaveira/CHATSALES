import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import type {FastifyInstance} from "fastify";
import {createTestDatabasePools} from "@sos-sales/database";
import {SignJWT} from "@sos-sales/auth";
import {buildApp} from "../index";

// Synthetic database-only receipts. No provider, bank or dispatch worker is started.
describe("Manual Pix receipt remains separate from commercial outcomes",()=>{
 const {ownerPool,appPool}=createTestDatabasePools();
 const jwtSecret="SIM_manual_receipt_test_secret_minimum_32_characters",issuer="sos-sales-test",audience="sos-sales-api-test";
 let app:FastifyInstance,workspaceId:string,otherWorkspaceId:string,userId:string,token:string,analystToken:string;
 const scalar=async(sql:string,args:unknown[])=>Number((await ownerPool.query(sql,args)).rows[0].count);
 beforeAll(async()=>{
  const suffix=crypto.randomUUID();
  const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM receipt audit',$1) RETURNING id",['sim-receipt-'+suffix])).rows[0].id;
  workspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM receipt workspace',$2) RETURNING id",[org,'sim-receipt-a-'+suffix])).rows[0].id;
  otherWorkspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM other workspace',$2) RETURNING id",[org,'sim-receipt-b-'+suffix])).rows[0].id;
  userId=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM receipt operator') RETURNING id",['sim-'+suffix+'@example.invalid'])).rows[0].id;
  const analystId=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM receipt analyst') RETURNING id",['sim-analyst-'+suffix+'@example.invalid'])).rows[0].id;
  await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'operator'),($1,$3,'analyst')",[workspaceId,userId,analystId]);
  const sign=(id:string)=>new SignJWT({workspaceId}).setProtectedHeader({alg:'HS256'}).setSubject(id).setIssuer(issuer).setAudience(audience).setExpirationTime('2h').sign(new TextEncoder().encode(jwtSecret));
  token=await sign(userId);analystToken=await sign(analystId);
  app=await buildApp({providerType:'local-jwt',jwtSecret,issuer,audience,masterKeyHex:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
 });
 afterAll(async()=>{if(app)await app.close();await ownerPool.end();await appPool.end();});
 async function fixture(connected=false,identified=true){
  const phone='+5500'+Math.floor(Math.random()*1e10).toString().padStart(10,'0');
  const contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,$2,'SIM receipt contact') RETURNING id",[workspaceId,phone])).rows[0].id;
  const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,is_active,status,phone_number_e164) VALUES($1,'waha','SIM no provider',$2,$3,$4,$5) RETURNING id",[workspaceId,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),connected,connected?'connected':'unconfigured',identified?'+5500999900000':null])).rows[0].id;
  const thread=(await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id) VALUES($1,$2,$3) RETURNING id",[workspaceId,channel,contact])).rows[0].id;
  const charge=(await ownerPool.query("INSERT INTO pix_charges(workspace_id,thread_id,contact_id,title,amount_cents,pix_code,expires_at) VALUES($1,$2,$3,'SIM receipt only',4200,'SIM_NOT_A_PAYABLE_PIX',now()+interval '1 hour') RETURNING id",[workspaceId,thread,contact])).rows[0].id;
  return {contact,thread,charge};
 }
 const receipt=(charge:string,auth=token,workspace=workspaceId)=>app.inject({method:'POST',url:`/v1/workspaces/${workspace}/pix-charges/${charge}/confirm-payment`,headers:{authorization:`Bearer ${auth}`}});
 it('records the receipt without choosing either of two open negotiations or creating conversion events',async()=>{
  const f=await fixture();await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,thread_id,contact_id,title,stage,status) VALUES($1,$2,$3,'SIM negotiation A','proposal','open'),($1,$2,$3,'SIM negotiation B','qualified','open')",[workspaceId,f.thread,f.contact]);
  const res=await receipt(f.charge);expect(res.statusCode,res.body).toBe(200);expect(res.json()).toMatchObject({success:true,alreadySettled:false,notification:'not_queued',commercialOutcome:'unchanged',charge:{status:'PAID',verificationMethod:'MANUAL_CASHIER',verifiedByUserId:userId}});
  const journeys=(await ownerPool.query("SELECT stage,status FROM commercial_journeys WHERE workspace_id=$1 AND thread_id=$2 ORDER BY title",[workspaceId,f.thread])).rows;expect(journeys).toEqual([{stage:'proposal',status:'open'},{stage:'qualified',status:'open'}]);
  expect(await scalar('SELECT count(*) FROM commercial_outcomes WHERE workspace_id=$1',[workspaceId])).toBe(0);expect(await scalar('SELECT count(*) FROM conversion_events WHERE workspace_id=$1',[workspaceId])).toBe(0);
 });
 it('does not create a negotiation when only a financial charge exists',async()=>{
  const f=await fixture();expect((await receipt(f.charge)).statusCode).toBe(200);expect(await scalar('SELECT count(*) FROM commercial_journeys WHERE workspace_id=$1 AND thread_id=$2',[workspaceId,f.thread])).toBe(0);
 });
 it('reports notification queueing separately and does not repeat it for an already recorded receipt',async()=>{
  const f=await fixture(true);const first=await receipt(f.charge);expect(first.statusCode,first.body).toBe(200);expect(first.json().notification).toBe('queued');const again=await receipt(f.charge);expect(again.statusCode,again.body).toBe(200);expect(again.json()).toMatchObject({alreadySettled:true,notification:'unchanged',commercialOutcome:'unchanged'});expect(await scalar('SELECT count(*) FROM outbound_commands WHERE workspace_id=$1 AND idempotency_key=$2',[workspaceId,'pix-confirm-'+f.charge])).toBe(1);
 });
 it('records the financial receipt even when a connected channel has no identified sending phone',async()=>{
  const f=await fixture(true,false);const res=await receipt(f.charge);expect(res.statusCode,res.body).toBe(200);expect(res.json()).toMatchObject({notification:'not_queued',charge:{status:'PAID'}});expect(await scalar('SELECT count(*) FROM outbound_commands WHERE workspace_id=$1 AND idempotency_key=$2',[workspaceId,'pix-confirm-'+f.charge])).toBe(0);
 });
 it('rejects a profile without receipt permission and leaves the charge pending',async()=>{
  const f=await fixture();expect((await receipt(f.charge,analystToken)).statusCode).toBe(403);expect((await ownerPool.query('SELECT status FROM pix_charges WHERE id=$1',[f.charge])).rows[0].status).toBe('PENDING');
 });
 it('does not settle a charge using another workspace context',async()=>{
  const f=await fixture();expect((await receipt(f.charge,token,otherWorkspaceId)).statusCode).toBe(403);expect((await ownerPool.query('SELECT status FROM pix_charges WHERE id=$1',[f.charge])).rows[0].status).toBe('PENDING');
 });
});
