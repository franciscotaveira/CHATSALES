import { beforeAll, afterAll, it, expect } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, encryptPayload } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";
const {ownerPool,workerPool,appPool}=createTestDatabasePools();
const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
let app:FastifyInstance,ws:string,other:string,meta:string,waha:string,token:string;
const headers=()=>({authorization:`Bearer ${token}`});
const endpoint=(id:string,tail='')=>`/v1/workspaces/${ws}/channels/${id}${tail}`;
async function revision(id:string){const res=await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()});expect(res.statusCode,res.body).toBe(200);return res.json().channels.find((channel:{id:string})=>channel.id===id).revision as string;}
async function billing(id:string,payload:Record<string,unknown>){return app.inject({method:'PATCH',url:endpoint(id,'/billing'),headers:headers(),payload});}
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES ('SIM channel management',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'SIM A',$2) RETURNING id",[org,suffix])).rows[0].id;
 other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'SIM B',$2) RETURNING id",[org,`b-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES ($1,$2,'SIM manager')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'owner')",[ws,actor]);
 for(const provider of ['meta_waba','waha']){const id=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,status,is_active,phone_number_e164) VALUES ($1,$2,$3,$4,'connected',true,'+551130000000') RETURNING id",[ws,provider,`SIM ${provider}`,crypto.createHash('sha256').update(provider+suffix).digest('hex')])).rows[0].id;if(provider==='meta_waba')meta=id;else waha=id;}
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});
it('records an acknowledged declaration, never provider verification; preserves account when omitted',async()=>{
 const observed=await revision(meta);expect(observed).toMatch(/^[0-9]{10,30}$/);
 expect((await billing(meta,{metaBillingConfigured:true,expectedRevision:observed})).statusCode).toBe(422);
 const res=await billing(meta,{metaBillingConfigured:true,acknowledgedDeclaration:true,expectedRevision:observed,metaBillingAccountId:'SIM-account'});expect(res.statusCode,res.body).toBe(200);expect(res.json().channel).toMatchObject({metaBillingConfigured:true,metaBillingAccountId:'SIM-account'});expect(res.json().message).toContain('não foi verificada');expect(res.json().channel.revision).not.toBe(observed);
 const duplicate=await billing(meta,{metaBillingConfigured:true,acknowledgedDeclaration:true,expectedRevision:observed});expect(duplicate.statusCode).toBe(409);
 const again=await billing(meta,{metaBillingConfigured:true,acknowledgedDeclaration:true,expectedRevision:await revision(meta)});expect(again.statusCode,again.body).toBe(200);expect(again.json().channel.metaBillingAccountId).toBe('SIM-account');
 const events=(await ownerPool.query("SELECT metadata FROM audit_events WHERE workspace_id=$1 AND action='channel.billing_declared'",[ws])).rows;expect(events).toHaveLength(2);expect(events.every(event=>event.metadata.providerVerified===false&&event.metadata.source==='responsible_declaration')).toBe(true);
});
it('commits only one concurrent decision from the same reviewed revision',async()=>{
 const expectedRevision=await revision(meta);
 const previous=(await ownerPool.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND action='channel.billing_declared'",[ws])).rows[0].n;
 const results=await Promise.all([billing(meta,{expectedRevision,metaBillingConfigured:true,acknowledgedDeclaration:true}),billing(meta,{expectedRevision,metaBillingConfigured:false})]);
 expect(results.map(result=>result.statusCode).sort()).toEqual([200,409]);
 const winner=results.find(result=>result.statusCode===200)!.json().channel;
 expect((await ownerPool.query('SELECT meta_billing_configured FROM channel_instances WHERE id=$1',[meta])).rows[0].meta_billing_configured).toBe(winner.metaBillingConfigured);
 expect((await ownerPool.query("SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND action='channel.billing_declared'",[ws])).rows[0].n).toBe(previous+1);
});
it('rejects wrong provider, disconnected state, missing revision, foreign workspace and removed management access',async()=>{
 expect((await billing(waha,{metaBillingConfigured:true,acknowledgedDeclaration:true,expectedRevision:await revision(waha)})).statusCode).toBe(422);
 expect((await billing(meta,{metaBillingConfigured:false})).statusCode).toBe(400);
 await ownerPool.query("UPDATE channel_instances SET is_active=false WHERE id=$1",[meta]);expect((await billing(meta,{metaBillingConfigured:true,acknowledgedDeclaration:true,expectedRevision:await revision(meta)})).statusCode).toBe(409);await ownerPool.query('UPDATE channel_instances SET is_active=true WHERE id=$1',[meta]);
 expect((await app.inject({method:'PATCH',url:`/v1/workspaces/${other}/channels/${meta}/billing`,headers:headers(),payload:{metaBillingConfigured:false,expectedRevision:'1700000000000000'}})).statusCode).toBe(403);
 await ownerPool.query("UPDATE workspace_memberships SET role='operator' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);expect((await billing(meta,{metaBillingConfigured:false,expectedRevision:'1700000000000000'})).statusCode).toBe(403);await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);
});
it('blocks stale suspension and requires review before archiving; preserves history and clears billing',async()=>{
 const observed=await revision(meta);const removed=await billing(meta,{metaBillingConfigured:false,expectedRevision:observed});expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().channel.metaBillingAccountId).toBeNull();
 expect((await app.inject({method:'POST',url:endpoint(meta,'/revoke'),headers:headers(),payload:{expectedRevision:observed}})).statusCode).toBe(409);
 expect((await app.inject({method:'DELETE',url:endpoint(waha),headers:headers()})).statusCode).toBe(428);
 const suspension=await app.inject({method:'POST',url:endpoint(meta,'/revoke'),headers:headers(),payload:{expectedRevision:await revision(meta)}});expect(suspension.statusCode,suspension.body).toBe(200);expect(suspension.json().message).toContain('não foi desconectada');
 const archived=await app.inject({method:'DELETE',url:endpoint(waha),headers:headers(),payload:{expectedRevision:await revision(waha)}});expect(archived.statusCode,archived.body).toBe(200);expect(archived.json().mode).toBe('archived');expect((await ownerPool.query('SELECT status,is_active,meta_billing_configured FROM channel_instances WHERE id=$1',[meta])).rows[0]).toMatchObject({status:'revoked',is_active:false,meta_billing_configured:false});
 expect((await ownerPool.query("SELECT action FROM audit_events WHERE workspace_id=$1 AND action IN ('channel.revoked','channel.archived')",[ws])).rows.map(row=>row.action).sort()).toEqual(['channel.archived','channel.revoked']);
});

it('revokes shared credentials when the last two active channels are suspended concurrently',async()=>{
 const encrypted=encryptPayload(JSON.stringify({api_key:'SIM-shared-key',base_url:'http://127.0.0.1:3000',session:'SIM-shared-session'}),'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
 const credential=(await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES ($1,'waha',$2,$3,$4,$5,'1') RETURNING id",[ws,crypto.randomUUID(),encrypted.encryptedBase64,encrypted.ivBase64,encrypted.authTagBase64])).rows[0].id;
 const channels:string[]=[];
 for(let index=0;index<2;index++)channels.push((await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,credential_id,status,is_active) VALUES ($1,'waha','SIM shared credential',$2,$3,'connected',true) RETURNING id",[ws,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),credential])).rows[0].id);
 const first=channels[0]!,second=channels[1]!,firstRevision=await revision(first),secondRevision=await revision(second);
 const responses=await Promise.all([app.inject({method:'POST',url:endpoint(first,'/revoke'),headers:headers(),payload:{expectedRevision:firstRevision}}),app.inject({method:'DELETE',url:endpoint(second),headers:headers(),payload:{expectedRevision:secondRevision}})]);
 expect(responses.map(response=>response.statusCode)).toEqual([200,200]);expect((await ownerPool.query('SELECT status FROM provider_credentials WHERE id=$1',[credential])).rows[0].status).toBe('REVOKED');expect((await ownerPool.query('SELECT is_active,status FROM channel_instances WHERE id=ANY($1::uuid[])',[channels])).rows.every(channel=>!channel.is_active&&channel.status==='revoked')).toBe(true);
});
