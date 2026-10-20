// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CampaignRecipientsDialog} from '../pages/templates/CampaignRecipientsDialog';
import {apiClient,type BroadcastRecipientPage,type BroadcastRecipientSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const row=(id:string,status='queued'):BroadcastRecipientSummary=>({id,phoneE164:`+5500${id}`,name:'SIM cliente',variant:'A',status,sentAt:null,deliveredAt:null,readAt:null,repliedAt:null,clickedAt:null,reason:null});
const page=(rows:BroadcastRecipientSummary[],next:string|null=null,id='SIM-campaign'):BroadcastRecipientPage=>({campaign:{id,name:'SIM campanha atual',totalTargeted:100,totalRecorded:rows.length,totalMatching:rows.length},recipients:rows,pagination:{hasMore:Boolean(next),nextCursor:next}});
const render=(id='SIM-campaign')=>act(async()=>root.render(<CampaignRecipientsDialog workspaceId="SIM-workspace" token="SIM-token" campaignId={id} campaignName="SIM campaign" onClose={()=>{}}/>));
const button=(text:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('shows recorded evidence and missing confirmation separately without a resend action',async()=>{
 vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValue(page([row('1'),{...row('2','delivered'),sentAt:'2026-10-18T12:00:00Z',deliveredAt:'2026-10-18T12:01:00Z'},{...row('3','blocked'),reason:'SIM bloqueio conhecido'},row('4','uncertain')]));await render();
 expect(document.body.textContent).toContain('Público da campanha: 100');expect(document.body.textContent).toContain('Registros disponíveis nesta consulta: 4');expect(document.body.textContent).toContain('Sem confirmação de envio, entrega ou leitura');expect(document.body.textContent).toContain('Entrega confirmada:');expect(document.body.textContent).toContain('SIM bloqueio conhecido');expect(document.body.textContent).toContain('Resultado não confirmado');expect(Array.from(document.querySelectorAll('button')).some(b=>/reenviar|confirmar envio/i.test(b.textContent||''))).toBe(false);
});
it('distinguishes an initial failure from an empty successful consultation and supports retry',async()=>{
 vi.spyOn(apiClient,'getBroadcastRecipients').mockRejectedValueOnce(new Error('SIM consulta falhou')).mockResolvedValue(page([]));await render();expect(document.body.textContent).toContain('SIM consulta falhou');expect(document.body.textContent).not.toContain('Nenhum destinatário foi registrado');await act(async()=>button('Tentar consultar novamente').click());expect(document.body.textContent).toContain('Nenhum destinatário foi registrado');
});
it('refreshes the loaded range atomically and preserves rows when a later page fails',async()=>{
 const first=Array.from({length:50},(_,i)=>row(String(i))),last=[row('50')];
 const get=vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValueOnce(page(first,'SIM-next')).mockResolvedValueOnce(page(last)).mockResolvedValueOnce(page([{...row('new'),name:'SIM incomplete'}],'SIM-next')).mockRejectedValueOnce(new Error('SIM segunda página falhou'));
 await render();await act(async()=>button('Carregar mais destinatários').click());expect(document.querySelectorAll('article')).toHaveLength(51);await act(async()=>button('Atualizar destinatários').click());expect(get).toHaveBeenCalledTimes(4);expect(document.querySelectorAll('article')).toHaveLength(51);expect(document.body.textContent).not.toContain('SIM incomplete');expect(document.body.textContent).toContain('podem estar desatualizados');
});
it('blocks a repeated cursor without appending ambiguous records or overlapping requests',async()=>{
 let resolve!:(result:BroadcastRecipientPage)=>void;const waiting=new Promise<BroadcastRecipientPage>(r=>resolve=r);
 const get=vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValueOnce(page([row('1')],'SIM-next')).mockReturnValueOnce(waiting);await render();await act(async()=>{button('Carregar mais destinatários').click();button('Carregar mais destinatários').click();});expect(get).toHaveBeenCalledTimes(2);await act(async()=>resolve(page([row('2')],'SIM-next')));expect(document.querySelectorAll('article')).toHaveLength(1);expect(document.body.textContent).toContain('paginação não avançou');expect(button('Carregar mais destinatários').disabled).toBe(true);
});
it('ignores a previous campaign response after changing the selected campaign',async()=>{
 let resolve!:(result:BroadcastRecipientPage)=>void;vi.spyOn(apiClient,'getBroadcastRecipients').mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce(page([row('current')],null,'SIM-current'));await render();await render('SIM-current');await act(async()=>resolve(page([{...row('old'),name:'SIM old client'}])));expect(document.body.textContent).not.toContain('SIM old client');expect(document.body.textContent).toContain('+5500current');
});
it('rejects a response belonging to a different campaign',async()=>{
 vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValue(page([row('wrong')],null,'SIM-wrong'));await render();expect(document.body.textContent).toContain('retornou outra campanha');expect(document.querySelectorAll('article')).toHaveLength(0);
});


async function setFilters(search:string,group:string){await act(async()=>{const input=document.querySelector<HTMLInputElement>('input[type="search"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,search);input.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('select')!;select.value=group;select.dispatchEvent(new Event('change',{bubbles:true}));});}
const submitFilters=()=>act(async()=>{document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
it('submits explicit filters to the server and retains them on subsequent pages',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValueOnce(page([row('initial')])).mockResolvedValueOnce(page([row('attention','blocked')],'SIM-filtered-next')).mockResolvedValueOnce(page([row('next','uncertain')]));await render();await setFilters('  SIM cliente  ','ATTENTION');expect(get).toHaveBeenCalledOnce();await submitFilters();expect(get).toHaveBeenLastCalledWith('SIM-workspace','SIM-campaign',{token:'SIM-token'},undefined,{search:'SIM cliente',group:'ATTENTION'});expect(document.body.textContent).toContain('Filtros aplicados: Precisam de atenção · SIM cliente');expect(document.body.textContent).not.toContain('+5500initial');await act(async()=>button('Carregar mais destinatários').click());expect(get).toHaveBeenLastCalledWith('SIM-workspace','SIM-campaign',{token:'SIM-token'},'SIM-filtered-next',{search:'SIM cliente',group:'ATTENTION'});expect(document.querySelectorAll('article')).toHaveLength(2);
});
it('distinguishes no matching results from an empty campaign and clears filters through a new consultation',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValueOnce(page([row('initial')])).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([row('restored')]));await render();await setFilters('SIM absent','ATTENTION');await submitFilters();expect(document.body.textContent).toContain('Nenhum destinatário corresponde aos filtros');expect(document.body.textContent).not.toContain('Nenhum destinatário foi registrado');await act(async()=>button('Limpar filtros').click());expect(get).toHaveBeenCalledTimes(3);expect(document.body.textContent).toContain('+5500restored');expect(document.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');expect(document.querySelector('select')!.value).toBe('ALL');expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
});
it('ignores an unfiltered response completed after a filtered consultation',async()=>{
 let resolve!:(value:BroadcastRecipientPage)=>void;vi.spyOn(apiClient,'getBroadcastRecipients').mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce(page([row('filtered','failed')]));await render();await setFilters('','ATTENTION');await submitFilters();await act(async()=>resolve(page([row('late')])));expect(document.body.textContent).toContain('+5500filtered');expect(document.body.textContent).not.toContain('+5500late');expect(document.querySelectorAll('article')).toHaveLength(1);
});

it.each(['UNKNOWN','constructor','__proto__'])('renders recipient unknown states safely %s',async status=>{
 vi.spyOn(apiClient,'getBroadcastRecipients').mockResolvedValue(page([row('SIM-unknown',status)]));await render();expect(document.body.textContent).toContain('Estado não reconhecido');expect(document.body.textContent).toContain('SIM cliente');
});


it.each([{}, {...page([]),recipients:null}, {...page([]),campaign:{...page([]).campaign,totalMatching:-1}}, {...page([]),pagination:{hasMore:true,nextCursor:null}}, {...page([]),recipients:[{...row("invalid"),name:{}}]}])("rejects incomplete recipient evidence without a false empty result",async invalid=>{vi.spyOn(apiClient,"getBroadcastRecipients").mockResolvedValue(invalid as never);await render();expect(document.body.textContent).toContain("não confirmou os registros e contadores");expect(document.body.textContent).not.toContain("Nenhum destinatário foi registrado");expect(document.querySelectorAll("article")).toHaveLength(0);});
it("preserves recorded recipients when refresh has an invalid list",async()=>{vi.spyOn(apiClient,"getBroadcastRecipients").mockResolvedValueOnce(page([row("preserved")])).mockResolvedValueOnce({...page([]),recipients:null} as never);await render();await act(async()=>button("Atualizar destinatários").click());expect(document.body.textContent).toContain("+5500preserved");expect(document.body.textContent).toContain("podem estar desatualizados");expect(document.body.textContent).toContain("não confirmou os registros e contadores");});


it.each([false,true])("restores recipient refresh focus without taking another control: moved=%s",async moved=>{let resolve!:(value:BroadcastRecipientPage)=>void;vi.spyOn(apiClient,"getBroadcastRecipients").mockResolvedValueOnce(page([])).mockReturnValueOnce(new Promise(r=>resolve=r));await render();const refresh=button("Atualizar destinatários"),close=button("Fechar");await act(async()=>{refresh.focus();refresh.click();});await act(async()=>{refresh.blur();if(moved)close.focus();});await act(async()=>resolve(page([])));expect(document.activeElement).toBe(moved?close:refresh);});
