// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SettingsPage} from '../pages/settings/SettingsPage';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
vi.mock('../pages/settings/AiAgentSection',()=>({AiAgentSection:()=>null}));vi.mock('../pages/settings/TeamSection',()=>({TeamSection:()=>null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const session=(id='SIM-A')=>({activeWorkspace:{id,name:'SIM empresa',role:'owner'},user:{id:'SIM-owner'},token:'SIM-token',refreshSession:vi.fn(),isLoadingWorkspace:false,isLoadingMe:false}) as unknown as UseSessionReturn;
const channel={id:'SIM-channel',provider:'meta_waba',displayName:'SIM linha oficial',status:'connected',isActive:true,phoneNumberE164:'+550000000001',revision:'1700000000000000',metaBillingConfigured:false};
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
const deferred=()=>{let resolve!:(v:never)=>void,reject!:(v:Error)=>void;const promise=new Promise<never>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
it.each(['archive','revoke'])('accepts a matching %s confirmation',async(kind)=>{
 const method=kind==='archive'?'deleteChannel':'revokeChannel';vi.spyOn(apiClient,method).mockResolvedValue((kind==='archive'?{success:true,mode:'archived',message:'SIM ação confirmada'}:{success:true,channelId:channel.id,status:'revoked',message:'SIM ação confirmada'}) as never);
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button(kind==='archive'?'Arquivar canal':'Suspender canal').click());await act(async()=>button(kind==='archive'?'Confirmar arquivamento':'Confirmar suspensão').click());expect(document.querySelector('[role=dialog]')).toBeNull();expect(el.textContent).toContain('SIM ação confirmada');
});
it.each([
 {kind:'archive',response:{success:'true',mode:'archived'}},
 {kind:'archive',response:{success:true,mode:'deleted'}},
 {kind:'archive',response:{success:true,mode:'archived',message:{invalid:true}}},
 {kind:'revoke',response:{success:true,channelId:'SIM-other',status:'revoked'}},
 {kind:'revoke',response:{success:true,channelId:channel.id,status:'connected'}},
 {kind:'billing',response:{success:true,channel:{id:'SIM-other',metaBillingConfigured:true}}},
 {kind:'billing',response:{success:true,channel:{id:channel.id,metaBillingConfigured:false}}},
])('keeps incompatible $kind confirmation in review',async({kind,response})=>{
 const method=kind==='archive'?'deleteChannel':kind==='revoke'?'revokeChannel':'updateChannelBilling';const action=vi.spyOn(apiClient,method).mockResolvedValue(response as never);
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button(kind==='archive'?'Arquivar canal':kind==='revoke'?'Suspender canal':'Declarar faturamento Meta').click());
 if(kind==='billing')await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());
 const label=kind==='archive'?'Confirmar arquivamento':kind==='revoke'?'Confirmar suspensão':'Confirmar declaração';await act(async()=>button(label).click());
 expect(document.querySelector('[role=dialog]')?.textContent).toContain('servidor não confirmou');expect(button(label).disabled).toBe(true);await act(async()=>button(label).click());expect(action).toHaveBeenCalledOnce();expect(el.textContent).not.toContain('Ação confirmada pelo servidor.');
});
it.each([false,true])('restores channel refresh focus without stealing another control, moved=%s',async(moved)=>{
 const pending=deferred();vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[channel]} as never).mockReturnValueOnce(pending.promise);
 await act(async()=>root.render(<SettingsPage session={session()}/>));const refresh=button('Atualizar canais');refresh.focus();await act(async()=>refresh.click());refresh.blur();
 const other=document.createElement('button');document.body.appendChild(other);if(moved)other.focus();await act(async()=>pending.resolve({channels:[channel]} as never));expect(document.activeElement).toBe(moved?other:refresh);other.remove();
});
it.each([
 [{...channel,id:''}], [{...channel,displayName:{invalid:true}}], [{...channel,isActive:'false'}],
 [{...channel,workspaceId:'SIM-other'}], [{...channel,metaBillingConfigured:'true'}],
 [{...channel,revision:{invalid:true}}], [{...channel,metaSubscriptionCheckedAt:'invalid'}], [channel,channel],
].map(rows=>({rows})))('preserves confirmed channels and blocks actions after incompatible rows %j',async({rows})=>{
 vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[channel]} as never).mockResolvedValueOnce({channels:rows} as never).mockResolvedValue({channels:[channel]} as never);
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Atualizar canais').click());
 expect(el.textContent).toContain('dados de canal incompatíveis');expect(el.textContent).toContain('SIM linha oficial');expect(button('Declarar faturamento Meta').disabled).toBe(true);expect(button('Arquivar canal').disabled).toBe(true);
 await act(async()=>button('Atualizar canais').click());expect(el.textContent).not.toContain('dados de canal incompatíveis');expect(button('Declarar faturamento Meta').disabled).toBe(false);
});
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[channel]} as never);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('requires explicit review and acknowledgement, then performs one billing mutation with the observed revision',async()=>{
 const pending=deferred();const update=vi.spyOn(apiClient,'updateChannelBilling').mockReturnValue(pending.promise);await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Declarar faturamento Meta').click());const dialog=document.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain('não cadastra cartão');expect(button('Confirmar declaração').disabled).toBe(true);expect(update).not.toHaveBeenCalled();await act(async()=> (dialog.querySelector('input[type="checkbox"]') as HTMLInputElement).click());await act(async()=>{button('Confirmar declaração').click();button('Confirmar declaração').click();});expect(update).toHaveBeenCalledOnce();expect(update.mock.calls[0]?.slice(0,3)).toEqual(['SIM-A','SIM-channel',{metaBillingConfigured:true,expectedRevision:channel.revision,acknowledgedDeclaration:true}]);expect(button('Cancelar').disabled).toBe(true);expect(dialog.textContent).toContain('Aguarde a confirmação');await act(async()=>pending.resolve({success:true,channel:{...channel,metaBillingConfigured:true},message:'SIM declaração registrada, sem verificação da Meta'} as never));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(el.textContent).toContain('sem verificação da Meta');
});
it('keeps a failed mutation inside the review and offers data reload instead of claiming success',async()=>{
 const update=vi.spyOn(apiClient,'updateChannelBilling').mockRejectedValue(new Error('SIM revisão desatualizada'));await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Declarar faturamento Meta').click());await act(async()=> (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click());await act(async()=>button('Confirmar declaração').click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain('SIM revisão desatualizada');expect(el.textContent).not.toContain('Ação confirmada pelo servidor');expect(button('Confirmar declaração').disabled).toBe(true);expect((document.querySelector('input[type=checkbox]') as HTMLInputElement).disabled).toBe(true);await act(async()=>button('Confirmar declaração').click());expect(update).toHaveBeenCalledOnce();await act(async()=>button('Atualizar canais e revisar novamente').click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(update).toHaveBeenCalledOnce();
});
it('ignores a prior company action after leaving and returning; closes the old review',async()=>{
 const pending=deferred();vi.spyOn(apiClient,'revokeChannel').mockReturnValue(pending.promise);await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Suspender canal').click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain('não desconecta o aparelho');await act(async()=>button('Confirmar suspensão').click());await act(async()=>root.render(<SettingsPage session={session('SIM-B')}/>));await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>pending.resolve({success:true,message:'SIM_RESULTADO_ANTIGO'} as never));expect(el.textContent).not.toContain('SIM_RESULTADO_ANTIGO');expect(document.querySelector('[role="dialog"]')).toBeNull();expect(button('Suspender canal').disabled).toBe(false);
});
it('labels archiving truthfully and cancels without calling the server',async()=>{
 const archive=vi.spyOn(apiClient,'deleteChannel');await act(async()=>root.render(<SettingsPage session={session()}/>));expect(button('Excluir / Arquivar')).toBeUndefined();expect(el.textContent).not.toContain('Cartão Meta Ativo');await act(async()=>button('Arquivar canal').click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain('histórico será preservado');await act(async()=>button('Cancelar').click());expect(archive).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('does not call a successful response a completed action when success is false',async()=>{
 vi.spyOn(apiClient,'deleteChannel').mockResolvedValue({success:false,mode:'archived',message:'SIM not confirmed'});await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Arquivar canal').click());await act(async()=>button('Confirmar arquivamento').click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain('servidor não confirmou');
});

it('requires a fresh review after an uncertain archive result rather than repeating the command',async()=>{
 const archive=vi.spyOn(apiClient,'deleteChannel').mockRejectedValue(new DOMException('SIM timeout','TimeoutError'));await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Arquivar canal').click());await act(async()=>button('Confirmar arquivamento').click());expect(document.querySelector('[role=dialog]')?.textContent).toContain('A ação pode ter sido aplicada');expect(button('Confirmar arquivamento').disabled).toBe(true);await act(async()=>button('Confirmar arquivamento').click());expect(archive).toHaveBeenCalledOnce();await act(async()=>button('Atualizar canais e revisar novamente').click());expect(document.querySelector('[role=dialog]')).toBeNull();await act(async()=>button('Arquivar canal').click());expect(button('Confirmar arquivamento').disabled).toBe(false);expect(archive).toHaveBeenCalledOnce();
});

it('keeps prior channel records explicitly stale after a failed refresh and recovers through a fresh query',async()=>{
 const request=deferred();const get=vi.mocked(apiClient.getChannels);get.mockResolvedValueOnce({channels:[channel]} as never).mockReturnValueOnce(request.promise).mockResolvedValueOnce({channels:[{...channel,displayName:'SIM linha atualizada',isActive:false,status:'configuring'}]} as never);
 const revoke=vi.spyOn(apiClient,'revokeChannel');await act(async()=>root.render(<SettingsPage session={session()}/>));const checkedAt=el.querySelector('time')!.dateTime;expect(checkedAt).toBeTruthy();expect(el.textContent).toContain('Este registro não comprova envio ou recebimento');
 await act(async()=>button('Atualizar canais').click());expect(el.textContent).toContain('Atualizando canais');expect(el.textContent).toContain('SIM linha oficial');expect(button('Suspender canal').disabled).toBe(true);
 await act(async()=>request.reject(new Error('SIM falha na consulta')));expect(el.textContent).toContain('cartões podem estar desatualizados');expect(el.querySelector('time')!.dateTime).toBe(checkedAt);expect(button('Suspender canal').disabled).toBe(true);expect(button('Consultar assinatura').disabled).toBe(true);expect(button('Atualizar canais').disabled).toBe(false);
 await act(async()=>button('Suspender canal').click());expect(document.querySelector('[role=dialog]')).toBeNull();expect(revoke).not.toHaveBeenCalled();
 await act(async()=>button('Tentar novamente').click());expect(el.textContent).toContain('SIM linha atualizada');expect(el.textContent).not.toContain('cartões podem estar desatualizados');expect(button('Revisar conexão Meta').disabled).toBe(false);expect(button('Suspender canal')).toBeUndefined();
});
it('does not invent a completed check or empty channel list when the initial query fails',async()=>{
 vi.mocked(apiClient.getChannels).mockRejectedValueOnce(new Error('SIM indisponível'));await act(async()=>root.render(<SettingsPage session={session()}/>));expect(el.textContent).toContain('SIM indisponível');expect(el.querySelector('time')).toBeNull();expect(el.textContent).not.toContain('Nenhum canal conectado');expect(button('Atualizar canais').disabled).toBe(false);
});
it('clears the previous company query evidence and rejects its late response',async()=>{
 const pending=deferred();vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[channel]} as never).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({channels:[]} as never);
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Atualizar canais').click());await act(async()=>root.render(<SettingsPage session={session('SIM-B')}/>));await act(async()=>pending.resolve({channels:[{...channel,displayName:'SIM RESPOSTA ANTIGA'}]} as never));expect(el.textContent).not.toContain('SIM RESPOSTA ANTIGA');expect(el.textContent).not.toContain('SIM linha oficial');expect(el.textContent).toContain('Nenhum canal conectado');expect(el.querySelector('time')).not.toBeNull();
});

it('opens the confirmed newly created channel for QR consultation while the list refresh is pending',async()=>{
 const refresh=deferred();vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[]} as never).mockReturnValueOnce(refresh.promise);vi.spyOn(apiClient,'createChannel').mockImplementation(async(workspaceId,payload)=>({channel:{id:'SIM-new-channel',workspaceId,provider:payload.provider,displayName:payload.displayName,isActive:false}} as never));const query=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',message:'SIM sessão parada'} as never);
 await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Conectar Canal').click());await act(async()=>{Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(b=>b.textContent?.includes('WAHA'))!.click();const field=document.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM novo WAHA');field.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button('Continuar').click());await act(async()=>button('Salvar Canal').click());expect(document.body.textContent).toContain('Cadastro do canal concluído');await act(async()=>button('Consultar conexão').click());expect(query).toHaveBeenCalledExactlyOnceWith('SIM-A','SIM-new-channel',expect.objectContaining({token:'SIM-token'}));await act(async()=>refresh.resolve({channels:[]} as never));
});

it('keeps the provider activation result visible when the integrated channel refresh fails',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[{...channel,isActive:false,status:'configuring',metaSubscriptionStatus:'confirmed'}]} as never).mockRejectedValueOnce(new Error('SIM lista indisponível'));const approve=vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue({success:true,status:'connected',isActive:true});await act(async()=>root.render(<SettingsPage session={session()}/>));await act(async()=>button('Revisar conexão Meta').click());await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());await act(async()=>button('Confirmar conexão').click());const dialog=document.querySelector('[role=dialog]')!;expect(dialog.textContent).toContain('Conexão local confirmada');expect(dialog.textContent).toContain('lista não foi atualizada');expect(button('Confirmar conexão').disabled).toBe(true);await act(async()=>button('Confirmar conexão').click());expect(approve).toHaveBeenCalledOnce();expect(apiClient.getChannels).toHaveBeenCalledTimes(2);
});


async function openHistoryReview(){await act(async()=>button('Importar histórico recente').click());}
async function approveHistory(){await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());}
const historyChannel={...channel,provider:'waha',isActive:true,status:'connected',displayName:'SIM histórico'};
it('reviews a named history source before mutation and allows cancelling without importing',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historyChannel]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats');await act(async()=>root.render(<SettingsPage session={session()}/>));await openHistoryReview();expect(document.querySelector('[role=dialog]')?.textContent).toContain('SIM histórico');expect(document.body.textContent).toContain('até 35 conversas e 15 mensagens');expect(button('Confirmar importação').disabled).toBe(true);await act(async()=>button('Cancelar').click());expect(sync).not.toHaveBeenCalled();expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('serializes history import and displays partial counters without allowing the same review to run twice',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historyChannel]} as never);const pending=deferred();const sync=vi.spyOn(apiClient,'syncChannelChats').mockReturnValue(pending.promise);await act(async()=>root.render(<SettingsPage session={session()}/>));await openHistoryReview();await approveHistory();await act(async()=>{button('Confirmar importação').click();button('Confirmar importação').click();});expect(sync).toHaveBeenCalledOnce();expect(button('Cancelar').disabled).toBe(true);
 await act(async()=>pending.resolve({success:true,partial:true,syncedChatsCount:2,syncedMessagesCount:7,failedChatsCount:1,skippedMessagesCount:3,message:'SIM lote parcial'} as never));const result=document.querySelector('[aria-label="Resultado da importação"]')!;expect(result.textContent).toContain('Importação parcial');expect(Array.from(result.querySelectorAll('dd')).map(node=>node.textContent)).toEqual(['2','7','1','3']);expect(button('Confirmar importação')).toBeUndefined();expect(sync).toHaveBeenCalledOnce();
});
it('keeps an uncertain import error inside its review and does not automatically repeat',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historyChannel]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats').mockRejectedValue(new DOMException('SIM timeout','TimeoutError'));await act(async()=>root.render(<SettingsPage session={session()}/>));await openHistoryReview();await approveHistory();await act(async()=>button('Confirmar importação').click());expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toContain('pode ter registrado parte do lote');expect(button('Confirmar importação')).toBeUndefined();expect(sync).toHaveBeenCalledOnce();
});
it('preserves a completed import when refreshing the channels fails and does not invent omitted counts',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[historyChannel]} as never).mockRejectedValueOnce(new Error('SIM refresh'));const sync=vi.spyOn(apiClient,'syncChannelChats').mockResolvedValue({success:true,syncedChatsCount:1,syncedMessagesCount:0,message:'SIM sem novas mensagens'});await act(async()=>root.render(<SettingsPage session={session()}/>));await openHistoryReview();await approveHistory();await act(async()=>button('Confirmar importação').click());expect(document.querySelector('[aria-label="Resultado da importação"]')?.textContent).toContain('Lote de importação concluído');expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toContain('resultado da importação foi preservado');expect(Array.from(document.querySelectorAll('[aria-label="Resultado da importação"] dd')).map(node=>node.textContent)).toEqual(['1','0','Não informado','Não informado']);expect(sync).toHaveBeenCalledOnce();
});
it('revalidates the reviewed history channel before importing when its state changes',async()=>{
 vi.mocked(apiClient.getChannels).mockResolvedValueOnce({channels:[historyChannel]} as never).mockResolvedValueOnce({channels:[{...historyChannel,isActive:false,status:'configuring'}]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats');await act(async()=>root.render(<SettingsPage session={session()}/>));await openHistoryReview();await approveHistory();await act(async()=>button('Atualizar canais').click());await act(async()=>button('Confirmar importação').click());expect(sync).not.toHaveBeenCalled();expect(document.querySelector('[role=dialog]')).toBeNull();expect(el.textContent).toContain('importação não foi iniciada');
});
