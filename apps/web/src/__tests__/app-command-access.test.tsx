// @vitest-environment happy-dom
import {act,useRef} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {useDiscardChanges,UnsavedChangesNotice} from '../pages/UnsavedChangesNotice';import type {CommandItem} from '@sos-sales/ui';
const state=vi.hoisted(()=>{Object.defineProperty(globalThis,"__CHAT_SALES_LAB__",{value:false,configurable:true});return {session:null as any,items:[] as any[],nav:[] as any[],cockpitMounted:0,settingsWorkspace:null as any,displayRole:undefined as string|undefined,headerLoading:false,dirty:false,selectWorkspace:null as any,logout:null as any,create:null as any,createProps:null as any,settingsInstance:null as any};});
vi.mock('../hooks/useSession',()=>({useSession:()=>state.session}));vi.mock('../hooks/useConnectivity',()=>({useConnectivity:()=>({status:'connected',checkNow:vi.fn()})}));
vi.mock('../components/CreateWorkspaceModal',()=>({CreateWorkspaceModal:(props:any)=>{state.createProps=props;return props.isOpen?<div>SIM criação de empresa</div>:null;}}));
vi.mock('../pages/LoginPage',()=>({LoginPage:()=> <div>SIM Login</div>}));
vi.mock('../pages/CockpitPage',()=>({CockpitPage:()=>{state.cockpitMounted++;return <div>SIM Inbox</div>;}}));
vi.mock('../pages/SettingsPage',()=>({SettingsPage:({session}:any)=>{state.settingsWorkspace=session.activeWorkspace;const instance=useRef(Symbol());state.settingsInstance=instance.current;const guard=useDiscardChanges(state.dirty,session.activeWorkspace?.id??'SIM-none',undefined,true);return <div>SIM Settings{guard.isPending&&<UnsavedChangesNotice onKeep={guard.keepEditing} onDiscard={guard.discard}/>}</div>}}));vi.mock('../pages/TemplatesPage',()=>({TemplatesPage:()=> <div>SIM Templates</div>}));vi.mock('../pages/ProductsPage',()=>({ProductsPage:()=> <div>SIM Products</div>}));
vi.mock('@sos-sales/ui',async original=>({...await original<typeof import('@sos-sales/ui')>(),AppShell:({children,navItems,userRole,isLoadingWorkspaces,onWorkspaceSelect,onLogout,onCreateWorkspaceClick}:any)=>{state.selectWorkspace=onWorkspaceSelect;state.logout=onLogout;state.create=onCreateWorkspaceClick;state.nav=navItems;state.displayRole=userRole;state.headerLoading=isLoadingWorkspaces;return <div>{children}</div>},CommandPalette:({items}:any)=>{state.items=items;return null;}}));
import {App} from '../App';
import {apiClient} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
function session(role:string,id='SIM-a'){return {token:'SIM-token',activeWorkspace:{id,name:'SIM company',role},workspaces:[{id,name:'SIM company',role},{id:'SIM-owner-elsewhere',name:'SIM other company',role:'owner'}],user:{id:'SIM-user',email:'SIM@example.invalid',activeRole:role},refreshSession:vi.fn(),refreshWorkspace:vi.fn(),selectWorkspace:vi.fn(),logout:vi.fn(),error:null};}
beforeEach(()=>{state.dirty=false;state.cockpitMounted=0;localStorage.setItem('sos_sales_auth_token','SIM-token');window.history.replaceState({},'','/settings');state.session=session('owner');el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
it('removes unauthorized actions and rejects a stale callback after access changes',async()=>{
 await act(async()=>root.render(<App/>));const old=state.items.find((x:CommandItem)=>x.id==='act-new-broadcast')!;expect(old).toBeTruthy();state.session=session('analyst');await act(async()=>root.render(<App/>));expect(state.items.some((x:CommandItem)=>x.id==='act-new-broadcast')).toBe(false);expect(state.items.some((x:CommandItem)=>x.id==='act-whatsapp-instances')).toBe(false);expect(state.items.some((x:CommandItem)=>x.id==='act-create-workspace')).toBe(true);
 await act(async()=>old.onSelect());expect(window.location.pathname).toBe('/settings');expect(el.textContent).not.toContain('SIM Templates');
});
it('rejects callbacks from an earlier A to B to A context and removes unsupported shortcuts',async()=>{
 await act(async()=>root.render(<App/>));const old=state.items.find((x:CommandItem)=>x.id==='act-new-product')!;expect(state.items.some((x:CommandItem)=>x.shortcut)).toBe(false);
 state.session=session('owner','SIM-b');await act(async()=>root.render(<App/>));state.session=session('owner','SIM-a');await act(async()=>root.render(<App/>));await act(async()=>old.onSelect());expect(window.location.pathname).toBe('/settings');expect(el.textContent).not.toContain('SIM Products');
});

it('does not mount an unauthorized direct page and keeps the settings exit',async()=>{
 window.history.replaceState({},'','/');state.session=session('analyst');await act(async()=>root.render(<App/>));expect(state.cockpitMounted).toBe(0);expect(el.textContent).toContain('Seu perfil não tem acesso');expect(state.nav.map(x=>x.id)).toEqual(['oportunidades','settings']);expect(state.items.some(x=>x.id==='nav-cockpit')).toBe(false);
 await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Abrir configurações')!.click());expect(el.textContent).toContain('SIM Settings');
});
it('does not mount a cached owner page until the current profile check finishes',async()=>{
 window.history.replaceState({},'','/');state.session={...session('owner'),isLoadingMe:true};await act(async()=>root.render(<App/>));expect(state.cockpitMounted).toBe(0);expect(el.textContent).toContain('Conferindo seu acesso');state.session={...session('owner'),isLoadingMe:false};await act(async()=>root.render(<App/>));expect(state.cockpitMounted).toBeGreaterThan(0);expect(el.textContent).toContain('SIM Inbox');
});
it('keeps settings available without a company role',async()=>{
 state.session={...session('analyst'),activeWorkspace:null};await act(async()=>root.render(<App/>));expect(el.textContent).toContain('SIM Settings');expect(state.nav.map(x=>x.id)).toEqual(['settings']);
});

it('does not mount a cached owner page after the profile check fails and offers retry',async()=>{
 window.history.replaceState({},'','/');state.session={...session('owner'),error:{type:'network',detail:'SIM failure'}};await act(async()=>root.render(<App/>));expect(state.cockpitMounted).toBe(0);expect(el.textContent).toContain('Não foi possível confirmar seu acesso');await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Tentar novamente')!.click());expect(state.session.refreshSession).toHaveBeenCalledOnce();expect(state.items.some(x=>x.id==='act-new-broadcast')).toBe(false);
});

it('keeps settings personal while a cached company role is being verified',async()=>{
 state.session={...session('owner'),isLoadingMe:true};await act(async()=>root.render(<App/>));expect(el.textContent).toContain('SIM Settings');expect(state.settingsWorkspace).toBeNull();expect(state.nav.map(x=>x.id)).toEqual(['settings']);state.session={...session('owner'),isLoadingMe:false};await act(async()=>root.render(<App/>));expect(state.settingsWorkspace?.id).toBe('SIM-a');
});

it('shows the role of the active company instead of the account default in the header',async()=>{
 state.session={...session('operator'),user:{...session('operator').user,activeRole:'owner'}};await act(async()=>root.render(<App/>));expect(state.displayRole).toBe('operator');state.session={...state.session,isLoadingWorkspace:true};await act(async()=>root.render(<App/>));expect(state.displayRole).toBeUndefined();expect(state.headerLoading).toBe(true);
});

it('keeps the page and URL until unsaved changes are explicitly discarded during command navigation',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));
 const navigate=()=>state.items.find(x=>x.id==='nav-produtos').onSelect();
 await act(async()=>navigate());expect(window.location.pathname).toBe('/settings');expect(el.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();
 await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Continuar editando')!.click());expect(window.location.pathname).toBe('/settings');expect(el.textContent).toContain('SIM Settings');
 await act(async()=>navigate());await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!.click());
 expect(window.location.pathname).toBe('/produtos');expect(el.textContent).toContain('SIM Products');
});

it('reviews workspace changes from the header and palette before touching the session',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));const select=state.session.selectWorkspace;
 await act(async()=>state.selectWorkspace({id:'SIM-owner-elsewhere'}));expect(select).not.toHaveBeenCalled();expect(state.settingsWorkspace.id).toBe('SIM-a');
 await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Continuar editando')!.click());expect(select).not.toHaveBeenCalled();
 await act(async()=>state.items.find(x=>x.id==='ws-SIM-owner-elsewhere').onSelect());expect(select).not.toHaveBeenCalled();await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!.click());expect(select).toHaveBeenCalledExactlyOnceWith('SIM-owner-elsewhere');
});
it('ignores a removed workspace and a stale confirmation after the current role changes',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));const select=state.session.selectWorkspace;
 await act(async()=>state.selectWorkspace({id:'SIM-owner-elsewhere'}));state.session={...state.session,workspaces:[state.session.workspaces[0]]};await act(async()=>root.render(<App/>));await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!.click());expect(select).not.toHaveBeenCalled();
 state.session={...session('owner'),selectWorkspace:select};await act(async()=>root.render(<App/>));await act(async()=>state.selectWorkspace({id:'SIM-owner-elsewhere'}));const oldDiscard=Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!;state.session={...state.session,activeWorkspace:{...state.session.activeWorkspace,role:'manager'}};await act(async()=>root.render(<App/>));expect(oldDiscard.isConnected).toBe(false);expect(el.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();await act(async()=>oldDiscard.click());expect(select).not.toHaveBeenCalled();
});
it('does not reload the current workspace, rejects unlisted targets and serializes repeated selection',async()=>{
 let finish!:()=>void;state.session.selectWorkspace=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));await act(async()=>root.render(<App/>));const select=state.session.selectWorkspace;
 await act(async()=>{state.selectWorkspace({id:'SIM-a'});state.selectWorkspace({id:'SIM-unlisted'});});expect(select).not.toHaveBeenCalled();
 await act(async()=>{state.selectWorkspace({id:'SIM-owner-elsewhere'});state.selectWorkspace({id:'SIM-owner-elsewhere'});});expect(select).toHaveBeenCalledOnce();await act(async()=>finish());
});
it('shows an unexpected switch failure without reporting another company as selected',async()=>{
 state.session.selectWorkspace.mockRejectedValue(new Error('SIM falha ao trocar de empresa'));await act(async()=>root.render(<App/>));await act(async()=>state.selectWorkspace({id:'SIM-owner-elsewhere'}));expect(el.textContent).toContain('SIM falha ao trocar de empresa');expect(state.settingsWorkspace.id).toBe('SIM-a');
});

it('does not let an earlier switch completion unlock a different destination still loading',async()=>{
 let finishFirst!:()=>void,finishSecond!:()=>void;
 state.session.workspaces.push({id:'SIM-c',name:'SIM third company',role:'owner'});
 state.session.selectWorkspace.mockImplementationOnce(()=>new Promise<void>(r=>{finishFirst=r;})).mockImplementationOnce(()=>new Promise<void>(r=>{finishSecond=r;}));
 await act(async()=>root.render(<App/>));const select=state.session.selectWorkspace;
 await act(async()=>{state.selectWorkspace({id:'SIM-owner-elsewhere'});state.selectWorkspace({id:'SIM-c'});});expect(select).toHaveBeenCalledTimes(2);
 await act(async()=>finishFirst());await act(async()=>state.selectWorkspace({id:'SIM-c'}));expect(select).toHaveBeenCalledTimes(2);await act(async()=>finishSecond());
});

it('reviews a voluntary logout from header and palette before clearing authentication',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));const logout=state.session.logout;
 await act(async()=>state.logout());expect(logout).not.toHaveBeenCalled();expect(localStorage.getItem('sos_sales_auth_token')).toBe('SIM-token');
 await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Continuar editando')!.click());expect(logout).not.toHaveBeenCalled();expect(el.textContent).toContain('SIM Settings');
 await act(async()=>state.items.find(x=>x.id==='act-logout').onSelect());expect(logout).not.toHaveBeenCalled();await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!.click());expect(logout).toHaveBeenCalledOnce();expect(localStorage.getItem('sos_sales_auth_token')).toBeNull();expect(el.textContent).toContain('SIM Login');
});
it('does not log out twice for repeated input when there is no draft',async()=>{
 await act(async()=>root.render(<App/>));const logout=state.session.logout,action=state.logout;
 await act(async()=>{action();action();});expect(logout).toHaveBeenCalledOnce();expect(el.textContent).toContain('SIM Login');
});
it('invalidates a pending logout when access changes instead of allowing the old confirmation to run',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));const logout=state.session.logout;await act(async()=>state.logout());const oldDiscard=Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!;
 state.session={...state.session,activeWorkspace:{...state.session.activeWorkspace,role:'manager'}};await act(async()=>root.render(<App/>));expect(oldDiscard.isConnected).toBe(false);await act(async()=>oldDiscard.click());expect(logout).not.toHaveBeenCalled();expect(localStorage.getItem('sos_sales_auth_token')).toBe('SIM-token');
});

it('reviews an existing draft before opening company creation and remounts the discarded editor',async()=>{
 state.dirty=true;await act(async()=>root.render(<App/>));const instance=state.settingsInstance;
 await act(async()=>state.create());expect(state.createProps.isOpen).toBe(false);await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Continuar editando')!.click());expect(state.settingsInstance).toBe(instance);
 await act(async()=>state.items.find(x=>x.id==='act-create-workspace').onSelect());await act(async()=>Array.from(el.querySelectorAll('button')).find(x=>x.textContent==='Descartar alterações')!.click());expect(state.createProps.isOpen).toBe(true);expect(state.settingsInstance).not.toBe(instance);
});
it('keeps the creation dialogue open through access verification while entering an authorized created company',async()=>{
 vi.spyOn(apiClient,'getMe').mockResolvedValue({user:state.session.user,workspaces:state.session.workspaces} as never);
 let finish!:()=>void;state.session.refreshSession.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));
 await act(async()=>root.render(<App/>));await act(async()=>state.create());let entering!:Promise<void>;await act(async()=>{entering=state.createProps.onCreated('SIM-owner-elsewhere');});expect(state.session.refreshSession).toHaveBeenCalledOnce();
 state.session={...state.session,isLoadingMe:true};await act(async()=>root.render(<App/>));expect(state.createProps.isOpen).toBe(true);expect(state.createProps.accessPending).toBe(true);
 state.session={...state.session,isLoadingMe:false};await act(async()=>{root.render(<App/>);finish();await entering;});expect(state.session.selectWorkspace).toHaveBeenCalledExactlyOnceWith('SIM-owner-elsewhere',{throwOnError:true});expect(state.createProps.isOpen).toBe(true);
});
it('keeps the confirmed creation available instead of entering a company missing from verified memberships',async()=>{
 vi.spyOn(apiClient,'getMe').mockResolvedValue({user:state.session.user,workspaces:state.session.workspaces} as never);await act(async()=>root.render(<App/>));await act(async()=>state.create());let failure:any;
 await act(async()=>{await state.createProps.onCreated('SIM-created-for-someone-else').catch((e:unknown)=>{failure=e;});});expect(failure.message).toContain('seu acesso a ela não foi confirmado');expect(state.createProps.isOpen).toBe(true);expect(state.session.refreshSession).not.toHaveBeenCalled();expect(state.session.selectWorkspace).not.toHaveBeenCalled();
});
it('does not switch companies after the creation context was abandoned during verification',async()=>{
 let finish!:(v:any)=>void;vi.spyOn(apiClient,'getMe').mockReturnValue(new Promise(r=>{finish=r;}));await act(async()=>root.render(<App/>));await act(async()=>state.create());let entering!:Promise<void>;await act(async()=>{entering=state.createProps.onCreated('SIM-owner-elsewhere');});
 await act(async()=>state.items.find(x=>x.id==='nav-produtos').onSelect());expect(state.createProps.isOpen).toBe(false);await act(async()=>{finish({user:state.session.user,workspaces:state.session.workspaces});await entering;});expect(state.session.refreshSession).not.toHaveBeenCalled();expect(state.session.selectWorkspace).not.toHaveBeenCalled();
});

it('does not enter a created company using memberships returned for a different identity',async()=>{
 vi.spyOn(apiClient,'getMe').mockResolvedValue({user:{...state.session.user,id:'SIM-another-user'},workspaces:state.session.workspaces} as never);await act(async()=>root.render(<App/>));await act(async()=>state.create());let failure:any;
 await act(async()=>{await state.createProps.onCreated('SIM-owner-elsewhere').catch((e:unknown)=>{failure=e;});});expect(failure.message).toContain('Sua identidade não foi confirmada');expect(state.session.refreshSession).not.toHaveBeenCalled();expect(state.session.selectWorkspace).not.toHaveBeenCalled();expect(state.createProps.isOpen).toBe(true);
});
