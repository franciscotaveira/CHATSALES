import {LeadSummary} from '../pages/cockpit/ContextPanel/LeadSummary';
// @vitest-environment happy-dom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {RadarDrawer} from "../pages/cockpit/drawers/RadarDrawer";
import {DossierDrawer,parseHistoricalSpent} from "../pages/cockpit/drawers/DossierDrawer";
import {apiClient,ApiError,type CommercialThreadSummary} from "../services/api-client";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;const close=vi.fn(),apply=vi.fn(),updated=vi.fn();
const thread={id:'SIM-thread',contactId:'SIM-contact',contactPhone:'+5511999999999',contactName:'SIM Cliente',status:'active',channelProvider:'waha',createdAt:'2026-10-17T12:00:00Z'} as CommercialThreadSummary;
const suggestion={id:'SIM-suggestion',threadId:thread.id,title:'SIM Sugestão',body:'SIM retorno',draftMessage:'SIM rascunho',priority:'urgent',status:'pending',stateVersion:1};
const contact={id:thread.contactId,name:'SIM Cliente',phoneE164:thread.contactPhone,metadata:{totalOrders:2,totalSpentCents:123456,email:'sim@example.invalid',company:'SIM Empresa',tags:[],notes:'SIM nota'}};
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
const radar=(id=thread.id)=><RadarDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" threadId={id} onDraftApplied={apply}/>;
const dossier=(t=thread)=><DossierDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={t} onContactUpdated={updated}/>;
async function fill(index:number,value:string){await act(async()=>{const input=document.querySelectorAll<HTMLInputElement>('input')[index]!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{close.mockReset();apply.mockReset();updated.mockReset();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.spyOn(apiClient,'getThreadActions').mockResolvedValue({actions:[]} as never);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('keeps Radar query failures separate from empty results and offers recovery',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockRejectedValueOnce(new Error('SIM consulta falhou')).mockResolvedValue({items:[]} as never);await act(async()=>root.render(radar()));expect(document.body.textContent).toContain('SIM consulta falhou');expect(document.body.textContent).not.toContain('Nenhuma sugestão pendente');await act(async()=>button('Tentar novamente').click());expect(document.body.textContent).toContain('Nenhuma sugestão pendente');
});
it('blocks duplicate Radar decisions and discards completion after switching thread',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[suggestion]} as never);const wait=deferred<never>();const decide=vi.spyOn(apiClient,'decideIntegrationSuggestion').mockReturnValue(wait.promise);await act(async()=>root.render(radar()));await act(async()=>{button('Usar rascunho').click();button('Usar rascunho')?.click();});expect(decide).toHaveBeenCalledOnce();await act(async()=>root.render(radar('SIM-other')));await act(async()=>wait.resolve({draftMessage:'SIM rascunho antigo'} as never));expect(apply).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
});
it('keeps a Radar decision error visible after refreshing the suggestions',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[suggestion]} as never);vi.spyOn(apiClient,'decideIntegrationSuggestion').mockRejectedValue(new Error('SIM decisão em conflito'));await act(async()=>root.render(radar()));await act(async()=>button('Ignorar').click());expect(document.body.textContent).toContain('SIM decisão em conflito');expect(document.body.textContent).toContain('SIM Sugestão');
});
it('does not apply a suggestion belonging to a different conversation',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[{...suggestion,threadId:'SIM-other'}]} as never);await act(async()=>root.render(radar()));expect(button('Usar rascunho').disabled).toBe(true);
});
it('parses historical reais exactly and rejects partial numeric strings',()=>{
 expect(parseHistoricalSpent('1.234,56')).toBe(123456);expect(parseHistoricalSpent('0,00')).toBe(0);expect(parseHistoricalSpent('1.23')).toBeNull();expect(parseHistoricalSpent('12abc')).toBeNull();expect(parseHistoricalSpent('-50')).toBeNull();
});
it('never presents a failed client lookup as zero historical purchases',async()=>{
 vi.spyOn(apiClient,'getContacts').mockRejectedValueOnce(new Error('SIM ficha indisponível')).mockResolvedValue({contacts:[contact]} as never);await act(async()=>root.render(dossier()));expect(document.body.textContent).not.toContain('Gasto acumulado informado');expect(document.body.textContent).toContain('SIM ficha indisponível');await act(async()=>button('Tentar novamente').click());expect(document.body.textContent).toContain('Gasto acumulado informado');
});
it('saves Brazilian historical amounts and rejects malformed order counts',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(5,'2.5');await act(async()=>button('Salvar alterações').click());expect(save).not.toHaveBeenCalled();await fill(5,'3');await fill(6,'1.234,57');await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[0]?.[2].metadata).toEqual({totalOrders:3,totalSpentCents:123457});
});
it('does not overwrite the new client after an earlier save completes',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const wait=deferred<never>();vi.spyOn(apiClient,'updateContact').mockReturnValue(wait.promise);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(0,'SIM pending name');await act(async()=>button('Salvar alterações').click());await act(async()=>root.render(dossier({...thread,id:'SIM-new',contactId:'SIM-new-contact'})));await act(async()=>wait.resolve({contact:{...contact,name:'SIM antigo'}} as never));expect(updated).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('SIM antigo');
});

it('shows absent customer history and estimate as unknown rather than verified zero or a new lead',async()=>{
 await act(async()=>root.render(<LeadSummary thread={thread} contact={{...contact,metadata:{}} as never}/>));expect(container.textContent).not.toContain('Novo Lead');expect(container.textContent).not.toContain('0 compras');expect(container.textContent).not.toContain('R$');expect(container.textContent?.match(/Não informado/g)).toHaveLength(3);
 await act(async()=>root.render(<LeadSummary thread={thread} contact={{...contact,metadata:{totalOrders:0,totalSpentCents:0}} as never} estimatedValueCents={0}/>));expect(container.textContent).toContain('0 compras');expect(container.textContent).toContain('0,00');expect(container.textContent).not.toContain('Não informado');
});
it('does not manufacture a purchase count from recurrence or coerce malformed historical values',async()=>{
 await act(async()=>root.render(<LeadSummary thread={thread} contact={{...contact,metadata:{isRecurring:true}} as never}/>));expect(container.textContent).toContain('Recorrência informada');expect(container.textContent).not.toContain('1 compra');
 await act(async()=>root.render(<LeadSummary thread={thread} contact={{...contact,metadata:{isRecurring:'false',totalOrders:'2',totalSpentCents:-1,tags:'cliente_recorrente'}} as never}/>));expect(container.textContent).toContain('Sem indicação de recorrência');expect(container.textContent?.match(/Não informado/g)).toHaveLength(3);
 await act(async()=>root.render(<LeadSummary thread={thread} contact={{...contact,id:'SIM-other',metadata:{totalOrders:9,totalSpentCents:9900}} as never}/>));expect(container.textContent).not.toContain('9 compras');expect(container.textContent).not.toContain('99,00');
});
it('does not persist fabricated zero history or a derived recurrence flag when only the customer name is edited',async()=>{
 const current={...contact,metadata:{isRecurring:true,providerCustom:'SIM preserve'}};vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[current]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact:current} as never);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());expect(document.querySelectorAll<HTMLInputElement>('input')[5]!.value).toBe('');expect(document.querySelectorAll<HTMLInputElement>('input')[6]!.value).toBe('');await fill(0,'SIM revised name');await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[0]![2]).toEqual({name:'SIM revised name'});
});
it('persists explicit historical zero and a deliberate recurrence flag without inferring an order',async()=>{
 const current={...contact,metadata:{}};vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[current]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact:current} as never);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(5,'0');await fill(6,'0,00');await act(async()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[0]![2].metadata).toMatchObject({totalOrders:0,totalSpentCents:0,isRecurring:true});
});

it('loads a conflicting received note while preserving other dossier edits',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);
 const save=vi.spyOn(apiClient,'updateContact').mockRejectedValueOnce(new ApiError(409,'Nota alterada','SIM conflito')).mockResolvedValue({contact} as never);
 await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(0,'SIM nome editado');await act(async()=>{const note=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'SIM draft');note.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Salvar alterações').click());expect(button('Salvar alterações').disabled).toBe(true);
 vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[{...contact,metadata:{...contact.metadata,notes:'SIM nota recebida'}}]} as never);
 await act(async()=>button('Consultar nota atual').click());await act(async()=>button('Cancelar').click());expect(button('Usar nota atual').disabled).toBe(true);expect(button('Consultar nota atual').disabled).toBe(true);expect(button('Manter minha edição da nota').disabled).toBe(true);await act(async()=>button('Usar nota atual').click());expect(document.querySelector('textarea')!.value).toBe('SIM draft');await act(async()=>button('Continuar editando').click());await act(async()=>button('Usar nota atual').click());
 expect(document.querySelector('textarea')!.value).toBe('SIM nota recebida');expect(document.querySelector('input')!.value).toBe('SIM nome editado');
 await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[1]![2]).toMatchObject({name:'SIM nome editado',metadata:{notes:'SIM nota recebida'},expectedNotes:'SIM nota recebida'});
});

it('does not submit an unchanged dossier or overwrite untouched known historical values',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);
 await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await act(async()=>button('Salvar alterações').click());expect(save).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Nenhuma alteração para salvar.');
 await fill(0,'SIM name only');await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[0]![2]).toEqual({name:'SIM name only'});
});
it('sends a deliberately edited dossier company without resending email, notes, tags or history',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);
 await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(1,'SIM new company');await act(async()=>button('Salvar alterações').click());expect(save.mock.calls[0]![2]).toEqual({metadata:{company:'SIM new company'}});
});

it('requires explicit discard before closing an edited dossier and can continue editing',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const save=vi.spyOn(apiClient,'updateContact');await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());expect(document.activeElement).toBe(document.querySelector('input'));await fill(0,'SIM unsaved customer');
 await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Há alterações não salvas.');expect(document.querySelector('fieldset')!.disabled).toBe(true);expect(button('Salvar alterações').disabled).toBe(true);await act(async()=>button('Salvar alterações').click());expect(save).not.toHaveBeenCalled();
 await act(async()=>button('Continuar editando').click());expect(document.querySelector('input')!.value).toBe('SIM unsaved customer');expect(document.activeElement).toBe(document.querySelector('input'));
 await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Fechar painel"]')!.click());expect(close).not.toHaveBeenCalled();
 await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
});
it('discards the pending exit when the dossier context changes',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(0,'SIM unsaved');await act(async()=>button('Cancelar').click());
 await act(async()=>root.render(dossier({...thread,id:'SIM-other-thread',contactId:'SIM-other-contact'})));expect(document.body.textContent).not.toContain('Há alterações não salvas.');expect(close).not.toHaveBeenCalled();
});

it.each(['UNKNOWN','constructor','__proto__'])('renders an unknown conversation state in the dossier safely %s',async status=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);await act(async()=>root.render(dossier({...thread,status} as CommercialThreadSummary)));expect(document.body.textContent).toContain('Estado não reconhecido');expect(document.body.textContent).toContain('SIM Cliente');
});


it('refreshes registered radar suggestions without scanning or changing the conversation draft',async()=>{
 const list=vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValueOnce({items:[suggestion]} as never).mockResolvedValueOnce({items:[]} as never);const scan=vi.spyOn(apiClient,'scanRadar');
 await act(async()=>root.render(<RadarDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" threadId={thread.id} currentDraft="SIM manual draft" onDraftApplied={apply}/>));
 await act(async()=>button('Atualizar sugestões').click());expect(list).toHaveBeenCalledTimes(2);expect(scan).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM manual draft');expect(document.body.textContent).toContain('Nenhuma sugestão pendente');
});


it('retains radar suggestions on refresh failure but blocks decisions until a successful query',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValueOnce({items:[suggestion]} as never).mockRejectedValueOnce(new Error('SIM refresh failed')).mockResolvedValueOnce({items:[suggestion]} as never);const decide=vi.spyOn(apiClient,'decideIntegrationSuggestion');
 await act(async()=>root.render(radar()));await act(async()=>button('Atualizar sugestões').click());expect(document.body.textContent).toContain('SIM Sugestão');expect(document.body.textContent).toContain('última consulta concluída');
 for(const label of ['Ignorar','Usar rascunho']){expect(button(label).disabled).toBe(true);await act(async()=>button(label).click());}expect(decide).not.toHaveBeenCalled();
 await act(async()=>button('Tentar novamente').click());expect(button('Ignorar').disabled).toBe(false);expect(button('Usar rascunho').disabled).toBe(false);expect(document.body.textContent).not.toContain('SIM refresh failed');
});


const simDecision={id:suggestion.id,status:'accepted',threadId:thread.id,stateVersion:2,draftMessage:'SIM confirmed draft',decidedByUserId:'SIM-user',decidedAt:'2026-10-18T12:00:00Z'};
it.each([{id:'SIM-other'},{threadId:'SIM-other'},{status:'dismissed'},{stateVersion:1},{draftMessage:null},{draftMessage:{text:'SIM invalid'}}])('does not apply a mismatched or incomplete Radar confirmation: %j',async patch=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[suggestion]} as never);vi.spyOn(apiClient,'decideIntegrationSuggestion').mockResolvedValue({...simDecision,...patch} as never);
 await act(async()=>root.render(radar()));await act(async()=>button('Usar rascunho').click());expect(apply).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('A resposta não confirmou a decisão');expect(document.body.textContent).toContain('SIM Sugestão');
});
it('applies a draft only after its matching versioned decision is confirmed',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[suggestion]} as never);vi.spyOn(apiClient,'decideIntegrationSuggestion').mockResolvedValue(simDecision as never);
 await act(async()=>root.render(radar()));await act(async()=>button('Usar rascunho').click());expect(apply).toHaveBeenCalledExactlyOnceWith('SIM confirmed draft');expect(close).toHaveBeenCalledOnce();
});


it.each([{}, {items:{}}, {items:[{...suggestion,body:{text:'SIM invalid'}}]}, {items:[suggestion,suggestion]}, {items:[{...suggestion,stateVersion:0}]}, {items:[{...suggestion,priority:{value:"urgent"}}]}])('rejects malformed Radar query data instead of showing an empty or actionable list: %j',async result=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue(result as never);const decide=vi.spyOn(apiClient,'decideIntegrationSuggestion');await act(async()=>root.render(radar()));
 expect(document.body.textContent).toContain('A consulta não confirmou uma lista válida');expect(document.body.textContent).not.toContain('Nenhuma sugestão pendente');expect(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Usar rascunho')).toBe(false);expect(decide).not.toHaveBeenCalled();
});
it('retains the last valid Radar list when the next response is malformed',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValueOnce({items:[suggestion]} as never).mockResolvedValueOnce({items:null} as never);await act(async()=>root.render(radar()));await act(async()=>button('Atualizar sugestões').click());expect(document.body.textContent).toContain('SIM Sugestão');expect(button('Usar rascunho').disabled).toBe(true);expect(document.body.textContent).toContain('A consulta não confirmou uma lista válida');
});


it('reports a completed Radar scan even if the following list refresh fails',async()=>{
 vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValueOnce({items:[suggestion]} as never).mockRejectedValueOnce(new Error('SIM list failed'));vi.spyOn(apiClient,'scanRadar').mockResolvedValue({enabled:true,candidates:3,created:1});await act(async()=>root.render(radar()));await act(async()=>button('Analisar agora').click());
 expect(document.body.textContent).toContain('3 conversa(s) candidata(s) encontrada(s); 1 nova(s) sugestão(ões) registrada(s)');expect(document.body.textContent).toContain('SIM list failed');expect(document.body.textContent).toContain('SIM Sugestão');expect(button('Usar rascunho').disabled).toBe(true);
});
it.each([{enabled:'true',candidates:0,created:0},{enabled:true,candidates:-1,created:0},{enabled:true,candidates:1,created:undefined}])('does not announce an unconfirmed Radar scan result: %j',async result=>{
 const list=vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValue({items:[]} as never);vi.spyOn(apiClient,'scanRadar').mockResolvedValue(result as never);await act(async()=>root.render(radar()));await act(async()=>button('Analisar agora').click());expect(document.body.textContent).toContain('A resposta não confirmou o resultado da análise');expect(document.body.textContent).not.toContain('Resultado da última análise');expect(list).toHaveBeenCalledOnce();
});


it.each([[401,'Sua sessão expirou'],[403,'Seu acesso não permite esta ação'],[500,'O serviço está indisponível']])('presents an actionable dossier load error for HTTP %s without exposing technical detail',async(status,message)=>{
 vi.spyOn(apiClient,'getContacts').mockRejectedValue(new ApiError(status as number,'SIM technical error','SELECT SIM_PRIVATE_INTERNAL_DETAIL FROM contacts'));
 await act(async()=>root.render(dossier()));expect(document.body.textContent).toContain(message as string);expect(document.body.textContent).not.toContain('SIM_PRIVATE_INTERNAL_DETAIL');expect(document.body.textContent).not.toContain('Gasto acumulado informado');expect(button('Tentar novamente')).toBeDefined();
});


it.each([null,{...contact,id:'SIM-other'},{...contact,name:{text:'SIM invalid'}}])('preserves dossier edits when the save response does not confirm this contact: %j',async returned=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact:returned} as never);await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(0,'SIM edited name');await act(async()=>button('Salvar alterações').click());
 expect(document.body.textContent).toContain('A resposta não confirmou a ficha deste cliente');expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('SIM edited name');expect(updated).not.toHaveBeenCalled();
});
it('keeps a confirmed dossier save distinct from failure to update the surrounding screen',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const save=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact:{...contact,name:'SIM saved name'}} as never);updated.mockImplementationOnce(()=>{throw new Error('SIM parent failed');});await act(async()=>root.render(dossier()));await act(async()=>button('Editar ficha').click());await fill(0,'SIM saved name');await act(async()=>button('Salvar alterações').click());
 expect(document.body.textContent).toContain('Ficha salva, mas a tela anterior');expect(document.body.textContent).toContain('SIM saved name');expect(button('Editar ficha')).toBeDefined();expect(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Salvar alterações')).toBe(false);expect(save).toHaveBeenCalledOnce();
});


it.each([{contacts:{}},{contacts:[{...contact,name:{text:'SIM invalid'}}]},{contacts:[{...contact,phoneE164:null}]},{contacts:[contact,contact]}])('does not render incompatible identity data in the dossier: %j',async result=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue(result as never);await act(async()=>root.render(dossier()));expect(document.body.textContent).toContain('A consulta não confirmou');expect(document.body.textContent).not.toContain('Gasto acumulado informado');expect(button('Editar ficha').disabled).toBe(true);expect(button('Tentar novamente')).toBeDefined();
});


it.each([false,true])('restores manual Radar refresh focus only when the user has not moved elsewhere (moved=%s)',async moved=>{
 const wait=deferred<never>();vi.spyOn(apiClient,'getIntegrationSuggestions').mockResolvedValueOnce({items:[]} as never).mockReturnValueOnce(wait.promise);await act(async()=>root.render(radar()));const refresh=button('Atualizar sugestões');refresh.focus();await act(async()=>refresh.click());expect(refresh.disabled).toBe(true);
 const other=button('Fechar');if(moved)other.focus();else refresh.blur();await act(async()=>wait.resolve({items:[]} as never));expect(document.activeElement).toBe(moved?other:refresh);
});
