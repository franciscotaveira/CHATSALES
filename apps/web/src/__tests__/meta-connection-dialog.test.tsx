// @vitest-environment happy-dom
import {act,StrictMode} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {ChannelConnectionDialog} from '../pages/settings/ChannelConnectionDialog';import {apiClient,type ChannelSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const close=vi.fn(),updated=vi.fn();const channel={provider:'meta_waba',id:'SIM-meta',displayName:'SIM Meta',revision:'1700000000000000',metaSubscriptionStatus:'confirmed',status:'configuring'} as ChannelSummary;
const confirm=()=>Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Confirmar conexão')!;
const view=(overrides:Partial<ChannelSummary>={})=><StrictMode><ChannelConnectionDialog channel={{...channel,...overrides}} workspaceId="SIM-company" token="SIM-token" onClose={close} onUpdated={updated}/></StrictMode>;
beforeEach(()=>{close.mockReset();updated.mockReset();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
async function acknowledge(){await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());}
it.each([
 null, {}, {success:'true',status:'connected',isActive:true}, {success:true,status:'connected',isActive:'false'},
 {success:true,status:'connected',isActive:true,isSimulated:'false'},
 {success:false,status:'error',isActive:false,handshakeDetail:{invalid:true}},
])('keeps malformed connection results unconfirmed: %j',async result=>{
 const approve=vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue(result as never);await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());
 expect(document.querySelector('[role=alert]')?.textContent).toContain('não confirmou um resultado válido');expect(document.querySelector('[role=status]')).toBeNull();expect(confirm().disabled).toBe(true);expect(updated).toHaveBeenCalledOnce();await act(async()=>confirm().click());expect(approve).toHaveBeenCalledOnce();
});
it('does not offer activation before the subscription has been confirmed',async()=>{
 vi.spyOn(apiClient,'approveProviderConnection');await act(async()=>root.render(view({metaSubscriptionStatus:'uncertain'})));expect(document.body.textContent).toContain('Confirme primeiro a assinatura');expect(confirm().disabled).toBe(true);expect(document.querySelector('input')).toBeNull();expect(apiClient.approveProviderConnection).not.toHaveBeenCalled();
});
it('requires acknowledgement, sends the reviewed revision once and distinguishes activation from delivery',async()=>{
 let resolve!:(v:any)=>void;vi.spyOn(apiClient,'approveProviderConnection').mockReturnValue(new Promise(r=>resolve=r));await act(async()=>root.render(view()));expect(confirm().disabled).toBe(true);await acknowledge();await act(async()=>{confirm().click();confirm().click();});expect(apiClient.approveProviderConnection).toHaveBeenCalledOnce();expect(apiClient.approveProviderConnection).toHaveBeenCalledWith('SIM-company','SIM-meta','1700000000000000',expect.anything());
 await act(async()=>resolve({success:true,status:'connected',isActive:true}));expect(document.querySelector('[role=status]')?.textContent).toContain('Conexão local confirmada');expect(document.body.textContent).toContain('a IA não foi ativada');expect(updated).toHaveBeenCalledOnce();expect(confirm().disabled).toBe(true);
});
it.each([{success:false,status:'error',isActive:false,handshakeDetail:'SIM número divergente'},{success:true,status:'connected',isActive:true,isSimulated:true}])('does not approve a failed or simulated result',async result=>{
 vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue(result);await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());expect(document.querySelector('[role=alert]')).not.toBeNull();expect(document.querySelector('[role=status]')).toBeNull();expect(confirm().disabled).toBe(true);
});
it('discards a late result after leaving the reviewed company',async()=>{
 let resolve!:(v:any)=>void;vi.spyOn(apiClient,'approveProviderConnection').mockReturnValue(new Promise(r=>resolve=r));await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());await act(async()=>root.render(null));await act(async()=>resolve({success:true,status:'connected',isActive:true}));expect(updated).not.toHaveBeenCalled();
});

it('offers Evolution review without a Meta subscription but requires acknowledgement',async()=>{
 vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue({success:false,status:'error',isActive:false,handshakeDetail:'SIM telefone não confirmado'});await act(async()=>root.render(view({provider:'evolution',metaSubscriptionStatus:undefined})));expect(document.body.textContent).toContain('Revisar conexão Evolution');expect(document.body.textContent).toContain('instância Evolution');expect(document.body.textContent).not.toContain('Confirme primeiro a assinatura');expect(confirm().disabled).toBe(true);await acknowledge();await act(async()=>confirm().click());expect(apiClient.approveProviderConnection).toHaveBeenCalledOnce();expect(document.querySelector('[role=alert]')?.textContent).toContain('SIM telefone não confirmado');
});
it.each([{status:'revoked'},{revision:undefined},{isActive:true}])('does not offer Evolution activation with an ineligible channel: %j',async override=>{
 vi.spyOn(apiClient,'approveProviderConnection');await act(async()=>root.render(view({provider:'evolution',...override} as Partial<ChannelSummary>)));expect(confirm().disabled).toBe(true);expect(document.querySelector('input[type=checkbox]')).toBeNull();expect(apiClient.approveProviderConnection).not.toHaveBeenCalled();
});

it('clears acknowledgement when the reviewed channel revision or phone changes',async()=>{
 vi.spyOn(apiClient,'approveProviderConnection');await act(async()=>root.render(view()));await acknowledge();expect(confirm().disabled).toBe(false);
 await act(async()=>root.render(view({revision:'SIM-new-revision'})));expect(confirm().disabled).toBe(true);expect(document.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
 await acknowledge();await act(async()=>root.render(view({revision:'SIM-new-revision',phoneNumberE164:'+551130000000'})));expect(confirm().disabled).toBe(true);expect(apiClient.approveProviderConnection).not.toHaveBeenCalled();
});
it('aborts observation and ignores a pending result after context changes in the same component',async()=>{
 let resolve!:(v:any)=>void;vi.spyOn(apiClient,'approveProviderConnection').mockReturnValue(new Promise(r=>resolve=r));await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());
 const signal=vi.mocked(apiClient.approveProviderConnection).mock.calls[0]![3]!.signal!;expect(signal.aborted).toBe(false);
 await act(async()=>root.render(<ChannelConnectionDialog channel={channel} workspaceId="SIM-other-company" token="SIM-other-token" onClose={close} onUpdated={updated}/>));expect(signal.aborted).toBe(true);expect(confirm().disabled).toBe(true);
 await act(async()=>resolve({success:true,status:'connected',isActive:true}));expect(updated).not.toHaveBeenCalled();expect(document.querySelector('[role=status]')).toBeNull();
});

it.each(['sync','async'])('preserves confirmed activation when refreshing the list fails: %s',async mode=>{
 const approve=vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue({success:true,status:'connected',isActive:true});updated.mockImplementation(()=>{if(mode==='sync')throw new Error('SIM refresh');return Promise.reject(new Error('SIM refresh'));});await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());expect(document.querySelector('[role=status]')?.textContent).toContain('Conexão local confirmada');expect(document.querySelector('[role=alert]')?.textContent).toContain('lista não foi atualizada');expect(confirm().disabled).toBe(true);await act(async()=>confirm().click());expect(approve).toHaveBeenCalledOnce();
});
it('keeps the identity rejection distinct from a simultaneous refresh failure',async()=>{
 vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue({success:false,status:'error',isActive:false,handshakeDetail:'SIM identidade divergente'});updated.mockRejectedValue(new Error('SIM refresh'));await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());expect(document.body.textContent).toContain('SIM identidade divergente');expect(document.body.textContent).toContain('lista não foi atualizada');expect(document.querySelector('[role=status]')).toBeNull();expect(confirm().disabled).toBe(true);
});
it('does not place a late refresh failure into a different reviewed company',async()=>{
 let reject!:(e:Error)=>void;updated.mockReturnValue(new Promise<void>((_,r)=>{reject=r;}));vi.spyOn(apiClient,'approveProviderConnection').mockResolvedValue({success:true,status:'connected',isActive:true});await act(async()=>root.render(view()));await acknowledge();await act(async()=>confirm().click());expect(document.querySelector('[role=status]')?.textContent).toContain('Conexão local confirmada');await act(async()=>root.render(<ChannelConnectionDialog channel={channel} workspaceId="SIM-other" token="SIM-token" onClose={close} onUpdated={updated}/>));await act(async()=>reject(new Error('SIM old refresh')));expect(document.body.textContent).not.toContain('lista não foi atualizada');expect(document.querySelector('[role=status]')).toBeNull();
});
