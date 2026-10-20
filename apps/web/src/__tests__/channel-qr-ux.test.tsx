// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useChannelQr } from "../pages/settings/useChannelQr";
import { apiClient, ApiError } from "../services/api-client";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,qr:ReturnType<typeof useChannelQr>;
const connected=vi.fn();
function Harness({workspace='a'}:{workspace?:string}){qr=useChannelQr(workspace,'synthetic',connected);return <p>{qr.modal?.error || qr.modal?.channelName || 'Fechado'}</p>;}
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
beforeEach(()=>{vi.useFakeTimers();connected.mockReset();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.useRealTimers();});
describe('Channel QR request lifecycle',()=>{
 it('ignores server fields that would overwrite the locally reviewed channel and generation',async()=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',channelId:'SIM-other',channelName:'SIM other',generation:999,openedAt:0,isActing:true} as never);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));expect(qr.modal?.channelId).toBe('channel');expect(qr.modal?.channelName).toBe('Canal simulado');expect(qr.modal?.generation).not.toBe(999);expect(qr.modal?.openedAt).not.toBe(0);expect(qr.modal?.isActing).not.toBe(true);expect(qr.checking).toBe(false);
 });
 it.each([null,{}, {success:'true'}, {success:true,message:{invalid:true}}, {success:true,alreadyConnected:'true'}, {success:true,operation:{id:'SIM-op',action:'start',state:42}}])('rejects malformed QR observation before publishing %j',async response=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue(response as never);await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));expect(qr.modal?.error).toContain('não confirmou dados válidos');expect(qr.modal?.qrDataUri).toBeUndefined();expect(connected).not.toHaveBeenCalled();expect(qr.checking).toBe(false);
 });
 it('does not reopen a dialog closed while loading',async()=>{
  const result=deferred<never>();vi.spyOn(apiClient,'getChannelQrCode').mockReturnValue(result.promise);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));
  await act(async()=>qr.close());await act(async()=>result.resolve({success:true,qrDataUri:'data:image/png;base64,AAAA'} as never));
  expect(qr.modal).toBeNull();expect(container.textContent).toBe('Fechado');
 });
 it('rejects a response after switching companies',async()=>{
  const result=deferred<never>();vi.spyOn(apiClient,'getChannelQrCode').mockReturnValue(result.promise);
  await act(async()=>root.render(<Harness workspace="old"/>));await act(async()=>qr.open('old','Canal anterior'));
  await act(async()=>root.render(<Harness workspace="new"/>));await act(async()=>result.resolve({success:true,alreadyConnected:true} as never));
  expect(qr.modal).toBeNull();expect(connected).not.toHaveBeenCalled();
 });
 it('does not overlap polling or refresh while a request is pending',async()=>{
  const result=deferred<never>();const get=vi.spyOn(apiClient,'getChannelQrCode').mockReturnValue(result.promise);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));
  await act(async()=>{qr.refresh();await vi.advanceTimersByTimeAsync(15000);});
  expect(get).toHaveBeenCalledTimes(1);expect(qr.checking).toBe(true);
  await act(async()=>result.resolve({success:true,status:'STARTING'} as never));
  await act(async()=>vi.advanceTimersByTimeAsync(3500));expect(get).toHaveBeenCalledTimes(2);
 });
 it('shows a poll failure and recovers on the next successful query',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:true,status:'STARTING'} as never).mockRejectedValueOnce(new Error('Falha de conexão simulada')).mockResolvedValue({success:true,qrDataUri:'data:image/png;base64,AAAA'} as never);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));
  await act(async()=>vi.advanceTimersByTimeAsync(3500));expect(qr.modal?.error).toBe('Falha de conexão simulada');expect(qr.modal?.isStarting).toBe(false);
  await act(async()=>vi.advanceTimersByTimeAsync(3500));expect(qr.modal?.error).toBeUndefined();expect(qr.modal?.qrDataUri).toContain('data:image');expect(get).toHaveBeenCalledTimes(3);
 });
 it('stops polling after the provider confirms connection',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,alreadyConnected:true} as never);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','Canal simulado'));
  expect(qr.modal?.alreadyConnected).toBe(true);expect(connected).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(get).toHaveBeenCalledOnce();
 });
 it('never places the previous channel QR into a newly opened channel',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'getChannelQrCode').mockReturnValueOnce(old.promise).mockResolvedValue({success:true,status:'STARTING'} as never);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('old','Canal anterior'));await act(async()=>qr.open('new','Canal atual'));
  await act(async()=>old.resolve({success:true,qrDataUri:'old-image'} as never));
  expect(qr.modal?.channelId).toBe('new');expect(qr.modal?.qrDataUri).toBeUndefined();
 });
 it('explains a successful provider response without a QR instead of displaying an empty dialog',async()=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true} as never);await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM Sem QR'));expect(qr.modal?.error).toContain('não retornou um QR Code');expect(qr.modal?.isLoading).toBe(false);
 });

 it('keeps consultation separate from reviewed mutation and serializes duplicate confirmations',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',revision:'1700000000000000',sessionName:'SIM session'});const pending=deferred<never>();const action=vi.spyOn(apiClient,'changeWahaConnection').mockReturnValue(pending.promise);
  await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM canal'));expect(action).not.toHaveBeenCalled();await act(async()=>qr.requestAction('restart'));expect(action).not.toHaveBeenCalled();expect(qr.review?.action).toBe('restart');await act(async()=>{void qr.confirmAction();void qr.confirmAction();});expect(action).toHaveBeenCalledOnce();expect(action.mock.calls[0]?.[2]).toMatchObject({action:'restart',expectedRevision:'1700000000000000',acknowledged:true});expect(qr.modal?.isActing).toBe(true);await act(async()=>pending.resolve({success:true,status:'ACTION_ACCEPTED',message:'SIM ação aceita'} as never));expect(qr.modal?.actionNotice).toBe('SIM ação aceita');expect(get).toHaveBeenCalledTimes(2);expect(action).toHaveBeenCalledOnce();expect(get.mock.calls.every(call=>!('force' in (call[2]||{})))).toBe(true);
 });
 it('labels simulation and never polls or offers a real mutation from it',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'SIMULATED',isSimulated:true,revision:'1700000000000000'});const action=vi.spyOn(apiClient,'changeWahaConnection');await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM canal'));await act(async()=>vi.advanceTimersByTimeAsync(20000));await act(async()=>qr.requestAction('start'));expect(get).toHaveBeenCalledOnce();expect(qr.review).toBeNull();expect(action).not.toHaveBeenCalled();
 });
 it('pauses bounded consultation and resumes only reading on manual refresh',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STARTING'});await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM canal'));await act(async()=>vi.advanceTimersByTimeAsync(125000));expect(qr.modal?.pollingPaused).toBe(true);const count=get.mock.calls.length;await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(get).toHaveBeenCalledTimes(count);await act(async()=>qr.refresh());expect(get).toHaveBeenCalledTimes(count+1);expect(qr.modal?.pollingPaused).toBe(false);
 });
 it('does not reopen a dialog after an already submitted mutation finishes',async()=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',revision:'1700000000000000'});const pending=deferred<never>();vi.spyOn(apiClient,'changeWahaConnection').mockReturnValue(pending.promise);await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM canal'));await act(async()=>qr.requestAction('start'));await act(async()=>{void qr.confirmAction();});await act(async()=>qr.close());await act(async()=>pending.resolve({success:true,message:'SIM resultado antigo'} as never));expect(qr.modal).toBeNull();expect(container.textContent).toBe('Fechado');
 });

 it('explains missing credentials and stops repeating a static configuration error',async()=>{
  const get=vi.spyOn(apiClient,'getChannelQrCode').mockRejectedValue(new ApiError(422,'Error','Configure as credenciais WAHA antes de consultar ou iniciar a sessão.'));await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('channel','SIM canal'));expect(qr.modal?.error).toContain('credenciais WAHA ativas');expect(qr.modal?.pollingPaused).toBe(true);await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(get).toHaveBeenCalledOnce();
 });
 it('validates mutation response and rejects malformed payloads before updating notice',async()=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-rev'});
  vi.spyOn(apiClient,'changeWahaConnection').mockResolvedValue({success:'true'} as never);
  await act(async()=>root.render(<Harness/>));
  await act(async()=>qr.open('channel','SIM canal'));
  await act(async()=>qr.requestAction('restart'));
  await act(async()=>qr.confirmAction());
  expect(qr.modal?.actionNotice).toContain('não retornou confirmação válida do servidor');
 });
 it('shows an honest failure notice when mutation returns success false without message',async()=>{
  vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-rev'});
  vi.spyOn(apiClient,'changeWahaConnection').mockResolvedValue({success:false} as never);
  await act(async()=>root.render(<Harness/>));
  await act(async()=>qr.open('channel','SIM canal'));
  await act(async()=>qr.requestAction('restart'));
  await act(async()=>qr.confirmAction());
  expect(qr.modal?.actionNotice).toBe('A ação não foi confirmada pelo servidor.');
  expect(connected).not.toHaveBeenCalled();
 });
});

it('freezes provider consultation during an explicit action review and resumes after returning',async()=>{
 const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STARTING',revision:'1700000000000000',sessionName:'SIM stable'} as never);const mutate=vi.spyOn(apiClient,'changeWahaConnection');await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM stable channel'));await act(async()=>qr.requestAction('restart'));expect(qr.review?.action).toBe('restart');await act(async()=>{qr.refresh();await vi.advanceTimersByTimeAsync(15000);});expect(get).toHaveBeenCalledOnce();expect(mutate).not.toHaveBeenCalled();await act(async()=>qr.cancelReview());await act(async()=>vi.advanceTimersByTimeAsync(3500));expect(get).toHaveBeenCalledTimes(2);
});


it('rejects action reviews after a failed refresh even with the old revision and restores them after a valid query',async()=>{
 const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:true,status:'STOPPED',revision:'SIM-old'}).mockRejectedValueOnce(new ApiError(502,'Unavailable','SIM provedor sem resposta')).mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-fresh'});const mutate=vi.spyOn(apiClient,'changeWahaConnection');
 await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));await act(async()=>qr.refresh());expect(qr.modal?.revision).toBe('SIM-old');expect(qr.modal?.error).toBeTruthy();await act(async()=>qr.requestAction('restart'));expect(qr.review).toBeNull();expect(mutate).not.toHaveBeenCalled();
 await act(async()=>qr.refresh());await act(async()=>qr.requestAction('restart'));expect(qr.review).toMatchObject({action:'restart',revision:'SIM-fresh'});expect(get).toHaveBeenCalledTimes(3);expect(mutate).not.toHaveBeenCalled();
});
it('requires an action compatible with the latest session state and preserves the first pending review',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'NOT_FOUND',revision:'SIM-revision',canCreate:false});const mutate=vi.spyOn(apiClient,'changeWahaConnection');await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));
 await act(async()=>{qr.requestAction('create');qr.requestAction('start');qr.requestAction('restart');qr.requestAction('activate');qr.requestAction('review');});expect(qr.review).toBeNull();expect(mutate).not.toHaveBeenCalled();
 vi.mocked(apiClient.getChannelQrCode).mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-new'});await act(async()=>qr.refresh());await act(async()=>qr.requestAction('start'));const first=qr.review;await act(async()=>qr.requestAction('restart'));expect(qr.review).toEqual(first);
});
it('blocks new actions after polling expires until a successful manual consultation',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STARTING',revision:'SIM-revision'});await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));await act(async()=>vi.advanceTimersByTimeAsync(125000));expect(qr.modal?.pollingPaused).toBe(true);await act(async()=>qr.requestAction('restart'));expect(qr.review).toBeNull();await act(async()=>qr.refresh());await act(async()=>qr.requestAction('restart'));expect(qr.review?.action).toBe('restart');
});
it('permits reviewing an uncertain operation but never starts or restarts over that operation',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-revision',operation:{id:'SIM-operation',action:'start',state:'uncertain'}});await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));await act(async()=>{qr.requestAction('start');qr.requestAction('restart');});expect(qr.review).toBeNull();await act(async()=>qr.requestAction('review'));expect(qr.review).toMatchObject({action:'review',operationId:'SIM-operation'});
});


it('replaces the provider snapshot instead of retaining an old phone confirmation',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:true,status:'WORKING',revision:'SIM-old',requiresConfirmation:true,verifiedPhoneNumber:'+5500000000001',sessionName:'SIM session'}).mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-new'});
 await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));expect(qr.modal?.requiresConfirmation).toBe(true);await act(async()=>qr.refresh());expect(qr.modal?.requiresConfirmation).toBe(false);expect(qr.modal?.verifiedPhoneNumber).toBeUndefined();expect(qr.modal?.sessionName).toBeUndefined();await act(async()=>qr.requestAction('activate'));expect(qr.review).toBeNull();await act(async()=>qr.requestAction('start'));expect(qr.review?.revision).toBe('SIM-new');
});
it('clears an operation absent from the latest successful snapshot and resumes bounded polling',async()=>{
 const get=vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:true,status:'STOPPED',revision:'SIM-old',operation:{id:'SIM-operation',action:'start',state:'uncertain'}}).mockResolvedValue({success:true,status:'STARTING',revision:'SIM-new'});
 await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));expect(qr.modal?.operation?.state).toBe('uncertain');await act(async()=>qr.refresh());expect(qr.modal?.operation).toBeUndefined();await act(async()=>vi.advanceTimersByTimeAsync(3500));expect(get).toHaveBeenCalledTimes(3);
});
it('does not treat a failed or simulated response as an active local connection',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:false,alreadyConnected:true,status:'FAILED',revision:'SIM-failed',error:'SIM consulta inválida'}).mockResolvedValue({success:true,isSimulated:true,alreadyConnected:true,status:'SIMULATED'});
 await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));expect(qr.modal?.alreadyConnected).toBe(false);expect(connected).not.toHaveBeenCalled();await act(async()=>qr.refresh());expect(qr.modal?.alreadyConnected).toBe(false);expect(qr.modal?.isSimulated).toBe(true);expect(connected).not.toHaveBeenCalled();
});
it('does not retain a previous connected state after a fresh stopped-session response',async()=>{
 vi.spyOn(apiClient,'getChannelQrCode').mockResolvedValueOnce({success:true,alreadyConnected:true,status:'WORKING',revision:'SIM-old'}).mockResolvedValue({success:true,status:'STOPPED',revision:'SIM-new'});
 await act(async()=>root.render(<Harness/>));await act(async()=>qr.open('SIM-channel','SIM canal'));expect(connected).toHaveBeenCalledOnce();await act(async()=>qr.refresh());expect(qr.modal?.alreadyConnected).toBe(false);expect(qr.modal?.status).toBe('STOPPED');expect(connected).toHaveBeenCalledOnce();await act(async()=>qr.requestAction('start'));expect(qr.review?.action).toBe('start');
});
