// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TemplatesPage} from '../pages/templates/TemplatesPage';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
vi.mock('../pages/templates/BroadcastTemplateDialog',()=>({BroadcastTemplateDialog:({isOpen}:any)=>isOpen?<div>SIM campaign opened</div>:null}));
vi.mock('../pages/templates/CreateTemplateDialog',()=>({CreateTemplateDialog:({onCreated}:any)=><button onClick={()=>void onCreated().catch(()=>{})}>SIM Atualizar modelos</button>}));
vi.mock('../pages/templates/TemplatesTable',()=>({TemplatesTable:({templates}:any)=><div>{templates.map((t:any)=>t.name).join(',')}</div>}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const session=(id='SIM-a')=>({activeWorkspace:{id,role:'owner'},token:'SIM-token'} as UseSessionReturn);
const deferred=()=>{let resolve!:(v:any)=>void,reject!:(e:Error)=>void;const promise=new Promise<any>((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}};
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('distinguishes initial loading, query failure and a confirmed empty list',async()=>{
 const request=deferred();vi.spyOn(apiClient,'getTemplates').mockReturnValueOnce(request.promise).mockResolvedValueOnce({templates:[]} as never);await act(async()=>root.render(<TemplatesPage session={session()}/>));
 expect(el.textContent).toContain('Modelos (carregando…)');expect(el.textContent).not.toContain('Todos (0)');expect(el.textContent).not.toContain('Nenhum modelo cadastrado');expect(el.textContent).not.toContain('indisponível');
 await act(async()=>request.reject(new Error('SIM consulta falhou')));expect(el.textContent).toContain('Modelos (consulta falhou)');expect(el.textContent).not.toContain('Todos (0)');
 await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Atualizar modelos')!.click());expect(el.textContent).toContain('Modelos cadastrados (0)');expect(el.textContent).toContain('Nenhum modelo cadastrado');
});
it('marks retained rows as updating and stale after a failed refresh',async()=>{
 const refresh=deferred();vi.spyOn(apiClient,'getTemplates').mockResolvedValueOnce({templates:[{id:'SIM-model',name:'SIM Modelo',category:'UTILITY',bodyText:'SIM body'}]} as never).mockReturnValueOnce(refresh.promise);
 await act(async()=>root.render(<TemplatesPage session={session()}/>));expect(el.textContent).toContain('Modelos cadastrados (1)');await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='SIM Atualizar modelos')!.click());expect(el.textContent).toContain('Atualizando modelos…');expect(el.textContent).toContain('SIM Modelo');
 await act(async()=>refresh.reject(new Error('SIM falha de atualização')));expect(el.textContent).toContain('pode estar desatualizada');expect(el.textContent).toContain('Modelos cadastrados (1)');expect(el.textContent).toContain('SIM Modelo');
});
it('does not carry a completed count into another company while it loads',async()=>{
 const pending=deferred();vi.spyOn(apiClient,'getTemplates').mockResolvedValueOnce({templates:[{id:'SIM-old',name:'SIM Antigo',category:'UTILITY',bodyText:'SIM'}]} as never).mockReturnValueOnce(pending.promise);
 await act(async()=>root.render(<TemplatesPage session={session()}/>));await act(async()=>root.render(<TemplatesPage session={session('SIM-b')}/>));expect(el.textContent).toContain('Modelos (carregando…)');expect(el.textContent).not.toContain('SIM Antigo');expect(el.textContent).not.toContain('Todos (1)');await act(async()=>pending.resolve({templates:[]}));
});

const roleSession=(role:string|undefined)=>({activeWorkspace:{id:'SIM-a',role},token:'SIM-token'} as UseSessionReturn);
const syncButton=()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Sincronizar modelos da Meta');
async function selectSyncChannel(){await act(async()=>{const select=el.querySelector('select')!;select.value='SIM-meta';select.dispatchEvent(new Event('change',{bubbles:true}));});}
it.each(['operator','manager','analyst','unknown',undefined])('keeps registered templates readable without offering privileged Meta sync to %s',async(role)=>{
 vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[{id:'SIM-model',name:'SIM Cadastrado',category:'UTILITY',bodyText:'SIM'}]} as never);const sync=vi.spyOn(apiClient,'syncMetaTemplates');
 await act(async()=>root.render(<TemplatesPage session={roleSession(role)}/>));
 expect(el.textContent).toContain('SIM Cadastrado');expect(el.textContent).toContain('Sincronizar modelos da Meta exige proprietário ou administrador');expect(syncButton()).toBeUndefined();expect(apiClient.getChannels).not.toHaveBeenCalled();expect(sync).not.toHaveBeenCalled();
});
it.each(['owner','admin'])('allows %s to explicitly synchronize a selected connected channel',async(role)=>{
 vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[{id:'SIM-meta',displayName:'SIM Meta',provider:'meta_waba',status:'connected',isActive:true}]} as never);const sync=vi.spyOn(apiClient,'syncMetaTemplates').mockResolvedValue({imported:2} as never);
 await act(async()=>root.render(<TemplatesPage session={roleSession(role)}/>));expect(syncButton()!.disabled).toBe(true);expect(sync).not.toHaveBeenCalled();await selectSyncChannel();await act(async()=>syncButton()!.click());
 expect(sync).toHaveBeenCalledExactlyOnceWith('SIM-a','SIM-meta',{token:'SIM-token'});expect(el.textContent).toContain('2 modelos consultados na Meta');
});
it('discards a pending sync outcome after access changes without refreshing the new scope',async()=>{
 const pending=deferred();const templates=vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[{id:'SIM-meta',displayName:'SIM Meta',provider:'meta_waba',status:'connected',isActive:true}]} as never);const sync=vi.spyOn(apiClient,'syncMetaTemplates').mockReturnValue(pending.promise);
 await act(async()=>root.render(<TemplatesPage session={roleSession('owner')}/>));await selectSyncChannel();await act(async()=>syncButton()!.click());expect(sync).toHaveBeenCalledOnce();
 await act(async()=>root.render(<TemplatesPage session={roleSession('operator')}/>));expect(syncButton()).toBeUndefined();const reads=templates.mock.calls.length;
 await act(async()=>pending.resolve({imported:99}));expect(el.textContent).not.toContain('99 modelos');expect(templates).toHaveBeenCalledTimes(reads);
});
it('discards an old channel response after demotion and requires a fresh selection when access returns',async()=>{
 vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);const old=deferred();vi.mocked(apiClient.getChannels).mockReturnValueOnce(old.promise).mockResolvedValueOnce({channels:[{id:'SIM-new',displayName:'SIM Atual',provider:'meta_waba',status:'connected',isActive:true}]} as never);
 await act(async()=>root.render(<TemplatesPage session={roleSession('owner')}/>));await act(async()=>root.render(<TemplatesPage session={roleSession('operator')}/>));await act(async()=>old.resolve({channels:[{id:'SIM-old',displayName:'SIM Antigo',provider:'meta_waba',status:'connected',isActive:true}]}));expect(el.textContent).not.toContain('SIM Antigo');
 await act(async()=>root.render(<TemplatesPage session={roleSession('admin')}/>));expect(el.textContent).toContain('SIM Atual');expect(el.textContent).not.toContain('SIM Antigo');expect(syncButton()!.disabled).toBe(true);
});

it('refreshes registered models without synchronizing Meta and keeps the confirmed list on failure',async()=>{
 const pending=deferred();const query=vi.spyOn(apiClient,'getTemplates').mockResolvedValueOnce({templates:[{id:'SIM-model',name:'SIM Existente',category:'UTILITY',bodyText:'SIM'}]} as never).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({templates:[]} as never);
 const sync=vi.spyOn(apiClient,'syncMetaTemplates');await act(async()=>root.render(<TemplatesPage session={roleSession('operator')}/>));
 const refresh=()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Atualizar modelos')!;
 await act(async()=>refresh().click());expect(refresh().disabled).toBe(true);expect(el.textContent).toContain('SIM Existente');expect(el.textContent).toContain('Atualizando modelos');
 await act(async()=>pending.reject(new Error('SIM refresh unavailable')));expect(el.textContent).toContain('SIM Existente');expect(refresh().disabled).toBe(false);
 await act(async()=>refresh().click());expect(query).toHaveBeenCalledTimes(3);expect(sync).not.toHaveBeenCalled();expect(apiClient.getChannels).not.toHaveBeenCalled();expect(el.textContent).toContain('Nenhum modelo cadastrado');
});

it('waits for confirmed session before querying or opening a requested campaign',async()=>{
 const query=vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);
 const base=roleSession('owner');
 await act(async()=>root.render(<TemplatesPage session={{...base,isLoadingMe:true} as UseSessionReturn} broadcastRequest={1}/>));
 expect(el.textContent).toContain('Conferindo acesso');expect(el.textContent).not.toContain('Nenhum modelo cadastrado');expect(el.querySelector('button')).toBeNull();expect(query).not.toHaveBeenCalled();expect(apiClient.getChannels).not.toHaveBeenCalled();expect(el.textContent).not.toContain('SIM campaign opened');
 await act(async()=>root.render(<TemplatesPage session={base} broadcastRequest={1}/>));expect(query).toHaveBeenCalledTimes(1);expect(apiClient.getChannels).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('SIM campaign opened');
 await act(async()=>root.render(<TemplatesPage session={{token:'SIM-token'} as UseSessionReturn}/>));expect(el.textContent).toContain('Selecione uma empresa');expect(el.textContent).not.toContain('Nenhum modelo cadastrado');
 await act(async()=>root.render(<TemplatesPage session={{activeWorkspace:base.activeWorkspace} as UseSessionReturn}/>));expect(el.textContent).toContain('Acesso não confirmado');expect(query).toHaveBeenCalledTimes(1);
});

it('discards a model response from before session reconfirmation',async()=>{
 const old=deferred();const query=vi.spyOn(apiClient,'getTemplates').mockReturnValueOnce(old.promise).mockResolvedValueOnce({templates:[]} as never);const base=roleSession('owner');
 await act(async()=>root.render(<TemplatesPage session={base}/>));await act(async()=>root.render(<TemplatesPage session={{...base,isLoadingWorkspace:true} as UseSessionReturn}/>));
 await act(async()=>old.resolve({templates:[{id:'SIM-old',name:'SIM stale session',category:'UTILITY',bodyText:'SIM'}]}));expect(el.textContent).not.toContain('SIM stale session');expect(el.textContent).toContain('Conferindo acesso');
 await act(async()=>root.render(<TemplatesPage session={base}/>));expect(query).toHaveBeenCalledTimes(2);expect(el.textContent).not.toContain('SIM stale session');expect(el.textContent).toContain('Nenhum modelo cadastrado');
});
