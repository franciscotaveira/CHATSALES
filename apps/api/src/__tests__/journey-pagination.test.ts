import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,contact:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
const url=()=>`/v1/workspaces/${ws}/journeys`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+55000000000','SIM contact') RETURNING id",[ws])).rows[0].id;
 await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,title,stage,status,updated_at) SELECT $1,$2,'SIM archived journey '||n,'won','won','2026-10-17T12:00:00.123456Z'::timestamptz FROM generate_series(1,103) n",[ws,contact]);
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});

it('pages timestamp ties with microsecond precision and rejects invalid cursors or other tenants',async()=>{
 const first=await app.inject({url:`${url()}?limit=100`,headers:headers()});expect(first.statusCode,first.body).toBe(200);expect(first.json().items).toHaveLength(100);const cursor=first.json().pagination.nextCursor;expect(cursor.updatedAt).toBe('2026-10-17T12:00:00.123456Z');
 const second=await app.inject({url:`${url()}?${new URLSearchParams({limit:'100',beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id})}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().items).toHaveLength(3);expect(second.json().pagination).toEqual({hasMore:false,nextCursor:null});expect(new Set([...first.json().items,...second.json().items].map((j:any)=>j.id)).size).toBe(103);
 for(const query of ['beforeUpdatedAt=invalid','beforeId='+crypto.randomUUID(),'beforeUpdatedAt=2026-10-17T12%3A00%3A00Z&beforeId=invalid'])expect((await app.inject({url:`${url()}?${query}`,headers:headers()})).statusCode).toBe(400);
 expect((await app.inject({url:`/v1/workspaces/${other}/journeys`,headers:headers()})).statusCode).toBe(403);
});

it('includes only linked contacts for allowed roles and does not widen contact access for analysts',async()=>{
 const first=await app.inject({url:`${url()}?limit=100`,headers:headers()});expect(first.json().contacts.map((c:any)=>c.id)).toEqual([contact]);expect(first.json().contacts[0].name).toBe('SIM contact');
 await ownerPool.query("UPDATE workspace_memberships SET role='analyst' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);try{const response=await app.inject({url:url(),headers:headers()});expect(response.statusCode,response.body).toBe(200);expect(response.json().contacts).toEqual([]);expect(response.json().items.length).toBeGreaterThan(0);}finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
});

it('searches older opportunities and linked contacts without wildcard expansion or private contact lookup',async()=>{
 const title='SIM needle 100%_literal';await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,title,stage,status,updated_at) VALUES($1,$2,$3,'won','won','2010-01-01T00:00:00Z')",[ws,contact,title]);for(const search of ['needle','100%_literal']){const response=await app.inject({url:`${url()}?${new URLSearchParams({search})}`,headers:headers()});expect(response.statusCode,response.body).toBe(200);expect(response.json().items.map((j:any)=>j.title)).toEqual([title]);}
 expect((await app.inject({url:`${url()}?${new URLSearchParams({search:'SIM contact'})}`,headers:headers()})).json().items.length).toBeGreaterThan(0);
 await ownerPool.query("UPDATE workspace_memberships SET role='analyst' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);try{expect((await app.inject({url:`${url()}?${new URLSearchParams({search:'SIM contact'})}`,headers:headers()})).json().items).toEqual([]);expect((await app.inject({url:`${url()}?search=needle`,headers:headers()})).json().items).toHaveLength(1);}finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
 expect((await app.inject({url:`${url()}?search=${'x'.repeat(201)}`,headers:headers()})).statusCode).toBe(400);
});


it('applies value, period and typed recurrence filters before pagination and checks contact permission',async()=>{
 const cases=[['zero',0,{},'2 days'],['missing',500,{'isRecurring':true},'20 days'],['string',100,{'totalOrders':'2'},'2 days'],['orders',200,{'totalOrders':2},'2 days'],['tags',300,{'tags':['cliente_recorrente']},'2 days'],['future',400,{},'-2 days']];
 for(const [name,value,metadata,age] of cases){const c=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name,metadata) VALUES($1,$2,$3,$4) RETURNING id",[ws,'+55'+Math.floor(Math.random()*1e10),'SIM filter '+name,JSON.stringify(metadata)])).rows[0].id;await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,title,stage,status,estimated_value_cents,created_at,updated_at) VALUES($1,$2,$3,'won','won',$4,now()-$5::interval,'2009-01-01T00:00:00Z')",[ws,c,'SIM filter '+name,value,age]);}
 const names=async(query:Record<string,string>)=>{const r=await app.inject({url:`${url()}?${new URLSearchParams({search:'SIM filter',...query})}`,headers:headers()});expect(r.statusCode,r.body).toBe(200);return r.json().items.map((j:any)=>j.title).sort();};
 expect(await names({value:'no_value'})).toEqual([]);expect(await names({value:'has_value',period:'7d'})).toEqual(['SIM filter orders','SIM filter string','SIM filter tags','SIM filter zero']);expect(await names({profile:'recurring'})).toEqual(['SIM filter missing','SIM filter orders','SIM filter tags']);expect(await names({profile:'new'})).toEqual(['SIM filter future','SIM filter string','SIM filter zero']);
 await ownerPool.query("UPDATE workspace_memberships SET role='analyst' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);try{expect((await app.inject({url:`${url()}?profile=recurring`,headers:headers()})).statusCode).toBe(403);}finally{await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);}
 for(const query of ['profile=invalid','value=invalid','period=invalid'])expect((await app.inject({url:`${url()}?${query}`,headers:headers()})).statusCode).toBe(400);
});

it('binds a created opportunity to the matching conversation and exposes its revision for review',async()=>{
 const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,is_active) VALUES($1,'waha','SIM stage review',$2,false) RETURNING id",[ws,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].id;const thread=(await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id,status) VALUES($1,$2,$3,'active') RETURNING id",[ws,channel,contact])).rows[0].id;const otherContact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+5500098765432','SIM other') RETURNING id",[ws])).rows[0].id;
 const denied=await app.inject({method:'POST',url:url(),headers:headers(),payload:{contactId:otherContact,threadId:thread,title:'SIM mismatch'}});expect(denied.statusCode,denied.body).toBe(409);
 const created=await app.inject({method:'POST',url:url(),headers:headers(),payload:{contactId:contact,threadId:thread,title:'SIM attached review',stage:'lead'}});expect(created.statusCode,created.body).toBe(201);const result=await app.inject({url:`/v1/workspaces/${ws}/threads/${thread}/journey`,headers:headers()});expect(result.statusCode,result.body).toBe(200);expect(result.json().journey).toMatchObject({id:created.json().id,threadId:thread,contactId:contact,title:'SIM attached review'});expect(Number.isFinite(Date.parse(result.json().journey.updatedAt))).toBe(true);
});

it('requires the outcome flow rather than creating an opportunity directly in a terminal stage',async()=>{for(const stage of ['won','lost']){const response=await app.inject({method:'POST',url:url(),headers:headers(),payload:{contactId:contact,title:'SIM forbidden terminal creation',stage}});expect(response.statusCode,response.body).toBe(400);}expect((await ownerPool.query("SELECT count(*)::int AS count FROM commercial_journeys WHERE workspace_id=$1 AND title='SIM forbidden terminal creation'",[ws])).rows[0].count).toBe(0);});
