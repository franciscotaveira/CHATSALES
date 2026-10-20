// @vitest-environment happy-dom
import {act,StrictMode} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {MetaSubscriptionDialog} from '../pages/settings/MetaSubscriptionDialog';import {apiClient,ApiError,type ChannelSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const close=vi.fn(),updated=vi.fn();const channel={id:'SIM-meta',revision:'1700000000000000',displayName:'SIMULADO Meta',provider:'meta_waba'} as ChannelSummary;
const button=()=>Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Consultar na Meta')!;
const view=()=> <StrictMode><MetaSubscriptionDialog channel={channel} workspaceId="SIM-company" token="SIM-token" onClose={close} onUpdated={updated}/></StrictMode>;
it.each([null,{}, {success:'true',subscriptionStatus:'confirmed',message:'SIM'}, {success:true,subscriptionStatus:'unknown',message:'SIM'}, {success:true,subscriptionStatus:'confirmed',message:{invalid:true}}])('does not publish an invalid subscription diagnostic %j',async result=>{
 const query=vi.spyOn(apiClient,'checkMetaSubscription').mockResolvedValue(result as never);await act(async()=>root.render(view()));await act(async()=>button().click());expect(document.querySelector('[role=alert]')?.textContent).toContain('não confirmou um diagnóstico válido');expect(document.querySelector('[role=status]')).toBeNull();expect(button().disabled).toBe(true);expect(updated).not.toHaveBeenCalled();await act(async()=>button().click());expect(query).toHaveBeenCalledOnce();
});
beforeEach(()=>{close.mockReset();updated.mockReset();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('requires an explicit consultation and prevents duplicate clicks while preserving a result under StrictMode',async()=>{
 let resolve!:(value:any)=>void;vi.spyOn(apiClient,'checkMetaSubscription').mockReturnValue(new Promise(r=>resolve=r));await act(async()=>root.render(view()));expect(apiClient.checkMetaSubscription).not.toHaveBeenCalled();expect(document.body.textContent).toContain('não ativa o canal');
 await act(async()=>{button().click();button().click();});expect(apiClient.checkMetaSubscription).toHaveBeenCalledOnce();await act(async()=>resolve({success:true,subscriptionStatus:'confirmed',message:'SIM aplicativo encontrado; canal inativo.'}));expect(document.body.textContent).toContain('SIM aplicativo encontrado; canal inativo.');expect(updated).toHaveBeenCalledOnce();expect(button().disabled).toBe(true);
});
it('shows missing configuration without retrying an old review',async()=>{
 vi.spyOn(apiClient,'checkMetaSubscription').mockRejectedValue(new ApiError(422,'Configuration','SIM provider detail'));await act(async()=>root.render(view()));await act(async()=>button().click());expect(document.querySelector('[role=alert]')?.textContent).toContain('Faltam credenciais Meta');expect(button().disabled).toBe(true);expect(updated).not.toHaveBeenCalled();
});
it('ignores a result after leaving the reviewed company',async()=>{
 let resolve!:(value:any)=>void;vi.spyOn(apiClient,'checkMetaSubscription').mockReturnValue(new Promise(r=>resolve=r));await act(async()=>root.render(view()));await act(async()=>button().click());await act(async()=>root.render(null));await act(async()=>resolve({success:true,subscriptionStatus:'confirmed',message:'SIM old company'}));expect(updated).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('SIM old company');
});

it('isolates a pending review when the same dialog receives another channel or company',async()=>{
 let resolve!:(value:any)=>void;const query=vi.spyOn(apiClient,'checkMetaSubscription').mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValue({success:true,subscriptionStatus:'uncertain',message:'SIM current result'} as never);
 await act(async()=>root.render(view()));await act(async()=>button().click());const signal=query.mock.calls[0]![3]!.signal!;expect(signal.aborted).toBe(false);
 await act(async()=>root.render(<MetaSubscriptionDialog channel={{...channel,id:'SIM-other',revision:'1700000000000001'}} workspaceId="SIM-other-company" token="SIM-other-token" onClose={close} onUpdated={updated}/>));
 expect(signal.aborted).toBe(true);expect(button().disabled).toBe(false);await act(async()=>resolve({success:true,message:'SIM old result'}));expect(document.body.textContent).not.toContain('SIM old result');expect(updated).not.toHaveBeenCalled();
 await act(async()=>button().click());expect(query).toHaveBeenLastCalledWith('SIM-other-company','SIM-other','1700000000000001',expect.objectContaining({token:'SIM-other-token'}));expect(document.body.textContent).toContain('SIM current result');expect(updated).toHaveBeenCalledOnce();
});
it('clears a completed diagnostic when the channel revision changes',async()=>{
 vi.spyOn(apiClient,'checkMetaSubscription').mockResolvedValue({success:true,subscriptionStatus:'uncertain',message:'SIM previous revision'} as never);await act(async()=>root.render(view()));await act(async()=>button().click());expect(button().disabled).toBe(true);
 await act(async()=>root.render(<MetaSubscriptionDialog channel={{...channel,revision:'1700000000000002'}} workspaceId="SIM-company" token="SIM-token" onClose={close} onUpdated={updated}/>));expect(document.body.textContent).not.toContain('SIM previous revision');expect(button().disabled).toBe(false);expect(apiClient.checkMetaSubscription).toHaveBeenCalledOnce();
});

it.each(['sync','async'])('preserves the subscription result when the list callback fails: %s',async mode=>{
 const query=vi.spyOn(apiClient,'checkMetaSubscription').mockResolvedValue({success:true,subscriptionStatus:'confirmed',message:'SIM consulta confirmada'});updated.mockImplementation(()=>{if(mode==='sync')throw new Error('SIM refresh');return Promise.reject(new Error('SIM refresh'));});await act(async()=>root.render(view()));await act(async()=>button().click());expect(document.body.textContent).toContain('Consulta concluída: assinatura confirmada.');expect(document.body.textContent).toContain('SIM consulta confirmada');expect(document.querySelector('[role=alert]')?.textContent).toContain('lista não foi atualizada');expect(button().disabled).toBe(true);await act(async()=>button().click());expect(query).toHaveBeenCalledOnce();
});
it('does not use a missing result message as permission to repeat a completed check',async()=>{
 const query=vi.spyOn(apiClient,'checkMetaSubscription').mockResolvedValue({success:true,subscriptionStatus:'uncertain',message:''});await act(async()=>root.render(view()));await act(async()=>button().click());expect(button().disabled).toBe(true);expect(document.body.textContent).toContain('resultado da assinatura não confirmado');await act(async()=>button().click());expect(query).toHaveBeenCalledOnce();
});
it.each([{provider:'evolution'},{status:'revoked'},{revision:undefined}])('blocks a subscription query on an ineligible channel: %j',async override=>{
 const query=vi.spyOn(apiClient,'checkMetaSubscription');await act(async()=>root.render(<MetaSubscriptionDialog channel={{...channel,...override} as ChannelSummary} workspaceId="SIM-company" token="SIM-token" onClose={close} onUpdated={updated}/>));expect(button().disabled).toBe(true);await act(async()=>button().click());expect(query).not.toHaveBeenCalled();expect(document.querySelector('[role=alert]')).not.toBeNull();
});
