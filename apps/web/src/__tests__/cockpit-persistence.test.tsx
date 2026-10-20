// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CockpitPage } from "../pages/cockpit/CockpitPage";
import { ApiError, apiClient } from "../services/api-client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fixture = vi.hoisted(() => ({
  mobile: false,
  thread: { id: "thread-1", contactId: "contact-1", contactPhone: "+5500000000001" },
}));
vi.mock("@sos-sales/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@sos-sales/ui")>(),
  useBreakpoint: () => ({ isMobile: fixture.mobile, isTablet: false }),
  Drawer: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => isOpen ? children : null,
}));
vi.mock("../hooks/useSession", () => ({ useSession: () => ({}) }));
vi.mock("../pages/cockpit/hooks/useInbox", () => ({ useInbox: () => ({ threads: [], refreshThreads: vi.fn() }) }));
vi.mock("../pages/cockpit/hooks/useConversation", () => ({ useConversation: () => ({ selectedThread: fixture.thread,windowInfo:{isOpen:true,hoursRemaining:0,badgeText:"SIM consulta",badgeVariant:"action"} }) }));
vi.mock("../pages/cockpit/hooks/useCockpitLayout", () => ({ useCockpitLayout: () => ({
  selectedThreadId: fixture.thread.id, isRightCollapsed: false, isContextDrawerOpen: true,
}) }));
vi.mock("../pages/cockpit/InboxList/InboxList", () => ({ InboxList: () => null }));
vi.mock("../pages/cockpit/Conversation/ConversationHeader", () => ({ ConversationHeader: () => null }));
vi.mock("../pages/cockpit/Conversation/MessageList", () => ({ MessageList: () => createElement("div", {"data-testid":"SIM-message-list"}) }));
vi.mock("../pages/cockpit/Conversation/Composer", () => ({ Composer: () => createElement("div", {"data-testid":"SIM-composer"}) }));
vi.mock("../pages/cockpit/drawers/CockpitDrawers", () => ({ CockpitDrawers: () => null }));
vi.mock("../pages/cockpit/ContextPanel/LeadSummary", () => ({ LeadSummary: () => null }));
vi.mock("../pages/cockpit/ContextPanel/PixStatus", () => ({ PixStatus: () => null }));
vi.mock("../pages/cockpit/ContextPanel/JourneyTimeline", () => ({ JourneyTimeline: () => null }));

const session = { activeWorkspace: { id: "workspace-1" }, token: "synthetic-test-token" };
const contact = { id: "contact-1", metadata: { notes: "Nota original", company: "Empresa LAB" } };
const proposal = { id: "proposal-1", title: "Proposta LAB", status: "draft", stateVersion: 7, items: [], totalCents: 25000, currency: "BRL" };
let root: Root;
let container: HTMLDivElement;
const button = (text: string) => {
  const result = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!result) throw new Error("Botão ausente: " + text);
  return result;
};
async function render() {
  await act(async () => { root.render(createElement(CockpitPage, { session: session as never })); });
}
async function editNote(value: string) {
  const textarea = container.querySelector('textarea[aria-label="Notas comerciais"]') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return textarea;
}
beforeEach(() => {
  fixture.mobile = false;
  fixture.thread = { id: "thread-1", contactId: "contact-1", contactPhone: "+5500000000001" };
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.spyOn(apiClient, "getStageLabels").mockResolvedValue({labels:{},version:0});
  vi.spyOn(apiClient, "getContacts").mockResolvedValue({ contacts: [contact] } as never);
  vi.spyOn(apiClient, "getThreadProposals").mockResolvedValue({ items: [proposal] } as never);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("Cockpit persistence contracts", () => {
  it("refreshes a conflicting saved note without discarding the draft and retries with the reviewed base", async () => {
    const update=vi.spyOn(apiClient,"updateContact").mockRejectedValueOnce(new ApiError(409,"Nota alterada","SIM conflito")).mockResolvedValue({contact:{...contact,metadata:{...contact.metadata,notes:"My draft"}}} as never);
    await render(); await editNote("My draft");
    vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[{...contact,metadata:{...contact.metadata,notes:"Other operator"}}]} as never);
    await act(async () => button("Salvar Anotação").click());
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe("My draft");
    expect(container.textContent).toContain("Other operator"); expect(button("Salvar Anotação").disabled).toBe(true);
    await act(async()=>button("Manter meu rascunho").click());
    await act(async()=>button("Salvar Anotação").click());
    expect(update).toHaveBeenLastCalledWith("workspace-1","contact-1",{metadata:{notes:"My draft"},expectedNotes:"Other operator"},{token:"synthetic-test-token"});
  });

  it.each([false, true])("persists notes through the contact API (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    const save = vi.spyOn(apiClient, "updateContact").mockResolvedValue({ contact: { ...contact, metadata: { ...contact.metadata, notes: "Nota salva" } } } as never);
    await render();
    const textarea = await editNote("Nota salva");
    await act(async () => { button("Salvar Anotação").click(); });
    expect(save).toHaveBeenCalledWith("workspace-1", "contact-1", { metadata: { notes: "Nota salva" }, expectedNotes: "Nota original" }, { token: "synthetic-test-token" });
    expect(textarea.value).toBe("Nota salva");
    expect(container.textContent).not.toContain("Salvar Anotação");
  });

  it("keeps the draft and retry action when saving fails", async () => {
    vi.spyOn(apiClient, "updateContact").mockRejectedValue(new Error("Servidor indisponível"));
    await render();
    const textarea = await editNote("Não perder este texto");
    await act(async () => { button("Salvar Anotação").click(); });
    expect(textarea.value).toBe("Não perder este texto");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Servidor indisponível");
    expect(button("Salvar Anotação").disabled).toBe(false);
  });

  it("sends the displayed proposal version and keeps conflicts visible", async () => {
    const patch = vi.spyOn(apiClient, "patchProposalStatus").mockRejectedValue(new Error("[409] Conflict"));
    await render();
    await act(async () => { button("Marcar Enviada").click(); });
    expect(patch).toHaveBeenCalledWith("workspace-1", "proposal-1", { status: "sent", expectedVersion: 7 }, { token: "synthetic-test-token" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("alterada por outra pessoa");
    expect(container.textContent).toContain("Rascunho");
  });
});

it('keeps one history and one composer across parent updates with distinct sibling identities',async()=>{
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
 await render();await render();await render();
 expect(container.querySelectorAll('[data-testid="SIM-message-list"]')).toHaveLength(1);expect(container.querySelectorAll('[data-testid="SIM-composer"]')).toHaveLength(1);
 expect(errors.mock.calls.some(call=>call.some(value=>typeof value==='string'&&value.includes('same key')))).toBe(false);
});


it('keeps incomplete proposal query distinct from confirmed empty records',async()=>{
 vi.mocked(apiClient.getThreadProposals).mockResolvedValue({} as never);await render();expect(container.textContent).toContain('A consulta não confirmou uma lista válida de propostas');expect(container.textContent).not.toContain('Nenhuma proposta comercial registrada');
});
it('preserves proposals after refresh failure and blocks status actions until a valid consultation',async()=>{
 const update=vi.spyOn(apiClient,'patchProposalStatus');vi.mocked(apiClient.getThreadProposals).mockResolvedValueOnce({items:[proposal]} as never).mockRejectedValueOnce(new Error('SIM failed proposal refresh')).mockResolvedValueOnce({items:[proposal]} as never);
 await render();await act(async()=>button('Consultar propostas novamente').click());expect(container.textContent).toContain('Proposta LAB');expect(button('Marcar Enviada').disabled).toBe(true);await act(async()=>button('Marcar Enviada').click());expect(update).not.toHaveBeenCalled();await act(async()=>button('Consultar propostas novamente').click());expect(button('Marcar Enviada').disabled).toBe(false);expect(container.textContent).not.toContain('SIM failed proposal refresh');
});
