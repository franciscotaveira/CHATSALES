// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {CustomizeStagesDialog} from '../pages/opportunities/CustomizeStagesDialog';
import {CreateTemplateDialog} from '../pages/templates/CreateTemplateDialog';
import {TemplatesPage} from '../pages/templates/TemplatesPage';
import {templateStatus} from '../pages/templates/template-presentation';
import {apiClient,ApiError,type MessageTemplateSummary} from '../services/api-client';
import type {UseSessionReturn} from '../hooks/useSession';
// @ts-expect-error React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;const close=vi.fn(),changed=vi.fn();
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label)!;
const field=(label:string)=>{const el=Array.from(document.querySelectorAll('label')).find(el=>el.textContent?.includes(label))!;return document.getElementById(el.htmlFor) as HTMLInputElement;};
async function input(el:HTMLInputElement|HTMLTextAreaElement,text:string){await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});}
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
async function stages(overrides:Record<string,unknown>={}){await act(async()=>root.render(createElement(CustomizeStagesDialog,{isOpen:true,onClose:close,onSaved:changed,workspaceId:'ws-a',token:'synthetic',...overrides})));}
async function template(overrides:Record<string,unknown>={}){await act(async()=>root.render(createElement(CreateTemplateDialog,{isOpen:true,onClose:close,onCreated:changed,workspaceId:'ws-a',token:'synthetic',...overrides})));}
async function submit(){await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
beforeEach(()=>{vi.clearAllMocks();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
describe('stage settings',()=>{
 it('reviews unsaved stage names and restores focus without saving',async()=>{
  vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{},version:0});const save=vi.spyOn(apiClient,'saveStageLabels');await stages();await input(field('Lead'),'SIM rascunho');await act(async()=>button('Fechar').click());expect(close).not.toHaveBeenCalled();expect(field('Lead').disabled).toBe(true);expect(button('Salvar alterações').disabled).toBe(true);await act(async()=>button('Continuar editando').click());expect(field('Lead').value).toBe('SIM rascunho');expect(document.activeElement).toBe(field('Lead'));await act(async()=>button('Fechar').click());await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
 });
 it('blocks editing and saving after a failed load, then recovers',async()=>{
  vi.spyOn(apiClient,'getStageLabels').mockRejectedValueOnce(new Error('Falha controlada')).mockResolvedValue({labels:{lead:'Primeiro contato'},version:1});const save=vi.spyOn(apiClient,'saveStageLabels');await stages();expect(field('Lead').disabled).toBe(true);expect(button('Salvar alterações').disabled).toBe(true);await act(async()=>button('Tentar novamente').click());expect(field('Lead').value).toBe('Primeiro contato');expect(save).not.toHaveBeenCalled();
 });
 it('preserves a conflicting draft until the user compares and chooses a revision',async()=>{
  vi.spyOn(apiClient,'getStageLabels').mockResolvedValueOnce({labels:{lead:'Original'},version:1}).mockResolvedValue({labels:{lead:'Outra alteração'},version:2});const save=vi.spyOn(apiClient,'saveStageLabels').mockRejectedValueOnce(new ApiError(409,'Conflict','As etapas mudaram')).mockResolvedValue({labels:{lead:'Meu rascunho'},version:3});await stages();await input(field('Lead'),'Meu rascunho');await act(async()=>button('Salvar alterações').click());expect(field('Lead').value).toBe('Meu rascunho');expect(button('Salvar alterações').disabled).toBe(true);
  await act(async()=>button('Conferir versão atual').click());expect(document.body.textContent).toContain('Outra alteração');await act(async()=>button('Manter meu rascunho para revisão').click());await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[1]?.[2]).toBe(2);expect(changed).toHaveBeenCalledWith({lead:'Meu rascunho'});
 });
 it('ignores a save from the previous company and prevents duplicate requests',async()=>{
  vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{},version:0});const pending=deferred<{labels:{lead:string};version:number}>();const save=vi.spyOn(apiClient,'saveStageLabels').mockReturnValue(pending.promise);await stages();await input(field('Lead'),'SIMULADO A');await act(async()=>{button('Salvar alterações').click();button('Salvar alterações').click();button('Fechar').click();});expect(save).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();await stages({workspaceId:'ws-b'});await act(async()=>pending.resolve({labels:{lead:'OUTRA EMPRESA'},version:1}));expect(changed).not.toHaveBeenCalled();expect(field('Lead').value).toBe('');
 });
});
describe('template authoring',()=>{
 const suggestion={name:'sim_generated',category:'MARKETING' as const,headerText:null,bodyText:'Sugestão gerada',footerText:null,buttonText:null,variableLabels:[],explanation:'SIMULADO'};
 it('shows the generated proposal without replacing the edited body until explicitly applied',async()=>{
  vi.spyOn(apiClient,'generateTemplate').mockResolvedValue({generated:suggestion,model:'synthetic'});await template();await input(document.querySelector('[aria-label="Corpo da mensagem"]')!,'Meu texto manual');await input(document.querySelector('[aria-label="Objetivo da mensagem"]')!,'Convidar clientes a conhecer uma oferta');await act(async()=>button('Gerar sugestão').click());expect((document.querySelector('[aria-label="Corpo da mensagem"]') as HTMLTextAreaElement).value).toBe('Meu texto manual');expect(document.body.textContent).toContain('Sugestão gerada');expect(button('Salvar rascunho local').disabled).toBe(true);
  await act(async()=>button('Aplicar sugestão ao formulário').click());expect((document.querySelector('[aria-label="Corpo da mensagem"]') as HTMLTextAreaElement).value).toBe('Sugestão gerada');await act(async()=>button('Restaurar versão anterior').click());expect((document.querySelector('[aria-label="Corpo da mensagem"]') as HTMLTextAreaElement).value).toBe('Meu texto manual');
 });
 it('does not apply an old generation after closing and reopening',async()=>{
  const pending=deferred<{generated:typeof suggestion;model:string}>();vi.spyOn(apiClient,'generateTemplate').mockReturnValue(pending.promise);await template();await input(document.querySelector('[aria-label="Objetivo da mensagem"]')!,'Gerar uma mensagem comercial');await act(async()=>button('Gerar sugestão').click());await template({isOpen:false});await template();await act(async()=>pending.resolve({generated:suggestion,model:'synthetic'}));expect(document.body.textContent).not.toContain('Sugestão gerada');
 });
 it('saves a new local draft once and preserves success if the list refresh fails',async()=>{
  const pending=deferred<never>();const save=vi.spyOn(apiClient,'createTemplate').mockReturnValue(pending.promise);changed.mockRejectedValueOnce(new Error('Refresh failed'));await template();await input(field('Identificador'),'sim_unique');await input(document.querySelector('[aria-label="Corpo da mensagem"]')!,'Mensagem local de teste');await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0]?.[1]).toMatchObject({createOnly:true,name:'sim_unique',status:'PENDING'});await act(async()=>pending.resolve({} as never));expect(document.body.textContent).toContain('Rascunho salvo');expect(close).not.toHaveBeenCalled();await submit();expect(save).toHaveBeenCalledTimes(1);
 });
 it('reports provider status separately from local or unverified records',()=>{
  const base={metaTemplateId:'provider-id',metaVerifiedAt:'2026-10-17T12:00:00Z',metaVerifiedChannelId:'channel',status:'REJECTED'} as MessageTemplateSummary;
  expect(templateStatus(base).label).toBe('Rejeitado na Meta');expect(templateStatus({...base,status:'PAUSED'}).label).toBe('Pausado na Meta');expect(templateStatus({...base,status:'APPROVED',metaVerifiedAt:null}).label).toBe('Meta — verificação pendente');expect(templateStatus({...base,metaTemplateId:null}).label).toBe('Rascunho local');
 });
 it('does not show query failure as an empty catalog and can retry',async()=>{
  vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);vi.spyOn(apiClient,'getTemplates').mockRejectedValueOnce(new Error('Consulta indisponível')).mockResolvedValue({templates:[]} as never);await act(async()=>root.render(createElement(TemplatesPage,{session:{activeWorkspace:{id:'a'},token:'synthetic'} as UseSessionReturn})));expect(document.body.textContent).toContain('Consulta indisponível');expect(document.body.textContent).not.toContain('Nenhum modelo cadastrado');await act(async()=>button('Atualizar modelos').click());expect(document.body.textContent).toContain('Nenhum modelo cadastrado');
 });
});


describe('template draft lifecycle',()=>{
 it('keeps edited text and focus on cancel and never saves during discard review',async()=>{
  const save=vi.spyOn(apiClient,'createTemplate');await template();await input(field('Identificador'),'sim_draft');await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();expect(field('Identificador').disabled).toBe(true);await submit();expect(save).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(field('Identificador').value).toBe('sim_draft');expect(document.activeElement).toBe(field('Identificador'));await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();
 });
 it('closes an untouched author without a false warning',async()=>{
  await template();await act(async()=>button('Cancelar').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();
 });
 it('guards an unapplied example even when the manual form is empty',async()=>{
  await template();await act(async()=>button('Cobrança Pix (exemplo)').click());await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();await act(async()=>button('Continuar editando').click());expect(document.querySelector('[aria-label="Sugestão para revisão"]')).not.toBeNull();
 });
 it('invalidates a generation only after confirming exit',async()=>{
  const pending=deferred<never>();vi.spyOn(apiClient,'generateTemplate').mockReturnValue(pending.promise);await template();await input(document.querySelector('[aria-label="Objetivo da mensagem"]')!,'SIM gerar uma mensagem comercial');await act(async()=>button('Gerar sugestão').click());await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();await act(async()=>pending.resolve({generated:{name:'sim_old',bodyText:'SIM resposta antiga',category:'MARKETING',variableLabels:[],explanation:''}} as never));expect(document.body.textContent).not.toContain('SIM resposta antiga');
 });
 it('does not submit again after an uncertain creation and resets only in a new scope',async()=>{
  const save=vi.spyOn(apiClient,'createTemplate').mockRejectedValue(new ApiError(503,'Unavailable','SIM falha'));await template();await input(field('Identificador'),'sim_uncertain');await input(document.querySelector('[aria-label="Corpo da mensagem"]')!,'SIM mensagem');await submit();expect(document.body.textContent).toContain('Resultado do cadastro incerto');expect(button('Salvar rascunho local').disabled).toBe(true);await submit();expect(save).toHaveBeenCalledOnce();await template({workspaceId:'ws-b'});expect(field('Identificador').value).toBe('');expect(button('Salvar rascunho local').disabled).toBe(false);
 });
 it('allows correction after a known validation rejection',async()=>{
  const save=vi.spyOn(apiClient,'createTemplate').mockRejectedValue(new ApiError(409,'Conflict','SIM identificador em uso'));await template();await input(field('Identificador'),'sim_conflict');await input(document.querySelector('[aria-label="Corpo da mensagem"]')!,'SIM mensagem');await submit();expect(document.body.textContent).not.toContain('Resultado do cadastro incerto');expect(button('Salvar rascunho local').disabled).toBe(false);await input(field('Identificador'),'sim_corrected');await submit();expect(save).toHaveBeenCalledTimes(2);
 });
 it('closes an untouched nested author before reviewing the parent navigation',async()=>{
  const {useState}=await import('react');const {useDiscardChanges,UnsavedChangesNotice}=await import('../pages/UnsavedChangesNotice');const {requestNavigation}=await import('../utils/request-navigation');const leave=vi.fn();
  function Parent(){const [open,setOpen]=useState(true);const guard=useDiscardChanges(true,'SIM-parent',undefined,true);return createElement('div',null,guard.isPending&&createElement(UnsavedChangesNotice,{onKeep:guard.keepEditing,onDiscard:guard.discard}),open&&createElement(CreateTemplateDialog,{isOpen:true,workspaceId:'ws-a',token:'synthetic',onCreated:changed,onClose:()=>setOpen(false)}));}
  await act(async()=>root.render(createElement(Parent)));await act(async()=>requestNavigation(leave));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();expect(leave).not.toHaveBeenCalled();await act(async()=>button('Descartar alterações').click());expect(leave).toHaveBeenCalledOnce();
 });
});


it('explains automatic body names, required scoped fields and unsupported buttons without claiming quick replies',async()=>{
 const {TemplateDetailDialog}=await import('../pages/templates/TemplateDetailDialog');const {isRecipientNameVariable}=await import('@sos-sales/contracts');
 for(const key of ['1','nome_do_cliente','primeiro_nome_cliente','NOME'])expect(isRecipientNameVariable(key)).toBe(true);
 for(const key of ['header:1','header:nome_do_cliente','button:0','2','nome_completo','nome_cliente_extra'])expect(isRecipientNameVariable(key)).toBe(false);
 await act(async()=>root.render(createElement(TemplateDetailDialog,{onClose:close,template:{id:'SIM-detail',name:'sim_named_fields',bodyText:'Olá {{nome_do_cliente}}, data {{data}}.',headerText:'Pedido {{1}}',buttons:[{type:'COPY_CODE',text:'Código'}],status:'PENDING',language:'pt_BR',category:'UTILITY'} as MessageTemplateSummary})));
 const fields=document.querySelector('[aria-label="Preenchimento do modelo"]')!;expect(fields.textContent).toContain('Cabeçalho {{1}}: preenchimento obrigatório');expect(fields.textContent).toContain('Variável {{nome_do_cliente}}: primeiro nome do contato, automático');expect(fields.textContent).toContain('sem nome cadastrado, usa cliente');expect(fields.textContent).toContain('Variável {{data}}: preenchimento obrigatório');expect(document.body.textContent).toContain('Botão COPY_CODE: Código');expect(document.body.textContent).not.toContain('Resposta rápida: Código');
});


describe('stage response integrity',()=>{
 it.each([null,{labels:[],version:0},{labels:{lead:42},version:0},{labels:{lead:'SIM'},version:-1},{labels:{lead:'SIM'},version:0.5}])('rejects malformed stage snapshots without enabling writes: %j',async value=>{
  vi.spyOn(apiClient,'getStageLabels').mockResolvedValue(value as never);const save=vi.spyOn(apiClient,'saveStageLabels');await stages();
  expect(document.body.textContent).toContain('A resposta não confirmou nomes e versão válidos');expect(field('Lead').disabled).toBe(true);expect(button('Salvar alterações').disabled).toBe(true);expect(save).not.toHaveBeenCalled();
 });
 it('preserves the draft and avoids publishing malformed save feedback',async()=>{
  vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{lead:'SIM original'},version:0});vi.spyOn(apiClient,'saveStageLabels').mockResolvedValue({labels:{lead:42},version:1} as never);await stages();await input(field('Lead'),'SIM edited');await act(async()=>button('Salvar alterações').click());
  expect(field('Lead').value).toBe('SIM edited');expect(document.body.textContent).toContain('A resposta não confirmou nomes e versão válidos');expect(document.body.textContent).not.toContain('Nomes das etapas salvos.');expect(changed).not.toHaveBeenCalled();
 });
});


it('does not mark an incomplete main model query as a confirmed empty list',async()=>{
 vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);vi.spyOn(apiClient,'getTemplates').mockResolvedValue({} as never);await act(async()=>root.render(createElement(TemplatesPage,{session:{activeWorkspace:{id:'SIM-a'},token:'synthetic'} as UseSessionReturn})));expect(document.body.textContent).toContain('A consulta não confirmou uma lista válida de modelos');expect(document.body.textContent).not.toContain('Nenhum modelo cadastrado');
});


it.each([{}, {generated:null}, {generated:{name:"invalid",bodyText:{}}}, {generated:{name:"sim_bad",category:"MARKETING",headerText:null,bodyText:"SIM",footerText:null,buttonText:null,explanation:"SIM",variableLabels:[{}]}}])("preserves manual template text after an invalid generation response",async response=>{vi.spyOn(apiClient,"generateTemplate").mockResolvedValue(response as never);await template();await input(document.querySelector("[aria-label=\"Corpo da mensagem\"]")!,"SIM texto manual preservado");await input(document.querySelector("[aria-label=\"Objetivo da mensagem\"]")!,"SIM criar mensagem comercial");await act(async()=>button("Gerar sugestão").click());expect(document.body.textContent).toContain("sugestão incompleta ou incompatível");expect((document.querySelector("[aria-label=\"Corpo da mensagem\"]") as HTMLTextAreaElement).value).toBe("SIM texto manual preservado");expect(document.querySelector("[aria-label=\"Sugestão para revisão\"]")).toBeNull();});
