import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,hook:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
const url=()=>`/v1/workspaces/${ws}/webhooks/${hook}/jobs`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 hook=(await ownerPool.query("INSERT INTO outbound_webhook_subscriptions(workspace_id,url,secret,events,is_active) VALUES($1,'https://sim.example.invalid','SIM-secret',ARRAY['lead.created'],false) RETURNING id",[ws])).rows[0].id;
 await ownerPool.query("INSERT INTO outbound_webhook_jobs(workspace_id,subscription_id,event_type,payload,status,created_at) SELECT $1,$2,'lead.created','{}'::jsonb,'suspended','2026-10-17T12:00:00.123456Z'::timestamptz FROM generate_series(1,53)",[ws,hook]);
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});

it('pages timestamp ties with microsecond precision and rejects invalid cursors or other tenants',async()=>{
 const first=await app.inject({url:url(),headers:headers()});expect(first.statusCode,first.body).toBe(200);expect(first.json().jobs).toHaveLength(50);const cursor=first.json().pagination.nextCursor;expect(cursor.createdAt).toBe('2026-10-17T12:00:00.123456Z');
 const second=await app.inject({url:`${url()}?${new URLSearchParams({beforeCreatedAt:cursor.createdAt,beforeId:cursor.id})}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().jobs).toHaveLength(3);expect(second.json().pagination).toEqual({hasMore:false,nextCursor:null});expect(new Set([...first.json().jobs,...second.json().jobs].map((j:any)=>j.id)).size).toBe(53);
 for(const query of ['beforeCreatedAt=invalid','beforeId='+crypto.randomUUID(),'beforeCreatedAt=2026-10-17T12%3A00%3A00Z&beforeId=invalid'])expect((await app.inject({url:`${url()}?${query}`,headers:headers()})).statusCode).toBe(400);
 expect((await app.inject({url:`/v1/workspaces/${other}/webhooks/${hook}/jobs`,headers:headers()})).statusCode).toBe(403);
});
