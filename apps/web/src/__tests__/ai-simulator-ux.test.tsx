// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {AiAgentSection} from '../pages/settings/AiAgentSection';
import {apiClient,ApiError} from '../services/api-client';
vi.mock('../pages/settings/AiRevisionTests',()=>({AiRevisionTests:()=>null}));
vi.mock('../pages/settings/GuidedAgentSetup',()=>({GuidedAgentSetup:()=>null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const config={enabled:false,name:'IA SIMULADA',systemPrompt:'Somente fatos confirmados',provider:'nvidia',model:'SIM_MODEL',skills:{},hasCustomApiKey:true};
const version={draftRevision:0,activeRevision:0,activeEnabled:false,sourceGuidedRevision:null};
const result={replyText:'Resposta simulada para a pergunta anterior',needsHandoff:false,provider:'nvidia',model:'SIM_MODEL',latencyMs:12,matchedCatalogCount:0};
const button=(text:string)=>[...el.querySelectorAll('button')].find(node=>node.textContent?.trim()===text)!;
const input=()=>el.querySelector('input[placeholder="Digite a mensagem simulada do cliente..."]') as HTMLInputElement;
async function edit(node:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function render(workspaceId='a'){await act(async()=>root.render(<AiAgentSection workspaceId={workspaceId} token="synthetic"/>));}
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);vi.spyOn(apiClient,'getAiAgentConfig').mockResolvedValue({config,activeConfig:config,version} as never);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
describe('AI simulator context and authorization language',()=>{
 it('keeps the submitted message with its result and marks changed input as a different test',async()=>{
  vi.spyOn(apiClient,'simulateAiAgent').mockResolvedValue(result as never);
  await render();await edit(input(),'Pergunta anterior');await act(async()=>button('Testar Resposta').click());
  expect(el.textContent).toContain('Resposta gerada — revisão necessária');expect(el.textContent).not.toContain('Factual Aprovado');
  await edit(input(),'Nova pergunta');expect(el.textContent).toContain('Este resultado pertence ao teste anterior');
  expect(el.textContent).toContain('Pergunta anterior');expect(el.textContent).toContain(result.replyText);
 });
 it('serializes double clicks and does not let an old response clear a new company simulation',async()=>{
  let oldResolve!:(value:never)=>void,newResolve!:(value:never)=>void;
  const simulate=vi.spyOn(apiClient,'simulateAiAgent').mockReturnValueOnce(new Promise(resolve=>{oldResolve=resolve;})).mockReturnValueOnce(new Promise(resolve=>{newResolve=resolve;}));
  await render();await edit(input(),'Empresa A');await act(async()=>{button('Testar Resposta').click();button('Testar Resposta')?.click();});
  expect(simulate).toHaveBeenCalledOnce();
  await render('b');await edit(input(),'Empresa B');await act(async()=>button('Testar Resposta').click());
  await act(async()=>oldResolve({...result,replyText:'Resposta antiga'} as never));
  expect(el.textContent).not.toContain('Resposta antiga');expect(button('Executando...').disabled).toBe(true);
  await act(async()=>newResolve({...result,replyText:'Resposta atual'} as never));expect(el.textContent).toContain('Resposta atual');
 });
 it('clears a typed key when choosing a different provider and exposes selection to keyboard users',async()=>{
  await render();const password=el.querySelector('input[type="password"]') as HTMLInputElement;await edit(password,'SIM_KEY');
  const provider=el.querySelector('button[aria-label="Usar OpenRouter"]') as HTMLButtonElement;
  await act(async()=>provider.click());expect(provider.getAttribute('aria-pressed')).toBe('true');expect(password.value).toBe('');
  expect(el.textContent).not.toContain('Chave personalizada ativa no workspace');
 });
 it('describes handoff as a model suggestion and does not claim the simulator transferred anyone',async()=>{
  vi.spyOn(apiClient,'simulateAiAgent').mockResolvedValue({...result,needsHandoff:true,handoffReason:'Informação ausente'} as never);
  await render();await edit(input(),'Preciso de uma pessoa');await act(async()=>button('Testar Resposta').click());
  expect(el.textContent).toContain('Encaminhamento sugerido');expect(el.textContent).toContain('O simulador não transferiu a conversa');expect(el.textContent).not.toContain('Transbordo Acionado');
 });
 it('saves an observed draft revision and keeps the active status separate',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig').mockResolvedValue({config:{...config,name:'SIM novo nome'},version:{...version,draftRevision:1}} as never);
  await render();await edit(el.querySelector('input[placeholder="Ex.: Camila, Sofia, Lucas..."]')!,'SIM novo nome');await act(async()=>button('Salvar rascunho operacional').click());
  expect(save.mock.calls[0]![1]).toMatchObject({expectedRevision:0,name:'SIM novo nome'});
  expect(el.textContent).toContain('Rascunho: revisão 1');expect(el.textContent).toContain('A configuração em uso foi preservada');
 });
 it('compares a conflicting revision without erasing the local form and saves only after an explicit choice',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig').mockRejectedValueOnce(new ApiError(409,'Conflict','Outro rascunho foi salvo')).mockResolvedValueOnce({config,version:{...version,draftRevision:3}} as never);
  await render();const name=el.querySelector('input[placeholder="Ex.: Camila, Sofia, Lucas..."]') as HTMLInputElement;await edit(name,'SIM texto local');await act(async()=>button('Salvar rascunho operacional').click());
  vi.mocked(apiClient.getAiAgentConfig).mockResolvedValueOnce({config:{...config,name:'SIM colega'},activeConfig:config,version:{...version,draftRevision:2}} as never);
  await act(async()=>button('Comparar com revisão salva').click());expect(el.textContent).toContain('SIM colega');expect(name.value).toBe('SIM texto local');
  await act(async()=>button('Manter meu formulário para revisar').click());await act(async()=>button('Salvar rascunho operacional').click());
  expect(save.mock.calls[1]![1]).toMatchObject({expectedRevision:2,name:'SIM texto local'});
 });
 it('suspends the active configuration without saving or erasing local draft edits',async()=>{
  vi.mocked(apiClient.getAiAgentConfig).mockResolvedValueOnce({config:{...config,enabled:true},activeConfig:{...config,enabled:true},version:{...version,activeEnabled:true}} as never);
  const stop=vi.spyOn(apiClient,'suspendAiAgent').mockResolvedValue({success:true,activeEnabled:false});const save=vi.spyOn(apiClient,'updateAiAgentConfig');
  await render();const name=el.querySelector('input[placeholder="Ex.: Camila, Sofia, Lucas..."]') as HTMLInputElement;await edit(name,'SIM não salvo');
  await act(async()=>button('Suspender atendimento automático agora').click());expect(stop).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();expect(name.value).toBe('SIM não salvo');
  expect(el.textContent).toContain('Atendimento automático suspenso');
 });

 it('blocks incomplete FAQ before save or paid simulation and focuses the missing field',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig'),simulate=vi.spyOn(apiClient,'simulateAiAgent');await render();await act(async()=>button('Adicionar Pergunta').click());
  const question=el.querySelector('#ai-faq-question-0') as HTMLInputElement;await edit(question,'SIM horário?');await act(async()=>button('Salvar rascunho operacional').click());expect(save).not.toHaveBeenCalled();expect(document.activeElement?.id).toBe('ai-faq-answer-0');expect(el.querySelector('[role="alert"]')?.textContent).toContain('preencha a resposta');expect(question.value).toBe('SIM horário?');
  await edit(input(),'SIM pergunta');await act(async()=>button('Testar Resposta').click());expect(simulate).not.toHaveBeenCalled();
  await act(async()=>{const answer=el.querySelector('#ai-faq-answer-0') as HTMLTextAreaElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(answer,'SIM resposta confirmada');answer.dispatchEvent(new Event('input',{bubbles:true}));});expect(el.querySelector('#ai-faq-error')).toBeNull();expect(el.querySelector('#ai-faq-answer-0')?.getAttribute('aria-invalid')).toBe('false');
 });
 it('undoes a FAQ removal with the exact original text and does not save automatically',async()=>{
  vi.mocked(apiClient.getAiAgentConfig).mockResolvedValue({config:{...config,faq:[{id:'SIM-faq',question:'SIM pergunta',answer:'SIM resposta'}]},activeConfig:config,version} as never);const save=vi.spyOn(apiClient,'updateAiAgentConfig');await render();await act(async()=>el.querySelector<HTMLButtonElement>('[aria-label="Remover FAQ 1 do formulário"]')!.click());expect(el.querySelector('#ai-faq-question-0')).toBeNull();await act(async()=>button('Desfazer última remoção de FAQ').click());expect((el.querySelector('#ai-faq-question-0') as HTMLInputElement).value).toBe('SIM pergunta');expect((el.querySelector('#ai-faq-answer-0') as HTMLTextAreaElement).value).toBe('SIM resposta');expect(save).not.toHaveBeenCalled();
 });
 it('uses named native emoji controls and persists their choice with contextual continuity',async()=>{
  const save=vi.spyOn(apiClient,'updateAiAgentConfig').mockResolvedValue({config,version:{...version,draftRevision:1}} as never);await render();const sober=el.querySelector<HTMLInputElement>('input[aria-label="🧊 Sóbrio & Executivo"]')!;expect(sober.type).toBe('radio');await act(async()=>sober.click());const cta=el.querySelector<HTMLInputElement>('[aria-label="Sugerir pergunta de continuidade"]')!;await act(async()=>cta.click());await act(async()=>button('Salvar rascunho operacional').click());expect(save.mock.calls[0]?.[1].businessRules).toMatchObject({emojiDensity:'sober',ctaRule:false});
 });

});

it('gives objection and simulated-message controls persistent names and guidance without overwriting saved rules',async()=>{
 const objections={priceDiscount:'SIM condição de desconto cadastrada',thinkAboutIt:'SIM decisão sem pressão',guaranteeTrust:'SIM política aprovada',deliveryTimeline:'SIM prazo a consultar'};
 vi.mocked(apiClient.getAiAgentConfig).mockResolvedValue({config:{...config,businessRules:{objections}},activeConfig:config,version} as never);
 await render();
 for(const [labelText,key] of [['Preço e pedido de desconto','priceDiscount'],['Tempo para decidir','thinkAboutIt'],['Garantia e confiança','guaranteeTrust'],['Prazos e disponibilidade','deliveryTimeline']] as const){
  const label=Array.from(el.querySelectorAll('label')).find(node=>node.textContent?.trim()===labelText)!;
  const field=document.getElementById(label.htmlFor) as HTMLTextAreaElement;
  expect(field.tagName).toBe('TEXTAREA');expect(field.value).toBe(objections[key]);expect(field.labels?.[0]).toBe(label);expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent?.trim()).toBeTruthy();
  expect(field.placeholder).not.toMatch(/5%|2 horas|7 dias|24 horas/);
 }
 const message=input(),label=Array.from(el.querySelectorAll('label')).find(node=>node.htmlFor===message.id)!;
 expect(label.textContent).toContain('Mensagem simulada do cliente');expect(document.getElementById(message.getAttribute('aria-describedby')!)?.textContent).toContain('pode consumir créditos');
});
