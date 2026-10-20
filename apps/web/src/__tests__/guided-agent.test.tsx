// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { initialGuidedDraft, guidedScenarios, type GuidedRecord } from "@sos-sales/contracts";
import { GuidedAgentSetup } from "../pages/settings/GuidedAgentSetup";
import { apiClient, ApiError } from "../services/api-client";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const draft = { ...initialGuidedDraft, company: "Empresa LAB", facts: "Serviços confirmados e horário das 9h às 18h.", handoff: "Equipe comercial na fila de atendimento." };
let plan: GuidedRecord; let root: Root; let el: HTMLDivElement;
const props = { workspaceId: "workspace-lab", token: "synthetic" };
function button(text: string) { const b = [...el.querySelectorAll("button")].find(e => e.textContent?.includes(text)); if (!b) throw new Error(text); return b; }
async function click(text: string) { await act(async () => button(text).click()); }
async function render() { await act(async () => root.render(createElement(GuidedAgentSetup, props))); }
async function edit(node: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  plan = { revision: 1, draft: structuredClone(draft), reviews: {}, approvedRevision: null, approvedAt: null, approvedBy: null };
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  vi.spyOn(apiClient, "getGuidedPlan").mockImplementation(async () => ({ plan: structuredClone(plan) }));
});
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.restoreAllMocks(); });
describe("Guided setup UI", () => {
  it("loads a server draft, keeps edits on failure, and never calls active settings", async () => {
    const live = vi.spyOn(apiClient, "updateAiAgentConfig");
    const save = vi.spyOn(apiClient, "saveGuidedPlan").mockRejectedValue(new Error("Falha de rede"));
    await render(); await edit(el.querySelector("input")!, "Empresa editada"); await click("Salvar rascunho");
    expect(save.mock.calls[0]![1].expectedRevision).toBe(1);
    expect(el.querySelector("input")!.value).toBe("Empresa editada"); expect(el.textContent).toContain("Falha de rede"); expect(live).not.toHaveBeenCalled();
  });
  it("requires saved scenario reviews and an explicit acknowledgment for plan approval", async () => {
    plan.reviews = Object.fromEntries(guidedScenarios(draft).map(s => [s.id, "Conferido: expectativa adequada para teste assistido."]));
    const approve = vi.spyOn(apiClient, "approveGuidedPlan").mockImplementation(async () => ({ plan: { ...plan, approvedRevision: 1 } }));
    await render(); await click("5. Cenários");
    expect(button("Aprovar plano").disabled).toBe(true);
    await act(async () => (el.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(button("Aprovar plano").disabled).toBe(false); await click("Aprovar plano"); expect(approve).toHaveBeenCalledWith(props.workspaceId, 1, { token: props.token });
    expect(el.textContent).toContain("Plano aprovado para teste assistido");
  });
  it("invalidates review eligibility immediately on edits", async () => {
    plan.reviews = Object.fromEntries(guidedScenarios(draft).map(s => [s.id, "Conferido para ensaio assistido."]));
    plan.approvedRevision = 1;
    await render(); await edit(el.querySelector("input")!, "Alterada"); await click("5. Cenários");
    expect(button("Registrar revisão").disabled).toBe(true); expect(button("Aprovar plano").disabled).toBe(true);
    expect(el.textContent).toContain("Salve o rascunho");
    expect(el.textContent).not.toContain("Plano aprovado para teste assistido");
  });
  it("uses multi-turn dry-run history and preserves a message when provider fails", async () => {
    const simulate = vi.spyOn(apiClient, "simulateAiAgent").mockResolvedValue({ replyText: "Como posso ajudar?" } as never);
    await render(); await click("5. Cenários");
    const input = el.querySelector('details textarea') as HTMLTextAreaElement;
    await edit(input, "Olá"); await click("Ensaiar mensagem");
    await edit(input, "Quero uma pessoa"); simulate.mockRejectedValueOnce(new Error("Provedor indisponível")); await click("Ensaiar mensagem");
    expect(simulate.mock.calls[1]![1].history).toEqual([{ role: "user", content: "Olá" }, { role: "assistant", content: "Como posso ajudar?" }]);
    expect(input.value).toBe("Quero uma pessoa"); expect(el.textContent).toContain("Provedor indisponível");
    expect(simulate.mock.calls[0]![1].draftConfig!.skills!.pix_charges).toBe(false);
  });
  it("blocks editing after a failed load and retries without inventing an empty plan",async()=>{
    vi.mocked(apiClient.getGuidedPlan).mockRejectedValueOnce(new Error('Consulta indisponível'));
    const save=vi.spyOn(apiClient,'saveGuidedPlan');
    await render();expect(el.textContent).toContain('Consulta indisponível');expect(el.querySelector('input')).toBeNull();
    await click('Tentar carregar plano novamente');expect(el.querySelector('input')!.value).toBe('Empresa LAB');expect(save).not.toHaveBeenCalled();
  });
  it("preserves the draft during a conflict and explicitly rebases after comparison",async()=>{
    vi.spyOn(apiClient,'saveGuidedPlan').mockRejectedValueOnce(new ApiError(409,'Conflict','Plano mudou'))
      .mockImplementationOnce(async(_id,payload)=>({plan:{...plan,revision:3,draft:payload.draft}}));
    await render();await edit(el.querySelector('input')!,'Minha empresa');await click('Salvar rascunho');
    expect(el.querySelector('input')!.value).toBe('Minha empresa');
    plan={...plan,revision:2,draft:{...draft,company:'Empresa salva por colega'}};
    await click('Consultar versão salva');expect(el.textContent).toContain('Empresa salva por colega');expect(el.textContent).toContain('Minha empresa');
    await click('Manter meu rascunho para revisar');await click('Salvar rascunho');
    expect(vi.mocked(apiClient.saveGuidedPlan).mock.calls[1]![1].expectedRevision).toBe(2);
    expect(el.querySelector('input')!.value).toBe('Minha empresa');
  });
  it("takes only one save before React renders the busy state",async()=>{
    let finish!:(value:{plan:GuidedRecord})=>void;
    const save=vi.spyOn(apiClient,'saveGuidedPlan').mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    await render();await edit(el.querySelector('input')!,'Rascunho');
    await act(async()=>{button('Salvar rascunho').click();button('Salvar rascunho').click();});
    expect(save).toHaveBeenCalledOnce();await act(async()=>finish({plan:{...plan,draft:{...draft,company:'Rascunho'}}}));
  });
  it("rejects an old rehearsal after switching companies and clears custom drafts",async()=>{
    let finish!:(value:never)=>void;
    vi.spyOn(apiClient,'simulateAiAgent').mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    await render();await click('5. Cenários');await edit(el.querySelector('details textarea')!,'Mensagem antiga');await click('Ensaiar mensagem');
    await act(async()=>root.render(createElement(GuidedAgentSetup,{...props,workspaceId:'outra'})));
    await act(async()=>finish({replyText:'Resposta da empresa anterior'} as never));
    await click('5. Cenários');expect(el.textContent).not.toContain('Resposta da empresa anterior');
    expect((el.querySelector('details textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it("shows the actual qualification criteria and custom cases in the review summary",async()=>{
    plan.draft.qualification='Região atendida e necessidade identificada';
    plan.draft.customCases=[{id:'d1111111-1111-4111-8111-111111111111',question:'Caso próprio simulado',expected:'Comportamento confirmado'}];
    await render();await click('4. Revisão');
    expect(el.textContent).toContain('Região atendida e necessidade identificada');expect(el.textContent).toContain('Caso próprio simulado');expect(el.textContent).toContain('Comportamento confirmado');
  });

  it("prepares a reviewed plan into an operational draft with both observed revisions",async()=>{
    plan.approvedRevision=1;plan.reviews=Object.fromEntries(guidedScenarios(draft).map(s=>[s.id,'Revisão sintética para ensaio assistido']));
    const prepare=vi.spyOn(apiClient,'prepareAiAgentFromGuided').mockResolvedValue({version:{draftRevision:5}} as never);const prepared=vi.fn();
    await act(async()=>root.render(createElement(GuidedAgentSetup,{...props,operationalRevision:4,onPrepared:prepared})));await click('5. Cenários');await click('Preparar rascunho operacional');
    expect(prepare).toHaveBeenCalledWith(props.workspaceId,{expectedRevision:4,expectedGuidedRevision:1},{token:props.token});expect(prepared).toHaveBeenCalledOnce();
  });
  it("does not replace unsaved operational form edits when preparing a guided plan",async()=>{
    plan.approvedRevision=1;const prepare=vi.spyOn(apiClient,'prepareAiAgentFromGuided');
    await act(async()=>root.render(createElement(GuidedAgentSetup,{...props,operationalRevision:4,operationalDirty:true,onPrepared:vi.fn()})));await click('5. Cenários');
    expect(button('Preparar rascunho operacional').disabled).toBe(true);expect(el.textContent).toContain('Há alterações no formulário operacional');expect(prepare).not.toHaveBeenCalled();
  });

});

it('withdraws old conflict choices while a newer comparison is pending and serializes reads',async()=>{vi.spyOn(apiClient,'saveGuidedPlan').mockRejectedValue(new ApiError(409,'Conflict','SIM conflito'));await render();await edit(el.querySelector('input')!,'SIM rascunho');await click('Salvar rascunho');await click('Consultar versão salva');expect(el.textContent).toContain('Usar versão salva');let resolve!:(v:{plan:GuidedRecord})=>void;const read=vi.mocked(apiClient.getGuidedPlan).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const previous=read.mock.calls.length;const consult=button('Consultar versão salva');await act(async()=>{consult.click();consult.click();});expect(read.mock.calls.length).toBe(previous+1);expect(el.textContent).not.toContain('Usar versão salva');expect(el.querySelector('input')!.value).toBe('SIM rascunho');await act(async()=>resolve({plan:{...plan,revision:3,draft:{...draft,company:'SIM versao atual'}}}));await click('Usar versão salva');expect(el.querySelector('input')!.value).toBe('SIM versao atual');});

it('recognizes a reviewed note after server whitespace normalization without a false unsaved warning',async()=>{
 const changed=vi.fn();const scenario=guidedScenarios(draft)[0]!;
 const review=vi.spyOn(apiClient,'reviewGuidedPlan').mockImplementation(async(_id,payload)=>({plan:{...plan,reviews:{[scenario.id]:payload.note}}}));
 await act(async()=>root.render(<GuidedAgentSetup {...props} onUnsavedChange={changed}/>));expect(changed).toHaveBeenLastCalledWith(false);
 await click('5. Cenários');const note=el.querySelector<HTMLTextAreaElement>('article textarea')!;
 await edit(note,'  SIM avaliação conferida pelo responsável  ');expect(changed).toHaveBeenLastCalledWith(true);
 await click(`Registrar revisão: ${scenario.title}`);expect(review.mock.calls[0]?.[1].note).toBe('SIM avaliação conferida pelo responsável');expect(changed).toHaveBeenLastCalledWith(false);expect(el.textContent).not.toContain('texto alterado, registre novamente');expect(note.value).toBe('  SIM avaliação conferida pelo responsável  ');
 await edit(note,'SIM avaliação realmente diferente');expect(changed).toHaveBeenLastCalledWith(true);expect(el.textContent).toContain('texto alterado, registre novamente');
});

it.each([
 {draft:{...draft,functions:['__proto__']}},
 {draft:{...draft,objective:'constructor'}},
 {draft:{...draft,company:{invalid:true}}},
 {reviews:{known:{invalid:true}}},
 {revision:-1},
])('rejects incompatible saved plan data and recovers through a confirmed reload %j',async patch=>{
 vi.mocked(apiClient.getGuidedPlan).mockResolvedValueOnce({plan:{...plan,...patch}} as never).mockResolvedValueOnce({plan});await render();expect(el.textContent).toContain('plano recebido tem dados incompatíveis');expect(el.querySelector('input')).toBeNull();await click('Tentar carregar plano novamente');expect(el.querySelector('input')!.value).toBe('Empresa LAB');
});
it('preserves local edits when a save response contains an incompatible draft',async()=>{
 vi.spyOn(apiClient,'saveGuidedPlan').mockResolvedValue({plan:{...plan,draft:{...draft,functions:['constructor']}}} as never);await render();await edit(el.querySelector('input')!,'SIM local preserved');await click('Salvar rascunho');expect(el.querySelector('input')!.value).toBe('SIM local preserved');expect(el.textContent).toContain('plano recebido tem dados incompatíveis');expect(el.textContent).not.toContain('Rascunho salvo.');
});

it('uses schema-normalized fields instead of treating whitespace as confirmed business information',async()=>{
 plan.draft={...draft,company:'   ',facts:' '.repeat(30),handoff:' '.repeat(20)};await render();expect(el.querySelector('input')!.value).toBe('');await click('4. Revisão');expect(el.textContent).toContain('Pendente: Empresa identificada');expect(el.textContent).toContain('Pendente: Informações confirmadas preenchidas');expect(el.textContent).toContain('Pendente: Encaminhamento humano definido');
});
it('does not count whitespace-only saved reviews as completed scenario evaluations',async()=>{
 plan.reviews=Object.fromEntries(guidedScenarios(draft).map(s=>[s.id,' '.repeat(20)]));await render();await click('5. Cenários');await act(async()=>el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());expect(button('Aprovar plano para teste assistido').disabled).toBe(true);expect(el.textContent).not.toContain('Revisão registrada nesta versão.');expect(Array.from(el.querySelectorAll('textarea')).every(field=>field.value==='')).toBe(true);
});
