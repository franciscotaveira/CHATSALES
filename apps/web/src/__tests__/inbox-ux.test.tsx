// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import {HistoryImportDialog} from "../pages/settings/HistoryImportDialog";
import { useInbox } from "../pages/cockpit/hooks/useInbox";
import { apiClient } from "../services/api-client";
import type { UseSessionReturn } from "../hooks/useSession";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT:boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,inbox:ReturnType<typeof useInbox>;
function Harness({workspace,checking=false}:{workspace:string;checking?:boolean}){inbox=useInbox({token:'synthetic',activeWorkspace:{id:workspace,role:'operator'},isLoadingMe:checking} as UseSessionReturn);return <div>{inbox.isLoadingThreads?'Carregando':inbox.threads.map(t=>t.id).join(',')}<p role="alert">{inbox.error}</p><HistoryImportDialog refreshTarget="atendimento" channel={inbox.historyReview} pending={inbox.isSyncing} acknowledged={inbox.historyAcknowledged} result={inbox.historyResult} error={inbox.historyError} refreshError={inbox.historyRefreshError} onAcknowledge={inbox.setHistoryAcknowledged} onConfirm={()=>void inbox.confirmHistoryImport()} onClose={inbox.closeHistoryImport}/></div>;}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
const threads=(id:string)=>({threads:[{id,contactName:id,contactPhone:'+5500000000001',status:'active',lastMessage:null}]} as never);
describe('Inbox feedback and company isolation',()=>{
 it('shows loading and rejects the previous company response after switching',async()=>{
  const a=deferred<never>(),b=deferred<never>();vi.spyOn(apiClient,'getThreads').mockImplementation(ws=>ws==='a'?a.promise:b.promise);
  await act(async()=>root.render(<Harness workspace="a"/>));expect(container.textContent).toContain('Carregando');
  await act(async()=>root.render(<Harness workspace="b"/>));
  await act(async()=>b.resolve(threads('company-b')));expect(inbox.threads[0]?.id).toBe('company-b');
  await act(async()=>a.resolve(threads('company-a')));expect(inbox.threads[0]?.id).toBe('company-b');
 });
 it('keeps the latest response when refreshes finish out of order',async()=>{
  const old=deferred<never>(),latest=deferred<never>();vi.spyOn(apiClient,'getThreads').mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  await act(async()=>root.render(<Harness workspace="a"/>));
  let refresh!:Promise<void>;await act(async()=>{refresh=inbox.refreshThreads();});
  await act(async()=>latest.resolve(threads('latest')));await act(async()=>refresh);
  await act(async()=>old.resolve(threads('stale')));expect(inbox.threads[0]?.id).toBe('latest');expect(inbox.isLoadingThreads).toBe(false);
 });
 it('shows a failed initial query and clears the error after a successful retry',async()=>{
  const fetch=vi.spyOn(apiClient,'getThreads').mockRejectedValueOnce(new Error('Servidor indisponível')).mockResolvedValue(threads('recovered'));
  await act(async()=>root.render(<Harness workspace="a"/>));expect(inbox.error).toBe('Servidor indisponível');expect(inbox.isLoadingThreads).toBe(false);
  await act(async()=>inbox.refreshThreads());expect(inbox.error).toBeNull();expect(inbox.threads[0]?.id).toBe('recovered');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('reports that a channel is missing instead of claiming successful sync',async()=>{
  vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[],total:0});const sync=vi.spyOn(apiClient,'syncChannelChats');
  await act(async()=>root.render(<Harness workspace="a"/>));await act(async()=>inbox.syncActiveChannel());
  expect(sync).not.toHaveBeenCalled();expect(inbox.error).toContain('Conecte um canal');expect(inbox.notice).toBeNull();
 });
 it('reports a synchronization failure without an unhandled rejection',async()=>{
  vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[],total:0});vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[{id:'channel',provider:'waha',isActive:true,status:'connected'}]} as never);
  vi.spyOn(apiClient,'syncChannelChats').mockRejectedValue(new Error('Canal indisponível'));
  await act(async()=>root.render(<Harness workspace="a"/>));await act(async()=>inbox.syncActiveChannel());await act(async()=>inbox.setHistoryAcknowledged(true));await act(async()=>inbox.confirmHistoryImport());expect(inbox.historyError).toBe('Canal indisponível');expect(inbox.isSyncing).toBe(false);
 });
 it('retries a failed channel query instead of leaving a permanent error banner',async()=>{
  vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[],total:0});vi.mocked(apiClient.getChannels).mockRejectedValueOnce(new Error('Falha ao consultar os canais')).mockResolvedValue({channels:[],total:0});
  await act(async()=>root.render(<Harness workspace="a"/>));expect(inbox.error).toContain('Falha ao consultar');await act(async()=>inbox.retry());expect(inbox.error).toBeNull();expect(apiClient.getChannels).toHaveBeenCalledTimes(2);
 });

});


const historySource={id:'SIM-channel-a',provider:'waha',status:'connected',isActive:true,displayName:'SIM origem A',revision:'SIM-revision-a'};
const historyResult={success:true,partial:true,syncedChatsCount:2,syncedMessagesCount:7,failedChatsCount:1,skippedMessagesCount:0,message:'SIM lote parcial'};
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
async function startReview(){await act(async()=>inbox.syncActiveChannel());await act(async()=>document.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!.click());}
it('reviews the source without importing and allows cancelling without a request',async()=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats');await act(async()=>root.render(<Harness workspace="a"/>));await act(async()=>inbox.syncActiveChannel());expect(document.querySelector('[role=dialog]')?.textContent).toContain('SIM origem A');expect(button('Confirmar importação').disabled).toBe(true);expect(sync).not.toHaveBeenCalled();await act(async()=>button('Cancelar').click());expect(inbox.historyReview).toBeNull();expect(sync).not.toHaveBeenCalled();
});
it('pins the reviewed source and refreshes the current inbox filter while serializing duplicate confirmation',async()=>{
 const get=vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource,{...historySource,id:'SIM-channel-b',displayName:'SIM origem B'}]} as never);const pending=deferred<typeof historyResult>();const sync=vi.spyOn(apiClient,'syncChannelChats').mockReturnValue(pending.promise);await act(async()=>root.render(<Harness workspace="a"/>));await startReview();await act(async()=>inbox.setSelectedChannelId('SIM-channel-b'));await act(async()=>{void inbox.confirmHistoryImport();void inbox.confirmHistoryImport();});expect(sync).toHaveBeenCalledOnce();expect(sync.mock.calls[0]?.slice(0,2)).toEqual(['a','SIM-channel-a']);await act(async()=>pending.resolve(historyResult));expect(inbox.historyResult).toEqual(historyResult);expect(document.body.textContent).toContain('Importação parcial');expect(get.mock.calls.at(-1)?.[1]?.channelInstanceId).toBe('SIM-channel-b');expect(inbox.isSyncing).toBe(false);
});
it('keeps the import result separate from refresh failure and makes retry read-only',async()=>{
 const get=vi.spyOn(apiClient,'getThreads').mockResolvedValueOnce({threads:[]} as never).mockRejectedValueOnce(new Error('SIM fila indisponível')).mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats').mockResolvedValue(historyResult);await act(async()=>root.render(<Harness workspace="a"/>));await startReview();await act(async()=>inbox.confirmHistoryImport());expect(inbox.historyResult).toEqual(historyResult);expect(inbox.historyRefreshError).toBe(true);expect(document.body.textContent).toContain('resultado da importação foi preservado');await act(async()=>inbox.retry());expect(sync).toHaveBeenCalledOnce();expect(get).toHaveBeenCalledTimes(3);
});
it('does not retry an uncertain import when the generic retry refreshes the inbox',async()=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats').mockRejectedValue(new Error('SIM resultado incerto'));await act(async()=>root.render(<Harness workspace="a"/>));await startReview();await act(async()=>inbox.confirmHistoryImport());expect(inbox.historyError).toBe('SIM resultado incerto');await act(async()=>inbox.retry());await act(async()=>inbox.confirmHistoryImport());expect(sync).toHaveBeenCalledOnce();expect(button('Confirmar importação')).toBeUndefined();
});
it('does not accept an old import after leaving and returning to the same company',async()=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource]} as never);const old=deferred<typeof historyResult>();vi.spyOn(apiClient,'syncChannelChats').mockReturnValueOnce(old.promise);await act(async()=>root.render(<Harness workspace="a"/>));await startReview();await act(async()=>{void inbox.confirmHistoryImport();});await act(async()=>root.render(<Harness workspace="b"/>));await act(async()=>root.render(<Harness workspace="a"/>));await act(async()=>old.resolve(historyResult));expect(inbox.historyReview).toBeNull();expect(inbox.historyResult).toBeNull();expect(inbox.isSyncing).toBe(false);expect(document.body.textContent).not.toContain('SIM lote parcial');
});
it('closes a pending review while access is being verified',async()=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[historySource]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats');await act(async()=>root.render(<Harness workspace="a"/>));await startReview();await act(async()=>root.render(<Harness workspace="a" checking/>));expect(inbox.historyReview).toBeNull();expect(inbox.historyImportAvailable).toBe(false);await act(async()=>inbox.confirmHistoryImport());expect(sync).not.toHaveBeenCalled();
});
it.each([{provider:'meta_waba'},{isActive:false},{status:'configuring'}])('rejects an ineligible import source: %j',async override=>{
 vi.spyOn(apiClient,'getThreads').mockResolvedValue({threads:[]} as never);vi.mocked(apiClient.getChannels).mockResolvedValue({channels:[{...historySource,...override}]} as never);const sync=vi.spyOn(apiClient,'syncChannelChats');await act(async()=>root.render(<Harness workspace="a"/>));expect(inbox.historyImportAvailable).toBe(false);await act(async()=>inbox.syncActiveChannel());expect(inbox.historyReview).toBeNull();expect(sync).not.toHaveBeenCalled();
});
