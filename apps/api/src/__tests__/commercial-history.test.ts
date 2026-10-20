import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,contact:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
let thread:string;const url=()=>`/v1/workspaces/${ws}/threads/${thread}/commercial-history`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+55000000000','SIM contact') RETURNING id",[ws])).rows[0].id;
 const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,is_active) VALUES($1,'waha','SIM history',$2,false) RETURNING id",[ws,crypto.createHash('sha256').update(suffix).digest('hex')])).rows[0].id;
 thread=(await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id,status) VALUES($1,$2,$3,'active') RETURNING id",[ws,channel,contact])).rows[0].id;
 await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,thread_id,title,stage,status,created_at) SELECT $1,$2,$3,'SIM historical '||n,'qualified','open','2026-10-17T12:00:00.123456Z'::timestamptz FROM generate_series(1,53) n",[ws,contact,thread]);
 await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,title,stage,status) VALUES($1,$2,'SIM unlinked','lead','open')",[ws,contact]);
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});


it('returns only recorded events for this conversation and pages tied timestamps without loss',async()=>{
 const first=await app.inject({url:url(),headers:headers()});expect(first.statusCode,first.body).toBe(200);const a=first.json();expect(a.journey.stage).toBe('qualified');expect(a.items).toHaveLength(50);expect(a.items.every((i:any)=>i.label==='Oportunidade criada')).toBe(true);expect(a.pagination.nextCursor.occurredAt).toBe('2026-10-17T12:00:00.123456Z');
 const c=a.pagination.nextCursor;const second=await app.inject({url:`${url()}?${new URLSearchParams({beforeOccurredAt:c.occurredAt,beforeEventId:c.eventId})}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().items).toHaveLength(3);expect(second.json().pagination.hasMore).toBe(false);expect(new Set([...a.items,...second.json().items].map((i:any)=>i.id)).size).toBe(53);
});
it('rejects unpaired cursors, absent conversations, foreign tenants and unauthorized roles',async()=>{
 for(const q of ['beforeOccurredAt=2026-10-17T12%3A00%3A00Z','beforeEventId=journey_created:'+crypto.randomUUID(),'limit=101'])expect((await app.inject({url:`${url()}?${q}`,headers:headers()})).statusCode).toBe(400);
 expect((await app.inject({url:`/v1/workspaces/${ws}/threads/${crypto.randomUUID()}/commercial-history`,headers:headers()})).statusCode).toBe(404);
 expect((await app.inject({url:`/v1/workspaces/${other}/threads/${thread}/commercial-history`,headers:headers()})).statusCode).toBe(403);
 await ownerPool.query("UPDATE workspace_memberships SET role='analyst' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);try{expect((await app.inject({url:url(),headers:headers()})).statusCode).toBe(403);}finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
});

it('projects proposal milestones only from stored timestamps and omits private content',async()=>{
 const id=(await ownerPool.query("INSERT INTO commercial_proposals(workspace_id,thread_id,contact_id,title,total_cents,status,sent_at,created_by_user_id,conditions) VALUES($1,$2,$3,'SIM private title',100,'accepted',now(),$4,'SIM private condition') RETURNING id",[ws,thread,contact,actor])).rows[0].id;
 const response=await app.inject({url:url(),headers:headers()});expect(response.statusCode,response.body).toBe(200);const events=response.json().items.filter((i:any)=>i.resourceId===id);expect(events.map((i:any)=>i.id).sort()).toEqual(['proposal_created:'+id,'proposal_sent:'+id].sort());expect(events.some((i:any)=>i.id.startsWith('proposal_accepted:'))).toBe(false);expect(response.body).not.toContain('SIM private');expect(response.body).not.toContain('total_cents');
});
