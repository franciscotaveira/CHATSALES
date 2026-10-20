// @vitest-environment happy-dom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { ChannelWizardDialog,sanitizeChannelPhoneE164 } from "../pages/settings/ChannelWizardDialog";
import { apiClient } from "../services/api-client";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,callback:(response:unknown)=>void;
const closed=vi.fn(),created=vi.fn();
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes(name))!;
const view=(workspace='SIM-a',open=true)=><ChannelWizardDialog isOpen={open} workspaceId={workspace} token="SIM-token" onClose={closed} onChannelCreated={created}/>;
async function begin(){
 await act(async()=>{const field=document.querySelector<HTMLInputElement>('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM Linha');field.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Continuar').click());await act(async()=>button('Login com Facebook').click());await act(async()=>button('Conectar com Facebook').click());
}
async function ids(origin='https://www.facebook.com'){await act(async()=>window.dispatchEvent(new MessageEvent('message',{origin,data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{phone_number_id:'123456',waba_id:'654321'}})})));}
beforeEach(()=>{vi.useFakeTimers();closed.mockReset();created.mockReset();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);Object.defineProperty(window,'FB',{configurable:true,value:{login:vi.fn((cb)=>{callback=cb;}),init:vi.fn()}});vi.spyOn(apiClient,'metaEmbeddedSignup').mockResolvedValue({channel:{id:'SIM-channel',displayName:'SIM Linha',workspaceId:'SIM-a',provider:'meta_waba',isActive:false},setup:{subscriptionStatus:'uncertain',requiresConnectionApproval:true,message:'SIM cadastro inativo'}} as never);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();delete (window as unknown as Record<string,unknown>).FB;document.querySelectorAll('script[src*="connect.facebook.net"]').forEach(script=>script.remove());vi.restoreAllMocks();vi.useRealTimers();});
describe('Meta embedded login lifecycle with synthetic SDK',()=>{
 it.each([{workspaceId:'SIM-other'},{provider:'waha'},{isActive:true},{id:42}])('keeps incompatible embedded registration uncertain %j',async override=>{
  vi.mocked(apiClient.metaEmbeddedSignup).mockResolvedValue({channel:{id:'SIM-new',displayName:'SIM Linha',workspaceId:'SIM-a',provider:'meta_waba',isActive:false,...override},setup:{subscriptionStatus:'uncertain',requiresConnectionApproval:true,message:'SIM'}} as never);
  await act(async()=>root.render(view()));await begin();await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(document.body.textContent).toContain('Cadastro sem confirmação');expect(created).not.toHaveBeenCalled();expect(button('Conectar com Facebook').disabled).toBe(true);
 });
 it('keeps malformed setup messages uncertain without rendering an object',async()=>{
  vi.mocked(apiClient.metaEmbeddedSignup).mockResolvedValue({channel:{id:'SIM-new',displayName:'SIM Linha',workspaceId:'SIM-a',provider:'meta_waba',isActive:false},setup:{subscriptionStatus:'confirmed',requiresConnectionApproval:true,message:{invalid:true}}} as never);
  await act(async()=>root.render(view()));await begin();await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(document.body.textContent).toContain('Cadastro sem confirmação');expect(created).not.toHaveBeenCalled();
 });
 it('preserves embedded registration after an asynchronous list refresh failure',async()=>{
  created.mockRejectedValue(new Error('SIM refresh'));await act(async()=>root.render(view()));await begin();await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(document.body.textContent).toContain('Cadastro salvo, mas a lista');expect(document.body.textContent).toContain('Cadastro do canal concluído');
 });
 it('waits for both auth and selected IDs, then registers exactly once',async()=>{
  await act(async()=>root.render(view()));await begin();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(apiClient.metaEmbeddedSignup).not.toHaveBeenCalled();
  await ids();expect(apiClient.metaEmbeddedSignup).toHaveBeenCalledWith('SIM-a',expect.objectContaining({code:'SIM-code',phoneNumberId:'123456',wabaAccountId:'654321'}),expect.anything());expect(created).toHaveBeenCalledOnce();
  await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(apiClient.metaEmbeddedSignup).toHaveBeenCalledOnce();
 });
 it('accepts selected IDs before auth and rejects messages from unrelated origins',async()=>{
  await act(async()=>root.render(view()));await begin();await ids('https://attacker.invalid');await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(apiClient.metaEmbeddedSignup).not.toHaveBeenCalled();await ids();expect(created).toHaveBeenCalledOnce();
 });
 it('cancel stops the attempt and prevents late callbacks from creating a channel',async()=>{
  await act(async()=>root.render(view()));await begin();await act(async()=>button('Cancelar login da Meta').click());await ids();await act(async()=>callback({authResponse:{code:'SIM-late',phone_number_id:'123',waba_id:'456'}}));await act(async()=>vi.advanceTimersByTimeAsync(46000));expect(apiClient.metaEmbeddedSignup).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('não concluiu o login');expect(button('Conectar com Facebook').disabled).toBe(false);
 });
 it('cleans the attempt when changing company and never registers under the old company',async()=>{
  await act(async()=>root.render(view()));await begin();await act(async()=>root.render(view('SIM-b')));await ids();await act(async()=>callback({authResponse:{code:'SIM-old',phone_number_id:'123',waba_id:'456'}}));expect(apiClient.metaEmbeddedSignup).not.toHaveBeenCalled();expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('');expect(document.body.textContent).toContain('Continuar');
 });
 it('allows closing during SDK login and ignores the expired attempt after reopening',async()=>{
  await act(async()=>root.render(view()));await begin();await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar diálogo"]')!.click());expect(closed).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();await act(async()=>button('Descartar alterações').click());expect(closed).toHaveBeenCalledOnce();await act(async()=>root.render(view('SIM-a',false)));await act(async()=>root.render(view()));await ids();await act(async()=>callback({authResponse:{code:'SIM-old',phone_number_id:'123',waba_id:'456'}}));expect(created).not.toHaveBeenCalled();
 });
 it('expires missing IDs and allows another attempt without accepting the previous callback',async()=>{
  await act(async()=>root.render(view()));await begin();const old=callback;await act(async()=>callback({authResponse:{code:'SIM-code'}}));await act(async()=>vi.advanceTimersByTimeAsync(45000));expect(document.body.textContent).toContain('sem os identificadores');await act(async()=>button('Conectar com Facebook').click());await act(async()=>old({authResponse:{code:'SIM-old',phone_number_id:'123',waba_id:'456'}}));expect(created).not.toHaveBeenCalled();
 });
 it('preserves explicit international country codes and rejects incomplete phone values',()=>{
  expect(sanitizeChannelPhoneE164('+351 911 222 333')).toBe('+351911222333');expect(sanitizeChannelPhoneE164('(55) 99999-0001')).toBe('+5555999990001');expect(sanitizeChannelPhoneE164('abc')).toBeUndefined();expect(sanitizeChannelPhoneE164('123')).toBeUndefined();expect(sanitizeChannelPhoneE164('')).toBeUndefined();
 });

 it('removes the SDK script and unlocks recovery after a load failure',async()=>{
  delete (window as unknown as Record<string,unknown>).FB;await act(async()=>root.render(view()));await begin();const script=document.querySelector<HTMLScriptElement>('script[src*="connect.facebook.net"]');expect(script).toBeNull();expect(document.body.textContent).toContain('Não foi possível carregar o login');expect(button('Conectar com Facebook').disabled).toBe(false);await act(async()=>vi.advanceTimersByTimeAsync(46000));expect(document.body.textContent).not.toContain('não concluiu o login');
 });

 it('shows a pending webhook setup without claiming the channel is active',async()=>{
  vi.mocked(apiClient.metaEmbeddedSignup).mockResolvedValue({channel:{id:'SIM-channel',displayName:'SIM Linha',workspaceId:'SIM-a',provider:'meta_waba',isActive:false,status:'validating'},setup:{subscriptionStatus:'uncertain',requiresConnectionApproval:true,message:'Cadastro salvo; assinatura sem confirmação. Canal inativo.'}} as never);
  await act(async()=>root.render(view()));await begin();await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(document.body.textContent).toContain('assinatura sem confirmação. Canal inativo.');expect(document.body.textContent).not.toContain('ativo para atendimento');expect(created).toHaveBeenCalledOnce();
 });

});

it('does not repeat provisioning through a new Meta login after an uncertain registration',async()=>{
 vi.mocked(apiClient.metaEmbeddedSignup).mockRejectedValue(new TypeError('SIM resposta perdida'));await act(async()=>root.render(view()));await begin();await ids();await act(async()=>callback({authResponse:{code:'SIM-code'}}));expect(document.body.textContent).toContain('Cadastro sem confirmação');expect(button('Conectar com Facebook').disabled).toBe(true);await act(async()=>button('Conectar com Facebook').click());expect(apiClient.metaEmbeddedSignup).toHaveBeenCalledOnce();expect(created).not.toHaveBeenCalled();await act(async()=>button('Encerrar rascunho e conferir canais').click());expect(closed).toHaveBeenCalledOnce();
});
