import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,hook:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
const url=()=>`/v1/workspaces/${ws}/webhooks/${hook}`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 hook=(await ownerPool.query("INSERT INTO outbound_webhook_subscriptions(workspace_id,url,secret,events,is_active) VALUES($1,'https://sim.example.invalid','SIM-secret',ARRAY['lead.created'],false) RETURNING id",[ws])).rows[0].id;

 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});


const original={url:'https://sim.example.invalid',events:['lead.created'],isActive:false};
async function reset(){await ownerPool.query("UPDATE outbound_webhook_subscriptions SET url=$2,events=$3,is_active=false WHERE id=$1",[hook,original.url,original.events]);}
async function approveTest(destination:string,events:string[]){
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({url:destination,events,supportsIdempotency:false})).digest('hex');
 await ownerPool.query("INSERT INTO outbound_webhook_deliveries(subscription_id,workspace_id,event_type,payload,status) VALUES($1,$2,'webhook.test',$3,'delivered')",[hook,ws,JSON.stringify({configurationFingerprint:fingerprint})]);
}
it('rejects a stale reviewed destination even when the new destination has a valid test',async()=>{
 await reset();const changed='https://sim.example.invalid/changed';await ownerPool.query('UPDATE outbound_webhook_subscriptions SET url=$2 WHERE id=$1',[hook,changed]);await approveTest(changed,original.events);
 const result=await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:true,expectedConfiguration:original}});
 expect(result.statusCode,result.body).toBe(409);expect(result.json().detail).toContain('revise novamente');expect((await ownerPool.query('SELECT is_active FROM outbound_webhook_subscriptions WHERE id=$1',[hook])).rows[0].is_active).toBe(false);
});
it('rejects stale event and active-state reviews without changing other fields',async()=>{
 await reset();await ownerPool.query("UPDATE outbound_webhook_subscriptions SET events=ARRAY['proposal.created'] WHERE id=$1",[hook]);
 expect((await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:false,description:'Must not apply',expectedConfiguration:original}})).statusCode).toBe(409);
 expect((await ownerPool.query('SELECT description FROM outbound_webhook_subscriptions WHERE id=$1',[hook])).rows[0].description).not.toBe('Must not apply');
 await reset();await ownerPool.query('UPDATE outbound_webhook_subscriptions SET is_active=true WHERE id=$1',[hook]);
 expect((await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:false,expectedConfiguration:original}})).statusCode).toBe(409);
 expect((await ownerPool.query('SELECT is_active FROM outbound_webhook_subscriptions WHERE id=$1',[hook])).rows[0].is_active).toBe(true);
});
it('serializes competing confirmations and still requires a valid test of the current configuration',async()=>{
 await reset();await approveTest(original.url,original.events);
 const results=await Promise.all([1,2].map(()=>app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:true,expectedConfiguration:original}})));
 expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
 const stop=await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:false,expectedConfiguration:{...original,isActive:true}}});expect(stop.statusCode,stop.body).toBe(200);
 const fresh='https://sim.example.invalid/not-tested';await ownerPool.query('UPDATE outbound_webhook_subscriptions SET url=$2 WHERE id=$1',[hook,fresh]);
 expect((await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:true,expectedConfiguration:{...original,url:fresh}}})).statusCode).toBe(422);
});
it('validates review input and preserves authentication and tenant boundaries',async()=>{
 expect((await app.inject({method:'PATCH',url:url(),headers:headers(),payload:{is_active:false,expectedConfiguration:{url:'invalid',events:[],isActive:false}}})).statusCode).toBe(400);
 expect((await app.inject({method:'PATCH',url:url(),payload:{is_active:false,expectedConfiguration:original}})).statusCode).toBe(401);
 expect((await app.inject({method:'PATCH',url:`/v1/workspaces/${other}/webhooks/${hook}`,headers:headers(),payload:{is_active:false,expectedConfiguration:original}})).statusCode).toBe(403);
});
