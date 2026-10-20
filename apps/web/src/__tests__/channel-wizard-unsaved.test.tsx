// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ChannelWizardDialog} from '../pages/settings/ChannelWizardDialog';
import {apiClient} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const close=vi.fn();
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
const view=(workspace='SIM-a',open=true)=><ChannelWizardDialog isOpen={open} workspaceId={workspace} token="SIM-token" onClose={close} onChannelCreated={()=>{}} initialProvider="waha"/>;
async function input(field:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);close.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('closes an untouched wizard immediately',async()=>{await act(async()=>root.render(view()));await act(async()=>button('Cancelar').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();});
it('preserves manual credentials when continuing editing and only closes after explicit discard',async()=>{
 const create=vi.spyOn(apiClient,'createChannel');await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM linha');await act(async()=>button('Continuar').click());await input(document.querySelector('input[type="url"]')!,'https://sim.example.invalid');await input(document.querySelector('input[type="password"]')!,'SIM-placeholder-no-secret');
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar diálogo"]')!.click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();expect(button('Salvar Canal').closest('fieldset')!.disabled).toBe(true);await act(async()=>button('Continuar editando').click());expect(document.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe('https://sim.example.invalid');expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('SIM-placeholder-no-secret');expect(button('Salvar Canal').closest('fieldset')!.disabled).toBe(false);expect(document.activeElement).toBe(document.querySelector('input[type="url"]'));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar diálogo"]')!.click());await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();expect(create).not.toHaveBeenCalled();await act(async()=>root.render(view('SIM-a',false)));await act(async()=>root.render(view()));expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('');
});
it('requires review when cancelling from identification after returning from credentials',async()=>{
 await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM linha');await act(async()=>button('Continuar').click());await input(document.querySelector('input[type="password"]')!,'SIM-placeholder');await act(async()=>button('Voltar').click());await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());await act(async()=>button('Continuar').click());expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('SIM-placeholder');
});
it('invalidates a pending discard choice when the company changes',async()=>{
 await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM anterior');await act(async()=>button('Cancelar').click());await act(async()=>root.render(view('SIM-b')));expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('');expect(close).not.toHaveBeenCalled();await act(async()=>button('Cancelar').click());expect(close).toHaveBeenCalledOnce();
});
it('does not ask to discard an already registered channel when finishing',async()=>{
 vi.spyOn(apiClient,'createChannel').mockImplementation(async(workspaceId,payload)=>({channel:{id:'SIM-channel',workspaceId,provider:payload.provider,displayName:payload.displayName,isActive:false}} as never));await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM linha');await act(async()=>button('Continuar').click());await act(async()=>button('Salvar Canal').click());expect(document.body.textContent).toContain('Cadastro do canal concluído');await act(async()=>button('Fazer Isso Mais Tarde').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();
});

function leavingPage(){const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}
it('warns before unloading only while an open wizard has unsaved fields',async()=>{
 await act(async()=>root.render(view()));expect(leavingPage()).toBe(false);await input(document.querySelector('input')!,'SIM não salvo');expect(leavingPage()).toBe(true);await act(async()=>button('Cancelar').click());expect(leavingPage()).toBe(true);await act(async()=>button('Continuar editando').click());expect(leavingPage()).toBe(true);await input(document.querySelector('input')!,'');expect(leavingPage()).toBe(false);
 await input(document.querySelector('input')!,'SIM novamente');expect(leavingPage()).toBe(true);await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(leavingPage()).toBe(false);
});
it('removes the unload guard on company changes, external closing and unmount',async()=>{
 await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM antigo');expect(leavingPage()).toBe(true);await act(async()=>root.render(view('SIM-b')));expect(leavingPage()).toBe(false);await input(document.querySelector('input')!,'SIM atual');expect(leavingPage()).toBe(true);await act(async()=>root.render(view('SIM-b',false)));expect(leavingPage()).toBe(false);await act(async()=>root.render(view('SIM-b')));await input(document.querySelector('input')!,'SIM desmontagem');expect(leavingPage()).toBe(true);await act(async()=>root.render(null));expect(leavingPage()).toBe(false);
});
it('does not warn about discarding a successfully registered channel when leaving the page',async()=>{
 vi.spyOn(apiClient,'createChannel').mockImplementation(async(workspaceId,payload)=>({channel:{id:'SIM-channel',workspaceId,provider:payload.provider,displayName:payload.displayName,isActive:false}} as never));await act(async()=>root.render(view()));await input(document.querySelector('input')!,'SIM linha');expect(leavingPage()).toBe(true);await act(async()=>button('Continuar').click());await act(async()=>button('Salvar Canal').click());expect(document.body.textContent).toContain('Cadastro do canal concluído');expect(leavingPage()).toBe(false);
});
