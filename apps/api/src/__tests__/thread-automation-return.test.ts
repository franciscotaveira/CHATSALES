import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import crypto from "node:crypto";
import type {FastifyInstance} from "fastify";
import {createTestDatabasePools} from "@sos-sales/database";
import {SignJWT} from "@sos-sales/auth";
import {buildApp} from "../index";
// Disposable database fixtures only. No connected provider or AI/dispatch worker.
describe("Explicit transactional hand-back to active AI",()=>{
 const {ownerPool,appPool}=createTestDatabasePools();
 const jwtSecret="SIM_atomic_return_secret_minimum_32_characters",issuer="sos-sales-test",audience="sos-sales-api-test";
 let app:FastifyInstance,workspaceId:string,otherWorkspaceId:string,userId:string,token:string,analystToken:string;
 beforeAll(async()=>{
  const suffix=crypto.randomUUID();const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM atomic return',$1) RETURNING id",['sim-atomic-'+suffix])).rows[0].id;
  workspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,ai_receptionist_enabled) VALUES($1,'SIM atomic workspace',$2,false) RETURNING id",[org,'sim-atomic-a-'+suffix])).rows[0].id;
  otherWorkspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,ai_receptionist_enabled) VALUES($1,'SIM other workspace',$2,false) RETURNING id",[org,'sim-atomic-b-'+suffix])).rows[0].id;
  userId=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM operator') RETURNING id",['sim-op-'+suffix+'@example.invalid'])).rows[0].id;
  const analyst=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM analyst') RETURNING id",['sim-a-'+suffix+'@example.invalid'])).rows[0].id;
  await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'operator'),($1,$3,'analyst')",[workspaceId,userId,analyst]);
  const sign=(id:string)=>new SignJWT({workspaceId}).setProtectedHeader({alg:'HS256'}).setSubject(id).setIssuer(issuer).setAudience(audience).setExpirationTime('2h').sign(new TextEncoder().encode(jwtSecret));token=await sign(userId);analystToken=await sign(analyst);
  app=await buildApp({providerType:'local-jwt',jwtSecret,issuer,audience,masterKeyHex:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
 });
 afterAll(async()=>{if(app)await app.close();await ownerPool.end();await appPool.end();});
 async function fixture(enabled=true,status='waiting_human'){
  await ownerPool.query('UPDATE workspaces SET ai_receptionist_enabled=$2 WHERE id=$1',[workspaceId,enabled]);
  const contact=(await ownerPool.query("INSERT INTO contacts(workspace_id,phone_e164,name) VALUES($1,$2,'SIM waiting contact') RETURNING id",[workspaceId,'+5500'+Math.floor(Math.random()*1e10).toString().padStart(10,'0')])).rows[0].id;
  const channel=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,is_active,status) VALUES($1,'waha','SIM disconnected',$2,false,'unconfigured') RETURNING id",[workspaceId,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].id;
  return (await ownerPool.query("INSERT INTO commercial_threads(workspace_id,channel_instance_id,contact_id,status,handoff_reason) VALUES($1,$2,$3,$4,'SIM human review') RETURNING id,updated_at",[workspaceId,channel,contact,status])).rows[0] as {id:string;updated_at:Date};
 }
 const readThread=async(id:string)=>(await ownerPool.query('SELECT status,handoff_reason,updated_at FROM commercial_threads WHERE id=$1',[id])).rows[0];
 const resume=(id:string,expectedUpdatedAt:string,auth=token,workspace=workspaceId,extra={})=>app.inject({method:'POST',url:`/v1/workspaces/${workspace}/threads/${id}/resume-automation`,headers:{authorization:`Bearer ${auth}`},payload:{expectedUpdatedAt,...extra}});
 const audits=async(id:string)=>(await ownerPool.query("SELECT actor_id,metadata FROM audit_events WHERE workspace_id=$1 AND resource_id=$2 AND action='thread.automation_resumed'",[workspaceId,id])).rows;
 it('records one explicit operator hand-back and returns an idempotent current-state result on repetition',async()=>{
  const f=await fixture();const first=await resume(f.id,f.updated_at.toISOString());expect(first.statusCode,first.body).toBe(200);expect(first.json()).toMatchObject({alreadyActive:false,thread:{id:f.id,workspaceId,status:'active'}});const repeated=await resume(f.id,f.updated_at.toISOString());expect(repeated.statusCode,repeated.body).toBe(200);expect(repeated.json().alreadyActive).toBe(true);expect(await audits(f.id)).toEqual([{actor_id:userId,metadata:{fromStatus:'waiting_human',toStatus:'active',source:'explicit_handoff',reviewedUpdatedAt:f.updated_at.toISOString()}}]);
 });
 it('keeps the conversation with the team when active AI is disabled',async()=>{
  const f=await fixture(false);const result=await resume(f.id,f.updated_at.toISOString());expect(result.statusCode,result.body).toBe(409);expect(result.json().detail).toContain('desativada na configuração em uso');expect((await readThread(f.id)).status).toBe('waiting_human');expect(await audits(f.id)).toHaveLength(0);
 });
 it('requires the reviewed version while still waiting for a human',async()=>{
  const f=await fixture();await ownerPool.query("UPDATE commercial_threads SET updated_at=updated_at+interval '1 second',handoff_reason='SIM new context' WHERE id=$1",[f.id]);const result=await resume(f.id,f.updated_at.toISOString());expect(result.statusCode).toBe(409);expect(result.json().detail).toContain('mudou desde a revisão');expect((await readThread(f.id)).handoff_reason).toBe('SIM new context');expect(await audits(f.id)).toHaveLength(0);
 });
 it('does not reopen a closed conversation through hand-back',async()=>{
  const f=await fixture(true,'closed');expect((await resume(f.id,f.updated_at.toISOString())).statusCode).toBe(409);expect((await readThread(f.id)).status).toBe('closed');
 });
 it('does not let the generic status endpoint bypass explicit human hand-back',async()=>{
  const f=await fixture();const result=await app.inject({method:'PATCH',url:`/v1/workspaces/${workspaceId}/threads/${f.id}`,headers:{authorization:`Bearer ${token}`},payload:{status:'active'}});expect(result.statusCode,result.body).toBe(409);expect((await readThread(f.id)).status).toBe('waiting_human');
 });
 it('requires permission, tenant context and a strict reviewed timestamp',async()=>{
  const f=await fixture();expect((await resume(f.id,f.updated_at.toISOString(),analystToken)).statusCode).toBe(403);expect((await resume(f.id,f.updated_at.toISOString(),token,otherWorkspaceId)).statusCode).toBe(403);expect((await resume(f.id,'SIM invalid date')).statusCode).toBe(400);expect((await resume(f.id,f.updated_at.toISOString(),token,workspaceId,{actorId:userId})).statusCode).toBe(400);expect((await readThread(f.id)).status).toBe('waiting_human');
 });
 it('rejects a nonexistent thread without creating an audit or another conversation',async()=>{
  await fixture();const result=await resume(crypto.randomUUID(),new Date().toISOString());expect(result.statusCode).toBe(404);
 });
 it('observes a suspension committed while the availability row was locked before hand-back',async()=>{
  const f=await fixture();const blocker=await ownerPool.connect();let pending:Promise<any>|undefined;
  try{
   const blockerPid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await blocker.query('BEGIN');await blocker.query('UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1',[workspaceId]);
   pending=Promise.resolve(resume(f.id,f.updated_at.toISOString()));
   await vi.waitFor(async()=>{const waiting=(await ownerPool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND $1::int=ANY(pg_blocking_pids(pid))",[blockerPid])).rows[0].count;expect(waiting).toBeGreaterThan(0);},{timeout:5000,interval:25});
   await blocker.query('COMMIT');const result=await pending;expect(result.statusCode,result.body).toBe(409);expect((await readThread(f.id)).status).toBe('waiting_human');expect(await audits(f.id)).toHaveLength(0);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
 });
});
