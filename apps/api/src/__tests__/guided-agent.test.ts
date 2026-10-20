import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { initialGuidedDraft, guidedChecks, guidedScenarios, type GuidedRecord } from "@sos-sales/contracts";
import { authPlugin } from "../plugins/auth.plugin";
import { guidedAgentRoutes } from "../routes/guided-agent.routes";
const state = vi.hoisted(() => ({ role: "owner", plan: null as GuidedRecord | null, sql: vi.fn() }));
const ws = "b1111111-1111-4111-8111-111111111111";
vi.mock("@sos-sales/database", async original => ({ ...await original<typeof import("@sos-sales/database")>(),
  getUserWorkspaces: async () => [{ workspace_id: ws, workspace_name: "LAB", role: state.role }],
  withTenantTransaction: async (_ws: string, callback: (client: unknown) => unknown) => callback({ query: state.sql }),
  recordSecurityAuditEvent: vi.fn(),
}));
let app: FastifyInstance;
const draft = { ...initialGuidedDraft, company: "Loja sintética", facts: "Atende de segunda a sexta, das 9h às 18h.", handoff: "Equipe comercial, fila fora do expediente." };
const headers = { authorization: "Bearer synthetic", "x-workspace-id": ws };
const url = `/v1/workspaces/${ws}/guided-agent`;
beforeEach(async () => {
  vi.clearAllMocks(); state.role = "owner"; state.plan = null;
  state.sql.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.startsWith("SELECT revision")) return { rows: state.plan ? [structuredClone(state.plan)] : [] };
    if (sql.startsWith("INSERT")) state.plan = { revision: (state.plan?.revision ?? 0) + 1, draft: JSON.parse(values[1] as string), reviews: {}, approvedRevision: null, approvedBy: null, approvedAt: null };
    if (sql.startsWith("UPDATE") && sql.includes("reviews=reviews")) state.plan = { ...state.plan!, reviews: { ...state.plan!.reviews, ...JSON.parse(values[1] as string) }, approvedRevision: null, approvedBy: null, approvedAt: null };
    if (sql.startsWith("UPDATE") && sql.includes("approved_revision=revision")) state.plan = { ...state.plan!, approvedRevision: state.plan!.revision, approvedBy: values[1] as string, approvedAt: new Date().toISOString() };
    return { rows: state.plan ? [structuredClone(state.plan)] : [] };
  });
  app = Fastify();
  await app.register(authPlugin, { identityProvider: { verifyToken: async () => ({ id: "c1111111-1111-4111-8111-111111111111", email: "lab@test.invalid", role: "owner", workspaceId: ws }) } as never });
  await app.register(guidedAgentRoutes); await app.ready();
});
afterEach(async () => { await app.close(); });
async function save(expectedRevision = 0) { return app.inject({ method: "PUT", url, headers, payload: { expectedRevision, draft } }); }
async function approve(revision = 1) { return app.inject({ method: "POST", url: url + "/approve", headers, payload: { expectedRevision: revision, acknowledgeAssistedTestOnly: true } }); }
describe("Guided plan lifecycle", () => {
  it("starts empty and persists a draft independently of live configuration", async () => {
    expect((await app.inject({ url, headers })).json()).toEqual({ plan: null });
    expect((await save()).json().plan.revision).toBe(1);
    expect((await app.inject({ url, headers })).json().plan.draft).toEqual(draft);
    expect(state.sql.mock.calls.every(([sql]) => !String(sql).includes("UPDATE public.workspaces"))).toBe(true);
  });
  it("rejects stale edits without overwriting data", async () => { await save(); expect((await save()).statusCode).toBe(409); expect(state.plan!.revision).toBe(1); });
  it("requires every scenario review and explicit assisted-test acknowledgment", async () => {
    await save(); expect((await approve()).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: url + "/approve", headers, payload: { expectedRevision: 1 } })).statusCode).toBe(400);
    for (const s of guidedScenarios(draft)) expect((await app.inject({ method: "POST", url: url + "/review", headers, payload: { expectedRevision: 1, scenarioId: s.id, note: "Cenário revisado como plano para teste." } })).statusCode).toBe(200);
    expect((await approve()).json().plan.approvedRevision).toBe(1);
    await save(1); expect(state.plan!.reviews).toEqual({}); expect(state.plan!.approvedRevision).toBeNull();
    expect((await approve(1)).statusCode).toBe(409);
  });
  it("rejects foreign or stale scenario reviews", async () => {
    await save();
    for (const [scenarioId, expectedRevision, status] of [["not-in-plan", 1, 400], ["human", 3, 409]] as const) expect((await app.inject({ method: "POST", url: url + "/review", headers, payload: { expectedRevision, scenarioId, note: "Avaliação sintética suficientemente longa" } })).statusCode).toBe(status);
  });
  it("cannot approve an incomplete configuration even if reviews exist", async () => {
    await save(); state.plan!.draft.facts = ""; state.plan!.reviews = Object.fromEntries(guidedScenarios(draft).map(s => [s.id, "Revisado para teste"]));
    expect((await approve()).statusCode).toBe(422);
  });
  it.each(["operator", "manager", "analyst"])("denies %s before database access", async role => {
    state.role = role; expect((await save()).statusCode).toBe(403); expect(state.sql).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-workspace access", async () => {
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ url: url.replace(ws, "b2222222-2222-4222-8222-222222222222"), headers })).statusCode).toBe(403);
    expect(state.sql).not.toHaveBeenCalled();
  });
  it("rejects unknown fields and oversized draft", async () => {
    expect((await app.inject({ method: "PUT", url, headers, payload: { expectedRevision: 0, draft: { ...draft, apiKey: "never-store-secrets" } } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url, headers, payload: { expectedRevision: 0, draft: { ...draft, facts: "x".repeat(2001) } } })).statusCode).toBe(400);
  });
  it("rejects duplicate custom scenario identities", async () => {
    const scenario = { id: "d1111111-1111-4111-8111-111111111111", question: "Pergunta", expected: "Resposta esperada" };
    const response = await app.inject({ method: "PUT", url, headers, payload: { expectedRevision: 0, draft: { ...draft, customCases: [scenario, scenario] } } });
    expect(response.statusCode).toBe(400);
  });
  it("requires objective capabilities and adds function-specific cases", () => {
    const sales = { ...draft, objective: "sell" as const, functions: [] };
    expect(guidedChecks(sales).find(c => c.id === "objective")!.passed).toBe(false);
    const configured = { ...sales, functions: ["catalog", "stock"] as ("catalog" | "stock")[] };
    expect(guidedChecks(configured).every(c => c.passed)).toBe(true);
    expect(guidedScenarios(configured).map(s => s.id)).toEqual(["known", "unknown", "human", "receipt", "catalog", "stock"]);
  });
});
