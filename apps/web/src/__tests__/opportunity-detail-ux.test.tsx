// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {OpportunityDetailDialog,centsFromOutcomeInput} from '../pages/opportunities/OpportunityDetailDialog';
import {apiClient,type JourneySummary} from '../services/api-client';
// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const journey={id:'journey-a',stage:'lead',contactId:'contact-a',title:'SIMULADO',estimatedValueCents:150000,createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z'} as JourneySummary;
const outcomeResponse=(status="won")=>({outcome:{id:"SIM-outcome",journeyId:journey.id,status,valueCents:150000,currency:"BRL"}});
let root:Root,container:HTMLDivElement;
const close=vi.fn(),changed=vi.fn();
const button=(name:string)=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent===name)!;
function field(label:string){const l=Array.from(document.body.querySelectorAll('label')).find(e=>e.textContent?.includes(label));return document.getElementById(l!.htmlFor) as HTMLInputElement;}
function value(el:HTMLInputElement,text:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
async function render(overrides:Record<string,unknown>={}){await act(async()=>root.render(createElement(OpportunityDetailDialog,{journey,workspaceId:'ws-a',token:'synthetic',onClose:close,onChanged:changed,customStages:{qualified:'Diagnóstico'},...overrides})));}
beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
describe('opportunity detail',()=>{
 it('parses reais exactly and rejects ambiguous, negative and out-of-range amounts',()=>{
  expect(centsFromOutcomeInput('1500')).toBe(150000);expect(centsFromOutcomeInput('1.500,5')).toBe(150050);expect(centsFromOutcomeInput('0,00')).toBe(0);
  for(const raw of ['', '-10','1,2,3','12.34','1.234,567','21474836,48'])expect(centsFromOutcomeInput(raw),raw).toBeNull();
 });
 it('uses custom stages and blocks duplicate submission and close while saving',async()=>{
  let resolve!:()=>void;const stage=vi.spyOn(apiClient,'updateJourneyStage').mockImplementation(()=>new Promise(r=>{resolve=()=>r({journey:{...journey,stage:"qualified"}});}));
  await render();expect(document.body.textContent).toContain('Diagnóstico');
  await act(async()=>{const select=document.querySelector('select')!;select.value='qualified';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{button('Salvar etapa').click();button('Salvar etapa').click();button('Fechar').click();});
  expect(stage).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
  await act(async()=>resolve());expect(changed).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
 });
 it('reviews a loss and validates the reason before committing it',async()=>{
  const outcome=vi.spyOn(apiClient,'recordJourneyOutcome').mockResolvedValue(outcomeResponse("lost"));await render();
  await act(async()=>button('Marcar perdido').click());expect(outcome).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Informe o motivo');
  await act(async()=>{value(field('Motivo da perda'),'Sem interesse');value(field('Valor final'),'1500');});
  await act(async()=>button('Marcar perdido').click());expect(outcome).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Confirmar perda');
  await act(async()=>button('Registrar perda').click());expect(outcome).toHaveBeenCalledWith('ws-a','journey-a',{status:'lost',valueCents:150000,currency:'BRL',reason:'Sem interesse',expectedUpdatedAt:journey.updatedAt},{token:'synthetic'});
 });
 it('does not close or refresh another company after a delayed save',async()=>{
  let resolve!:(x:unknown)=>void;vi.spyOn(apiClient,'recordJourneyOutcome').mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();
  await act(async()=>button('Marcar ganho').click());await act(async()=>button('Registrar ganho').click());
  await render({workspaceId:'ws-b',journey:{...journey,id:'journey-b',title:'OUTRO CONTEXTO'}});
  await act(async()=>resolve({}));expect(close).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();expect(document.body.textContent).toContain('OUTRO CONTEXTO');
 });
 it('preserves success and prevents repeating a committed outcome if refresh fails',async()=>{
  const outcome=vi.spyOn(apiClient,'recordJourneyOutcome').mockResolvedValue(outcomeResponse());changed.mockRejectedValueOnce(new Error('refresh failed'));await render();
  await act(async()=>button('Marcar ganho').click());await act(async()=>button('Registrar ganho').click());
  expect(document.body.textContent).toContain('A alteração foi salva');expect(button('Marcar ganho').disabled).toBe(true);expect(outcome).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
 });
});

it('requires a fresh opportunity after an unconfirmed stage change instead of retrying it',async()=>{
 const update=vi.spyOn(apiClient,'updateJourneyStage').mockRejectedValue(new DOMException('SIM timeout','TimeoutError'));const outcome=vi.spyOn(apiClient,'recordJourneyOutcome');await render();await act(async()=>{const select=document.querySelector('select')!;select.value='qualified';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Salvar etapa').click());expect(document.body.textContent).toContain('confira o resultado antes');expect(button('Salvar etapa').disabled).toBe(true);expect(button('Marcar ganho').disabled).toBe(true);await act(async()=>{button('Salvar etapa').click();button('Marcar ganho').click();});expect(update).toHaveBeenCalledOnce();expect(outcome).not.toHaveBeenCalled();expect(button('Fechar').disabled).toBe(false);await render({journey:{...journey,updatedAt:'2026-10-17T12:00:00Z'}});expect(button('Marcar ganho').disabled).toBe(false);expect(document.body.textContent).not.toContain('confira o resultado antes');
});


it.each([{lead:{text:'SIM invalid'}},{lead:42},{lead:'   '},Object.create({lead:'SIM inherited'})])('keeps opportunity details readable with malformed custom names: %j',async customStages=>{
 await render({customStages});expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();expect(document.body.textContent).toContain('Lead');expect(document.body.textContent).not.toContain('SIM inherited');expect(document.body.textContent).not.toContain('SIM invalid');
});
it.each(['constructor','__proto__','SIM_UNKNOWN'])('shows an explicit fallback for unrecognized opportunity stage %s',async stage=>{
 const move=vi.spyOn(apiClient,'updateJourneyStage');const outcome=vi.spyOn(apiClient,'recordJourneyOutcome');
 await render({journey:{...journey,stage},customStages:{}});expect(document.body.textContent).toContain('Etapa não reconhecida');expect(document.body.textContent).not.toContain('function Object');
 expect(document.body.textContent).toContain('confira o registro antes de alterar');
 for(const name of ['Salvar etapa','Marcar ganho','Marcar perdido']){expect(button(name).disabled).toBe(true);await act(async()=>button(name).click());}
 expect(move).not.toHaveBeenCalled();expect(outcome).not.toHaveBeenCalled();
 await act(async()=>button('Fechar').click());expect(close).toHaveBeenCalledOnce();
});


it.each([{}, {journey:{...journey,id:"SIM-other",stage:"qualified"}}, {journey:{...journey,stage:"lead"}}])("does not confirm an incompatible stage acknowledgement",async response=>{const update=vi.spyOn(apiClient,"updateJourneyStage").mockResolvedValue(response as never);await render();await act(async()=>{const select=document.querySelector("select")!;select.value="qualified";select.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>button("Salvar etapa").click());expect(document.body.textContent).toContain("O retorno não confirmou a alteração");expect(changed).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(button("Salvar etapa").disabled).toBe(true);await act(async()=>button("Salvar etapa").click());expect(update).toHaveBeenCalledOnce();});
it.each([{}, {outcome:{...outcomeResponse().outcome,journeyId:"SIM-other"}}, {outcome:{...outcomeResponse().outcome,valueCents:1}}])("does not confirm an incompatible commercial outcome",async response=>{const record=vi.spyOn(apiClient,"recordJourneyOutcome").mockResolvedValue(response);await render();await act(async()=>button("Marcar ganho").click());await act(async()=>button("Registrar ganho").click());expect(document.body.textContent).toContain("O retorno não confirmou a alteração");expect(changed).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(button("Marcar ganho").disabled).toBe(true);expect(record).toHaveBeenCalledOnce();});
it("confirms the matching commercial outcome before refreshing and closing",async()=>{vi.spyOn(apiClient,"recordJourneyOutcome").mockResolvedValue(outcomeResponse());await render();await act(async()=>button("Marcar ganho").click());await act(async()=>button("Registrar ganho").click());expect(changed).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();});
