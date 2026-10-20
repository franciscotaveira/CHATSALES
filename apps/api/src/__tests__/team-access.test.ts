import crypto from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {createTestDatabasePools,withTenantTransaction,createCommercialJourney} from '@sos-sales/database';
import {SignJWT,hashPassword,verifyPassword} from '@sos-sales/auth';
import {buildApp} from '../index';
import type {FastifyInstance} from 'fastify';
const {ownerPool,workerPool,appPool}=createTestDatabasePools();
const ids={owner:crypto.randomUUID(),admin:crypto.randomUUID(),manager:crypto.randomUUID(),operator:crypto.randomUUID(),target:crypto.randomUUID()};
const suffix=crypto.randomUUID(),password=' SIM exact password 2026 ';
let app:FastifyInstance,ws:string,other:string,thread:string,contact:string,targetMembership:string;
const tokens:Record<string,string>={};
const url=(tail='')=>`/v1/workspaces/${ws}/members${tail}`;
const headers=(role='owner')=>({authorization:`Bearer ${tokens[role]}`});
beforeAll(async()=>{
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM team',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM team A',$2) RETURNING id",[org,'a-'+suffix])).rows[0].id;
 other=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM team B',$2) RETURNING id",[org,'b-'+suffix])).rows[0].id;
 for(const [role,id] of Object.entries(ids)){
  await ownerPool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[id,`sim-${role}-${suffix}@example.invalid`,'SIM '+role,hashPassword(password)]);
  if(role!=='target')await ownerPool.query('INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)',[ws,id,role]);
  tokens[role]=await new SignJWT({sub:id,email:`sim-${role}-${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));
 }
 await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[other,ids.target]);
 const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,status,is_active) VALUES($1,'waha','SIM canal',$2,'error',false) RETURNING id",[ws,crypto.randomBytes(32).toString('hex')])).rows[0].id;
 contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,'+5500000000099','SIM contato') RETURNING id",[ws])).rows[0].id;
 thread=(await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id) VALUES($1,$2,$3) RETURNING id",[ws,channel,contact])).rows[0].id;
 app=await buildApp({masterKeyHex:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();});
it('does not let manager or operator grant administrator access',async()=>{
 for(const role of ['manager','operator']){const r=await app.inject({method:'POST',url:url(),headers:headers(role),payload:{name:'SIM denied',email:`denied-${suffix}@example.invalid`,role:'admin'}});expect(r.statusCode,r.body).toBe(403);}
 expect((await ownerPool.query('SELECT id FROM users WHERE email=$1',[`denied-${suffix}@example.invalid`])).rows).toHaveLength(0);
});
it('rejects password replacement when adding an existing account and adds it without changing its global credentials',async()=>{
 const input={name:'SIM replacement',email:`sim-target-${suffix}@example.invalid`,role:'operator'};
 const refused=await app.inject({method:'POST',url:url(),headers:headers(),payload:{...input,password:'SIM takeover'}});expect(refused.statusCode,refused.body).toBe(409);
 const added=await app.inject({method:'POST',url:url(),headers:headers(),payload:input});expect(added.statusCode,added.body).toBe(201);expect(added.json().accountCreated).toBe(false);expect(added.json().initialPassword).toBeUndefined();targetMembership=added.json().member.id;
 const user=(await ownerPool.query('SELECT password_hash,name FROM users WHERE id=$1',[ids.target])).rows[0];expect(verifyPassword(password,user.password_hash)).toBe(true);expect(user.name).toBe('SIM target');
});
it('keeps an exact initial password for a genuinely new account',async()=>{
 const r=await app.inject({method:'POST',url:url(),headers:headers('admin'),payload:{name:'SIM new',email:`sim-new-${suffix}@example.invalid`,role:'operator',password}});expect(r.statusCode,r.body).toBe(201);expect(r.json().initialPassword).toBe(password);expect(r.json().accountCreated).toBe(true);const stored=(await ownerPool.query('SELECT password_hash FROM users WHERE id=$1',[r.json().member.userId])).rows[0];expect(verifyPassword(password,stored.password_hash)).toBe(true);
});
it('protects owner, self, account passwords and malformed member identifiers',async()=>{
 for(const [who,target,body] of [['admin',ids.owner,{role:'operator',expectedRole:'owner'}],['admin',ids.admin,{role:'manager',expectedRole:'admin'}],['owner',ids.target,{password:'SIM forbidden'}]] as const){const r=await app.inject({method:'PATCH',url:url('/'+target),headers:headers(who),payload:body});expect(r.statusCode,r.body).toBe(403);}
 const malformed=await app.inject({method:'PATCH',url:url('/not-a-uuid'),headers:headers(),payload:{role:'operator',expectedRole:'operator'}});expect(malformed.statusCode).toBe(400);
});
it('requires the observed role and audits a valid scoped update',async()=>{
 const missing=await app.inject({method:'PATCH',url:url('/'+ids.target),headers:headers(),payload:{role:'manager'}});expect(missing.statusCode).toBe(428);
 const stale=await app.inject({method:'PATCH',url:url('/'+ids.target),headers:headers(),payload:{role:'manager',expectedRole:'admin'}});expect(stale.statusCode,stale.body).toBe(409);
 const saved=await app.inject({method:'PATCH',url:url('/'+ids.target),headers:headers('admin'),payload:{role:'manager',expectedRole:'operator'}});expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().member.role).toBe('manager');
 expect((await ownerPool.query("SELECT count(*)::int n FROM audit_events WHERE workspace_id=$1 AND action='member.role_changed' AND resource_id=$2",[ws,ids.target])).rows[0].n).toBe(1);
});
it('removes only this workspace access, places open work in review and preserves completed history',async()=>{
 const openAction=(await ownerPool.query("INSERT INTO commercial_actions(workspace_id,thread_id,title,assignee_user_id,due_at,created_by_user_id) VALUES($1,$2,'SIM pendente',$3,clock_timestamp(),$3) RETURNING id",[ws,thread,ids.target])).rows[0].id;
 const done=(await ownerPool.query("INSERT INTO commercial_actions(workspace_id,thread_id,title,assignee_user_id,due_at,created_by_user_id,status,completed_by_user_id,completed_at) VALUES($1,$2,'SIM concluída',$3,clock_timestamp(),$3,'completed',$3,clock_timestamp()) RETURNING id",[ws,thread,ids.target])).rows[0].id;
 const journey=(await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,thread_id,assigned_user_id,title) VALUES($1,$2,$3,$4,'SIM oportunidade') RETURNING id",[ws,contact,thread,ids.target])).rows[0].id;
 const stale=await app.inject({method:'DELETE',url:url('/'+ids.target),headers:headers(),payload:{expectedRole:'operator'}});expect(stale.statusCode).toBe(409);
 const removed=await app.inject({method:'DELETE',url:url('/'+ids.target),headers:headers(),payload:{expectedRole:'manager'}});expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().pendingReassignment).toEqual({tasks:1,opportunities:1});
 expect((await ownerPool.query('SELECT id FROM workspace_memberships WHERE id=$1',[targetMembership])).rows).toHaveLength(0);expect((await ownerPool.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2',[other,ids.target])).rows[0].role).toBe('owner');
 const rows=(await ownerPool.query('SELECT id,assignee_user_id,created_by_user_id,status FROM commercial_actions WHERE id=ANY($1::uuid[])',[[openAction,done]])).rows;expect(rows.find(r=>r.id===openAction)).toMatchObject({assignee_user_id:null,created_by_user_id:ids.target,status:'open'});expect(rows.find(r=>r.id===done)).toMatchObject({assignee_user_id:ids.target,status:'completed'});
 expect((await ownerPool.query('SELECT assigned_user_id FROM commercial_journeys WHERE id=$1',[journey])).rows[0].assigned_user_id).toBeNull();expect((await ownerPool.query("SELECT previous_assignee_id FROM commercial_action_history WHERE action_id=$1 AND action_type='assigned'",[openAction])).rows[0].previous_assignee_id).toBe(ids.target);
 const forbidden=await app.inject({url:url(),headers:headers('target')});expect(forbidden.statusCode,forbidden.body).toBe(403);
 expect(verifyPassword(password,(await ownerPool.query('SELECT password_hash FROM users WHERE id=$1',[ids.target])).rows[0].password_hash)).toBe(true);
});

it('shows persistent unassigned work and assigns it only to a current operational member without stealing a concurrent assignment',async()=>{
 const denied=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers('manager')});expect(denied.statusCode).toBe(403);
 const page=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers()});expect(page.statusCode,page.body).toBe(200);const items=page.json().items as {id:string;kind:string}[];expect(items.map(item=>item.kind).sort()).toEqual(['opportunity','task']);
 for(const item of items){
  const stale=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers(),payload:{id:item.id,kind:item.kind,assigneeUserId:ids.target}});expect(stale.statusCode,stale.body).toBe(409);
  const saved=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers(),payload:{id:item.id,kind:item.kind,assigneeUserId:ids.admin}});expect(saved.statusCode,saved.body).toBe(200);
  const repeat=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers(),payload:{id:item.id,kind:item.kind,assigneeUserId:ids.owner}});expect(repeat.statusCode,repeat.body).toBe(409);
 }
 const empty=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers()});expect(empty.json().items).toEqual([]);
});
it('paginates all pending opportunities without duplicates or cross-company rows',async()=>{
 await ownerPool.query("INSERT INTO commercial_journeys(workspace_id,contact_id,title) SELECT $1,$2,'SIM página '||n FROM generate_series(1,23) AS n",[ws,contact]);
 const first=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment`,headers:headers()});expect(first.statusCode,first.body).toBe(200);expect(first.json().items).toHaveLength(20);expect(first.json().nextCursor).toBeTruthy();
 const second=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment?before=${encodeURIComponent(first.json().nextCursor)}`,headers:headers()});expect(second.statusCode,second.body).toBe(200);expect(second.json().items).toHaveLength(3);expect(second.json().nextCursor).toBeNull();expect(new Set([...first.json().items,...second.json().items].map(item=>item.id)).size).toBe(23);
 const invalid=await app.inject({url:`/v1/workspaces/${ws}/team-reassignment?before=invalid`,headers:headers()});expect(invalid.statusCode).toBe(400);
});

it('does not assign a newly created opportunity to an account removed from this company',async()=>{
 await expect(withTenantTransaction(ws,client=>createCommercialJourney(client,ws,{contactId:contact,title:'SIM atribuição inválida',assignedUserId:ids.target}),appPool)).rejects.toThrow('ASSIGNEE_NOT_MEMBER');
});
