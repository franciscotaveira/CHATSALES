import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import crypto from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {createTestDatabasePools} from '@sos-sales/database';
import {SignJWT} from '@sos-sales/auth';
import {buildApp} from '../index';
// Disposable records only: no dispatcher, provider, or connected channel.
describe('Read-only campaign recipient evidence',()=>{
 const {ownerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,otherWs:string,campaign:string,token:string;
 const secret='SIM_recipient_evidence_secret_minimum_32_characters';
 beforeAll(async()=>{
  const suffix=crypto.randomUUID();const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM recipients',$1) RETURNING id",['sim-rec-'+suffix])).rows[0].id;
  ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,ai_receptionist_enabled) VALUES($1,'SIM recipient workspace',$2,false) RETURNING id",[org,'sim-rec-a-'+suffix])).rows[0].id;
  otherWs=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,ai_receptionist_enabled) VALUES($1,'SIM other workspace',$2,false) RETURNING id",[org,'sim-rec-b-'+suffix])).rows[0].id;
  const user=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM operator') RETURNING id",['sim-rec-'+suffix+'@example.invalid'])).rows[0].id;await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'operator')",[ws,user]);
  token=await new SignJWT({workspaceId:ws}).setProtectedHeader({alg:'HS256'}).setSubject(user).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('2h').sign(new TextEncoder().encode(secret));
  app=await buildApp({providerType:'local-jwt',jwtSecret:secret,issuer:'sos-sales-test',audience:'sos-sales-api-test',masterKeyHex:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
  const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,is_active,status) VALUES($1,'waha','SIM disconnected',$2,false,'unconfigured') RETURNING id",[ws,crypto.createHash('sha256').update(suffix).digest('hex')])).rows[0].id;
  const template=(await ownerPool.query("INSERT INTO message_templates(workspace_id,name,category,body_text,status,language) VALUES($1,'sim_recipient_notice','UTILITY','SIM sem envio','PENDING','pt_BR') RETURNING id",[ws])).rows[0].id;
  campaign=(await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,is_ab_test,variant_a_template_id,variant_b_template_id,total_targeted,status,sent_count,delivered_count) VALUES($1,'SIM recipient evidence',$2,true,$3,$3,60,'partial',1,1) RETURNING id",[ws,channel,template])).rows[0].id;
  for(let i=0;i<52;i++)await ownerPool.query("INSERT INTO broadcast_recipients(workspace_id,campaign_id,phone_e164,variant,template_id,status,sent_at,delivered_at,error_message) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)",[ws,campaign,'+550000'+i.toString().padStart(6,'0'),i%2?'B':'A',template,['delivered','blocked','failed','uncertain'][i]??'queued',i===0?new Date('2026-10-18T12:00:00Z'):null,i===1?'CAMPAIGN_BLOCKED: synthetic guard':i===2?'SIM_PRIVATE_PROVIDER_DETAIL':null]);
  const named=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+550000000051','SIM Cliente Ágata') RETURNING id",[ws])).rows[0].id;
  await ownerPool.query("UPDATE broadcast_recipients SET contact_id=$3 WHERE workspace_id=$1 AND campaign_id=$2 AND phone_e164='+550000000051'",[ws,campaign,named]);
 });
 afterAll(async()=>{if(app)await app.close();await ownerPool.end();await appPool.end();});
 const get=(id=campaign,workspace=ws,query='')=>app.inject({method:'GET',url:`/v1/workspaces/${workspace}/broadcasts/${id}/recipients${query}`,headers:{authorization:`Bearer ${token}`}});
 it('paginates registered recipients without fabricating confirmations or exposing raw provider details',async()=>{
  const first=await get();expect(first.statusCode,first.body).toBe(200);const page=first.json();expect(page.campaign).toMatchObject({id:campaign,totalTargeted:60,totalRecorded:52});expect(page.recipients).toHaveLength(50);expect(page.pagination.hasMore).toBe(true);
  const second=await get(campaign,ws,'?afterId='+page.pagination.nextCursor);expect(second.statusCode).toBe(200);const all=[...page.recipients,...second.json().recipients];expect(all).toHaveLength(52);expect(new Set(all.map(r=>r.id)).size).toBe(52);expect(second.json().pagination).toEqual({hasMore:false,nextCursor:null});
  expect(all.filter(r=>r.sentAt!==null)).toHaveLength(1);expect(all.find(r=>r.status==='queued')).toMatchObject({sentAt:null,deliveredAt:null,readAt:null});expect(all.find(r=>r.status==='blocked').reason).toContain('não discrimina');expect(JSON.stringify(all)).not.toContain('SIM_PRIVATE_PROVIDER_DETAIL');expect(all.find(r=>r.status==='failed').reason).toBeNull();
 });
 it('does not count queued and failed recipients as confirmed A/B sends',async()=>{
  const result=await app.inject({method:'GET',url:`/v1/workspaces/${ws}/broadcasts/campaigns`,headers:{authorization:`Bearer ${token}`}});expect(result.statusCode,result.body).toBe(200);const report=result.json().campaigns.find((c:any)=>c.id===campaign).abReport;expect(report.variantA.sent).toBe(1);expect(report.variantB.sent).toBe(0);
 });
 it('filters across the full campaign by recorded state and reports matching counts separately',async()=>{
  const attention=(await get(campaign,ws,'?group=ATTENTION')).json();expect(attention.campaign).toMatchObject({totalRecorded:52,totalMatching:3});expect(attention.recipients.map((r:any)=>r.status).sort()).toEqual(['blocked','failed','uncertain']);
  const pending=(await get(campaign,ws,'?group=PENDING')).json();expect(pending.campaign.totalMatching).toBe(48);expect(pending.recipients.every((r:any)=>r.status==='queued')).toBe(true);
  const confirmed=(await get(campaign,ws,'?group=CONFIRMED')).json();expect(confirmed.campaign.totalMatching).toBe(1);expect(confirmed.recipients[0].sentAt).not.toBeNull();
 });
 it('searches names and formatted phone numbers on the server, combining search and state',async()=>{
  const named=await get(campaign,ws,'?search='+encodeURIComponent('ágata')+'&group=PENDING');expect(named.statusCode,named.body).toBe(200);expect(named.json().recipients).toHaveLength(1);expect(named.json().recipients[0].name).toBe('SIM Cliente Ágata');expect(named.json().campaign.totalMatching).toBe(1);
  const formatted=(await get(campaign,ws,'?search='+encodeURIComponent('+55 (0000) 000051'))).json();expect(formatted.recipients).toHaveLength(1);expect(formatted.recipients[0].phoneE164).toBe('+550000000051');
  const unmatched=(await get(campaign,ws,'?search='+encodeURIComponent('Ágata')+'&group=ATTENTION')).json();expect(unmatched.campaign).toMatchObject({totalRecorded:52,totalMatching:0});expect(unmatched.recipients).toEqual([]);
  expect((await get(campaign,ws,'?group=INVALID')).statusCode).toBe(400);expect((await get(campaign,ws,'?search='+encodeURIComponent('X'.repeat(121)))).statusCode).toBe(400);
 });
 it('projects precise known blockers while keeping unknown log content private',async()=>{
  await ownerPool.query("UPDATE broadcast_recipients SET error_message='CAMPAIGN_BLOCKED: CHANNEL_UNAVAILABLE,CONTACT_OPTED_OUT,SIM_PRIVATE_TOKEN' WHERE workspace_id=$1 AND campaign_id=$2 AND status='blocked'",[ws,campaign]);
  const result=await get(campaign,ws,'?group=ATTENTION');expect(result.statusCode).toBe(200);const reason=result.json().recipients.find((r:any)=>r.status==='blocked').reason;expect(reason).toContain('Canal não está ativo e conectado');expect(reason).toContain('Contato bloqueou comunicações comerciais');expect(reason).toContain('outro motivo');expect(result.body).not.toContain('SIM_PRIVATE_TOKEN');expect(result.body).not.toContain('error_message');
 });
 it('rejects foreign workspace, nonexistent campaign, invalid cursor and unauthenticated access',async()=>{
  expect((await get(campaign,otherWs)).statusCode).toBe(403);expect((await get(crypto.randomUUID())).statusCode).toBe(404);expect((await get(campaign,ws,'?afterId=invalid')).statusCode).toBe(400);expect((await get(campaign,ws,'?extra=1')).statusCode).toBe(400);expect((await app.inject({method:'GET',url:`/v1/workspaces/${ws}/broadcasts/${campaign}/recipients`})).statusCode).toBe(401);
 });
});
