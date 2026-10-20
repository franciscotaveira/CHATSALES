// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CreateWorkspaceModal} from '../components/CreateWorkspaceModal';import {apiClient} from '../services/api-client';import {requestNavigation} from '../utils/request-navigation';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const close=vi.fn(),created=vi.fn();
const result={success:true,workspace:{id:'SIM-new',name:'SIM empresa',slug:'sim-company'},owner:{id:'SIM-owner',name:'SIM responsável',email:'sim@example.invalid',isExistingUser:true,tempPassword:null},welcomeMessage:'SIM acesso existente mantido'};
const buttons=()=>Array.from(document.querySelectorAll('button'));const button=(label:string)=>buttons().find(x=>x.textContent?.trim()===label)!;
const fields=()=>Array.from(document.querySelectorAll('input'));
async function edit(index:number,value:string){await act(async()=>{const field=fields()[index]!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
async function fill(){await edit(0,'SIM empresa');await edit(1,'SIM responsável');await edit(2,'sim@example.invalid');}
async function render(isOpen=true,accessPending=false){await act(async()=>root.render(<CreateWorkspaceModal isOpen={isOpen} accessPending={accessPending} onClose={close} onCreated={created}/>));}
const unload=()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;};
beforeEach(()=>{close.mockReset();created.mockReset().mockResolvedValue(undefined);el=document.createElement('div');document.body.append(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('reviews cancelling a company draft, blocks submission during review and restores the original field',async()=>{
 const save=vi.spyOn(apiClient,'createWorkspace');await render();await edit(0,'SIM rascunho');await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('fieldset')!.disabled).toBe(true);expect(unload()).toBe(true);
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(fields()[0]!.value).toBe('SIM rascunho');expect(document.activeElement).toBe(fields()[0]);
 await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();expect(fields()[0]!.value).toBe('');expect(save).not.toHaveBeenCalled();
});
it('participates in route or session exit review and removes its warning after closing',async()=>{
 await render();await edit(0,'SIM antes de sair');const leave=vi.fn();await act(async()=>requestNavigation(leave));expect(leave).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(fields()[0]!.value).toBe('SIM antes de sair');await render(false);expect(unload()).toBe(false);await act(async()=>requestNavigation(leave));expect(leave).toHaveBeenCalledOnce();
});
it('blocks replay after an uncertain company creation result until the operator closes and checks existing companies',async()=>{
 const save=vi.spyOn(apiClient,'createWorkspace').mockRejectedValue(new Error('SIM conexão interrompida'));await render();await fill();await act(async()=>{button('Criar Empresa e Liberar Acesso').click();button('Criar Empresa e Liberar Acesso').click();});expect(save).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('resultado do cadastro é incerto');expect(button('Criar Empresa e Liberar Acesso').disabled).toBe(true);
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).toHaveBeenCalledOnce();await act(async()=>button('Fechar e conferir empresas').click());expect(close).toHaveBeenCalledOnce();expect(created).not.toHaveBeenCalled();
});
it('blocks creation while access is being checked without erasing the prepared fields',async()=>{
 const save=vi.spyOn(apiClient,'createWorkspace').mockResolvedValue(result);await render();await fill();await render(true,true);expect(fields()[0]!.value).toBe('SIM empresa');expect(button('Criar Empresa e Liberar Acesso').disabled).toBe(true);await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).not.toHaveBeenCalled();await render(true,false);await act(async()=>button('Criar Empresa e Liberar Acesso').click());expect(save).toHaveBeenCalledOnce();expect(created).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Empresa criada');
});
it('preserves confirmed creation while parent access refreshes and when entering the created company fails',async()=>{
 const save=vi.spyOn(apiClient,'createWorkspace').mockResolvedValue(result);created.mockRejectedValue(new Error('SIM entrada não confirmada'));await render();await fill();await act(async()=>button('Criar Empresa e Liberar Acesso').click());await render(true,true);expect(document.body.textContent).toContain('SIM empresa');expect(document.body.textContent).toContain('Empresa criada');await act(async()=>button('Entrar nesta Empresa Agora').click());expect(document.body.textContent).toContain('SIM entrada não confirmada');expect(button('Entrar nesta Empresa Agora').disabled).toBe(false);expect(save).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
});
