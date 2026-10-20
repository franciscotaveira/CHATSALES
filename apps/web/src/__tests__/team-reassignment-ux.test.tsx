// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TeamReassignmentQueue} from '../pages/settings/TeamReassignmentQueue';import {apiClient} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const item={id:'SIM-item',kind:'task' as const,title:'SIM pendência',threadId:'SIM-thread',contactName:'SIM cliente',changedAt:'2026-10-17T12:00:00Z'},member={id:'SIM-member',userId:'SIM-user',name:'SIM operador',email:'sim@example.invalid',role:'operator' as const,joinedAt:'2026-10-17T12:00:00Z'};
const panel=(ws='SIM-ws')=><TeamReassignmentQueue workspaceId={ws} token="SIM-token" members={[member]} reloadKey={0}/>;
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===name)!;
it.each([false,true])('restores keyboard refresh focus without stealing another control: moved=%s',async(moved)=>{
 let resolve!:(v:{items:typeof item[];nextCursor:null})=>void;
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:null}).mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 await act(async()=>root.render(panel()));const refresh=button('Atualizar pendências');refresh.focus();await act(async()=>refresh.click());refresh.blur();
 const other=document.createElement('button');document.body.appendChild(other);if(moved)other.focus();
 await act(async()=>resolve({items:[item],nextCursor:null}));expect(document.activeElement).toBe(moved?other:refresh);other.remove();
});
it.each([
 {items:[{...item,title:{invalid:true}}],nextCursor:null},
 {items:[{...item,kind:'unknown'}],nextCursor:null},
 {items:[{...item,changedAt:'invalid'}],nextCursor:null},
 {items:[{...item,contactName:42}],nextCursor:null},
 {items:[item,item],nextCursor:null},
 {items:[item],nextCursor:undefined},
 {items:[item],nextCursor:42},
 {items:[],nextCursor:'SIM-next'},
])('preserves the confirmed queue and blocks assignment after malformed page %j',async(invalid)=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:null}).mockResolvedValueOnce(invalid as never).mockResolvedValue({items:[item],nextCursor:null});
 await act(async()=>root.render(panel()));await act(async()=>{const select=el.querySelector('select')!;select.value=member.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('Atualizar pendências').click());expect(el.querySelectorAll('article')).toHaveLength(1);expect(el.querySelector('[role="alert"]')).not.toBeNull();expect(button('Atribuir responsável').disabled).toBe(true);
 await act(async()=>button('Atualizar pendências').click());expect(button('Atribuir responsável').disabled).toBe(false);expect(el.querySelector('[role="alert"]')).toBeNull();
});
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('requires an explicit current member choice and removes assigned work without completing it',async()=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValue({items:[item],nextCursor:null});const assign=vi.spyOn(apiClient,'assignTeamPendingWork').mockResolvedValue({success:true});await act(async()=>root.render(panel()));expect(button('Atribuir responsável').disabled).toBe(true);await act(async()=>{const select=el.querySelector('select')!;select.value='SIM-user';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Atribuir responsável').click());expect(assign.mock.calls[0]?.[1]).toEqual({id:'SIM-item',kind:'task',assigneeUserId:'SIM-user'});expect(el.querySelector('article')).toBeNull();expect(el.textContent).toContain('Nenhuma mensagem foi enviada');
});
it('keeps an assignment conflict visible and lets the user refresh instead of stealing the work',async()=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:null}).mockResolvedValue({items:[],nextCursor:null});vi.spyOn(apiClient,'assignTeamPendingWork').mockRejectedValue(new Error('SIM já atribuída'));await act(async()=>root.render(panel()));await act(async()=>{const select=el.querySelector('select')!;select.value='SIM-user';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Atribuir responsável').click());expect(el.querySelector('[role="alert"]')?.textContent).toContain('SIM já atribuída');expect(el.querySelector('article')).not.toBeNull();await act(async()=>button('Atualizar pendências').click());expect(el.querySelector('article')).toBeNull();
});
it('loads previous pages without duplicate work and ignores an old company response',async()=>{
 const get=vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:'SIM-cursor'}).mockResolvedValueOnce({items:[item,{...item,id:'SIM-other'}],nextCursor:null});await act(async()=>root.render(panel()));await act(async()=>button('Carregar pendências anteriores').click());expect(get.mock.calls[1]?.[1]).toBe('SIM-cursor');expect(el.querySelectorAll('article')).toHaveLength(2);
 let resolve!:(v:never)=>void;get.mockReturnValueOnce(new Promise<never>(r=>{resolve=r;})).mockResolvedValue({items:[],nextCursor:null});await act(async()=>button('Atualizar pendências').click());await act(async()=>root.render(panel('SIM-new')));await act(async()=>resolve({items:[item],nextCursor:null} as never));expect(el.querySelector('article')).toBeNull();
});

it('keeps unloaded pending pages explicit after assigning the final loaded item',async()=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:'SIM-next'}).mockResolvedValue({items:[{...item,id:'SIM-older'}],nextCursor:null});vi.spyOn(apiClient,'assignTeamPendingWork').mockResolvedValue({success:true});
 await act(async()=>root.render(panel()));await act(async()=>{const select=el.querySelector('select')!;select.value=member.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Atribuir responsável').click());
 expect(el.textContent).toContain('Ainda há páginas anteriores');expect(el.textContent).not.toContain('Nenhuma pendência sem responsável nesta consulta.');await act(async()=>button('Carregar pendências anteriores').click());expect(el.querySelectorAll('article')).toHaveLength(1);
});
it('blocks assignment while the team list is unconfirmed even with a previous selection',async()=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValue({items:[item],nextCursor:null});const assign=vi.spyOn(apiClient,'assignTeamPendingWork');
 await act(async()=>root.render(panel()));await act(async()=>{const select=el.querySelector('select')!;select.value=member.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>root.render(<TeamReassignmentQueue workspaceId="SIM-ws" token="SIM-token" members={[member]} reloadKey={0} membersReady={false}/>));
 expect(el.textContent).toContain('lista da equipe ainda não foi confirmada');expect(el.querySelector('select')!.disabled).toBe(true);expect(button('Atribuir responsável').disabled).toBe(true);
 await act(async()=>button('Atribuir responsável').click());expect(assign).not.toHaveBeenCalled();
});
it('distinguishes a confirmed team with no eligible operators from an unconfirmed list',async()=>{
 vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValue({items:[item],nextCursor:null});await act(async()=>root.render(<TeamReassignmentQueue workspaceId="SIM-ws" token="SIM-token" members={[]} reloadKey={0} membersReady/>));expect(el.textContent).toContain('Nenhum integrante com acesso operacional');expect(el.textContent).not.toContain('lista da equipe ainda não foi confirmada');
});

it('preserves selected work but blocks assignment after failed refresh until a valid query',async()=>{
 const query=vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:null}).mockRejectedValueOnce(new Error('SIM query failed')).mockResolvedValue({items:[item],nextCursor:null});const assign=vi.spyOn(apiClient,'assignTeamPendingWork');
 await act(async()=>root.render(panel()));await act(async()=>{const select=el.querySelector('select')!;select.value=member.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('Atualizar pendências').click());expect(el.querySelector('article')).not.toBeNull();expect(button('Atribuir responsável').disabled).toBe(true);expect(el.textContent).toContain('última consulta concluída');
 await act(async()=>button('Atribuir responsável').click());expect(assign).not.toHaveBeenCalled();await act(async()=>button('Atualizar pendências').click());expect(button('Atribuir responsável').disabled).toBe(false);expect(query).toHaveBeenCalledTimes(3);
});
it('rejects a looping cursor without publishing unconfirmed work',async()=>{
 const query=vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce({items:[item],nextCursor:'SIM-next'}).mockResolvedValueOnce({items:[{...item,id:'SIM-invalid',title:'SIM invalid page'}],nextCursor:'SIM-next'});
 await act(async()=>root.render(panel()));await act(async()=>button('Carregar pendências anteriores').click());expect(el.textContent).toContain('continuação válida');expect(el.textContent).not.toContain('SIM invalid page');expect(button('Carregar pendências anteriores').disabled).toBe(true);await act(async()=>button('Carregar pendências anteriores').click());expect(query).toHaveBeenCalledTimes(2);
});

it('refreshes the full opened range atomically and keeps it after a later-page failure',async()=>{
 const first={items:[item],nextCursor:'SIM-next'},last={items:[{...item,id:'SIM-old',title:'SIM older'}],nextCursor:null};
 const query=vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValueOnce(first).mockResolvedValueOnce(last).mockResolvedValueOnce({items:[{...item,title:'SIM partial replacement'}],nextCursor:'SIM-next'}).mockRejectedValueOnce(new Error('SIM refresh second failed')).mockResolvedValueOnce(first).mockResolvedValueOnce(last);
 await act(async()=>root.render(panel()));await act(async()=>button('Carregar pendências anteriores').click());expect(el.querySelectorAll('article')).toHaveLength(2);
 await act(async()=>button('Atualizar pendências').click());expect(el.textContent).toContain('SIM older');expect(el.textContent).toContain('SIM pendência');expect(el.textContent).not.toContain('SIM partial replacement');expect(el.textContent).toContain('SIM refresh second failed');
 await act(async()=>button('Atualizar pendências').click());expect(query).toHaveBeenCalledTimes(6);expect(el.querySelectorAll('article')).toHaveLength(2);expect(el.textContent).not.toContain('SIM refresh second failed');
});
