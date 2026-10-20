// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {AiAgentSection} from '../pages/settings/AiAgentSection';
import {apiClient} from '../services/api-client';
vi.mock('../pages/settings/AiRevisionTests',()=>({AiRevisionTests:()=>null}));
vi.mock('../pages/settings/GuidedAgentSetup',()=>({GuidedAgentSetup:()=>null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const config={enabled:false,name:'IA SIMULADA',systemPrompt:'Somente fatos confirmados',personality:'cordial_comercial',provider:'nvidia',model:'SIM_MODEL',skills:{},hasCustomApiKey:true,businessRules:{companyName:'SIM Empresa',generalRules:'SIM fatos',agentRole:'SIM papel próprio',valueProposition:'SIM diferencial',objections:{priceDiscount:'SIM sem desconto'},ctaRule:true,emojiDensity:'moderate'},faq:[{id:'sim-faq',question:'SIM pergunta',answer:'SIM resposta'}]};
const version={draftRevision:0,activeRevision:0,activeEnabled:false,sourceGuidedRevision:null};
const button=(text:string)=>[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===text)!;
async function edit(node:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function render(workspaceId='a'){await act(async()=>root.render(<AiAgentSection workspaceId={workspaceId} token="synthetic"/>));}
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);vi.spyOn(apiClient,'getAiAgentConfig').mockResolvedValue({config,activeConfig:config,version} as never);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});

const agentName=()=>el.querySelector('input[placeholder="Ex.: Camila, Sofia, Lucas..."]') as HTMLInputElement;
const prompt=()=>el.querySelector('textarea[placeholder^="Ex.: Atenda os clientes"]') as HTMLTextAreaElement;
describe('Niche models are reviewed draft suggestions',()=>{
 it('opens a preview without modifying the form and cancellation preserves existing content',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig');await render();await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Revisar modelo E-commerce & Moda"]')!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(agentName().value).toBe(config.name);expect(prompt().value).toBe(config.systemPrompt);expect(document.body.textContent).toContain('Por padrão, campos preenchidos são preservados');
  await act(async()=>button('Cancelar').click());expect(prompt().value).toBe(config.systemPrompt);expect(save).not.toHaveBeenCalled();
 });
 it('preserves filled fields, FAQ and business facts by default while populating missing guidance',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig');await render();await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Revisar modelo E-commerce & Moda"]')!.click());await act(async()=>button('Aplicar ao formulário').click());
  expect(agentName().value).toBe(config.name);expect(prompt().value).toBe(config.systemPrompt);expect(el.querySelector<HTMLInputElement>('input[placeholder="Ex.: Haven Escovaria & SPA, Loja Aurora..."]')!.value).toBe('SIM Empresa');
  expect(el.textContent).toContain('SIM pergunta');expect(el.textContent).toContain('SIM resposta');expect(save).not.toHaveBeenCalled();expect(button('Desfazer aplicação do modelo').disabled).toBe(false);
 });
 it('requires explicit replacement and allows undo before further edits',async()=>{
  await render();await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Revisar modelo Clínicas & Estética"]')!.click());
  const replace=document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!;await act(async()=>replace.click());await act(async()=>button('Aplicar ao formulário').click());
  expect(agentName().value).toBe('Camila');expect(prompt().value).toContain('não faça diagnóstico');expect(prompt().value).not.toContain('5 pacientes');
  await act(async()=>button('Desfazer aplicação do modelo').click());expect(agentName().value).toBe(config.name);expect(prompt().value).toBe(config.systemPrompt);expect(document.activeElement?.getAttribute('role')).toBe('status');
 });
 it('does not undo over a later manual edit and associates business labels with controls',async()=>{
  await render();await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Revisar modelo E-commerce & Moda"]')!.click());await act(async()=>button('Aplicar ao formulário').click());await edit(agentName(),'SIM texto depois');
  expect(button('Desfazer aplicação do modelo').disabled).toBe(true);expect(agentName().value).toBe('SIM texto depois');
  for(const label of [...el.querySelectorAll('label')].filter(n=>n.textContent?.includes('Nome da Sua Empresa')||n.textContent?.includes('Horário de Funcionamento')||n.textContent?.includes('System Prompt'))){expect(label.htmlFor).not.toBe('');expect(document.getElementById(label.htmlFor)).not.toBeNull();}
 });
 it('uses changeable, named native checkboxes for proposed functions',async()=>{
  await render();const control=el.querySelector<HTMLInputElement>('input[aria-label="Propor apresentação de catálogo"]')!;
  expect(control.readOnly).toBe(false);expect(control.checked).toBe(false);await act(async()=>control.click());expect(control.checked).toBe(true);await act(async()=>control.click());expect(control.checked).toBe(false);
  expect(el.textContent).not.toContain('Avança o contato de "Lead"');expect(el.textContent).not.toContain('Sincronização Ativa');
 });

});
