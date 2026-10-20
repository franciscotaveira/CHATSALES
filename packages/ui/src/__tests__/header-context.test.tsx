// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';import {Header} from '../components/AppShell/Header';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const wsA={id:'SIM-a',name:'SIM Empresa A',role:'owner'},wsB={id:'SIM-b',name:'SIM Empresa B',role:'operator'};
const userButton=()=>el.querySelector<HTMLButtonElement>('[aria-label="Menu do Usuário"]')!;
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('never defaults an unconfirmed role to owner',async()=>{
 await act(async()=>root.render(<Header activeWorkspace={wsA} userEmail="SIM@example.invalid"/>));await act(async()=>userButton().click());expect(el.textContent).toContain('Papel nesta empresa: Não confirmado');expect(el.textContent).not.toContain('Proprietário');
});
it('closes stale menus on context changes and shows the current company role',async()=>{
 await act(async()=>root.render(<Header activeWorkspace={wsA} userRole="owner"/>));await act(async()=>userButton().click());expect(el.textContent).toContain('Proprietário');await act(async()=>root.render(<Header activeWorkspace={wsB} userRole="operator"/>));expect(el.querySelector('[role=menu]')).toBeNull();await act(async()=>userButton().click());expect(el.textContent).toContain('Atendente');expect(el.textContent).not.toContain('Proprietário');
});
it('shows pending verification and distinguishes membership roles in the selector',async()=>{
 await act(async()=>root.render(<Header activeWorkspace={wsA} userRole="owner" isLoadingWorkspaces/>));await act(async()=>userButton().click());expect(el.textContent).toContain('Em conferência');expect(el.textContent).toContain('Conferindo empresa...');expect(el.textContent).not.toContain('Proprietário');
 await act(async()=>root.render(<Header activeWorkspace={wsB} workspaces={[wsA,wsB]} userRole="operator"/>));await act(async()=>el.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!.click());expect(el.querySelector('[aria-label="SIM Empresa A — Proprietário"]')).not.toBeNull();expect(el.querySelector('[aria-label="SIM Empresa B — Atendente"]')).not.toBeNull();
});
it('does not label a global owner as a company owner without a selected company',async()=>{
 await act(async()=>root.render(<Header userRole="owner"/>));await act(async()=>userButton().click());expect(el.textContent).toContain('Sem empresa selecionada');expect(el.textContent).not.toContain('Proprietário');
});

it('does not restart the current company when selecting it again',async()=>{
 const select=vi.fn();await act(async()=>root.render(<Header activeWorkspace={wsB} workspaces={[wsA,wsB]} userRole="operator" onWorkspaceSelect={select}/>));
 const open=()=>el.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;
 await act(async()=>open().click());await act(async()=>el.querySelector<HTMLButtonElement>('[aria-label="SIM Empresa B — Atendente"]')!.click());expect(select).not.toHaveBeenCalled();
 await act(async()=>open().click());await act(async()=>el.querySelector<HTMLButtonElement>('[aria-label="SIM Empresa A — Proprietário"]')!.click());expect(select).toHaveBeenCalledOnce();expect(select).toHaveBeenCalledWith(wsA);
});

async function key(target:Element,value:string){await act(async()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));}
it('opens with arrows, moves focus without selecting, and restores the trigger with Escape',async()=>{
 const select=vi.fn(),create=vi.fn();await act(async()=>root.render(<Header activeWorkspace={wsB} workspaces={[wsA,wsB]} userRole="operator" onWorkspaceSelect={select} onCreateWorkspaceClick={create}/>));
 const trigger=el.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;trigger.focus();await key(trigger,'ArrowDown');const options=Array.from(el.querySelectorAll('[role=option]'));expect(document.activeElement).toBe(options[0]);await key(options[0]!,'ArrowDown');expect(document.activeElement).toBe(options[1]);expect(select).not.toHaveBeenCalled();
 await key(options[1]!,'End');const createButton=el.querySelector('[data-workspace-create]')!;expect(document.activeElement).toBe(createButton);expect(createButton.closest('[role=listbox]')).toBeNull();await key(createButton,'Home');expect(document.activeElement).toBe(options[0]);await key(options[0]!,'Escape');expect(el.querySelector('[role=listbox]')).toBeNull();expect(document.activeElement).toBe(trigger);expect(create).not.toHaveBeenCalled();
});
it('does not trap focus when leaving a menu and keeps only one menu open',async()=>{
 await act(async()=>root.render(<Header activeWorkspace={wsB} workspaces={[wsA,wsB]} userRole="operator" onLogout={vi.fn()}/>));await act(async()=>el.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!.click());expect(el.querySelector('[role=listbox]')).not.toBeNull();await act(async()=>userButton().click());expect(el.querySelector('[role=listbox]')).toBeNull();expect(el.querySelector('[role=menu]')).not.toBeNull();
 const outside=document.createElement('button');document.body.appendChild(outside);await act(async()=>outside.focus());expect(el.querySelector('[role=menu]')).toBeNull();outside.remove();
});
it('does not activate logout while navigating the user menu with the keyboard',async()=>{
 const logout=vi.fn();await act(async()=>root.render(<Header activeWorkspace={wsB} userRole="operator" onLogout={logout}/>));userButton().focus();await key(userButton(),'ArrowDown');const item=el.querySelector('[role=menuitem]')!;expect(document.activeElement).toBe(item);expect(logout).not.toHaveBeenCalled();await key(item,'Escape');expect(el.querySelector('[role=menu]')).toBeNull();expect(document.activeElement).toBe(userButton());expect(logout).not.toHaveBeenCalled();
});
it('returns focus to the selector if its company context changes while open',async()=>{
 await act(async()=>root.render(<Header activeWorkspace={wsA} workspaces={[wsA,wsB]} userRole="owner"/>));const trigger=el.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;await key(trigger,'ArrowDown');expect(document.activeElement?.getAttribute('role')).toBe('option');await act(async()=>root.render(<Header activeWorkspace={wsB} workspaces={[wsA,wsB]} userRole="operator"/>));expect(el.querySelector('[role=listbox]')).toBeNull();expect(document.activeElement).toBe(trigger);
});
