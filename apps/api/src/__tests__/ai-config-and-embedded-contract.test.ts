import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authPlugin } from "../plugins/auth.plugin";
import { aiAgentRoutes } from "../routes/ai-agent.routes";
import { channelsRoutes } from "../routes/channels.routes";
import { decryptPayload } from "@sos-sales/database";

const state = vi.hoisted(() => ({
  role: "owner", query: vi.fn(), fetch: vi.fn(), transaction: vi.fn(), memberships: vi.fn(),
}));
vi.mock("@sos-sales/database", async (importOriginal) => ({
  ...await importOriginal<typeof import("@sos-sales/database")>(),
  getUserWorkspaces: (...args: unknown[]) => state.memberships(...args),
  withTenantTransaction: (...args: unknown[]) => state.transaction(...args),
  recordSecurityAuditEvent: vi.fn(),
  parseKeyringFromEnv: () => undefined,
}));
vi.mock("@sos-sales/application", async (importOriginal) => ({
  ...await importOriginal<typeof import("@sos-sales/application")>(),
  safeFetchWithSsrfGuard: (...args: unknown[]) => state.fetch(...args),
}));
const workspace = "b1111111-1111-4111-8111-111111111111";
const user = "c1111111-1111-4111-8111-111111111111";
const key = "12".repeat(32);
const payload = { displayName: "Canal LAB", wabaAccountId: "123456", phoneNumberId: "654321", accessToken: "synthetic-provider-token" };
let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  state.role = "owner";
  vi.stubEnv("MCT_CREDENTIALS_MASTER_KEY", key);
  vi.stubEnv("META_APP_SECRET", "");
  state.memberships.mockImplementation(async () => [{ workspace_id: workspace, workspace_name: "LAB", role: state.role }]);
  state.transaction.mockImplementation(async (_workspace, callback) => callback({ query: state.query }));
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM public.workspace_memberships")) return {rows:[{role:state.role}]};
    if (sql.includes("INSERT INTO public.provider_credentials")) return { rows: [{ id: "credential-lab" }] };
    if (sql.includes("INSERT INTO public.channel_instances")) return { rows: [{ id: "channel-lab", workspace_id: workspace, provider: "meta_waba", display_name: "Canal LAB", status: "validating", is_active: false, created_at: new Date() }] };
    if (sql.includes("FROM public.workspaces")) return {rows:[{ai_agent_name:"Assistente LAB",ai_receptionist_enabled:false,ai_temperature:0.1,ai_provider:"nvidia",ai_model:"SIM_MODEL",ai_api_key:null}]};
    if (sql.includes("UPDATE public.workspaces")) return { rows: [{ ai_agent_name: "Assistente LAB", ai_receptionist_enabled: false, ai_temperature: 0.1 }] };
    return { rows: [] };
  });
  state.fetch.mockImplementation(async (url:string) => new Response(JSON.stringify(url.includes("subscribed_apps")?{success:true}:url.includes("/phone_numbers")?{data:[{id:payload.phoneNumberId,display_phone_number:"5500000000000"}]}:{id:payload.phoneNumberId,display_phone_number:"5500000000000"}),{status:200}));
  app = Fastify();
  await app.register(authPlugin, { identityProvider: {
    verifyToken: async () => ({ id: user, email: "operador@chat-sales.test", role: "owner", workspaceId: workspace }),
  } as never });
  await app.register(aiAgentRoutes);
  await app.register(channelsRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });
const headers = { authorization: "Bearer synthetic-lab-token", "x-workspace-id": workspace };

describe("AI configuration authorization", () => {
  it.each(["operator", "manager", "analyst", "integration_service", "support_auditor"])("denies %s before writing, despite an owner role from the identity", async (role) => {
    state.role = role;
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspace}/ai-agent`, headers, payload: { enabled: true } });
    expect(response.statusCode).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin"])("allows %s to save", async (role) => {
    state.role = role;
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspace}/ai-agent`, headers, payload: { expectedRevision:0,enabled: false } });
    expect(response.statusCode).toBe(200);
    expect(state.query.mock.calls[0]![0]).toContain("pg_advisory_xact_lock");
    expect(state.query.mock.calls.some(([sql])=>sql.includes("INSERT INTO public.ai_agent_versions"))).toBe(true);
    expect(state.query.mock.calls.some(([sql])=>sql.includes("UPDATE public.workspaces"))).toBe(false);
  });
  it("requires authentication", async () => {
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspace}/ai-agent`, payload: { enabled: true } });
    expect(response.statusCode).toBe(401);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("denies another workspace", async () => {
    const response = await app.inject({ method: "PUT", url: "/v1/workspaces/b2222222-2222-4222-8222-222222222222/ai-agent", headers, payload: { enabled: true } });
    expect(response.statusCode).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
  });
});

describe("AI simulation permissions",()=>{
  it.each(["operator","manager","analyst"])("denies %s before using model credentials",async(role)=>{
    state.role=role;
    const response=await app.inject({method:'POST',url:`/v1/workspaces/${workspace}/ai-agent/simulate`,headers,payload:{message:'SIMULADO'}});
    expect(response.statusCode).toBe(403);expect(state.transaction).not.toHaveBeenCalled();
  });
});

describe('AI draft access boundaries',()=>{
 it.each(['operator','manager','analyst'])('does not expose or mutate drafts for %s',async role=>{
  state.role=role;
  for(const [method,tail,payload] of [['GET','',undefined],['POST','/suspend',{reason:'SIM Parada manual'}],['POST','/draft/from-guided',{expectedRevision:0,expectedGuidedRevision:1}]] as const){
   const response=await app.inject({method,url:`/v1/workspaces/${workspace}/ai-agent${tail}`,headers,payload});expect(response.statusCode).toBe(403);
  }
  expect(state.transaction).not.toHaveBeenCalled();
 });
});

describe("Embedded signup credential contract", () => {
  it("persists an authenticated ciphertext that can be decrypted, without exposing the provider token in the response", async () => {
    const response = await app.inject({ method: "POST", url: `/v1/workspaces/${workspace}/channels/meta-embedded-signup`, headers, payload });
    expect(response.statusCode).toBe(201);
    const insert = state.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO public.provider_credentials"));
    const values = insert![1];
    expect(typeof values[3]).toBe("string");
    expect(typeof values[4]).toBe("string");
    expect(typeof values[5]).toBe("string");
    const recovered = JSON.parse(decryptPayload(values[3], values[4], values[5], key));
    expect(recovered.access_token).toBe(payload.accessToken);
    expect(response.body).not.toContain(payload.accessToken);
  });
  it("refuses an OAuth code without server secret before calling Meta", async () => {
    const response = await app.inject({ method: "POST", url: `/v1/workspaces/${workspace}/channels/meta-embedded-signup`, headers, payload: { ...payload, accessToken: undefined, code: "synthetic-code" } });
    expect(response.statusCode).toBe(503);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("does not report success when the credential insert returns no identifier", async () => {
    state.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FROM public.workspace_memberships")?[{role:state.role}]:[]}));
    const response = await app.inject({ method: "POST", url: `/v1/workspaces/${workspace}/channels/meta-embedded-signup`, headers, payload });
    expect(response.statusCode).toBe(409);
  });
  it("does not report success when the channel insert returns no record", async () => {
    state.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("workspace_memberships")?[{role:state.role}]:sql.includes("INSERT INTO public.provider_credentials") ? [{ id: "credential-lab" }] : [] }));
    const response = await app.inject({ method: "POST", url: `/v1/workspaces/${workspace}/channels/meta-embedded-signup`, headers, payload });
    expect(response.statusCode).toBe(500);
  });
});
