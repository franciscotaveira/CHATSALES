import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiReceptionistProcessor } from "../processors/ai-receptionist.processor";
import type { Pool } from "pg";

const state = vi.hoisted(() => ({ query: vi.fn(), createPix: vi.fn(),prepare:vi.fn(),confirm:vi.fn(),link:vi.fn(), skills: { pix_charges: true } as Record<string, unknown> | null, initialSkills:{pix_charges:true} as Record<string,unknown>|null,contextProducts:null as Array<Record<string,unknown>>|null,enabled: true, actionThreadStatus: "active", products: [] as Array<Record<string, unknown>> }));
vi.mock("@sos-sales/database", () => ({
  withWorkerTransaction: async (_workspace: string, callback: (client: unknown) => unknown) => callback({ query: state.query }),
  createPixCharge: (...args: unknown[]) => state.createPix(...args),
  prepareAiCheckout:(...args:unknown[])=>state.prepare(...args),confirmAiCheckout:(...args:unknown[])=>state.confirm(...args),linkAiCheckoutSummary:(...args:unknown[])=>state.link(...args),
  AiCheckoutError:class extends Error {constructor(public reason:string,message:string){super(message);}},
}));
vi.mock("@sos-sales/observability", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const event = { workspaceId: "workspace-lab", channelInstanceId: "channel-lab", contactId: "contact-lab", threadId: "thread-lab", inboundMessageId: "inbound-lab", inboundBody: "Quero pagar", senderPhoneE164: "+5500000000001", recipientPhoneE164: "+5500000000000" };
const rawReply = "Seu Pix já foi gerado: CODIGO-INVENTADO-PELO-MODELO [OFFER_PIX: product-lab]";
let complete: ReturnType<typeof vi.fn>;
let processor: AiReceptionistProcessor;
const messages = () => state.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO public.messages"));
const outbox = () => state.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO public.outbound_commands"));

beforeEach(() => {
  vi.clearAllMocks(); state.actionThreadStatus = "active"; state.enabled = true; state.skills = { pix_charges: true };state.initialSkills={pix_charges:true};state.contextProducts=null;
  state.products = [{ id: "product-lab", title: "Produto LAB", price_cents: 25000 }];
  state.prepare.mockReset().mockResolvedValue({checkoutRequestId:"checkout-lab",replyText:"SIM Confira item, quantidade 1 e valor R$ 250,00. Responda CONFIRMAR AAAAAAAAAA"});state.confirm.mockReset();state.link.mockReset().mockResolvedValue(undefined);
  state.createPix.mockResolvedValue({ id: "charge-lab", pix_code: "CODIGO-SINTETICO-GERADO" });
  state.query.mockImplementation(async (sql: string) => {
    if ((sql.includes("FROM public.workspaces")||sql.includes("FROM workspaces")) && /SELECT ai_receptionist_enabled,\s*ai_skills/.test(sql)) return { rows: [{ ai_receptionist_enabled: state.enabled, ai_skills: state.skills }] };
    if (sql.includes("FROM public.workspaces")||sql.includes("FROM workspaces")) return { rows: [{ workspace_name: "LAB", ai_receptionist_enabled: true, ai_api_key: "synthetic-not-a-real-key", ai_skills: state.initialSkills }] };
    if (sql.includes("FROM public.commercial_threads") && sql.includes("FOR UPDATE")) return { rows: [{ status: state.actionThreadStatus }] };
    if (sql.includes("FROM public.commercial_threads")) return { rows: [{ status: "active", contact_id: event.contactId, opt_out: false }] };
    if (sql.includes("FROM public.channel_instances")) return { rows: [{ provider: "waha", is_active: true }] };
    if (sql.includes("FROM public.products")) return { rows:sql.includes("AND id=$2")?state.products:(state.contextProducts??state.products) };
    if (sql.includes("INSERT INTO public.messages")) return { rows: [{ id: "message-lab" }] };
    return { rows: [] };
  });
  complete = vi.fn().mockResolvedValue({ content: rawReply, provider: "nvidia", model: "synthetic-model" });
  processor = new AiReceptionistProcessor({ complete } as never);
});
async function run() { return processor.processInboundMessage({} as Pool, event); }
function expectBlocked(result: Awaited<ReturnType<typeof run>>, reason: string) {
  expect(state.createPix).not.toHaveBeenCalled();
  expect(result.generatedPixChargeId).toBeNull();
  expect(result.blockedPixReason).toBe(reason);
  expect(result.needsHandoff).toBe(true);
  expect(result.replyText).not.toContain("CODIGO-INVENTADO");
  expect(result.replyText).not.toContain("OFFER_PIX");
  expect(result.replyText).toContain("Nenhuma cobrança foi gerada automaticamente");
  expect(messages()).toHaveLength(1); expect(outbox()).toHaveLength(1);
  const metadata = JSON.parse(messages()[0]![1][7]);
  expect(metadata.blockedPixReason).toBe(reason); expect(metadata.generatedPixChargeId).toBeNull();
  expect(outbox()[0]![1][5]).toBe(result.replyText);
  expect(state.query.mock.calls.some(([sql]) => sql.includes("status = 'waiting_human'"))).toBe(true);
}

describe("AI Pix capability enforcement", () => {
  it.each([false, undefined, null, "true"])("blocks a non-explicit pix_charges permission: %s", async (value) => {
    state.skills = { pix_charges: value };
    expectBlocked(await run(), "pix_skill_disabled");
  });
  it("blocks absent skill configuration", async () => {
    state.skills = null; expectBlocked(await run(), "pix_skill_disabled");
  });
  it("rechecks permission after the model returns", async () => {
    complete.mockImplementation(async () => { state.skills = { pix_charges: false }; return { content: rawReply, provider: "nvidia", model: "test" }; });
    expectBlocked(await run(), "pix_skill_disabled");
    expect(state.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });
  it("sends nothing when AI was disabled during inference", async () => {
    complete.mockImplementation(async () => { state.enabled = false; return { content: rawReply }; });
    const result = await run();
    expect(result.reason).toBe("ai_disabled_before_pix_action");
    expect(state.createPix).not.toHaveBeenCalled(); expect(messages()).toHaveLength(0); expect(outbox()).toHaveLength(0);
  });
  it("does not charge or reply after a human takes over during inference", async () => {
    complete.mockImplementation(async () => { state.actionThreadStatus = "waiting_human"; return { content: rawReply }; });
    const result = await run();
    expect(result.reason).toBe("thread_unavailable_before_pix_action");
    expect(state.createPix).not.toHaveBeenCalled(); expect(outbox()).toHaveLength(0);
  });
  it("gives human handoff priority over a simultaneous payment marker", async () => {
    complete.mockResolvedValue({ content: rawReply + " [HUMAN_HANDOFF: confirmar condição]" });
    expectBlocked(await run(), "human_handoff");
  });
  it("rejects an unknown or inactive catalog product", async () => {
    state.products = []; expectBlocked(await run(), "product_not_in_context");
  });
  it.each([0, -1, 12.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid catalog amount %s", async (price_cents) => {
    state.products[0]!.price_cents = price_cents;
    expectBlocked(await run(), "invalid_product_amount");
  });
  it("replaces the model's success claim when summary preparation fails", async () => {
    state.prepare.mockRejectedValueOnce(new Error("SIM_PREPARATION_FAILED"));
    const result = await run();
    expect(result.blockedPixReason).toBe("checkout_preparation_failed"); expect(result.generatedPixChargeId).toBeNull();
    expect(result.needsHandoff).toBe(true); expect(result.replyText).not.toContain("CODIGO-INVENTADO");
    expect(outbox()[0]![1][5]).toContain("Nenhuma cobrança foi gerada automaticamente");
  });
  it("prepares a confirmation summary without generating a charge from the model marker",async()=>{
    const result=await run();expect(state.prepare).toHaveBeenCalledOnce();expect(state.prepare.mock.calls[0]!.slice(1)).toEqual([expect.objectContaining({workspaceId:event.workspaceId,threadId:event.threadId}),"product-lab",1]);
    expect(state.createPix).not.toHaveBeenCalled();expect(result.generatedPixChargeId).toBeNull();expect(result.checkoutRequestId).toBe('checkout-lab');expect(result.replyText).toContain('CONFIRMAR');expect(result.replyText).not.toContain('CODIGO-INVENTADO');expect(state.link).toHaveBeenCalled();
  });
  it('routes a coded confirmation without asking the model to interpret consent',async()=>{
    state.confirm.mockResolvedValue({checkoutRequestId:'checkout-lab',replyText:'SIM cobrança comprovada',generatedPixChargeId:'charge-lab'});
    const result=await processor.processInboundMessage({} as Pool,{...event,inboundBody:'CONFIRMAR AAAAAAAAAA'});
    expect(complete).not.toHaveBeenCalled();expect(state.confirm).toHaveBeenCalledOnce();expect(result).toMatchObject({generatedPixChargeId:'charge-lab',provider:'system'});expect(state.prepare).not.toHaveBeenCalled();
  });
  it("skips model and charge for an inbound intention already committed",async()=>{
    const original=state.query.getMockImplementation()!;
    state.query.mockImplementation(async(sql:string,...args:unknown[])=>sql.includes("FROM public.outbound_commands")?{rows:[{id:"existing"}]}:original(sql,...args));
    expect((await run()).reason).toBe("inbound_already_replied");expect(complete).not.toHaveBeenCalled();expect(state.createPix).not.toHaveBeenCalled();expect(messages()).toHaveLength(0);
  });
  it("does not send an ordinary reply after a human takes over during inference",async()=>{
    complete.mockImplementation(async()=>{state.actionThreadStatus="waiting_human";return {content:"Resposta atrasada"};});
    expect((await run()).reason).toBe("thread_unavailable_before_reply");expect(outbox()).toHaveLength(0);
  });
  it("keeps ordinary replies available when Pix is disabled", async () => {
    state.skills = { pix_charges: false };state.initialSkills={pix_charges:false}; complete.mockResolvedValue({ content: "Olá, como posso ajudar?" });
    const result = await run();
    expect(result.replyText).toBe("Olá, como posso ajudar?"); expect(result.needsHandoff).toBe(false);
    expect(state.createPix).not.toHaveBeenCalled(); expect(outbox()).toHaveLength(1);
  });
  it('does not query or expose catalog content when both catalog uses are disabled',async()=>{
    state.initialSkills={};state.skills={};complete.mockResolvedValue({content:'SIM atendimento básico',provider:'nvidia',model:'SIM'});
    const result=await run();expect(result.handled).toBe(true);expect(state.query.mock.calls.some(([sql])=>sql.includes('FROM public.products'))).toBe(false);expect(JSON.stringify(complete.mock.calls)).not.toContain('Produto LAB');
    expect(JSON.stringify(complete.mock.calls)).not.toContain('<fechamento_comercial_pix>');expect(JSON.parse(messages()[0]![1][7]).capabilities.readCatalog).toBe(false);
  });
  it('blocks a Pix product that was not among the items supplied to the model',async()=>{
    state.contextProducts=[];expectBlocked(await run(),'product_not_in_context');
  });
  it('blocks an action after any effective capability change during inference',async()=>{
    complete.mockImplementation(async()=>{state.skills={pix_charges:true,catalog_offers:true};return {content:rawReply,provider:'nvidia',model:'SIM'};});
    expectBlocked(await run(),'ai_capabilities_changed');
  });
  it('replaces a stale normal response with handoff when permissions change',async()=>{
    complete.mockImplementation(async()=>{state.skills={pix_charges:false};return {content:'SIM oferta antiga',provider:'nvidia',model:'SIM'};});
    const result=await run();expect(result.needsHandoff).toBe(true);expect(result.replyText).not.toContain('SIM oferta antiga');expect(state.createPix).not.toHaveBeenCalled();expect(result.replyText).toContain('equipe confirmar');
  });

  it('does not charge a price different from the item shown to the model',async()=>{
    const initial=state.products.map(product=>({...product}));state.contextProducts=initial;
    complete.mockImplementation(async()=>{state.products=[{id:'product-lab',title:'Produto LAB',price_cents:30000}];return {content:rawReply,provider:'nvidia',model:'SIM'};});
    expectBlocked(await run(),'product_changed_during_inference');
  });

  it('rejects a product removed after it was included in model context',async()=>{
    state.contextProducts=state.products.map(product=>({...product}));complete.mockImplementation(async()=>{state.products=[];return {content:rawReply};});expectBlocked(await run(),'product_unavailable');
  });
  it.each(['0','1000','abc'])('rejects malformed payment quantity %s before summary preparation',async qty=>{
    complete.mockResolvedValue({content:`SIM [OFFER_PIX: product-lab; QTY=${qty}]`});expectBlocked(await run(),'invalid_product_quantity');expect(state.prepare).not.toHaveBeenCalled();
  });

});
