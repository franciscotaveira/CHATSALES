// @vitest-environment happy-dom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { useConversation,conversationDraftKey } from "../pages/cockpit/hooks/useConversation";
import { apiClient, ApiError } from "../services/api-client";
import type { CommercialThreadSummary,ThreadMessageSummary } from "../services/api-client";
import type { UseSessionReturn } from "../hooks/useSession";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,conversation:ReturnType<typeof useConversation>;
let currentThread:CommercialThreadSummary;
const session={token:'synthetic',activeWorkspace:{id:'workspace'}} as UseSessionReturn;
const messages=(threadId='thread',body='Mensagem antiga')=>({messages:[{id:threadId,threadId,direction:'inbound',createdAt:'2000-01-01T00:00:00Z',body} as ThreadMessageSummary],total:1});
function Harness({provider='waha',id='thread',userId='SIM-user',blocked=null,updated}:{provider?:string;id?:string;userId?:string|null;blocked?:string|null;updated?:()=>void|Promise<void>}){
 const thread={id,workspaceId:'workspace',channelInstanceId:'channel',channelProvider:provider,contactPhone:'+5500000000001',updatedAt:'2026-10-18T12:00:00Z'} as CommercialThreadSummary;
 currentThread=thread;conversation=useConversation(id,{...session,user:userId?{id:userId}:null} as UseSessionReturn,updated,()=>blocked);return <p>{conversation.windowInfo.badgeText}{conversation.messages.map(m=>m.body).join(',')}</p>;
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{vi.spyOn(apiClient,"getThread").mockImplementation(async()=>({thread:currentThread}));sessionStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.spyOn(apiClient,'getThreadMessages').mockResolvedValue(messages());});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
const accepted={messageId:'message',commandId:'command',deliveryStatus:'queued',isIdempotentReplay:false};
describe('Conversation drafts and truthful send feedback',()=>{
 it.each(['waha','evolution'])('does not impose the Meta template window on %s',async provider=>{
  await act(async()=>root.render(<Harness provider={provider}/>));expect(conversation.windowInfo.isOpen).toBe(true);
 });
 it('keeps the Meta window closed when only an expired inbound is known',async()=>{
  await act(async()=>root.render(<Harness provider="meta_waba"/>));expect(conversation.windowInfo.isOpen).toBe(false);expect(conversation.windowInfo.isLoading).not.toBe(true);
 });
 it('shows loading instead of prematurely claiming the Meta window expired',async()=>{
  const pending=deferred<ReturnType<typeof messages>>();vi.mocked(apiClient.getThreadMessages).mockReturnValue(pending.promise);
  await act(async()=>root.render(<Harness provider="meta_waba"/>));expect(conversation.windowInfo.isLoading).toBe(true);expect(conversation.windowInfo.badgeText).toContain('Carregando');
  await act(async()=>pending.resolve(messages()));expect(conversation.windowInfo.isLoading).not.toBe(true);
 });
 it('retains a failed draft and reuses the same intention when retried',async()=>{
  const send=vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValueOnce(new Error('Resposta de rede ausente')).mockResolvedValue(accepted);
  await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('Minha resposta'));
  await act(async()=>conversation.handleSendMessage());expect(conversation.messageInput).toBe('Minha resposta');expect(sessionStorage.getItem(conversationDraftKey('SIM-user','workspace','thread')!)).toBe('Minha resposta');expect(conversation.sendError).toContain('rascunho foi preservado');
  expect(conversation.messages.some(m=>m.direction==='outbound')).toBe(false);
  await act(async()=>conversation.handleSendMessage());expect(send.mock.calls[1]![2].idempotencyKey).toBe(send.mock.calls[0]![2].idempotencyKey);expect(conversation.messageInput).toBe('');expect(sessionStorage.getItem(conversationDraftKey('SIM-user','workspace','thread')!)).toBeNull();
 });
 it('preserves a new draft typed while the previous message awaits acceptance',async()=>{
  const pending=deferred<typeof accepted>();vi.spyOn(apiClient,'sendOutboundMessage').mockReturnValue(pending.promise);
  await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('Primeira resposta'));
  let sending!:Promise<void>;await act(async()=>{sending=conversation.handleSendMessage();});await act(async()=>conversation.handleMessageInputChange('Próxima resposta'));
  await act(async()=>pending.resolve(accepted));await act(async()=>sending);expect(conversation.messageInput).toBe('Próxima resposta');expect(sessionStorage.getItem(conversationDraftKey('SIM-user','workspace','thread')!)).toBe('Próxima resposta');
 });
 it('reuses an uploaded attachment after the send response fails',async()=>{
  const upload=vi.spyOn(apiClient,'uploadMedia').mockResolvedValue({mediaUrl:'https://files.example.invalid/synthetic.png',category:'image'} as never);
  const send=vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValueOnce(new Error('Timeout')).mockResolvedValue(accepted);
  await act(async()=>root.render(<Harness/>));const file=new File(['synthetic'],'teste.png',{type:'image/png'});await act(async()=>conversation.setAttachedFile(file));
  await act(async()=>conversation.handleSendMessage());expect(conversation.attachedFile).toBe(file);await act(async()=>conversation.handleSendMessage());expect(upload).toHaveBeenCalledTimes(1);expect(send.mock.calls[0]![2].mediaUrl).toBe(send.mock.calls[1]![2].mediaUrl);expect(send.mock.calls[0]![2].idempotencyKey).toBe(send.mock.calls[1]![2].idempotencyKey);
 });
 it('never renders a previous conversation response under the newly selected client',async()=>{
  const previous=deferred<ReturnType<typeof messages>>(),next=deferred<ReturnType<typeof messages>>();vi.mocked(apiClient.getThreadMessages).mockImplementation((_workspace,thread)=>thread==='previous'?previous.promise:next.promise);
  await act(async()=>root.render(<Harness id="previous"/>));await act(async()=>root.render(<Harness id="next"/>));await act(async()=>next.resolve(messages('next','Cliente atual')));await act(async()=>previous.resolve(messages('previous','Cliente anterior')));
  expect(conversation.messages[0]?.body).toBe('Cliente atual');expect(container.textContent).not.toContain('Cliente anterior');
 });
 it('explains an inactive channel without displaying server codes or identifiers',async()=>{
  vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValue(new ApiError(422,'Unprocessable Entity',"CHANNEL_INSTANCE_INACTIVE: channel 'd1111111-1111-4111-8111-111111111111' cannot dispatch"));
  await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('Teste'));
  await act(async()=>conversation.handleSendMessage());expect(conversation.sendError).toContain('Revise a conexão em Configurações');expect(conversation.sendError).not.toContain('CHANNEL_INSTANCE');expect(conversation.sendError).not.toContain('d1111111');expect(conversation.messageInput).toBe('Teste');
 });

});

it('keeps the selected conversation and draft independent of list reloads, but clears inaccessible context on lookup failure',async()=>{await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('SIM rascunho preservado'));expect(conversation.selectedThread?.id).toBe('thread');vi.mocked(apiClient.getThread).mockRejectedValueOnce(new ApiError(403,'Forbidden','SIM acesso indisponível'));await act(async()=>conversation.refreshSelectedThread());expect(conversation.selectedThread).toBeNull();expect(conversation.selectedThreadError).toBeTruthy();expect(conversation.messageInput).toBe('SIM rascunho preservado');const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>conversation.handleSendMessage());expect(send).not.toHaveBeenCalled();vi.mocked(apiClient.getThread).mockResolvedValue({thread:currentThread});await act(async()=>conversation.refreshSelectedThread());expect(conversation.selectedThread?.id).toBe('thread');expect(conversation.messageInput).toBe('SIM rascunho preservado');});
it('rejects a late selected conversation response from the previous id',async()=>{const old=deferred<{thread:CommercialThreadSummary}>();vi.mocked(apiClient.getThread).mockImplementationOnce(()=>old.promise);await act(async()=>root.render(<Harness id="SIM-old"/>));await act(async()=>root.render(<Harness id="SIM-current"/>));await act(async()=>old.resolve({thread:{...currentThread,id:'SIM-old'}}));expect(conversation.selectedThread?.id).toBe('SIM-current');});

it('does not display an old status mutation failure in the newly selected conversation',async()=>{let reject!:(error:Error)=>void;vi.spyOn(apiClient,'updateThreadStatus').mockReturnValue(new Promise((_,r)=>reject=r));await act(async()=>root.render(<Harness id="SIM-old"/>));let pending:Promise<void>|undefined;await act(async()=>{pending=conversation.handleUpdateStatus('closed');});await act(async()=>root.render(<Harness id="SIM-current"/>));await act(async()=>reject(new Error('SIM erro da conversa anterior')));await pending;expect(conversation.sendError).toBeNull();expect(conversation.selectedThread?.id).toBe('SIM-current');});

it('keeps drafts and attachments separate for users in the same company and conversation',async()=>{await act(async()=>root.render(<Harness userId="SIM-A"/>));await act(async()=>conversation.handleMessageInputChange('SIM rascunho A'));await act(async()=>conversation.setAttachedFile(new File(['SIM'],'SIM-A.txt')));await act(async()=>root.render(<Harness userId="SIM-B"/>));expect(conversation.messageInput).toBe('');expect(conversation.attachedFile).toBeNull();await act(async()=>conversation.handleMessageInputChange('SIM rascunho B'));await act(async()=>root.render(<Harness userId="SIM-A"/>));expect(conversation.messageInput).toBe('SIM rascunho A');expect(sessionStorage.getItem(conversationDraftKey('SIM-B','workspace','thread')!)).toBe('SIM rascunho B');});
it('does not restore an unowned legacy draft or persist a new draft before user identification',async()=>{sessionStorage.setItem('chat_sales_draft_workspace_thread','SIM legado sem autor');await act(async()=>root.render(<Harness userId={null}/>));expect(conversation.windowInfo.isLoading).toBe(true);expect(conversation.windowInfo.badgeText).toContain("Confirmando usuário");expect(conversation.messageInput).toBe('');await act(async()=>conversation.handleMessageInputChange('SIM temporário'));expect(sessionStorage.length).toBe(1);await act(async()=>root.render(<Harness userId="SIM-A"/>));expect(conversation.messageInput).toBe('');expect(sessionStorage.getItem('chat_sales_draft_workspace_thread')).toBe('SIM legado sem autor');});
it('does not erase a different users draft when the previous users send finishes',async()=>{const pending=deferred<typeof accepted>();vi.spyOn(apiClient,'sendOutboundMessage').mockReturnValue(pending.promise);await act(async()=>root.render(<Harness userId="SIM-A"/>));await act(async()=>conversation.handleMessageInputChange('SIM A enviado'));let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});await act(async()=>root.render(<Harness userId="SIM-B"/>));await act(async()=>conversation.handleMessageInputChange('SIM B preservado'));await act(async()=>pending.resolve(accepted));await sending;expect(conversation.messageInput).toBe('SIM B preservado');expect(sessionStorage.getItem(conversationDraftKey('SIM-B','workspace','thread')!)).toBe('SIM B preservado');});

it('preserves draft and attachment without upload or send while channel availability is blocked',async()=>{
 const upload=vi.spyOn(apiClient,'uploadMedia'),send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);await act(async()=>root.render(<Harness blocked="SIM canal desconectado"/>));await act(async()=>{conversation.handleMessageInputChange('SIM rascunho preservado');conversation.setAttachedFile(new File(['SIM'],'sim.pdf',{type:'application/pdf'}));});await act(async()=>conversation.handleSendMessage());expect(upload).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(conversation.messageInput).toBe('SIM rascunho preservado');expect(conversation.attachedFile?.name).toBe('sim.pdf');expect(conversation.windowInfo.sendBlockedReason).toBe('SIM canal desconectado');expect(conversation.sendError).toContain('rascunho foi preservado');await act(async()=>root.render(<Harness/>));expect(conversation.messageInput).toBe('SIM rascunho preservado');expect(conversation.windowInfo.sendBlockedReason).toBeUndefined();
});
it('rechecks channel availability after an in-flight upload before creating an outbound message',async()=>{
 const upload=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();vi.spyOn(apiClient,'uploadMedia').mockReturnValue(upload.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(<Harness/>));await act(async()=>{conversation.handleMessageInputChange('SIM conteúdo preservado');conversation.setAttachedFile(new File(['SIM'],'sim.pdf',{type:'application/pdf'}));});let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});await act(async()=>root.render(<Harness blocked="SIM conexão perdida"/>));await act(async()=>upload.resolve({mediaUrl:'https://example.invalid/sim.pdf',category:'document',expiresInSeconds:3600,contentType:'application/pdf',sizeBytes:3,fileName:'sim.pdf'}));await sending;expect(send).not.toHaveBeenCalled();expect(conversation.messageInput).toBe('SIM conteúdo preservado');expect(conversation.attachedFile?.name).toBe('sim.pdf');expect(conversation.isSendingMessage).toBe(false);expect(conversation.sendError).toContain('SIM conexão perdida');
});

it('refuses freeform Meta sends outside the service window before upload and preserves the draft',async()=>{
 const send=vi.spyOn(apiClient,'sendOutboundMessage'),upload=vi.spyOn(apiClient,'uploadMedia');await act(async()=>root.render(<Harness provider="meta_waba"/>));await act(async()=>{conversation.handleMessageInputChange('SIM resposta');conversation.setAttachedFile(new File(['SIM'],'SIM.pdf',{type:'application/pdf'}));});await act(async()=>conversation.handleSendMessage());expect(send).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(conversation.messageInput).toBe('SIM resposta');expect(conversation.attachedFile?.name).toBe('SIM.pdf');expect(conversation.sendError).toContain('janela de atendimento');
});
it('rechecks the service-window deadline after upload even without a render or polling update',async()=>{
 let now=Date.parse('2026-10-18T12:00:00Z');vi.spyOn(Date,'now').mockImplementation(()=>now);vi.mocked(apiClient.getThreadMessages).mockResolvedValue({messages:[{id:'SIM-recent',direction:'inbound',createdAt:new Date(now-24*60*60*1000+1000).toISOString(),body:'SIM pergunta'} as ThreadMessageSummary],total:1});const upload=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();vi.spyOn(apiClient,'uploadMedia').mockReturnValue(upload.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(<Harness provider="meta_waba"/>));expect(conversation.windowInfo.isOpen).toBe(true);await act(async()=>{conversation.handleMessageInputChange('SIM resposta preservada');conversation.setAttachedFile(new File(['SIM'],'SIM.pdf',{type:'application/pdf'}));});let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});now+=2000;await act(async()=>upload.resolve({mediaUrl:'https://example.invalid/SIM.pdf',category:'document',expiresInSeconds:60,contentType:'application/pdf',sizeBytes:3,fileName:'SIM.pdf'}));await sending;expect(send).not.toHaveBeenCalled();expect(conversation.sendError).toContain('janela de atendimento');expect(conversation.messageInput).toBe('SIM resposta preservada');expect(conversation.attachedFile?.name).toBe('SIM.pdf');
});
it.each(['SIM invalid date',new Date(Date.now()+60*60*1000).toISOString()])('does not infer an open Meta service window from an invalid or future inbound timestamp: %s',async createdAt=>{
 vi.mocked(apiClient.getThreadMessages).mockResolvedValue({messages:[{id:'SIM-invalid',direction:'inbound',createdAt,body:'SIM timestamp não confiável'} as ThreadMessageSummary],total:1});await act(async()=>root.render(<Harness provider="meta_waba"/>));expect(conversation.windowInfo.isOpen).toBe(false);
});

it('keeps accepted send feedback separate from a synchronous conversation-list refresh failure',async()=>{
 const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);await act(async()=>root.render(<Harness updated={()=>{throw new Error('SIM atualização falhou');}}/>));await act(async()=>conversation.handleMessageInputChange('SIM resposta aceita'));await act(async()=>conversation.handleSendMessage());expect(send).toHaveBeenCalledOnce();expect(conversation.messageInput).toBe('');expect(conversation.sendError).toBeNull();expect(conversation.sendNotice).toContain('Mensagem aceita para envio');expect(conversation.sendNotice).toContain('não repita o envio');expect(conversation.sendNotice).not.toContain('rascunho foi preservado');
});
it('preserves a new draft and retained messages when asynchronous post-send refreshes fail',async()=>{
 let reject!:(error:Error)=>void;const refresh=new Promise<void>((_,r)=>reject=r);vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);await act(async()=>root.render(<Harness updated={()=>refresh}/>));await act(async()=>conversation.handleMessageInputChange('SIM resposta enviada'));let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});expect(conversation.sendNotice).toContain('Mensagem aceita para envio');await act(async()=>conversation.handleMessageInputChange('SIM próxima resposta'));vi.mocked(apiClient.getThreadMessages).mockRejectedValueOnce(new Error('SIM mensagens não atualizaram'));await act(async()=>reject(new Error('SIM fila não atualizou')));await sending;expect(conversation.messageInput).toBe('SIM próxima resposta');expect(conversation.messages).toHaveLength(1);expect(conversation.messagesError).toContain('SIM mensagens não atualizaram');expect(conversation.sendError).toBeNull();expect(conversation.sendNotice).toContain('não repita o envio');
});
it('serializes duplicate composer submissions before rendering and uploads an attachment once',async()=>{
 const pending=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();const upload=vi.spyOn(apiClient,'uploadMedia').mockReturnValue(pending.promise),send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);await act(async()=>root.render(<Harness/>));await act(async()=>{conversation.handleMessageInputChange('SIM com anexo');conversation.setAttachedFile(new File(['SIM'],'SIM.pdf',{type:'application/pdf'}));});let first:Promise<void>|undefined,second:Promise<void>|undefined;await act(async()=>{first=conversation.handleSendMessage();second=conversation.handleSendMessage();});expect(upload).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();await act(async()=>pending.resolve({mediaUrl:'https://example.invalid/SIM.pdf',category:'document',expiresInSeconds:60,contentType:'application/pdf',sizeBytes:3,fileName:'SIM.pdf'}));await first;await second;expect(send).toHaveBeenCalledOnce();expect(conversation.isSendingMessage).toBe(false);
});
it('does not let an old post-send refresh failure unlock or change feedback for a different conversation send',async()=>{
 let rejectOld!:(error:Error)=>void;const oldRefresh=new Promise<void>((_,r)=>rejectOld=r),currentSend=deferred<typeof accepted>();vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValueOnce(accepted).mockReturnValueOnce(currentSend.promise);await act(async()=>root.render(<Harness id="SIM-old" updated={()=>oldRefresh}/>));await act(async()=>conversation.handleMessageInputChange('SIM anterior'));let first:Promise<void>|undefined,second:Promise<void>|undefined;await act(async()=>{first=conversation.handleSendMessage();});await act(async()=>root.render(<Harness id="SIM-current"/>));expect(conversation.sendNotice).toBeNull();await act(async()=>conversation.handleMessageInputChange('SIM atual'));await act(async()=>{second=conversation.handleSendMessage();});await act(async()=>rejectOld(new Error('SIM falha anterior')));await first;expect(conversation.isSendingMessage).toBe(true);expect(conversation.sendNotice).toBeNull();expect(conversation.sendError).toBeNull();await act(async()=>currentSend.resolve(accepted));await second;expect(conversation.isSendingMessage).toBe(false);expect(conversation.sendNotice).toContain('Mensagem aceita para envio');
});

it('keeps accepted attendance changes separate from a failed thread lookup',async()=>{
 vi.spyOn(apiClient,'updateThreadStatus').mockResolvedValue({} as never);await act(async()=>root.render(<Harness/>));vi.mocked(apiClient.getThread).mockRejectedValueOnce(new Error('SIM consulta após alteração falhou'));await act(async()=>conversation.handleUpdateStatus('closed'));expect(conversation.statusNotice).toContain('Alteração do atendimento registrada');expect(conversation.statusNotice).toContain('conversa não pôde ser consultada');expect(conversation.selectedThread).toBeNull();expect(conversation.sendError).toBeNull();expect(conversation.isUpdatingStatus).toBe(false);
});
it('awaits an asynchronous attendance-list refresh and preserves the accepted result on failure',async()=>{
 vi.spyOn(apiClient,'updateThreadStatus').mockResolvedValue({} as never);await act(async()=>root.render(<Harness updated={()=>Promise.reject(new Error('SIM fila indisponível'))}/>));await act(async()=>conversation.handleUpdateStatus('waiting_human'));expect(conversation.statusNotice).toContain('Alteração do atendimento registrada');expect(conversation.statusNotice).toContain('não repita a alteração');expect(conversation.sendError).toBeNull();
});
it('serializes conflicting attendance updates and ignores a previous-context completion',async()=>{
 const old=deferred<Awaited<ReturnType<typeof apiClient.updateThreadStatus>>>(),current=deferred<Awaited<ReturnType<typeof apiClient.updateThreadStatus>>>();const update=vi.spyOn(apiClient,'updateThreadStatus').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);await act(async()=>root.render(<Harness id="SIM-old"/>));let first:Promise<void>|undefined,second:Promise<void>|undefined;await act(async()=>{first=conversation.handleUpdateStatus('closed');void conversation.handleUpdateStatus('active');});expect(update).toHaveBeenCalledOnce();await act(async()=>root.render(<Harness id="SIM-new"/>));await act(async()=>{second=conversation.handleUpdateStatus('waiting_human');});expect(update).toHaveBeenCalledTimes(2);await act(async()=>old.resolve({thread:currentThread}));await first;expect(conversation.isUpdatingStatus).toBe(true);expect(conversation.statusNotice).toBeNull();await act(async()=>current.resolve({thread:currentThread}));await second;expect(conversation.isUpdatingStatus).toBe(false);expect(conversation.statusNotice).toContain('Alteração do atendimento registrada');
});

it('uses the explicit server hand-back operation with the reviewed timestamp rather than a generic active status patch',async()=>{
 const generic=vi.spyOn(apiClient,'updateThreadStatus'),resume=vi.spyOn(apiClient,'resumeThreadAutomation').mockImplementation(async()=>({thread:currentThread,alreadyActive:false}));await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleUpdateStatus('active'));expect(generic).not.toHaveBeenCalled();expect(resume).toHaveBeenCalledWith('workspace','thread','2026-10-18T12:00:00Z',{token:'synthetic'});expect(conversation.statusNotice).toContain('Alteração do atendimento registrada');
});
it('distinguishes an already-active conversation without claiming another hand-back',async()=>{
 vi.spyOn(apiClient,'resumeThreadAutomation').mockImplementation(async()=>({thread:currentThread,alreadyActive:true}));await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleUpdateStatus('active'));expect(conversation.statusNotice).toContain('Nenhuma nova devolução foi registrada');
});


it.each(['contactPhone','channelInstanceId','contactId'])('preserves the draft and blocks an uploaded attachment when %s changes before send',async field=>{
 const pending=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();vi.spyOn(apiClient,'uploadMedia').mockReturnValue(pending.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);
 await act(async()=>root.render(<Harness/>));await act(async()=>{conversation.handleMessageInputChange('SIM revisar destinatário');conversation.setAttachedFile(new File(['SIM'],'SIM.pdf',{type:'application/pdf'}));});
 let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});
 vi.mocked(apiClient.getThread).mockResolvedValue({thread:{...currentThread,[field]:field==='contactPhone'?'+5500000000002':'SIM-different'}});await act(async()=>{await conversation.refreshSelectedThread();});
 await act(async()=>pending.resolve({mediaUrl:'https://example.invalid/SIM.pdf',category:'document',expiresInSeconds:60,contentType:'application/pdf',sizeBytes:3,fileName:'SIM.pdf'}));await sending;
 expect(send).not.toHaveBeenCalled();expect(conversation.messageInput).toBe('SIM revisar destinatário');expect(conversation.attachedFile?.name).toBe('SIM.pdf');expect(conversation.sendError).toContain('destinatário ou o canal');expect(conversation.isSendingMessage).toBe(false);
});

it('does not reuse an uncertain intention after the recipient changes',async()=>{
 const send=vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValueOnce(new Error('SIM resposta incerta')).mockResolvedValue(accepted);
 await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('SIM mesma mensagem'));await act(async()=>conversation.handleSendMessage());
 vi.mocked(apiClient.getThread).mockResolvedValue({thread:{...currentThread,contactPhone:'+5500000000002'}});await act(async()=>{await conversation.refreshSelectedThread();});await act(async()=>conversation.handleSendMessage());
 expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1]![2].recipientPhoneE164).toBe('+5500000000002');expect(send.mock.calls[1]![2].idempotencyKey).not.toBe(send.mock.calls[0]![2].idempotencyKey);
});


it('does not revive an old attachment send after leaving and returning to the same conversation',async()=>{
 const pending=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();vi.spyOn(apiClient,'uploadMedia').mockReturnValue(pending.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);
 await act(async()=>root.render(<Harness/>));await act(async()=>{conversation.handleMessageInputChange('SIM original');conversation.setAttachedFile(new File(['SIM'],'SIM.pdf',{type:'application/pdf'}));});let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();});
 await act(async()=>root.render(<Harness id="SIM-other"/>));await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('SIM revisão ao voltar'));
 await act(async()=>pending.resolve({mediaUrl:'https://example.invalid/SIM.pdf',category:'document',expiresInSeconds:60,contentType:'application/pdf',sizeBytes:3,fileName:'SIM.pdf'}));await sending;
 expect(send).not.toHaveBeenCalled();expect(conversation.messageInput).toBe('SIM revisão ao voltar');expect(conversation.isSendingMessage).toBe(false);expect(conversation.sendNotice).toBeNull();
});


it.each([
 ['queued','Mensagem aceita para envio'],['sent','Envio ao provedor registrado'],['delivered','Entrega da mensagem registrada'],['read','Leitura da mensagem registrada'],['failed','falha de envio'],['unknown','estado de envio não foi confirmado'],['SIM_unrecognized','estado de envio não foi confirmado'],
])('shows the recorded %s result when the API recognizes an earlier send',async(deliveryStatus,notice)=>{
 const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({...accepted,deliveryStatus,isIdempotentReplay:true});await act(async()=>root.render(<Harness/>));await act(async()=>conversation.handleMessageInputChange('SIM tentativa anterior'));await act(async()=>conversation.handleSendMessage());
 expect(send).toHaveBeenCalledOnce();expect(conversation.sendNotice).toContain('Nenhum novo envio foi criado');expect(conversation.sendNotice).toContain(notice);expect(conversation.sendError).toBeNull();expect(conversation.messageInput).toBe('');
});
it('preserves a failed replay outcome when the conversation list cannot refresh',async()=>{
 vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({...accepted,deliveryStatus:'failed',isIdempotentReplay:true});await act(async()=>root.render(<Harness updated={()=>{throw new Error('SIM fila indisponível');}}/>));await act(async()=>conversation.handleMessageInputChange('SIM consultar falha'));await act(async()=>conversation.handleSendMessage());expect(conversation.sendNotice).toContain('falha de envio');expect(conversation.sendNotice).toContain('Nenhum novo envio');expect(conversation.sendNotice).toContain('não repita o envio');expect(conversation.sendNotice).not.toContain('Mensagem aceita para envio');
});


it('keeps an attachment locked while its upload is pending even before the UI disables removal',async()=>{
 const pending=deferred<Awaited<ReturnType<typeof apiClient.uploadMedia>>>();vi.spyOn(apiClient,'uploadMedia').mockReturnValue(pending.promise);vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue(accepted);await act(async()=>root.render(<Harness/>));const file=new File(['SIM'],'SIM locked.pdf',{type:'application/pdf'});await act(async()=>conversation.setAttachedFile(file));let sending:Promise<void>|undefined;await act(async()=>{sending=conversation.handleSendMessage();conversation.setAttachedFile(null);});expect(conversation.attachedFile).toBe(file);await act(async()=>pending.resolve({mediaUrl:'https://example.invalid/SIM.pdf',category:'document',expiresInSeconds:60,contentType:'application/pdf',sizeBytes:3,fileName:'SIM.pdf'}));await sending;expect(conversation.attachedFile).toBeNull();
});
