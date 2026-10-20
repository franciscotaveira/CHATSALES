import {productPriceInput,productPriceLabel} from '../pages/products/product-price';
import {ProductsTable} from '../pages/products/ProductsTable';
import {productMatchesSearch} from '../pages/products/product-status';
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ContactsPage } from "../pages/ContactsPage";
import { CreateProductDialog } from "../pages/products/CreateProductDialog";
import { ProductsPage } from "../pages/products/ProductsPage";
import { NewOpportunityDialog } from "../pages/opportunities/NewOpportunityDialog";
import { OpportunitiesPage } from "../pages/opportunities/OpportunitiesPage";
import { apiClient, type ContactSummary } from "../services/api-client";
import type { UseSessionReturn } from "../hooks/useSession";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
const session = (id: string) => ({ activeWorkspace: { id,role:"owner" }, token: "synthetic" }) as UseSessionReturn;
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
const deferred = <T,>() => { let resolve!: (v:T)=>void; const promise = new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; };
async function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async()=>{
    Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value')!.set!.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
beforeEach(()=>{vi.useFakeTimers();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.useRealTimers();});
async function load() { await act(async()=>{await vi.advanceTimersByTimeAsync(300);}); }
describe('Contact recovery and catalog form',()=>{
  it('rejects a late contact response from the previous company',async()=>{
    const old=deferred<never>();
    vi.spyOn(apiClient,'getContacts').mockReturnValueOnce(old.promise).mockResolvedValue({contacts:[]} as never);
    await act(async()=>root.render(<ContactsPage session={session('old')}/>));await load();
    await act(async()=>root.render(<ContactsPage session={session('new')}/>));await load();
    await act(async()=>old.resolve({contacts:[{id:'old',name:'Cliente de outra empresa',phoneE164:'+5511999999999',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]} as never));
    expect(container.textContent).not.toContain('Cliente de outra empresa');
  });
  it('shows query failure instead of empty success and allows retry',async()=>{
    vi.spyOn(apiClient,'getContacts').mockRejectedValueOnce(new Error('Falha de consulta')).mockResolvedValue({contacts:[]} as never);
    await act(async()=>root.render(<ContactsPage session={session('a')}/>));await load();
    expect(container.textContent).toContain('Falha de consulta');expect(container.textContent).not.toContain('Nenhum contato encontrado');
    await act(async()=>button('Tentar novamente').click());
    expect(container.textContent).not.toContain('Falha de consulta');expect(container.textContent).toContain('Nenhum contato encontrado');
  });
  it('validates an incomplete country prefix before creating a contact',async()=>{
    vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);const create=vi.spyOn(apiClient,'createContact');
    await act(async()=>root.render(<ContactsPage session={session('a')}/>));await load();
    await act(async()=>button('Novo Contato').click());
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(create).not.toHaveBeenCalled();expect(document.body.textContent).toContain('código do país e DDD');
  });
  it('does not prefill a fabricated image and exposes the stock status',async()=>{
    await act(async()=>root.render(<CreateProductDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="a" token="synthetic"/>));
    expect(document.querySelector('img')).toBeNull();expect(document.body.textContent).toContain('Sem estoque');
    expect(document.querySelector('[aria-label="URL da imagem do produto"]')).not.toBeNull();
  });
  it('preserves product fields when saving fails',async()=>{
    vi.spyOn(apiClient,'createProduct').mockRejectedValue(new Error('Servidor indisponível'));
    const close=vi.fn();
    await act(async()=>root.render(<CreateProductDialog isOpen onClose={close} onCreated={()=>{}} workspaceId="a" token="synthetic"/>));
    const fields=Array.from(document.querySelectorAll('input'));
    await input(fields.find(x=>x.placeholder==='ex: MENSAL-VIP')!,'SIM-PRODUTO');
    await input(fields.find(x=>x.placeholder==='ex: Acesso Anual Plataforma SOS')!,'Produto simulado');
    await input(document.querySelector('textarea')!,'Descrição simulada');
    await input(document.querySelector('[aria-label="URL da imagem do produto"]')!,'https://example.com/product.png');
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(apiClient.createProduct).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
    expect(fields.find(x=>x.placeholder==='ex: Acesso Anual Plataforma SOS')!.value).toBe('Produto simulado');
    expect(document.body.textContent).toContain('Servidor indisponível');
  });
  it('requires a deliberate lead selection and preserves opportunity edits when contacts refresh',async()=>{
    const contacts=[{id:'lead',name:'Cliente simulado',phoneE164:'+5511999999999'}] as ContactSummary[];
    const props={isOpen:true,onClose:vi.fn(),onCreated:vi.fn(),workspaceId:'a',token:'synthetic',contacts,customStages:{lead:'Primeiro contato'}};
    await act(async()=>root.render(<NewOpportunityDialog {...props}/>));
    expect(document.querySelector('select')!.value).toBe('');
    expect(document.body.textContent).toContain('Primeiro contato');
    const title=document.querySelector<HTMLInputElement>('input[placeholder="Ex: Pacote mensal"]')!;
    await input(title,'Negociação simulada');
    await act(async()=>{
      const select=document.querySelector('select')!;select.value='lead';select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await act(async()=>root.render(<NewOpportunityDialog {...props} contacts={[...contacts]}/>));
    expect(title.value).toBe('Negociação simulada');expect(document.querySelector('select')!.value).toBe('lead');
  });
  it('does not replace the current company opportunities with a late response',async()=>{
    const old=deferred<never>();
    vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);
    vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);
    vi.spyOn(apiClient,'listJourneys').mockReturnValueOnce(old.promise).mockResolvedValue({items:[]} as never);
    await act(async()=>root.render(<OpportunitiesPage session={session('old')}/>));
    await act(async()=>root.render(<OpportunitiesPage session={session('new')}/>));
    await act(async()=>old.resolve({items:[{id:'old',contactId:'old',stage:'lead',title:'Negociação de outra empresa',createdAt:new Date().toISOString()}]} as never));
    expect(container.textContent).not.toContain('Negociação de outra empresa');
  });
  it('shows catalog errors with retry instead of suggesting the first product',async()=>{
    vi.spyOn(apiClient,'getProducts').mockRejectedValueOnce(new Error('Falha no catálogo')).mockResolvedValue({products:[]} as never);
    await act(async()=>root.render(<ProductsPage session={session('a')}/>));
    expect(container.textContent).toContain('Falha no catálogo');expect(container.textContent).not.toContain('Cadastrar Primeiro Produto');
    await act(async()=>button('Tentar novamente').click());
    expect(container.textContent).not.toContain('Falha no catálogo');expect(container.textContent).toContain('Cadastrar Primeiro Produto');
  });
  it('does not apply a drag result to another company',async()=>{
    const pending=deferred<never>();
    vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);
    vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);
    const createdAt='2026-10-01T12:00:00Z';
    vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[{id:'j-old',contactId:'old',stage:'lead',title:'SIMULADO antigo',createdAt,updatedAt:createdAt}]} as never);
    const move=vi.spyOn(apiClient,'updateJourneyStage').mockReturnValue(pending.promise);
    await act(async()=>root.render(<OpportunitiesPage session={session('old')}/>));
    const drop=()=>{const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{getData:()=> 'j-old'}});document.querySelector('section[aria-label="Qualificado"]')!.dispatchEvent(event);};
    await act(async()=>{drop();drop();});expect(move).toHaveBeenCalledTimes(1);
    vi.mocked(apiClient.listJourneys).mockResolvedValue({items:[{id:'j-new',contactId:'new',stage:'lead',title:'SIMULADO atual',createdAt}]} as never);
    await act(async()=>root.render(<OpportunitiesPage session={session('new')}/>));
    await act(async()=>pending.resolve({journey:{id:'j-old',stage:'qualified',title:'RESULTADO ANTIGO'}} as never));
    expect(container.textContent).toContain('SIMULADO atual');expect(container.textContent).not.toContain('RESULTADO ANTIGO');
  });

});

it('serializes opportunity creation and discards completion after reopening the dialog',async()=>{
 const pending=deferred<never>();const create=vi.spyOn(apiClient,'createJourney').mockReturnValue(pending.promise);const close=vi.fn(),created=vi.fn();const props={isOpen:true,onClose:close,onCreated:created,workspaceId:'SIM-a',token:'SIM-token',contacts:[{id:'SIM-contact',name:'SIM',phoneE164:'+55000000000'}] as ContactSummary[]};await act(async()=>root.render(<NewOpportunityDialog {...props}/>));await act(async()=>{const select=document.querySelector('select')!;select.value='SIM-contact';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(create).toHaveBeenCalledOnce();expect(document.querySelector('fieldset')!.disabled).toBe(true);await act(async()=>root.render(<NewOpportunityDialog {...props} isOpen={false}/>));await act(async()=>root.render(<NewOpportunityDialog {...props}/>));await act(async()=>pending.resolve({journey:{id:'SIM-old'}} as never));expect(close).not.toHaveBeenCalled();expect(created).not.toHaveBeenCalled();expect(document.querySelector('select')!.value).toBe('');expect(button('Criar Oportunidade').disabled).toBe(false);
});
it('does not create a duplicate opportunity after the list refresh fails',async()=>{
 const create=vi.spyOn(apiClient,'createJourney').mockResolvedValue({journey:{id:'SIM-created'}} as never);await act(async()=>root.render(<NewOpportunityDialog isOpen onClose={()=>{}} onCreated={async()=>{throw new Error('SIM refresh failed');}} workspaceId="SIM-a" token="SIM-token" contacts={[{id:'SIM-contact',phoneE164:'+55000000000'}] as ContactSummary[]}/>));await act(async()=>{const select=document.querySelector('select')!;select.value='SIM-contact';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(document.body.textContent).toContain('Oportunidade criada, mas');expect(button('Oportunidade criada').disabled).toBe(true);expect(button('Cancelar').disabled).toBe(false);await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledOnce();
});

it('labels partial stage estimates and distinguishes missing estimates from confirmed zero',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[{id:'SIM-zero',contactId:'SIM-contact',stage:'lead',estimatedValueCents:0,createdAt:'2026-10-17T12:00:00Z'},{id:'SIM-missing',contactId:'SIM-contact',stage:'lead',estimatedValueCents:null,createdAt:'2026-10-17T12:00:00Z'},{id:'SIM-unknown',contactId:'SIM-contact',stage:'qualified',estimatedValueCents:null,createdAt:'2026-10-17T12:00:00Z'}]} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));expect(document.body.textContent).toMatch(/Subtotal informado: R\$\s*0,00/);expect(document.body.textContent).toContain('1 oportunidade(s) sem valor informado válido');expect(document.body.textContent).toContain('Estimativa não informada');
});

it('keeps a confirmed creation visible when the real opportunity page cannot refresh its list',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[{id:'SIM-contact',name:'SIM contact',phoneE164:'+55000000000'}]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);vi.spyOn(apiClient,'listJourneys').mockResolvedValueOnce({items:[]} as never).mockRejectedValue(new Error('SIM refresh list unavailable'));const create=vi.spyOn(apiClient,'createJourney').mockResolvedValue({journey:{id:'SIM-created'}} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));await act(async()=>button('Nova Oportunidade').click());await act(async()=>{const select=document.querySelector('[role=dialog] select') as HTMLSelectElement;select.value='SIM-contact';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>document.querySelector('[role=dialog] form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(document.querySelector('[role=dialog]')?.textContent).toContain('Oportunidade criada, mas não foi possível atualizar a lista');expect(button('Oportunidade criada').disabled).toBe(true);await act(async()=>document.querySelector('[role=dialog] form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledOnce();await act(async()=>button('Cancelar').click());expect(document.querySelector('[role=dialog]')).toBeNull();expect(container.textContent).toContain('SIM refresh list unavailable');
});

it('keeps a stage-name failure visible through a successful journey refresh and recovers independently',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[]} as never);const stages=vi.spyOn(apiClient,'getStageLabels').mockRejectedValueOnce(new Error('SIM labels unavailable')).mockResolvedValueOnce({labels:{lead:'SIM revised lead'},version:1});await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));expect(container.textContent).toContain('SIM labels unavailable');expect(container.textContent).toContain('Nenhuma oportunidade ainda');await act(async()=>button('Atualizar').click());expect(container.textContent).toContain('SIM labels unavailable');expect(stages).toHaveBeenCalledOnce();await act(async()=>button('Consultar nomes das etapas novamente').click());expect(container.textContent).not.toContain('SIM labels unavailable');expect(stages).toHaveBeenCalledTimes(2);
});

it('loads additional opportunity pages without losing previous cards after a page failure',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);const item=(id:string)=>({id,contactId:'SIM-contact',title:id,stage:'lead',createdAt:'2026-10-17T12:00:00Z'});const cursor={updatedAt:'2026-10-17T12:00:00.123456Z',id:'SIM-cursor'};const query=vi.spyOn(apiClient,'listJourneys').mockResolvedValueOnce({items:[item('SIM-first')],total:1,pagination:{hasMore:true,nextCursor:cursor}} as never).mockRejectedValueOnce(new Error('SIM more unavailable')).mockResolvedValueOnce({items:[item('SIM-first'),item('SIM-older')],total:2,pagination:{hasMore:false,nextCursor:null}} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));await act(async()=>button('Carregar mais oportunidades').click());expect(container.textContent).toContain('SIM-first');expect(container.textContent).toContain('SIM more unavailable');await act(async()=>button('Carregar mais oportunidades').click());expect(query).toHaveBeenLastCalledWith('SIM-a',{limit:100,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id},{token:'synthetic'});expect(container.textContent).toContain('SIM-older');expect(container.querySelectorAll('article')).toHaveLength(2);expect(button('Carregar mais oportunidades')).toBeUndefined();
});

it('resolves a paged journey contact outside the initial contact list and lets local search find its name',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);const cursor={updatedAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'};vi.spyOn(apiClient,'listJourneys').mockResolvedValueOnce({items:[],total:0,pagination:{hasMore:true,nextCursor:cursor}} as never).mockResolvedValueOnce({items:[{id:'SIM-older',contactId:'SIM-old-contact',stage:'lead',title:'SIM negotiation',createdAt:'2026-10-17T12:00:00Z'}],total:1,contacts:[{id:'SIM-old-contact',name:'SIM oldest customer',phoneE164:'+55000000090',metadata:{isRecurring:true}}],pagination:{hasMore:false,nextCursor:null}} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));await act(async()=>button('Carregar mais oportunidades').click());expect(container.textContent).toContain('SIM oldest customer');expect(container.textContent).toContain('Recorrência informada');await input(container.querySelector<HTMLInputElement>('input[aria-label="Buscar oportunidades por lead, telefone ou serviço"]')!,'oldest customer');expect(container.querySelector('article')?.textContent).toContain('SIM negotiation');
});

it('searches the company for a contact not loaded in the initial opportunity selector without choosing it automatically',async()=>{
 const query=vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[{id:'SIM-found',name:'SIM distant customer',phoneE164:'+55000000009'}],total:1} as never);const create=vi.spyOn(apiClient,'createJourney').mockResolvedValue({id:'SIM-new'} as never);await act(async()=>root.render(<NewOpportunityDialog isOpen workspaceId="SIM-a" token="SIM-token" contacts={[]} onClose={()=>{}} onCreated={()=>{}}/>));await input(document.querySelector<HTMLInputElement>('input[placeholder="Nome ou telefone"]')!,'distant');await act(async()=>{button('Buscar contatos').click();button('Buscar contatos').click();});expect(query).toHaveBeenCalledOnce();expect(query).toHaveBeenCalledWith('SIM-a',{search:'distant',limit:100},{token:'SIM-token'});expect(document.querySelector('select')!.value).toBe('');expect(document.body.textContent).toContain('SIM distant customer');await act(async()=>{const select=document.querySelector('select')!;select.value='SIM-found';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledWith('SIM-a',expect.objectContaining({contactId:'SIM-found'}),{token:'SIM-token'});
});
it('ignores a contact search result after reopening the opportunity form in another company',async()=>{
 const old=deferred<never>();vi.spyOn(apiClient,'getContacts').mockReturnValue(old.promise);const props={isOpen:true,workspaceId:'SIM-a',token:'SIM-token',contacts:[],onClose:()=>{},onCreated:()=>{}};await act(async()=>root.render(<NewOpportunityDialog {...props}/>));await input(document.querySelector<HTMLInputElement>('input[placeholder="Nome ou telefone"]')!,'SIM old');await act(async()=>button('Buscar contatos').click());await act(async()=>root.render(<NewOpportunityDialog {...props} workspaceId="SIM-b"/>));await act(async()=>old.resolve({contacts:[{id:'SIM-old',name:'SIM old result',phoneE164:'+55000000001'}],total:1} as never));expect(document.body.textContent).not.toContain('SIM old result');expect(document.querySelector<HTMLInputElement>('input[placeholder="Nome ou telefone"]')!.value).toBe('');
});

it('applies opportunity search explicitly on the server and keeps it on subsequent pages',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);const cursor={updatedAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'};const query=vi.spyOn(apiClient,'listJourneys').mockResolvedValueOnce({items:[],total:0} as never).mockResolvedValueOnce({items:[],total:0,pagination:{hasMore:true,nextCursor:cursor}} as never).mockResolvedValueOnce({items:[],total:0,pagination:{hasMore:false,nextCursor:null}} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));await input(container.querySelector<HTMLInputElement>('input[aria-label="Buscar oportunidades por lead, telefone ou serviço"]')!,'SIM needle');expect(query).toHaveBeenCalledOnce();await act(async()=>button('Buscar oportunidades').click());expect(query).toHaveBeenLastCalledWith('SIM-a',{limit:100,search:'SIM needle'},{token:'synthetic'});expect(container.textContent).toContain('Nenhuma oportunidade com estes filtros');await act(async()=>button('Carregar mais oportunidades').click());expect(query).toHaveBeenLastCalledWith('SIM-a',{limit:100,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id,search:'SIM needle'},{token:'synthetic'});
});

it('does not invalidate a pending stage-name query when applying a search',async()=>{
 const stages=deferred<never>();vi.spyOn(apiClient,'getStageLabels').mockReturnValue(stages.promise);vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[],total:0} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));await input(container.querySelector<HTMLInputElement>('input[aria-label="Buscar oportunidades por lead, telefone ou serviço"]')!,'SIM search');await act(async()=>button('Buscar oportunidades').click());await act(async()=>stages.resolve({labels:{lead:'SIM custom stage'},version:1} as never));expect(container.textContent).not.toContain('Consultando os nomes das etapas');await act(async()=>button('Nova Oportunidade').click());expect(document.querySelector('[role=dialog]')?.textContent).toContain('SIM custom stage');
});


it('queries opportunity filters on the server and preserves them while loading more',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);const cursor={updatedAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'};const query=vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[],pagination:{hasMore:true,nextCursor:cursor}} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));
 for(const [label,value] of [['perfil do cliente','recurring'],['valor estimado','has_value'],['data','7d']] as const)await act(async()=>{const select=container.querySelector<HTMLSelectElement>(`select[aria-label="Filtrar oportunidades por ${label}"]`)!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(query).toHaveBeenLastCalledWith('SIM-a',{limit:100,profile:'recurring',value:'has_value',period:'7d'},{token:'synthetic'});expect(container.textContent).toContain('Nenhuma oportunidade com estes filtros');await act(async()=>button('Carregar mais oportunidades').click());expect(query).toHaveBeenLastCalledWith('SIM-a',{limit:100,profile:'recurring',value:'has_value',period:'7d',beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id},{token:'synthetic'});
});


it('allows analysts to consult opportunities without forbidden contact queries or editing controls',async()=>{
 const contacts=vi.spyOn(apiClient,'getContacts');const labels=vi.spyOn(apiClient,'getStageLabels');vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[{id:'SIM-view',contactId:'SIM-private',title:'SIM visible deal',stage:'lead',status:'open',estimatedValueCents:100,createdAt:'2026-10-17',updatedAt:'2026-10-17'}]} as never);const current={...session('SIM-a'),activeWorkspace:{id:'SIM-a',role:'analyst'}} as UseSessionReturn;await act(async()=>root.render(<OpportunitiesPage session={current}/>));expect(contacts).not.toHaveBeenCalled();expect(labels).not.toHaveBeenCalled();expect(container.textContent).toContain('SIM visible deal');expect(container.textContent).not.toContain('Nova Oportunidade');expect(container.textContent).not.toContain('Personalizar Estágios');expect(container.querySelector<HTMLSelectElement>('select[aria-label="Filtrar oportunidades por perfil do cliente"]')!.disabled).toBe(true);expect(container.querySelector('article')!.getAttribute('draggable')).toBe('false');await act(async()=>container.querySelector<HTMLElement>('article')!.click());expect(document.body.textContent).toContain('Somente consulta.');expect(button('Salvar etapa').disabled).toBe(true);expect(button('Marcar ganho').disabled).toBe(true);
});
it('keeps permitted opportunities visible when the optional contact lookup fails',async()=>{
 vi.spyOn(apiClient,'getContacts').mockRejectedValue(new Error('SIM contact lookup failed'));vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{}} as never);vi.spyOn(apiClient,'listJourneys').mockResolvedValue({items:[{id:'SIM-view',contactId:'SIM-contact',title:'SIM deal preserved',stage:'lead',status:'open',estimatedValueCents:100,createdAt:'2026-10-17',updatedAt:'2026-10-17'}],contacts:[{id:'SIM-contact',name:'SIM linked name',phoneE164:'+55000000001'}]} as never);await act(async()=>root.render(<OpportunitiesPage session={session('SIM-a')}/>));expect(container.textContent).toContain('SIM deal preserved');expect(container.textContent).toContain('SIM linked name');expect(container.textContent).toContain('Não foi possível atualizar os contatos');expect(container.textContent).not.toContain('Falha ao carregar oportunidades.');
});


it('loads more contacts with the same query and keeps loaded records after a page failure',async()=>{
 const cursor={updatedAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'};const contact={optOut:false,id:'SIM-one',name:'SIM first contact',phoneE164:'+55000000001',metadata:{},createdAt:'2026-10-17',updatedAt:'2026-10-17'};const query=vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce({contacts:[contact],total:1,pagination:{hasMore:true,nextCursor:cursor}} as never).mockRejectedValueOnce(new Error('SIM page unavailable')).mockResolvedValueOnce({contacts:[{...contact,id:'SIM-two',name:'SIM older contact'}],total:1,pagination:{hasMore:false,nextCursor:null}} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();await act(async()=>button('Carregar mais contatos').click());expect(container.textContent).toContain('SIM first contact');expect(container.textContent).toContain('SIM page unavailable');await act(async()=>button('Carregar mais contatos').click());expect(query).toHaveBeenLastCalledWith('SIM-a',{search:undefined,status:'active',limit:100,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id},{token:'synthetic'});expect(container.textContent).toContain('SIM older contact');expect(container.textContent).toContain('SIM first contact');
});
it('discards a delayed contact page after switching company',async()=>{
 const old=deferred<never>(),cursor={updatedAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'};vi.spyOn(apiClient,'getContacts').mockResolvedValueOnce({contacts:[],pagination:{hasMore:true,nextCursor:cursor}} as never).mockReturnValueOnce(old.promise).mockResolvedValueOnce({contacts:[]} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();await act(async()=>button('Carregar mais contatos').click());await act(async()=>root.render(<ContactsPage session={session('SIM-b')}/>));await load();await act(async()=>old.resolve({contacts:[{id:'SIM-old',name:'SIM foreign old contact',phoneE164:'+55000000000'}]} as never));expect(container.textContent).not.toContain('SIM foreign old contact');expect(container.textContent).not.toContain('Carregando mais contatos');
});


it('renders incompatible contact metadata safely and preserves untouched fields when saving another change',async()=>{
 const contact={optOut:false,id:'SIM-legacy',name:'SIM legacy customer',phoneE164:'+55000000001',metadata:{company:{legacy:'SIM'},email:'valid@example.invalid',tags:'SIM old tags',notes:{text:'SIM old note'}},createdAt:'2026-10-17',updatedAt:'2026-10-17'};vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const update=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();expect(container.textContent).toContain('Empresa precisa de revisão');await act(async()=>container.querySelector<HTMLElement>('tr[role="button"]')!.click());expect(document.body.textContent).toContain('Dado precisa de revisão');await act(async()=>button('Editar dados').click());await input(document.querySelector<HTMLInputElement>('input[value="SIM legacy customer"]')!,'SIM revised name');await act(async()=>button('Salvar').click());const payload=update.mock.calls[0]![2];expect(payload.name).toBe('SIM revised name');expect(payload).toEqual({name:'SIM revised name'});
});
it('saves only deliberately corrected incompatible metadata fields',async()=>{
 const contact={optOut:false,id:'SIM-legacy',name:'SIM legacy customer',phoneE164:'+55000000001',metadata:{tags:['vip',7],company:8},createdAt:'2026-10-17',updatedAt:'2026-10-17'};vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const update=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();await act(async()=>container.querySelector<HTMLElement>('tr[role="button"]')!.click());await act(async()=>button('Editar dados').click());const tagInput=Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(el=>el.id&&document.querySelector(`label[for="${el.id}"]`)?.textContent?.includes('Etiquetas'))!;await input(tagInput,'vip, revisado');await act(async()=>button('Salvar').click());expect(update.mock.calls[0]![2].metadata).toEqual({tags:['vip','revisado']});
});


it('preserves a malformed metadata container and still allows saving the contact name',async()=>{
 const contact={optOut:false,id:'SIM-malformed',name:'SIM malformed customer',phoneE164:'+55000000001',metadata:[{company:'SIM preserved raw'}],createdAt:'2026-10-17',updatedAt:'2026-10-17'};vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact]} as never);const update=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();await act(async()=>container.querySelector<HTMLElement>('tr[role="button"]')!.click());expect(document.body.textContent).toContain('precisam de revisão técnica');await act(async()=>button('Editar dados').click());await input(document.querySelector<HTMLInputElement>('input[value="SIM malformed customer"]')!,'SIM corrected name');expect(document.querySelector('textarea')!.disabled).toBe(true);await act(async()=>button('Salvar').click());expect(update.mock.calls[0]![2]).toEqual({name:'SIM corrected name'});
});


it('shows an unknown product status explicitly instead of declaring it inactive',async()=>{
 const product={id:'SIM-unknown',title:'SIM legacy product',retailerId:'SIM-LEGACY',category:'SIM category',status:'LEGACY_UNKNOWN',priceFormatted:'R$ 10,00',imageUrl:''};await act(async()=>root.render(<ProductsTable products={[product as never]} onEdit={()=>{}}/>));expect(container.textContent).toContain('Status não reconhecido');expect(container.textContent).not.toContain('Inativo');
});
it('trims catalog search and tolerates missing text fields without fabricating matches',()=>{
 expect(productMatchesSearch({title:'SIM produto',retailerId:null,category:undefined},'  produto  ')).toBe(true);expect(productMatchesSearch({title:null,retailerId:undefined,category:7},'7')).toBe(false);expect(productMatchesSearch({title:null},'  ')).toBe(true);
});
it('requires a valid deliberate status before updating a product with an unknown status',async()=>{
 const product={id:'SIM-unknown',title:'SIM legacy product',retailerId:'SIM-LEGACY',description:'SIM description',category:'Geral',priceCents:1000,imageUrl:'https://example.invalid/sim.png',status:'LEGACY_UNKNOWN'};const update=vi.spyOn(apiClient,'createProduct').mockResolvedValue({product} as never);await act(async()=>root.render(<CreateProductDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="SIM-a" token="synthetic" product={product as never}/>));await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Escolha um status válido antes de salvar');const active=Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]')).find(el=>el.textContent==='Ativo')!;await act(async()=>active.click());await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).toHaveBeenCalledWith('SIM-a',expect.objectContaining({status:'ACTIVE',expectedProductId:'SIM-unknown'}),{token:'synthetic'});
});


it('distinguishes a valid free product from missing or invalid catalogue prices',()=>{
 expect(productPriceInput(0)).toBe('0,00');for(const value of [null,undefined,'100',-1,1.5,NaN,Infinity,2147483648]){expect(productPriceInput(value)).toBe('');expect(productPriceLabel(value,'BRL')).toBe('Preço indisponível');}expect(productPriceLabel(100,'BRL')).toContain('1,00');expect(productPriceLabel(100,null)).toBe('Preço indisponível');
});
it('does not present a malformed catalogue price as free even if a stale formatted label says zero',async()=>{
 const product={id:'SIM-price',title:'SIM missing price',retailerId:'SIM-PRICE',category:'Geral',status:'INACTIVE',priceCents:null,currency:'BRL',priceFormatted:'R$ 0,00',imageUrl:''};await act(async()=>root.render(<ProductsTable products={[product as never]} onEdit={()=>{}}/>));expect(container.textContent).toContain('Preço indisponível');expect(container.textContent).not.toContain('R$ 0,00');
});
it('requires an explicit replacement for a missing product price before saving',async()=>{
 const product={id:'SIM-price',title:'SIM missing price',retailerId:'SIM-PRICE',description:'SIM description',category:'Geral',priceCents:null,currency:'BRL',imageUrl:'https://example.invalid/sim.png',status:'INACTIVE'};const save=vi.spyOn(apiClient,'createProduct').mockResolvedValue({product} as never);await act(async()=>root.render(<CreateProductDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="SIM-a" token="synthetic" product={product as never}/>));const price=document.querySelector<HTMLInputElement>('input[placeholder="0,00"]')!;expect(price.value).toBe('');await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Informe um preço válido');await input(price,'0,00');await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).toHaveBeenCalledWith('SIM-a',expect.objectContaining({priceCents:0,expectedProductId:'SIM-price'}),{token:'synthetic'});
});

it('creates a reviewed opportunity with its conversation-bound contact and stage',async()=>{const create=vi.spyOn(apiClient,'createJourney').mockResolvedValue({id:'SIM-new'} as never);await act(async()=>root.render(<NewOpportunityDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="SIM-a" token="synthetic" contacts={[{id:'SIM-bound',name:'SIM known contact',phoneE164:'+55000000001'} as never]} thread={{id:'SIM-thread',contactId:'SIM-bound'}} initialStage="qualified"/>));expect(document.querySelector<HTMLSelectElement>('select')!.value).toBe('SIM-bound');expect(document.querySelector<HTMLSelectElement>('select')!.disabled).toBe(true);expect(document.body.textContent).not.toContain('Buscar contatos');await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledWith('SIM-a',expect.objectContaining({contactId:'SIM-bound',threadId:'SIM-thread',stage:'qualified'}),{token:'synthetic'});});

it('offers only open stages when creating an opportunity even with a terminal initial intent',async()=>{await act(async()=>root.render(<NewOpportunityDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="SIM-a" token="synthetic" contacts={[]} initialStage="won"/>));const stage=document.querySelectorAll<HTMLSelectElement>('select')[1]!;expect(stage.value).toBe('proposal');expect(Array.from(stage.options).map(option=>option.value)).toEqual(['lead','qualified','proposal','scheduled']);});


it('preserves and focuses an estimated value above the storage limit before any create request',async()=>{
 const create=vi.spyOn(apiClient,'createJourney').mockResolvedValue({journey:{id:'SIM-boundary'}} as never);
 await act(async()=>root.render(<NewOpportunityDialog isOpen onClose={()=>{}} onCreated={()=>{}} workspaceId="SIM-a" token="SIM-token" contacts={[{id:'SIM-contact',phoneE164:'+55000000000'}] as ContactSummary[]}/>));
 await act(async()=>{const select=document.querySelector('select')!;select.value='SIM-contact';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const amount=document.querySelector<HTMLInputElement>('input[placeholder="1.500,00"]')!;
 await input(amount,'21.474.836,48');await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(create).not.toHaveBeenCalled();expect(amount.value).toBe('21.474.836,48');expect(document.activeElement).toBe(amount);expect(document.body.textContent).toContain('até R$ 21.474.836,47');
 await input(amount,'21.474.836,47');await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(create).toHaveBeenCalledOnce();expect(create).toHaveBeenCalledWith('SIM-a',expect.objectContaining({estimatedValueCents:2147483647}),{token:'SIM-token'});
});


it('distinguishes an incomplete main contacts response from a valid empty list',async()=>{
 vi.spyOn(apiClient,'getContacts').mockResolvedValue({} as never);await act(async()=>root.render(<ContactsPage session={session('SIM-a')}/>));await load();expect(document.body.textContent).toContain('A consulta não confirmou uma lista válida de contatos');expect(document.body.textContent).not.toContain('Nenhum contato encontrado');
});
it('distinguishes an incomplete main products response from a valid empty catalog',async()=>{
 vi.spyOn(apiClient,'getProducts').mockResolvedValue({} as never);await act(async()=>root.render(<ProductsPage session={session('SIM-a')}/>));expect(document.body.textContent).toContain('A consulta não confirmou uma lista válida de produtos');expect(document.body.textContent).not.toContain('Nenhum produto cadastrado');
});
