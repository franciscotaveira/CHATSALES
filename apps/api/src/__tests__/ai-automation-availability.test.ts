import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import type {FastifyInstance} from "fastify";
import {createTestDatabasePools} from "@sos-sales/database";
import {SignJWT} from "@sos-sales/auth";
import {buildApp} from "../index";
describe("Minimal active AI availability for handoff operators",()=>{
 const {ownerPool,appPool}=createTestDatabasePools();
 const jwtSecret="SIM_availability_test_secret_minimum_32_characters",issuer="sos-sales-test",audience="sos-sales-api-test";
 let app:FastifyInstance,workspaceId:string,otherWorkspaceId:string,operatorToken:string,analystToken:string;
 beforeAll(async()=>{
  const suffix=crypto.randomUUID();const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES('SIM AI availability',$1) RETURNING id",['sim-ai-availability-'+suffix])).rows[0].id;
  workspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug,ai_receptionist_enabled) VALUES($1,'SIM availability workspace',$2,false) RETURNING id",[org,'sim-ai-a-'+suffix])).rows[0].id;
  otherWorkspaceId=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES($1,'SIM other workspace',$2) RETURNING id",[org,'sim-ai-b-'+suffix])).rows[0].id;
  const operator=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM operator') RETURNING id",['sim-op-'+suffix+'@example.invalid'])).rows[0].id;
  const analyst=(await ownerPool.query("INSERT INTO users(email,name) VALUES($1,'SIM analyst') RETURNING id",['sim-analyst-'+suffix+'@example.invalid'])).rows[0].id;
  await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'operator'),($1,$3,'analyst')",[workspaceId,operator,analyst]);
  const sign=(id:string)=>new SignJWT({workspaceId}).setProtectedHeader({alg:'HS256'}).setSubject(id).setIssuer(issuer).setAudience(audience).setExpirationTime('2h').sign(new TextEncoder().encode(jwtSecret));operatorToken=await sign(operator);analystToken=await sign(analyst);
  app=await buildApp({providerType:'local-jwt',jwtSecret,issuer,audience,masterKeyHex:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
 });
 afterAll(async()=>{if(app)await app.close();await ownerPool.end();await appPool.end();});
 const read=(auth=operatorToken,workspace=workspaceId)=>app.inject({url:`/v1/workspaces/${workspace}/ai-agent/availability`,headers:{authorization:`Bearer ${auth}`}});
 it('lets a handoff operator read only active availability while full configuration remains protected',async()=>{
  const res=await read();expect(res.statusCode,res.body).toBe(200);expect(res.json()).toEqual({success:true,activeEnabled:false});const config=await app.inject({url:`/v1/workspaces/${workspaceId}/ai-agent`,headers:{authorization:`Bearer ${operatorToken}`}});expect(config.statusCode).toBe(403);
 });
 it('reports the active runtime flag and never returns editable configuration',async()=>{
  await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=true WHERE id=$1",[workspaceId]);expect((await read()).json()).toEqual({success:true,activeEnabled:true});await ownerPool.query("UPDATE workspaces SET ai_receptionist_enabled=false WHERE id=$1",[workspaceId]);expect((await read()).json()).toEqual({success:true,activeEnabled:false});
 });
 it('requires handoff permission, membership in the requested company and authentication',async()=>{
  expect((await read(analystToken)).statusCode).toBe(403);expect((await read(operatorToken,otherWorkspaceId)).statusCode).toBe(403);expect((await app.inject({url:`/v1/workspaces/${workspaceId}/ai-agent/availability`})).statusCode).toBe(401);
 });
});
