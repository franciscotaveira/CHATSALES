import {beforeAll,afterAll,it,expect} from 'vitest';import crypto from 'node:crypto';import {createTestDatabasePools} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();let app:FastifyInstance,ws:string,other:string,channel:string,template:string,token:string;const suffix=crypto.randomUUID(),actor=crypto.randomUUID();
const url=()=>`/v1/workspaces/${ws}/broadcasts/campaigns`;const headers=()=>({authorization:`Bearer ${token}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM pagination',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM campaigns',$2) RETURNING id",[org,suffix])).rows[0].id;other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM foreign',$2) RETURNING id",[org,`other-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM actor')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,status,is_active) VALUES($1,'waha','SIM channel',$2,'unconfigured',false) RETURNING id",[ws,crypto.randomBytes(32).toString('hex')])).rows[0].id;
 template=(await ownerPool.query("INSERT INTO message_templates(workspace_id,name,category,body_text) VALUES($1,'SIM-pagination','UTILITY','SIM no send') RETURNING id",[ws])).rows[0].id;
 await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,status,created_at) SELECT $1,'SIM campaign '||n,$2,$3,'queued','2026-10-17T12:00:00.123456Z'::timestamptz FROM generate_series(1,53) n",[ws,channel,template]);
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp();
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});
it('pages timestamp ties without loss or duplicates and preserves microsecond cursor precision',async()=>{
 const first=await app.inject({url:url(),headers:headers()});expect(first.statusCode,first.body).toBe(200);expect(first.json().campaigns).toHaveLength(50);expect(first.json().pagination.hasMore).toBe(true);const cursor=first.json().pagination.nextCursor;expect(cursor.createdAt).toBe('2026-10-17T12:00:00.123456Z');
 await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,status,created_at) VALUES($1,'SIM inserted later',$2,$3,'queued','2026-10-17T12:01:00Z')",[ws,channel,template]);
 const query=new URLSearchParams({beforeCreatedAt:cursor.createdAt,beforeId:cursor.id});const second=await app.inject({url:`${url()}?${query}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().campaigns).toHaveLength(3);expect(second.json().pagination).toEqual({hasMore:false,nextCursor:null});const ids=[...first.json().campaigns,...second.json().campaigns].map((c:any)=>c.id);expect(new Set(ids).size).toBe(53);expect(second.json().campaigns.some((c:any)=>c.name==='SIM inserted later')).toBe(false);
});
it('rejects malformed or half cursors and does not grant another company access',async()=>{
 for(const query of ['beforeCreatedAt=invalid','beforeId='+crypto.randomUUID(),'beforeCreatedAt=2026-10-17T12%3A00%3A00Z&beforeId=invalid'])expect((await app.inject({url:`${url()}?${query}`,headers:headers()})).statusCode).toBe(400);
 expect((await app.inject({url:`/v1/workspaces/${other}/broadcasts/campaigns`,headers:headers()})).statusCode).toBe(403);
});

it('finds older campaigns through server-side search, keeps literal symbols and filters type',async()=>{
 const name='SIM needle 100%_literal';await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,variant_b_template_id,is_ab_test,status,created_at) VALUES($1,$2,$3,$4,$4,true,'queued','2010-01-01T00:00:00Z')",[ws,name,channel,template]);
 for(const search of ['needle','100%_literal']){const query=new URLSearchParams({search,type:'AB_ONLY'});const response=await app.inject({url:`${url()}?${query}`,headers:headers()});expect(response.statusCode,response.body).toBe(200);expect(response.json().campaigns.map((c:any)=>c.name)).toEqual([name]);expect(response.json().pagination.hasMore).toBe(false);}
 expect((await app.inject({url:`${url()}?${new URLSearchParams({search:'needle',type:'SINGLE'})}`,headers:headers()})).json().campaigns).toHaveLength(0);
 expect((await app.inject({url:`${url()}?search=${'x'.repeat(201)}`,headers:headers()})).statusCode).toBe(400);
 const byChannel=await app.inject({url:`${url()}?${new URLSearchParams({search:'SIM channel'})}`,headers:headers()});expect(byChannel.json().campaigns).toHaveLength(50);expect(byChannel.json().pagination.hasMore).toBe(true);
});

it('reports recorded failure counts without treating them as delivery receipts',async()=>{
 const name='SIM recorded failure evidence';await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,status,total_targeted,sent_count,delivered_count,failed_count) VALUES($1,$2,$3,$4,'partial',10,7,2,3)",[ws,name,channel,template]);
 const response=await app.inject({url:`${url()}?${new URLSearchParams({search:name})}`,headers:headers()});expect(response.statusCode,response.body).toBe(200);const campaign=response.json().campaigns[0];expect(campaign.status).toBe('partial');expect(campaign.metrics).toMatchObject({failed:3,sent:7,delivered:2});
});

async function roleToken(role:string){
 if(role==='owner')return token;
 const user=crypto.randomUUID(),email=`${user}@example.invalid`;await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM permission')",[user,email]);await ownerPool.query('INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)',[ws,user,role]);return new SignJWT({sub:user,email,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));
}
it.each(['operator','manager'])('allows report consultation but rejects cancellation by %s',async(role)=>{
 const currentToken=await roleToken(role);const auth={authorization:`Bearer ${currentToken}`};const id=(await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,status) VALUES($1,'SIM permission blocked',$2,$3,'queued') RETURNING id",[ws,channel,template])).rows[0].id;
 expect((await app.inject({url:url(),headers:auth})).statusCode).toBe(200);
 expect((await app.inject({method:'POST',url:`/v1/workspaces/${ws}/broadcasts/${id}/cancel`,headers:auth})).statusCode).toBe(403);
 expect((await ownerPool.query('SELECT status FROM broadcast_campaigns WHERE id=$1',[id])).rows[0].status).toBe('queued');
});
it.each(['owner','admin'])('allows cancellation by %s without creating outbound commands',async(role)=>{
 const currentToken=await roleToken(role);const id=(await ownerPool.query("INSERT INTO broadcast_campaigns(workspace_id,name,channel_instance_id,variant_a_template_id,status) VALUES($1,'SIM permission allowed',$2,$3,'queued') RETURNING id",[ws,channel,template])).rows[0].id;
 const result=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/broadcasts/${id}/cancel`,headers:{authorization:`Bearer ${currentToken}`}});expect(result.statusCode,result.body).toBe(200);expect(result.json().campaign.status).toBe('cancelled');expect((await ownerPool.query('SELECT count(*)::int AS count FROM broadcast_recipients WHERE campaign_id=$1',[id])).rows[0].count).toBe(0);
});
