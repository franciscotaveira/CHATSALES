// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ContactsPage} from '../pages/ContactsPage';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const contact={id:'SIM-contact',name:'SIM confirmado',phoneE164:'+5511999999999',optOut:false,metadata:{},updatedAt:'2026-10-18T12:00:00Z'};
const cursor={updatedAt:contact.updatedAt,id:contact.id};
const button=(text:string)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent===text)!;
beforeEach(()=>{vi.useFakeTimers();el=document.createElement('div');document.body.append(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();vi.useRealTimers();});
async function render(){await act(async()=>root.render(<ContactsPage session={{activeWorkspace:{id:'SIM-ws'},token:'SIM-token'} as UseSessionReturn}/>));await act(async()=>vi.advanceTimersByTimeAsync(300));}
it('rejects a repeated contact cursor without adding the unconfirmed page',async()=>{
 const query=vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce({contacts:[contact],pagination:{hasMore:true,nextCursor:cursor}} as never).mockResolvedValueOnce({contacts:[{...contact,id:'SIM-invalid',name:'SIM invalid page'}],pagination:{hasMore:true,nextCursor:cursor}} as never);
 await render();await act(async()=>button('Carregar mais contatos').click());expect(el.textContent).toContain('continuação válida');expect(el.textContent).toContain('SIM confirmado');expect(el.textContent).not.toContain('SIM invalid page');expect(button('Carregar mais contatos').disabled).toBe(true);await act(async()=>button('Carregar mais contatos').click());expect(query).toHaveBeenCalledTimes(2);
});
it('preserves a confirmed page and allows retry after a temporary page failure',async()=>{
 const query=vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce({contacts:[contact],pagination:{hasMore:true,nextCursor:cursor}} as never).mockRejectedValueOnce(new Error('SIM page unavailable')).mockResolvedValueOnce({contacts:[{...contact,id:'SIM-older',name:'SIM older'}],pagination:{hasMore:false,nextCursor:null}} as never);
 await render();await act(async()=>button('Carregar mais contatos').click());expect(el.textContent).toContain('registros anteriores foram preservados');expect(button('Carregar mais contatos').disabled).toBe(false);await act(async()=>button('Carregar mais contatos').click());expect(query).toHaveBeenCalledTimes(3);expect(el.textContent).toContain('SIM older');
});

it('identifies retained contacts while a new search is still being confirmed',async()=>{
 let resolve!:(value:never)=>void;vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce({contacts:[contact]} as never).mockReturnValueOnce(new Promise<never>(r=>resolve=r));await render();
 const field=el.querySelector('input[aria-label="Buscar contatos por telefone ou nome"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM outra busca');field.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>vi.advanceTimersByTimeAsync(300));
 expect(el.textContent).toContain('podem não corresponder aos novos filtros');expect(el.textContent).toContain('SIM confirmado');expect(el.textContent).not.toContain('Nenhum contato encontrado');
 await act(async()=>resolve({contacts:[]} as never));expect(el.textContent).toContain('Nenhum contato encontrado');expect(el.textContent).not.toContain('podem não corresponder');
});

it('refreshes the whole opened contact range and preserves it after a later-page failure',async()=>{
 const first={contacts:[contact],pagination:{hasMore:true,nextCursor:cursor}},last={contacts:[{...contact,id:'SIM-older',name:'SIM older'}],pagination:{hasMore:false,nextCursor:null}};
 const query=vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce(first as never).mockResolvedValueOnce(last as never).mockResolvedValueOnce({...first,contacts:[{...contact,name:'SIM partial replacement'}]} as never).mockRejectedValueOnce(new Error('SIM second refresh failed')).mockResolvedValueOnce(first as never).mockResolvedValueOnce(last as never);
 await render();await act(async()=>button('Carregar mais contatos').click());await act(async()=>button('Atualizar contatos').click());expect(el.textContent).toContain('SIM confirmado');expect(el.textContent).toContain('SIM older');expect(el.textContent).not.toContain('SIM partial replacement');expect(el.textContent).toContain('SIM second refresh failed');
 await act(async()=>button('Atualizar contatos').click());expect(query).toHaveBeenCalledTimes(6);expect(el.textContent).toContain('2 contatos carregados');expect(el.textContent).not.toContain('SIM second refresh failed');
});

it('does not report an empty contact list or offer mutations before session confirmation',async()=>{
 const query=vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);
 const base={activeWorkspace:{id:'SIM-ws'},token:'SIM-token'};
 await act(async()=>root.render(<ContactsPage session={{...base,isLoadingWorkspace:true} as UseSessionReturn}/>));
 await act(async()=>vi.advanceTimersByTimeAsync(300));expect(query).not.toHaveBeenCalled();expect(el.textContent).toContain('Conferindo acesso');expect(el.textContent).not.toContain('Nenhum contato encontrado');expect(button('Novo Contato')).toBeUndefined();
 await act(async()=>root.render(<ContactsPage session={base as UseSessionReturn}/>));await act(async()=>vi.advanceTimersByTimeAsync(300));expect(query).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('Nenhum contato encontrado');
 await act(async()=>root.render(<ContactsPage session={{token:'SIM-token'} as UseSessionReturn}/>));await act(async()=>vi.advanceTimersByTimeAsync(300));expect(query).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('Selecione uma empresa');expect(el.textContent).not.toContain('Nenhum contato encontrado');
 await act(async()=>root.render(<ContactsPage session={{activeWorkspace:base.activeWorkspace} as UseSessionReturn}/>));await act(async()=>vi.advanceTimersByTimeAsync(300));expect(query).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('Acesso não confirmado');
});


it.each([[null],[{...contact,optOut:undefined}],[{...contact,phoneE164:{}}],[contact,contact]].map(contacts=>({contacts})))("rejects unconfirmed contact identity and commercial preference",async response=>{vi.spyOn(apiClient,"getContacts").mockResolvedValue(response as never);await render();expect(el.textContent).toContain("identidade ou preferência comercial não confirmada");expect(el.textContent).not.toContain("Nenhum contato encontrado");expect(el.querySelector("tr[role=button]")).toBeNull();});
it("preserves contacts when an older page lacks a commercial preference",async()=>{vi.spyOn(apiClient,"getContacts").mockResolvedValueOnce({contacts:[contact],pagination:{hasMore:true,nextCursor:cursor}} as never).mockResolvedValueOnce({contacts:[{...contact,id:"SIM-unconfirmed",optOut:undefined}]} as never);await render();await act(async()=>button("Carregar mais contatos").click());expect(el.textContent).toContain("SIM confirmado");expect(el.textContent).toContain("identidade ou preferência comercial não confirmada");expect(el.textContent).not.toContain("SIM-unconfirmed");});
