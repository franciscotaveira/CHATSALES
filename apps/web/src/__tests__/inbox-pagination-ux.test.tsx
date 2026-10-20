import {InboxList} from "../pages/cockpit/InboxList/InboxList";
// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {useInbox} from '../pages/cockpit/hooks/useInbox';import {apiClient,type CommercialThreadSummary} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,current:ReturnType<typeof useInbox>;
const thread=(id:string)=>({id,contactName:id,contactPhone:'+5500000000001',channelInstanceId:'SIM-channel',status:'active'} as CommercialThreadSummary);
const cursor={activityAt:'2026-10-17T12:00:00.123456Z',id:'SIM-cursor'};
const page=(ids:string[],more=false)=>({threads:ids.map(thread),total:ids.length,pagination:{hasMore:more,nextCursor:more?cursor:null}});
function Harness({ws='SIM-a'}:{ws?:string}){current=useInbox({token:'synthetic',activeWorkspace:{id:ws}} as UseSessionReturn);return <div>{current.threads.map(t=><p key={t.id}>{t.contactName}</p>)}{current.error&&<p>{current.error}</p>}</div>;}
it.each([
 {name:'missing rows',response:{total:0}},
 {name:'duplicate identity',response:page(['SIM-duplicate','SIM-duplicate'])},
 {name:'unknown state',response:{...page([]),threads:[{...thread('SIM-bad'),status:'unknown'}]}},
 {name:'invalid contact',response:{...page([]),threads:[{...thread('SIM-bad'),contactName:{bad:true}}]}},
 {name:'invalid message',response:{...page([]),threads:[{...thread('SIM-bad'),lastMessage:{body:{bad:true},direction:'inbound'}}]}},
 {name:'invalid cursor',response:{...page(['SIM-new']),pagination:{hasMore:true,nextCursor:{id:'SIM-next',activityAt:'invalid'}}}},
 {name:'ambiguous continuation',response:{...page(['SIM-new']),pagination:{hasMore:'false',nextCursor:null}}},
 {name:'invalid handoff reason',response:{...page([]),threads:[{...thread('SIM-bad'),handoffReason:{bad:true}}]}},
 {name:'invalid task title',response:{...page([]),threads:[{...thread('SIM-bad'),nextAction:{id:'SIM-task',title:{bad:true},status:'open',dueAt:null}}]}},
 {name:'invalid task deadline',response:{...page([]),threads:[{...thread('SIM-bad'),nextAction:{id:'SIM-task',title:'SIM retorno',status:'open',dueAt:'invalid'}}]}},
])('preserves consulted conversations when a refresh has $name',async({response})=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce(page(['SIM-kept'])).mockResolvedValueOnce(response as never);
 await act(async()=>root.render(<Harness/>));await act(async()=>current.refreshThreads());
 expect(current.threads.map(row=>row.id)).toEqual(['SIM-kept']);expect(current.requiresThreadRefresh).toBe(true);expect(current.error).toContain('inválidas');
});
beforeEach(()=>{vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('preserves pages on failure, retries the cursor and refreshes the loaded range instead of dropping older conversations',async()=>{const query=vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce(page(['SIM-head'],true)).mockRejectedValueOnce(new Error('SIM page unavailable')).mockResolvedValueOnce(page(['SIM-older'])).mockResolvedValueOnce(page(['SIM-head'],true)).mockResolvedValueOnce(page(['SIM-older']));await act(async()=>root.render(<Harness/>));await act(async()=>current.loadMoreThreads());expect(container.textContent).toContain('SIM-head');expect(container.textContent).toContain('SIM page unavailable');await act(async()=>current.loadMoreThreads());expect(query.mock.calls[2]?.[1]).toMatchObject({beforeActivityAt:cursor.activityAt,beforeId:cursor.id});expect(container.textContent).toContain('SIM-older');await act(async()=>current.refreshThreads());expect(current.threads.map(t=>t.id)).toEqual(['SIM-head','SIM-older']);expect(query).toHaveBeenCalledTimes(5);});
it('discards a late page from another company',async()=>{let resolve!:(v:ReturnType<typeof page>)=>void;vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce(page(['SIM-head'],true)).mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValue(page(['SIM-new-company']));await act(async()=>root.render(<Harness/>));let pending:Promise<void>|undefined;await act(async()=>{pending=current.loadMoreThreads();});await act(async()=>root.render(<Harness ws="SIM-b"/>));await act(async()=>resolve(page(['SIM-foreign-old'])));await pending;expect(current.threads.map(t=>t.id)).toEqual(['SIM-new-company']);});
it('sends search and channel to the server before pagination',async()=>{const query=vi.spyOn(apiClient,'getThreads').mockResolvedValue(page([]));await act(async()=>root.render(<Harness/>));await act(async()=>current.setSearchQuery('  SIM older  '));await act(async()=>{await new Promise(r=>setTimeout(r,350));});expect(query.mock.calls.at(-1)?.[1]).toMatchObject({search:'SIM older',status:'open'});await act(async()=>current.setSelectedChannelId('SIM-channel'));expect(query.mock.calls.at(-1)?.[1]).toMatchObject({search:'SIM older',channelInstanceId:'SIM-channel'});});

it('offers the continuation control with a partial count and blocks it during an update',async()=>{const more=vi.fn();const view=(refresh=false)=><InboxList threads={[thread('SIM-head')]} selectedThreadId={null} onSelectThread={()=>{}} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed={false} onToggleCollapse={()=>{}} isMobile hasMore isRefreshing={refresh} onLoadMore={more}/>;await act(async()=>root.render(view()));expect(container.textContent).toContain('1+');const button=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais conversas')!;await act(async()=>button.click());expect(more).toHaveBeenCalledOnce();await act(async()=>root.render(view(true)));expect(Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais conversas')!.disabled).toBe(true);});

it('blocks an old cursor after a full refresh failure and restores continuation after a valid refresh',async()=>{
 const refreshed=Array.from({length:50},(_,index)=>`SIM-current-${index}`);const query=vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce(page(['SIM-head'],true)).mockRejectedValueOnce(new Error('SIM refresh failed')).mockResolvedValueOnce(page(refreshed,true)).mockResolvedValueOnce(page(['SIM-older']));await act(async()=>root.render(<Harness/>));await act(async()=>current.refreshThreads());expect(current.requiresThreadRefresh).toBe(true);expect(current.threads.map(row=>row.id)).toEqual(['SIM-head']);await act(async()=>current.loadMoreThreads());expect(query).toHaveBeenCalledTimes(2);await act(async()=>current.refreshThreads());expect(current.requiresThreadRefresh).toBe(false);await act(async()=>current.loadMoreThreads());expect(current.threads.map(row=>row.id)).toEqual([...refreshed,'SIM-older']);expect(query).toHaveBeenCalledTimes(4);expect(query.mock.calls[3]?.[1]).toMatchObject({beforeId:cursor.id});
});
it('bounds a refresh whose advancing cursors keep returning the same record without erasing the prior range',async()=>{
 let cursorStep=0;const query=vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce(page(['SIM-head'],true)).mockImplementation(async()=>({...page(['SIM-head'],true),pagination:{hasMore:true,nextCursor:{activityAt:'2026-10-18T12:00:00Z',id:`SIM-cursor-${++cursorStep}`}}}));await act(async()=>root.render(<Harness/>));await act(async()=>current.refreshThreads());expect(query).toHaveBeenCalledTimes(3);expect(current.threads.map(row=>row.id)).toEqual(['SIM-head']);expect(current.requiresThreadRefresh).toBe(true);expect(current.error).toContain('limite de páginas');
});
it('explains retained conversations and disables continuation when their full refresh is required',async()=>{
 const more=vi.fn();await act(async()=>root.render(<InboxList threads={[thread('SIM-head')]} selectedThreadId={null} onSelectThread={()=>{}} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed={false} onToggleCollapse={()=>{}} hasMore requiresRefresh onLoadMore={more}/>));expect(container.textContent).toContain('conversas anteriores foram preservadas');const next=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais conversas')!;expect(next.disabled).toBe(true);await act(async()=>next.click());expect(more).not.toHaveBeenCalled();
});
it('distinguishes received messages from human handoff and exposes selection in the collapsed rail',async()=>{
 const select=vi.fn();
 await act(async()=>root.render(<InboxList threads={[
  {...thread('SIM-inbound'),lastMessage:{direction:'inbound',body:'SIM mensagem'}},
  {...thread('SIM-human'),status:'waiting_human'},
  thread('SIM-neutral'),
 ] as CommercialThreadSummary[]} selectedThreadId="SIM-inbound" onSelectThread={select} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed onToggleCollapse={()=>{}} isMobile={false}/>));
 const inbound=container.querySelector<HTMLButtonElement>('button[aria-label="SIM-inbound (Última mensagem recebida do cliente)"]')!;
 expect(inbound).not.toBeNull();expect(inbound.getAttribute('aria-pressed')).toBe('true');expect(inbound.title).not.toContain('Aguardando atendimento');
 const human=container.querySelector<HTMLButtonElement>('button[aria-label="SIM-human (Aguardando atendimento humano)"]')!;
 expect(human).not.toBeNull();expect(human.getAttribute('aria-pressed')).toBe('false');
 const neutral=container.querySelector<HTMLButtonElement>('button[aria-label="SIM-neutral"]')!;expect(neutral).not.toBeNull();
 await act(async()=>human.click());expect(select).toHaveBeenCalledWith('SIM-human');
});
it('keeps refresh failures, loading and partial coverage discoverable in the collapsed rail',async()=>{
 const expand=vi.fn();await act(async()=>root.render(<InboxList threads={[thread('SIM-kept')]} selectedThreadId={null} onSelectThread={()=>{}} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed onToggleCollapse={expand} isMobile={false} error="SIM consulta indisponível" requiresRefresh isRefreshing hasMore/>));
 expect(container.querySelector('aside')?.getAttribute('aria-busy')).toBe('true');
 expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Atualizando fila de conversas');
 const review=container.querySelector<HTMLButtonElement>('button[aria-label="A fila precisa de revisão. Expandir para consultar o aviso"]')!;
 expect(review).not.toBeNull();expect(container.querySelector('[role="alert"]')).not.toBeNull();
 await act(async()=>review.click());expect(expand).toHaveBeenCalledTimes(1);
 const more=container.querySelector<HTMLButtonElement>('button[aria-label="Há mais conversas. Expandir fila para carregar"]')!;
 await act(async()=>more.click());expect(expand).toHaveBeenCalledTimes(2);
 expect(container.querySelector('button[aria-label="SIM-kept"]')).not.toBeNull();
});
it.each(['SIM-return','SIM-missing'])('restores navigation focus to the previous conversation or search: %s',async id=>{
 await act(async()=>root.render(<InboxList threads={[thread('SIM-return')]} restoreFocusThreadId={id} selectedThreadId={null} onSelectThread={()=>{}} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed={false} onToggleCollapse={()=>{}} isMobile/>));
 expect(document.activeElement).toBe(id==='SIM-return'?container.querySelector('[data-thread-id="SIM-return"] [role="button"]'):container.querySelector('input'));
});
it('does not take focus away from another control during restoration',async()=>{
 const external=document.createElement('button');document.body.append(external);external.focus();
 try{
  await act(async()=>root.render(<InboxList threads={[thread('SIM-return')]} restoreFocusThreadId="SIM-return" selectedThreadId={null} onSelectThread={()=>{}} queueFilter="open" onQueueFilterChange={()=>{}} searchQuery="" onSearchQueryChange={()=>{}} activeChannel={null} isCollapsed={false} onToggleCollapse={()=>{}} isMobile/>));
  expect(document.activeElement).toBe(external);
 }finally{external.remove();}
});
