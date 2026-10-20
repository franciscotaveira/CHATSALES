// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {initialGuidedDraft} from '@sos-sales/contracts';
import {AiAgentSection} from '../pages/settings/AiAgentSection';
import {apiClient} from '../services/api-client';
import {requestNavigation} from '../utils/request-navigation';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const config={enabled:false,name:'SIM Assistente',systemPrompt:'SIM fatos aprovados',provider:'nvidia',model:'SIM_MODEL',skills:{},hasCustomApiKey:false};
const version={draftRevision:1,activeRevision:0,activeEnabled:false,sourceGuidedRevision:null};
const plan={revision:1,draft:{...initialGuidedDraft,company:'SIM Empresa'},reviews:{},approvedRevision:null,approvedAt:null,approvedBy:null};
const scenario={id:'human',title:'SIM Pedido humano',question:'Quero uma pessoa',expected:'Encaminhar',origin:'base' as const};
const run={id:'SIM-run',revision:1,scenarioId:'human',title:scenario.title,question:scenario.question,expected:scenario.expected,status:'completed' as const,replyText:'SIM resposta',checks:[],needsHandoff:true,offerPixProductId:null,provider:'SIM',model:'SIM',createdAt:'2026-10-18T01:00:00Z',completedAt:'2026-10-18T01:00:01Z',failureMessage:null,isSynthetic:true,reviewRevision:0,qualityReview:null,catalogSnapshot:[]};
let root:Root,el:HTMLDivElement;
const button=(text:string)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.trim()===text)!;
const guided=()=>el.querySelector<HTMLInputElement>('section[aria-label="Construção guiada da IA"] input')!;
const operational=()=>el.querySelector<HTMLInputElement>('input[placeholder="Ex.: Camila, Sofia, Lucas..."]')!;
const note=()=>el.querySelector<HTMLTextAreaElement>('textarea[id="review-SIM-run"]')!;
async function edit(field:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
async function render(){await act(async()=>root.render(<AiAgentSection workspaceId="SIM-workspace" token="SIM-token"/>));}
const unload=()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;};
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);vi.spyOn(apiClient,'getAiAgentConfig').mockResolvedValue({config,activeConfig:config,version} as never);vi.spyOn(apiClient,'getGuidedPlan').mockResolvedValue({plan} as never);vi.spyOn(apiClient,'getAiRevisionTests').mockResolvedValue({revision:1,currentRevision:1,verifierVersion:'SIM',scenarios:[scenario],runs:[run]});});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('collects guided, operational and test-note edits into one exit review without saving or activating AI',async()=>{
 const save=vi.spyOn(apiClient,'updateAiAgentConfig'),savePlan=vi.spyOn(apiClient,'saveGuidedPlan'),review=vi.spyOn(apiClient,'reviewAiRevisionTest'),leave=vi.fn();await render();expect(unload()).toBe(false);
 await edit(guided(),'SIM Empresa editada');await edit(operational(),'SIM Assistente editado');
 // Operational edits correctly block test reviews, so record the note after reverting this one field.
 await edit(operational(),'SIM Assistente');await edit(note(),'SIM avaliação ainda não registrada');await edit(operational(),'SIM Assistente editado');
 await act(async()=>requestNavigation(leave));expect(leave).not.toHaveBeenCalled();expect(el.querySelectorAll('[aria-label="Alterações não salvas"]')).toHaveLength(1);expect(el.querySelector('fieldset')!.disabled).toBe(true);expect(unload()).toBe(true);
 await act(async()=>button('Salvar rascunho operacional').click());expect(save).not.toHaveBeenCalled();
 await act(async()=>button('Continuar editando').click());expect(document.activeElement).toBe(guided());expect(guided().value).toBe('SIM Empresa editada');expect(operational().value).toBe('SIM Assistente editado');expect(note().value).toBe('SIM avaliação ainda não registrada');expect(el.querySelector('fieldset')!.disabled).toBe(false);
 await act(async()=>requestNavigation(leave));await act(async()=>button('Descartar alterações').click());expect(leave).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();expect(savePlan).not.toHaveBeenCalled();expect(review).not.toHaveBeenCalled();
});
it('recognizes automatic-mode edits and releases protection when reverted',async()=>{
 await render();const toggle=Array.from(el.querySelectorAll('input[type="checkbox"]')).find(x=>x.closest('label')?.textContent?.includes('Manual no rascunho')) as HTMLInputElement;
 await act(async()=>toggle.click());expect(unload()).toBe(true);await act(async()=>toggle.click());expect(unload()).toBe(false);
});
it('treats a pristine new guided plan as empty and warns for typed business information',async()=>{
 vi.mocked(apiClient.getGuidedPlan).mockResolvedValue({plan:null});await render();expect(unload()).toBe(false);await edit(guided(),'SIM nova empresa');expect(unload()).toBe(true);await edit(guided(),'');expect(unload()).toBe(false);
});
it('clears test-note protection only after the quality review is acknowledged by the server',async()=>{
 const saved={...run,reviewRevision:1,qualityReview:{revision:1,verdict:'adequate' as const,note:'SIM avaliação confirmada',reviewedAt:'2026-10-18T01:01:00Z'}};
 let resolve!:(v:typeof saved)=>void;vi.spyOn(apiClient,'reviewAiRevisionTest').mockReturnValue(new Promise(r=>{resolve=r;}));await render();await edit(note(),saved.qualityReview.note);expect(unload()).toBe(true);await act(async()=>button('Resposta adequada').click());const leave=vi.fn();await act(async()=>requestNavigation(leave));expect(button('Descartar alterações').disabled).toBe(true);
 await act(async()=>resolve(saved));expect(unload()).toBe(false);expect(button('Descartar alterações').disabled).toBe(false);await act(async()=>button('Continuar editando').click());expect(el.textContent).toContain('SIM avaliação confirmada');
});
