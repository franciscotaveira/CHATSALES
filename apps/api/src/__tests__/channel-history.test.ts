import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, encryptPayload } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";
import { historyDate, historyPhone, parseHistoryMessage } from "../services/channel-history";
const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@sos-sales/application", async original => ({...await original<typeof import("@sos-sales/application")>(), safeFetchWithSsrfGuard: (...args: unknown[]) => network.fetch(...args)}));
const { ownerPool, workerPool, appPool } = createTestDatabasePools();
const actor = crypto.randomUUID(), suffix = crypto.randomUUID();
const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let app: FastifyInstance, ws: string, channel: string, token: string;
const result = (data: unknown, status = 200) => ({ok: status === 200, status, json: async () => data});
const sync = () => app.inject({method: "POST", url: `/v1/workspaces/${ws}/channels/${channel}/sync`, headers: {authorization: `Bearer ${token}`}});
const at = 1700000000;
const inbound = { id: "SIM-inbound", fromMe: false, timestamp: at, body: "SIM histórico" };
const outbound = { id: "SIM-outbound", fromMe: true, timestamp: at + 1, body: "SIM resposta" };
beforeAll(async () => {
 const org = (await ownerPool.query("INSERT INTO organizations(name,slug) VALUES ('SIM history',$1) RETURNING id", [suffix])).rows[0].id;
 ws = (await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'SIM history',$2) RETURNING id", [org,suffix])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES ($1,$2,'SIM operator')", [actor,`${suffix}@example.invalid`]);
 await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'operator')", [ws,actor]);
 const credentials = encryptPayload(JSON.stringify({base_url:"http://127.0.0.1:3000",session:"SIM session",api_key:"SIM-secret"}), key);
 const credential = (await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES ($1,'waha',$2,$3,$4,$5,'1') RETURNING id", [ws,suffix,credentials.encryptedBase64,credentials.ivBase64,credentials.authTagBase64])).rows[0].id;
 channel = (await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,endpoint_token_hash,credential_id,status,is_active,phone_number_e164) VALUES ($1,'waha','SIM history',$2,$3,'connected',true,'+551130000000') RETURNING id", [ws,crypto.createHash('sha256').update(suffix).digest('hex'),credential])).rows[0].id;
 token = await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:"authenticated"}).setProtectedHeader({alg:"HS256"}).setIssuer("sos-sales-test").setAudience("sos-sales-api-test").setExpirationTime("1h").sign(new TextEncoder().encode("synthetic_jwt_secret_for_isolated_audit_2026"));
 app = await buildApp({masterKeyHex:key});
});
afterAll(async () => {await app?.close(); await ownerPool.end(); await workerPool.end(); await appPool.end();});
beforeEach(async () => {
 await ownerPool.query("UPDATE channel_instances SET status='connected',is_active=true WHERE id=$1",[channel]);
 network.fetch.mockReset().mockImplementation(async (url: string) => {
  if (url.includes('/api/sessions/')) return result({status:'WORKING',me:{id:'551130000000@c.us'}});
  if (url.includes('/messages?')) return result([inbound,outbound]);
  return result([{id:'5511999990001@c.us',name:'SIM contact',conversationTimestamp:at}]);
 });
});
it('validates identity, chronology, direction and actual acknowledgement without inventing evidence', () => {
 expect(historyPhone('bad5511999990001@c.us')).toBeNull(); expect(historyDate(undefined)).toBeNull(); expect(historyDate(Infinity)).toBeNull(); expect(historyDate(Date.now()+600000)).toBeNull();
 expect(parseHistoryMessage({...inbound,fromMe:'false'},'http://localhost')).toBeNull();
 expect(parseHistoryMessage(outbound,'http://localhost')).toMatchObject({deliveryStatus:'unknown',statusRank:0});
 for (const [ack,status,rank] of [[-1,'failed',-1],[0,'queued',0],[1,'sent',10],[2,'delivered',20],[3,'read',30],[4,'read',30]] as const) expect(parseHistoryMessage({...outbound,ack},'http://localhost')).toMatchObject({deliveryStatus:status,statusRank:rank});
 expect(parseHistoryMessage({...inbound,ack:3},'http://localhost')).toMatchObject({deliveryStatus:'unknown'});
 expect(parseHistoryMessage({...inbound,hasMedia:true,body:'',media:{url:'https://untrusted.invalid/api/files/x'}},'http://localhost')).toMatchObject({mediaUrl:null,body:'[Mídia do histórico indisponível]'});
});
it('imports without auto-creating a negotiation, delivery claims, inbox replay or duplicate effects', async () => {
 const response = await sync(); expect(response.statusCode,response.body).toBe(200); expect(response.json().syncedMessagesCount).toBe(2); expect(response.json().message).toContain('não representa o histórico completo');
 const messages=(await ownerPool.query("SELECT direction,delivery_status,created_at,metadata FROM messages WHERE workspace_id=$1 ORDER BY created_at",[ws])).rows;
 expect(messages).toHaveLength(2); expect(messages.every(m=>m.delivery_status==='unknown')).toBe(true); expect(new Date(messages[0].created_at).getTime()).toBe(at*1000);
 for(const table of ['commercial_journeys','outbound_commands','channel_webhook_inbox']) expect((await ownerPool.query(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`,[ws])).rows[0].n).toBe(0);
 expect((await sync()).json().syncedMessagesCount).toBe(0);
 expect(network.fetch.mock.calls.every(([,options])=>!options.method || options.method==='GET')).toBe(true);
 expect(network.fetch.mock.calls.some(([url])=>url.includes('downloadMedia=false'))).toBe(true);
 expect(network.fetch.mock.calls[0]![0]).toContain('SIM%20session');
});
it('rejects inactive channels before network access and never starts a stopped session', async () => {
 await ownerPool.query("UPDATE channel_instances SET is_active=false WHERE id=$1",[channel]); expect((await sync()).statusCode).toBe(409);expect(network.fetch).not.toHaveBeenCalled();
 await ownerPool.query("UPDATE channel_instances SET is_active=true WHERE id=$1",[channel]); network.fetch.mockResolvedValue(result({status:'STOPPED'}));expect((await sync()).statusCode).toBe(409);expect(network.fetch).toHaveBeenCalledTimes(1);
 expect((await ownerPool.query('SELECT is_active,status FROM channel_instances WHERE id=$1',[channel])).rows[0]).toMatchObject({is_active:true,status:'connected'});
});
it('does not mistake provider outage, malformed history or another account for an empty successful import', async () => {
 network.fetch.mockRejectedValue(new Error('SIM provider outage')); let response=await sync();expect(response.statusCode).toBe(502);expect(response.body).not.toContain('SIM provider outage');
 network.fetch.mockResolvedValue(result({status:'WORKING',me:{id:'551130000001@c.us'}}));expect((await sync()).statusCode).toBe(409);
 network.fetch.mockImplementation(async (url:string)=>result(url.includes('/api/sessions/')?{status:'WORKING',me:{id:'551130000000@c.us'}}:{not:'an array'}));expect((await sync()).statusCode).toBe(502);
});
it('reports per-chat failures and cannot write after the channel is disabled during consultation', async () => {
 network.fetch.mockImplementation(async (url:string)=>{
  if(url.includes('/api/sessions/'))return result({status:'WORKING',me:{id:'551130000000@c.us'}});
  if(url.includes('/messages?')){await ownerPool.query('UPDATE channel_instances SET is_active=false WHERE id=$1',[channel]);return result([{...inbound,id:'SIM-late'}]);}
  return result([{id:'5511999990001@c.us',conversationTimestamp:at}]);
 });
 const response=await sync();expect(response.statusCode,response.body).toBe(502);expect(response.json()).toMatchObject({partial:true,failedChatsCount:1,syncedMessagesCount:0});expect((await ownerPool.query("SELECT id FROM messages WHERE workspace_id=$1 AND provider_message_id='SIM-late'",[ws])).rowCount).toBe(0);
});
