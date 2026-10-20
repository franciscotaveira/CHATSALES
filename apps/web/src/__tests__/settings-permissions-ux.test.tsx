// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SettingsPage} from '../pages/settings/SettingsPage';import {IntegrationsSection} from '../pages/settings/IntegrationsSection';import {PixSection} from '../pages/settings/PixSection';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
vi.mock('../pages/settings/AiAgentSection',()=>({AiAgentSection:()=> <div>SIM editor IA</div>}));
vi.mock('../pages/settings/TeamSection',()=>({TeamSection:()=> <div>SIM equipe</div>}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const session=(role='owner')=>({activeWorkspace:{id:'SIM-ws',name:'SIM empresa',role},activeWorkspaceDetails:{workspace:{id:'SIM-ws',defaultPixKey:'SIM-PIX',defaultPixMerchantName:'SIM RECEBEDOR',defaultPixMerchantCity:'SIM CIDADE'}},user:{id:'SIM-actor'},token:'SIM-token',refreshWorkspace:vi.fn(),refreshSession:vi.fn(),isLoadingWorkspace:false,isLoadingMe:false}) as unknown as UseSessionReturn;
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
const channel={id:'SIM-channel',provider:'waha',displayName:'SIM canal',status:'connected',isActive:true,phoneNumberE164:'+550000000001'};
it('reviews unsaved Pix edits before refreshing access can unmount the editor',async()=>{
 const data=session();const save=vi.spyOn(apiClient,'updateWorkspace');await act(async()=>root.render(<SettingsPage session={data}/>));await act(async()=>button('Cobrança Pix').click());
 const name=el.querySelectorAll('input')[1]!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'SIM rascunho preservado');name.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Atualizar meu acesso').click());expect(data.refreshSession).not.toHaveBeenCalled();expect(el.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();
 await act(async()=>button('Continuar editando').click());expect(name.value).toBe('SIM rascunho preservado');expect(data.refreshSession).not.toHaveBeenCalled();
 await act(async()=>button('Atualizar meu acesso').click());await act(async()=>button('Descartar alterações').click());expect(data.refreshSession).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
});
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[channel]} as never);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('keeps operator channel consultation and sync while removing credential, AI and finance controls',async()=>{
 const sync=vi.spyOn(apiClient,'syncChannelChats').mockResolvedValue({success:true,message:'SIM sincronizado',syncedChatsCount:1,syncedMessagesCount:1});await act(async()=>root.render(<SettingsPage session={session('operator')}/>));expect(button('Atendimento IA & Skills')).toBeUndefined();expect(button('Cobrança Pix')).toBeUndefined();expect(button('Equipe & Acessos')).toBeUndefined();expect(button('Conectar Canal')).toBeUndefined();expect(button('QR Code')).toBeUndefined();expect(button('Desconectar')).toBeUndefined();expect(button('Excluir / Arquivar')).toBeUndefined();expect(button('Sessão deste dispositivo')).toBeDefined();await act(async()=>button('Importar histórico recente').click());await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());await act(async()=>button('Confirmar importação').click());expect(sync).toHaveBeenCalledOnce();
});
it('unmounts a now-forbidden AI editor immediately when the workspace role changes',async()=>{
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Atendimento IA & Skills').click());expect(el.textContent).toContain('SIM editor IA');await act(async()=>root.render(<SettingsPage session={session('manager')}/>));expect(el.textContent).not.toContain('SIM editor IA');expect(button('Atendimento IA & Skills')).toBeUndefined();expect(button('API & Webhooks')).toBeDefined();
});
it('does not request channels for analyst or an unknown role and preserves the personal session page',async()=>{
 const get=vi.mocked(apiClient.getChannels);await act(async()=>root.render(<SettingsPage session={session('analyst')}/>));expect(get).not.toHaveBeenCalled();expect(el.textContent).toContain('SIM equipe');await act(async()=>root.render(<SettingsPage session={session('unrecognized')}/>));expect(get).not.toHaveBeenCalled();expect(el.textContent).toContain('Desconectar Sessão do Dispositivo');expect(button('API & Webhooks')).toBeUndefined();
});
it('allows read-only integration inspection and event queue consultation without exposing external mutations',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://example.invalid/hook',events:['lead.created'],is_active:true}]} as never);const jobs=vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValue({jobs:[]} as never);await act(async()=>root.render(<IntegrationsSection session={session('manager')}/>));expect(button('Novo Webhook')).toBeUndefined();expect(button('Testar (Ping)')).toBeUndefined();expect(button('Suspender')).toBeUndefined();expect(button('Suspender integração')).toBeUndefined();expect(el.textContent).toContain('https://example.invalid/hook');await act(async()=>button('Consultar fila').click());expect(jobs).toHaveBeenCalledOnce();
});
it('shows authorized Pix configuration as read-only and never saves from the consultation view',async()=>{
 const save=vi.spyOn(apiClient,'updateWorkspace');await act(async()=>root.render(<PixSection session={session('manager')}/>));expect(el.textContent).toContain('SIM-PIX');expect(el.querySelector('form')).toBeNull();expect(el.querySelector('input')).toBeNull();expect(save).not.toHaveBeenCalled();await act(async()=>root.render(<PixSection session={session('operator')}/>));expect(el.textContent).not.toContain('SIM-PIX');expect(el.textContent).toContain('Configuração Pix restrita');
});

it('ignores a sync result after leaving and returning to the same workspace',async()=>{
 let resolve!:(v:never)=>void;const wait=new Promise<never>(r=>{resolve=r;});vi.spyOn(apiClient,'syncChannelChats').mockReturnValue(wait);const first=session('operator');await act(async()=>root.render(<SettingsPage session={first}/>));await act(async()=>button('Importar histórico recente').click());await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());await act(async()=>button('Confirmar importação').click());await act(async()=>root.render(<SettingsPage session={{...first,activeWorkspace:{...first.activeWorkspace!,id:'SIM-other'}}}/>));await act(async()=>root.render(<SettingsPage session={first}/>));await act(async()=>resolve({success:true,message:'SIM_RESULTADO_ANTIGO',syncedChatsCount:1,syncedMessagesCount:1} as never));expect(el.textContent).not.toContain('SIM_RESULTADO_ANTIGO');expect(button('Importar histórico recente').disabled).toBe(false);
});

it('shows access verification instead of flashing the logout section and preserves the chosen section across refresh',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const data=session();await act(async()=>root.render(<SettingsPage session={{...data,isLoadingMe:true,activeWorkspace:null}}/>));expect(el.textContent).toContain('Conferindo seu acesso');expect(el.textContent).not.toContain('Desconectar Sessão do Dispositivo');expect(button('Conectar Canal')).toBeUndefined();expect(apiClient.getChannels).not.toHaveBeenCalled();await act(async()=>root.render(<SettingsPage session={data}/>));await act(async()=>button('API & Webhooks').click());expect(el.textContent).toContain('API de Integrações');await act(async()=>root.render(<SettingsPage session={{...data,isLoadingWorkspace:true}}/>));expect(el.textContent).not.toContain('API de Integrações');expect(el.textContent).toContain('Conferindo seu acesso');await act(async()=>root.render(<SettingsPage session={data}/>));expect(el.textContent).toContain('API de Integrações');
});
it('keeps personal session available explicitly while access is unavailable and shows a truthful error',async()=>{
 const data={...session(),error:{type:'network',detail:'SIM network error'}} as unknown as UseSessionReturn;await act(async()=>root.render(<SettingsPage session={data}/>));expect(el.textContent).toContain('Não foi possível confirmar seu acesso');expect(el.textContent).not.toContain('Desconectar Sessão do Dispositivo');expect(button('Conectar Canal')).toBeUndefined();await act(async()=>button('Sessão deste dispositivo').click());expect(el.textContent).toContain('Desconectar Sessão do Dispositivo');expect(apiClient.getChannels).not.toHaveBeenCalled();
});

it('preserves a webhook draft when switching settings sections until the operator discards it',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook');
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('API & Webhooks').click());await act(async()=>button('Novo Webhook').click());
 const field=el.querySelector<HTMLInputElement>('input[placeholder="Ex: n8n Produção - Disparo de E-mail de Boas Vindas"]')!;
 expect(field).toBeDefined();
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM rascunho não salvo');field.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Canais WhatsApp').click());expect(el.textContent).toContain('API de Integrações');expect(el.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();
 await act(async()=>button('Continuar editando').click());expect(field.value).toBe('SIM rascunho não salvo');
 await act(async()=>button('Canais WhatsApp').click());await act(async()=>button('Descartar alterações').click());expect(el.textContent).not.toContain('API de Integrações');expect(button('Conectar Canal')).toBeDefined();expect(create).not.toHaveBeenCalled();
});
