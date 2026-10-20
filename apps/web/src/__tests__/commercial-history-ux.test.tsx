// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {JourneyTimeline} from '../pages/cockpit/ContextPanel/JourneyTimeline';import {apiClient,type ThreadCommercialHistory} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
const empty:ThreadCommercialHistory={journey:null,items:[],pagination:{hasMore:false,nextCursor:null}};
const event={id:'SIM-event',label:'Oportunidade criada',resourceId:'SIM-id',resourceType:'opportunity',occurredAt:'2026-10-17T12:00:00Z'};
const view=(ws='SIM-a')=><JourneyTimeline workspaceId={ws} threadId="SIM-thread" token="synthetic"/>;
const click=async(label:string)=>act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===label)!.click());
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('does not invent a stage or zero history while loading or after failure, and retries',async()=>{let reject!:(e:Error)=>void;vi.spyOn(apiClient,'getThreadCommercialHistory').mockReturnValueOnce(new Promise((_,r)=>reject=r)).mockResolvedValue(empty);await act(async()=>root.render(view()));expect(container.textContent).toContain('Consultando negociação');expect(container.textContent).not.toContain('Registros consultados: 0');expect(container.textContent).not.toContain('Qualificação');await act(async()=>reject(new Error('SIM unavailable')));expect(container.textContent).toContain('SIM unavailable');expect(container.textContent).not.toContain('Nenhum evento');await click('Atualizar negociação e registros');expect(container.textContent).toContain('Nenhuma negociação vinculada');await click('Registros consultados: 0');expect(container.textContent).toContain('Nenhum evento disponível');});
it('preserves records and cursor on page failure, then deduplicates the retry',async()=>{const cursor={occurredAt:'2026-10-17T12:00:00.123456Z',eventId:'SIM-event'};const query=vi.spyOn(apiClient,'getThreadCommercialHistory').mockResolvedValueOnce({...empty,items:[event],pagination:{hasMore:true,nextCursor:cursor}}).mockRejectedValueOnce(new Error('SIM page unavailable')).mockResolvedValue({...empty,items:[event,{...event,id:'SIM-older',label:'Proposta criada'}]});await act(async()=>root.render(view()));await click('Registros consultados: 1 ou mais');await click('Carregar registros anteriores');expect(container.textContent).toContain('Oportunidade criada');expect(container.textContent).toContain('SIM page unavailable');await click('Carregar registros anteriores');expect(query).toHaveBeenLastCalledWith('SIM-a','SIM-thread',{limit:50,beforeOccurredAt:cursor.occurredAt,beforeEventId:cursor.eventId},{token:'synthetic'});expect(container.textContent).toContain('Registros consultados: 2');expect(container.textContent).toContain('Proposta criada');});
it('ignores an old company response after the scope changes',async()=>{let resolve!:(v:ThreadCommercialHistory)=>void;vi.spyOn(apiClient,'getThreadCommercialHistory').mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValue(empty);await act(async()=>root.render(view()));await act(async()=>root.render(view('SIM-b')));await act(async()=>resolve({...empty,items:[event],journey:{id:'old',title:'SIM old',stage:'won'}}));expect(container.textContent).toContain('Nenhuma negociação vinculada');expect(container.textContent).not.toContain('Oportunidade criada');});

it('preserves records and blocks continuation after a failed refresh until a successful query',async()=>{
 const cursor={occurredAt:event.occurredAt,eventId:event.id};
 const query=vi.spyOn(apiClient,'getThreadCommercialHistory').mockResolvedValueOnce({...empty,items:[event],pagination:{hasMore:true,nextCursor:cursor}}).mockRejectedValueOnce(new Error('SIM refresh failed')).mockResolvedValue(empty);
 await act(async()=>root.render(view()));await click('Registros consultados: 1 ou mais');await click('Atualizar negociação e registros');
 expect(container.textContent).toContain('Oportunidade criada');
 const more=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Carregar registros anteriores')!;expect(more.disabled).toBe(true);await act(async()=>more.click());expect(query).toHaveBeenCalledTimes(2);
 await click('Atualizar negociação e registros');expect(container.textContent).toContain('Nenhum evento disponível');
});
it.each(['repeated','missing'])('rejects a %s continuation without replacing the confirmed records',async kind=>{
 const cursor={occurredAt:event.occurredAt,eventId:event.id};
 const query=vi.spyOn(apiClient,'getThreadCommercialHistory').mockResolvedValueOnce({...empty,items:[event],pagination:{hasMore:true,nextCursor:cursor}}).mockResolvedValue({...empty,items:[{...event,id:'SIM-unconfirmed',label:'SIM unconfirmed'}],pagination:{hasMore:true,nextCursor:kind==='repeated'?cursor:null}});
 await act(async()=>root.render(view()));await click('Registros consultados: 1 ou mais');await click('Carregar registros anteriores');
 expect(container.textContent).toContain('continuação válida');expect(container.textContent).toContain('Oportunidade criada');expect(container.textContent).not.toContain('SIM unconfirmed');
 await click('Carregar registros anteriores');expect(query).toHaveBeenCalledTimes(2);
});

it('refreshes every opened page and publishes the whole range only after it succeeds',async()=>{
 const cursor={occurredAt:event.occurredAt,eventId:event.id};const older={...event,id:'SIM-older',label:'SIM older'};
 let resolve!:(v:ThreadCommercialHistory)=>void;
 const query=vi.spyOn(apiClient,'getThreadCommercialHistory').mockResolvedValueOnce({...empty,items:[event],pagination:{hasMore:true,nextCursor:cursor}}).mockResolvedValueOnce({...empty,items:[older]}).mockResolvedValueOnce({...empty,items:[{...event,label:'SIM refreshed first'}],pagination:{hasMore:true,nextCursor:cursor}}).mockReturnValueOnce(new Promise(r=>resolve=r));
 await act(async()=>root.render(view()));await click('Registros consultados: 1 ou mais');await click('Carregar registros anteriores');
 await click('Atualizar negociação e registros');expect(query).toHaveBeenCalledTimes(4);expect(container.textContent).toContain('SIM older');expect(container.textContent).not.toContain('SIM refreshed first');
 await act(async()=>resolve({...empty,items:[{...older,label:'SIM refreshed older'}]}));
 expect(container.textContent).toContain('SIM refreshed first');expect(container.textContent).toContain('SIM refreshed older');expect(container.textContent).toContain('Registros consultados: 2');
});
it('preserves the whole previous range when a later refresh page fails, and retries that full range',async()=>{
 const cursor={occurredAt:event.occurredAt,eventId:event.id};const first={...empty,items:[event],pagination:{hasMore:true,nextCursor:cursor}};const last={...empty,items:[{...event,id:'SIM-older',label:'SIM older'}]};
 const query=vi.spyOn(apiClient,'getThreadCommercialHistory').mockResolvedValueOnce(first).mockResolvedValueOnce(last).mockResolvedValueOnce({...first,items:[{...event,label:'SIM partial refresh'}]}).mockRejectedValueOnce(new Error('SIM later page failed')).mockResolvedValueOnce(first).mockResolvedValueOnce(last);
 await act(async()=>root.render(view()));await click('Registros consultados: 1 ou mais');await click('Carregar registros anteriores');await click('Atualizar negociação e registros');
 expect(container.textContent).toContain('Oportunidade criada');expect(container.textContent).toContain('SIM older');expect(container.textContent).not.toContain('SIM partial refresh');expect(container.textContent).toContain('SIM later page failed');
 await click('Atualizar negociação e registros');expect(query).toHaveBeenCalledTimes(6);expect(container.textContent).not.toContain('SIM later page failed');expect(container.textContent).toContain('Registros consultados: 2');
});
