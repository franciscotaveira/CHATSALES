import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
const url=()=>`/v1/workspaces/${ws}/contacts`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+55000000000','SIM contact') RETURNING id",[ws]);
 await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name,updated_at) SELECT $1,'+55000'||lpad(n::text,8,'0'),'SIM contact '||n,'2026-10-17T12:00:00.123456Z'::timestamptz FROM generate_series(1,103) n",[ws]);await ownerPool.query("UPDATE contacts SET updated_at='2026-10-17T12:00:00.123456Z' WHERE workspace_id=$1",[ws]);
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});


it('paginates contact timestamp ties without losing records and preserves search/status filters',async()=>{
 const first=await app.inject({url:`${url()}?limit=100&status=active`,headers:headers()});expect(first.statusCode,first.body).toBe(200);expect(first.json().contacts).toHaveLength(100);const cursor=first.json().pagination.nextCursor;expect(cursor.updatedAt).toBe('2026-10-17T12:00:00.123456Z');const second=await app.inject({url:`${url()}?${new URLSearchParams({limit:'100',status:'active',beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id})}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().contacts).toHaveLength(4);expect(second.json().pagination).toEqual({hasMore:false,nextCursor:null});expect(new Set([...first.json().contacts,...second.json().contacts].map((c:any)=>c.id)).size).toBe(104);
 await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name,opt_out,updated_at) VALUES($1,'+5500099999999','SIM literal 100%_needle',true,'2010-01-01T00:00:00Z')",[ws]);const found=await app.inject({url:`${url()}?${new URLSearchParams({search:'100%_needle',status:'inactive'})}`,headers:headers()});expect(found.json().contacts.map((c:any)=>c.name)).toEqual(['SIM literal 100%_needle']);expect((await app.inject({url:`${url()}?search=needle&status=active`,headers:headers()})).json().contacts).toEqual([]);
});
it('rejects invalid cursor pairs, mixed offset/cursor, and unauthorized contact access',async()=>{
 for(const query of ['beforeId='+crypto.randomUUID(),'beforeUpdatedAt=invalid','beforeUpdatedAt=2026-10-17T12%3A00%3A00Z&beforeId='+crypto.randomUUID()+'&offset=1','search='+'x'.repeat(201)])expect((await app.inject({url:`${url()}?${query}`,headers:headers()})).statusCode).toBe(400);
 expect((await app.inject({url:`/v1/workspaces/${other}/contacts`,headers:headers()})).statusCode).toBe(403);await ownerPool.query("UPDATE workspace_memberships SET role='analyst' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);try{expect((await app.inject({url:url(),headers:headers()})).statusCode).toBe(403);}finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
});
