// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ProductsPage} from '../pages/products/ProductsPage';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
const bp=vi.hoisted(()=>({mobile:false}));vi.mock('@sos-sales/ui',async original=>({...await original<typeof import('@sos-sales/ui')>(),useBreakpoint:()=>({isMobile:bp.mobile})}));
vi.mock('../pages/products/CreateProductDialog',()=>({CreateProductDialog:({isOpen}:any)=>isOpen?<div aria-label="SIM editor de produto">SIM editor aberto</div>:null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const session=(id='SIM-a',role='owner')=>({activeWorkspace:{id,role},token:'SIM-token'} as UseSessionReturn);
const product=(title='SIM Produto')=>({id:'SIM-product',title,retailerId:'SIM-SKU',category:'SIM categoria',priceCents:123,currency:'BRL',status:'ACTIVE'});
const button=(label:string)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
const deferred=()=>{let resolve!:(v:any)=>void,reject!:(e:Error)=>void;const promise=new Promise<any>((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject};};
beforeEach(()=>{bp.mobile=false;el=document.createElement('div');document.body.append(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('does not display confirmed zero counts before a successful catalog query',async()=>{
 const pending=deferred();vi.spyOn(apiClient,'getProducts').mockReturnValueOnce(pending.promise).mockResolvedValueOnce({products:[]} as never);await act(async()=>root.render(<ProductsPage session={session()}/>));expect(el.textContent).toContain('Todos (consultando…)');expect(el.textContent).not.toContain('Todos (0)');expect(el.textContent).not.toContain('Nenhum produto cadastrado');expect(el.querySelector('time')).toBeNull();await act(async()=>pending.reject(new Error('SIM consulta falhou')));expect(el.textContent).toContain('Todos (consulta pendente)');expect(el.textContent).not.toContain('Nenhum produto cadastrado');await act(async()=>button('Tentar novamente').click());expect(el.textContent).toContain('Todos (0)');expect(el.textContent).toContain('Nenhum produto cadastrado');expect(el.querySelector('time')).not.toBeNull();
});
it('labels retained records and counts as updating or stale and recovers on retry',async()=>{
 const pending=deferred();vi.spyOn(apiClient,'getProducts').mockResolvedValueOnce({products:[product()]} as never).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({products:[product('SIM Produto atualizado')]} as never);await act(async()=>root.render(<ProductsPage session={session()}/>));const time=el.querySelector('time')!.dateTime;await act(async()=>button('Atualizar catálogo').click());expect(el.textContent).toContain('Atualizando catálogo');expect(el.textContent).toContain('SIM Produto');expect(el.textContent).toContain('Todos (1)');await act(async()=>pending.reject(new Error('SIM falha temporária')));expect(el.textContent).toContain('podem estar desatualizados');expect(el.querySelector('time')!.dateTime).toBe(time);expect(button('Atualizar catálogo').disabled).toBe(false);await act(async()=>button('Atualizar catálogo').click());expect(el.textContent).not.toContain('podem estar desatualizados');expect(el.textContent).toContain('SIM Produto atualizado');
});
it('clears counts and records immediately on company change and ignores the old response',async()=>{
 const old=deferred(),current=deferred();vi.spyOn(apiClient,'getProducts').mockResolvedValueOnce({products:[product()]} as never).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);await act(async()=>root.render(<ProductsPage session={session()}/>));await act(async()=>button('Atualizar catálogo').click());await act(async()=>root.render(<ProductsPage session={session('SIM-b')}/>));expect(el.textContent).not.toContain('SIM Produto');expect(el.textContent).not.toContain('Todos (1)');expect(el.querySelector('time')).toBeNull();await act(async()=>old.resolve({products:[product('SIM antigo')]}));expect(el.textContent).not.toContain('SIM antigo');await act(async()=>current.resolve({products:[]}));expect(el.textContent).toContain('Todos (0)');
});
it('closes the product editor when the role changes within the same company',async()=>{
 vi.spyOn(apiClient,'getProducts').mockResolvedValue({products:[]} as never);await act(async()=>root.render(<ProductsPage session={session()}/>));await act(async()=>button('Novo Produto').click());expect(el.textContent).toContain('SIM editor aberto');await act(async()=>root.render(<ProductsPage session={session('SIM-a','operator')}/>));expect(el.textContent).not.toContain('SIM editor aberto');
});
it('uses unconfirmed counts in the mobile filter until the query completes',async()=>{
 bp.mobile=true;const pending=deferred();vi.spyOn(apiClient,'getProducts').mockReturnValue(pending.promise);await act(async()=>root.render(<ProductsPage session={session()}/>));expect(el.querySelector('select')!.textContent).toContain('Todos (consultando…)');expect(el.querySelector('select')!.textContent).not.toContain('(0)');await act(async()=>pending.resolve({products:[product()]}));expect(el.querySelector('select')!.textContent).toContain('Todos (1)');
});

it('waits for confirmed access before querying or opening the requested product editor',async()=>{
 const query=vi.spyOn(apiClient,'getProducts').mockResolvedValue({products:[]} as never);const base=session();
 await act(async()=>root.render(<ProductsPage session={{...base,isLoadingWorkspace:true} as UseSessionReturn} createRequest={1}/>));expect(query).not.toHaveBeenCalled();expect(el.textContent).toContain('Conferindo acesso');expect(el.textContent).not.toContain('SIM editor aberto');expect(el.querySelector('button')).toBeNull();
 await act(async()=>root.render(<ProductsPage session={base} createRequest={1}/>));expect(query).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('SIM editor aberto');
 await act(async()=>root.render(<ProductsPage session={{token:'SIM-token'} as UseSessionReturn}/>));expect(el.textContent).toContain('Selecione uma empresa');expect(el.textContent).not.toContain('Nenhum produto cadastrado');
 await act(async()=>root.render(<ProductsPage session={{activeWorkspace:base.activeWorkspace} as UseSessionReturn}/>));expect(el.textContent).toContain('Acesso não confirmado');expect(query).toHaveBeenCalledTimes(1);
});
it('does not publish a catalog response started before access reconfirmation',async()=>{
 const old=deferred();const query=vi.spyOn(apiClient,'getProducts').mockReturnValueOnce(old.promise).mockResolvedValueOnce({products:[]} as never);const base=session();
 await act(async()=>root.render(<ProductsPage session={base}/>));await act(async()=>root.render(<ProductsPage session={{...base,isLoadingMe:true} as UseSessionReturn}/>));await act(async()=>old.resolve({products:[product('SIM resposta antiga')]}));expect(el.textContent).toContain('Conferindo acesso');expect(el.textContent).not.toContain('SIM resposta antiga');
 await act(async()=>root.render(<ProductsPage session={base}/>));expect(query).toHaveBeenCalledTimes(2);expect(el.textContent).toContain('Nenhum produto cadastrado');expect(el.textContent).not.toContain('SIM resposta antiga');
});


it.each([[null],[{...product(),title:{}}],[{...product(),id:""}],[product(),product()]].map(products=>({products})))("rejects malformed product rows before publishing confirmed counts",async ({products})=>{vi.spyOn(apiClient,"getProducts").mockResolvedValue({products} as never);await act(async()=>root.render(<ProductsPage session={session()}/>));expect(el.textContent).toContain("produtos incompletos ou com identificadores repetidos");expect(el.querySelector("time")).toBeNull();expect(el.textContent).not.toContain("Nenhum produto cadastrado");});
it("preserves the previous catalog and consultation time after invalid rows",async()=>{vi.spyOn(apiClient,"getProducts").mockResolvedValueOnce({products:[product()]} as never).mockResolvedValueOnce({products:[null]} as never);await act(async()=>root.render(<ProductsPage session={session()}/>));const time=el.querySelector("time")!.dateTime;await act(async()=>button("Atualizar catálogo").click());expect(el.textContent).toContain("SIM Produto");expect(el.textContent).toContain("podem estar desatualizados");expect(el.querySelector("time")!.dateTime).toBe(time);});
