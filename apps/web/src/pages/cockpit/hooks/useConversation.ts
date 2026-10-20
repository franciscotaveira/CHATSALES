import {attachmentFileError} from "../utils/attachment-file";
import {freeformSendBlockReason} from "../utils/freeformSendAvailability";
import { userFacingError } from "../../../utils/user-facing-error";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient, type CommercialThreadSummary, type ThreadMessageSummary } from "../../../services/api-client";
import type { UseSessionReturn } from "../../../hooks/useSession";

export function conversationDraftKey(userId:string|null|undefined,workspaceId:string,threadId:string):string|null{
 return userId?['chat_sales_draft_v2',userId,workspaceId,threadId].map(encodeURIComponent).join(':'):null;
}

export interface WindowInfo {
  isOpen: boolean;
  hoursRemaining: number;
  expiresAt?:number;
  badgeText: string;
  badgeVariant: "action" | "danger";
  isLoading?: boolean;
  sendBlockedReason?:string;
}

export const useConversation = (
  selectedThreadId: string | null,
  session: UseSessionReturn,
  onThreadUpdated?: () => void|Promise<void>,
  getSendBlockReason?: (thread:CommercialThreadSummary|null)=>string|null
) => {
  const { token, activeWorkspace } = session;
  const userId=session.user?.id;
  const sendGuard=useRef(getSendBlockReason);sendGuard.current=getSendBlockReason;

  const [messages, setMessages] = useState<ThreadMessageSummary[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>("");
  const [attachedFile, setAttachedFileState] = useState<File | null>(null);
  const [messagesError,setMessagesError]=useState<string|null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice,setSendNotice]=useState<string|null>(null);
  const sendLock=useRef<symbol|null>(null);
  const statusLock=useRef<symbol|null>(null);
  const [isUpdatingStatus,setIsUpdatingStatus]=useState(false),[statusNotice,setStatusNotice]=useState<string|null>(null);

  const draftsByThreadRef = useRef<Record<string, string>>({});
  const activeThreadIdRef = useRef<string | null>(null);
  const activeWorkspaceIdRef = useRef<string | undefined>(undefined);
  const activeUserIdRef=useRef<string|undefined>(undefined);
  const inFlightMessages=useRef<{workspaceId:string;threadId:string;sequence:number}|null>(null);
  const currentContext=useRef({workspaceId:activeWorkspace?.id,threadId:selectedThreadId,token,userId});
  currentContext.current={workspaceId:activeWorkspace?.id,threadId:selectedThreadId,token,userId};
  const messageRequestSequence=useRef(0);
  const pendingIntents=useRef(new Map<string,{idempotencyKey:string;mediaUrl?:string;category?:"text"|"image"|"audio"|"video"|"document"}>());
  const fileIds=useRef(new WeakMap<File,string>());

  const selectionKey=JSON.stringify([activeWorkspace?.id,token,userId,selectedThreadId]);
  useEffect(()=>{statusLock.current=null;setIsUpdatingStatus(false);setStatusNotice(null);},[selectionKey]);
  const [threadState,setThreadState]=useState<{key:string;thread:CommercialThreadSummary|null;loading:boolean;error:string|null}>({key:"",thread:null,loading:false,error:null});
  const threadSequence=useRef(0),threadFlight=useRef<{key:string;sequence:number}|null>(null),selectionRef=useRef(selectionKey);selectionRef.current=selectionKey;
  const refreshSelectedThread=useCallback(async(force=true)=>{
    if(!selectedThreadId||!activeWorkspace?.id||!token)return;
    if(!force&&threadFlight.current?.key===selectionKey)return;
    const sequence=++threadSequence.current;threadFlight.current={key:selectionKey,sequence};const valid=()=>selectionRef.current===selectionKey&&threadSequence.current===sequence;
    setThreadState(previous=>previous.key===selectionKey?{...previous,loading:force||!previous.thread}:{key:selectionKey,thread:null,loading:true,error:null});
    try{const result=await apiClient.getThread(activeWorkspace.id,selectedThreadId,{token});if(!valid())return;if(result.thread.id!==selectedThreadId||result.thread.workspaceId!==activeWorkspace.id)throw new Error('A consulta não retornou a conversa desta empresa.');setThreadState({key:selectionKey,thread:result.thread,loading:false,error:null});return true;}
    catch(error){if(valid())setThreadState({key:selectionKey,thread:null,loading:false,error:userFacingError(error,'Não foi possível confirmar o acesso à conversa. Tente novamente; o rascunho foi preservado.')});return false;}
    finally{if(threadFlight.current?.sequence===sequence)threadFlight.current=null;}
  },[activeWorkspace?.id,token,selectedThreadId,selectionKey]);
  useEffect(()=>{
    setThreadState({key:selectionKey,thread:null,loading:Boolean(selectedThreadId),error:null});
    if(!selectedThreadId||!activeWorkspace?.id||!token)return;
    void refreshSelectedThread();const timer=setInterval(()=>{void refreshSelectedThread(false);},3500);
    return()=>{clearInterval(timer);threadSequence.current++;};
  },[selectionKey,selectedThreadId,activeWorkspace?.id,token,refreshSelectedThread]);
  const selectedThread=threadState.key===selectionKey?threadState.thread:null;
  const latestSelectedThread=useRef(selectedThread);latestSelectedThread.current=selectedThread;
  const selectedThreadError=threadState.key===selectionKey?threadState.error:null;
  const isLoadingSelectedThread=Boolean(selectedThreadId)&&(threadState.key!==selectionKey||threadState.loading);

  const getDraftKey = useCallback((workspaceId:string,threadId:string)=>conversationDraftKey(userId,workspaceId,threadId),[userId]);

  const setAttachedFile=useCallback((file:File|null)=>{
    if(sendLock.current)return;
    const error=file?attachmentFileError(file):null;
    if(error){setSendError(error+" O rascunho e o anexo anterior foram preservados.");return;}
    setAttachedFileState(file);setSendError(null);
  },[]);

  const handleMessageInputChange = useCallback(
    (val: string) => {
      setMessageInput(val);
      if(selectedThreadId&&activeWorkspace?.id){
        const key=getDraftKey(activeWorkspace.id,selectedThreadId);if(!key)return;
        draftsByThreadRef.current[key]=val;
        try{if(val.trim())sessionStorage.setItem(key,val);else sessionStorage.removeItem(key);}catch{/* Storage can be unavailable. */}
      }
    },
    [selectedThreadId, activeWorkspace?.id, getDraftKey]
  );

  // Restore draft when switching thread
  useEffect(() => {
    activeThreadIdRef.current = selectedThreadId;
    activeWorkspaceIdRef.current=activeWorkspace?.id;
    activeUserIdRef.current=userId;
    setAttachedFileState(null);setIsSendingMessage(false);sendLock.current=null;setSendNotice(null);setMessagesError(null);++messageRequestSequence.current;
    if (selectedThreadId && activeWorkspace?.id) {
      const draftKey=getDraftKey(activeWorkspace.id,selectedThreadId);
      let draft = draftKey?draftsByThreadRef.current[draftKey]:"";
      if (!draft && activeWorkspace?.id && draftKey) {
        try {
          draft = sessionStorage.getItem(draftKey) || "";
          if (draft) {
            draftsByThreadRef.current[draftKey] = draft;
          }
        } catch {
          draft = "";
        }
      }
      setMessageInput(draft || "");
    } else {
      setMessageInput("");
    }
    setSendError(null);
  }, [selectedThreadId, activeWorkspace?.id, getDraftKey]);

  // Load and poll messages
  const loadMessages = useCallback(
    async (threadId: string, force = false) => {
      if (!activeWorkspace?.id || !token) return;

      if(!force && inFlightMessages.current?.workspaceId===activeWorkspace.id && inFlightMessages.current.threadId===threadId)return;
      const sequence=++messageRequestSequence.current;
      inFlightMessages.current={workspaceId:activeWorkspace.id,threadId,sequence};
      const isCurrent=()=>currentContext.current.workspaceId===activeWorkspace.id && currentContext.current.threadId===threadId && currentContext.current.token===token && currentContext.current.userId===userId && sequence===messageRequestSequence.current;
      try {
        const res = await apiClient.getThreadMessages(
          activeWorkspace.id,
          threadId,
          { token }
        );
        if (isCurrent()) {setMessages(res.messages);setMessagesError(null);}
      } catch (err: unknown) {
        if (isCurrent()) setMessagesError(userFacingError(err,"Não foi possível carregar as mensagens."));
      }finally{if(inFlightMessages.current?.sequence===sequence)inFlightMessages.current=null;}
    },
    [activeWorkspace?.id, token,userId]
  );

  useEffect(() => {
    if (!selectedThreadId || !activeWorkspace?.id || !token) {
      setMessages([]);
      return;
    }

    setMessages([]);
    setIsLoadingMessages(true);
    const currentThreadId = selectedThreadId;

    loadMessages(currentThreadId,true).finally(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        setIsLoadingMessages(false);
      }
    });

    const interval = setInterval(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        loadMessages(currentThreadId);
      }
    }, 3000);

    return () => {clearInterval(interval);++messageRequestSequence.current;};
  }, [selectedThreadId, loadMessages, activeWorkspace?.id, token]);

  const visibleMessages=activeThreadIdRef.current===selectedThreadId && activeWorkspaceIdRef.current===activeWorkspace?.id && activeUserIdRef.current===userId ? messages : [];
  const loadingCurrentMessages=Boolean(selectedThreadId) && (isLoadingMessages || activeThreadIdRef.current!==selectedThreadId || activeWorkspaceIdRef.current!==activeWorkspace?.id || activeUserIdRef.current!==userId);
  // Only the Meta WABA adapter applies the template window; other supported adapters stay usable.
  const lastInboundMessage = visibleMessages
    .filter((m) => m.direction === "inbound"&&Number.isFinite(Date.parse(m.createdAt))&&Date.parse(m.createdAt)<=Date.now())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const computeWindowInfo = (): WindowInfo => {
    if(!userId)return {isOpen:false,isLoading:true,hoursRemaining:0,badgeText:"Confirmando usuário do atendimento…",badgeVariant:"danger"};
    if(selectedThread?.channelProvider==="waha" || selectedThread?.channelProvider==="evolution") return {isOpen:true,hoursRemaining:0,badgeText:"Atendimento pelo canal conectado",badgeVariant:"action"};
    if(loadingCurrentMessages && visibleMessages.length===0) return {isOpen:false,isLoading:true,hoursRemaining:0,badgeText:"Carregando conversa…",badgeVariant:"danger"};
    if (!lastInboundMessage) {
      return {
        isOpen: false,
        hoursRemaining: 0,
        badgeText: "Janela 24h Fechada (Requer Modelo)",
        badgeVariant: "danger" as const,
      };
    }
    const diffHours = (Date.now() - new Date(lastInboundMessage.createdAt).getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      const remaining = Math.max(0, Math.ceil(24 - diffHours));
      return {
        isOpen: true,
        hoursRemaining: remaining,
        expiresAt:Date.parse(lastInboundMessage.createdAt)+24*60*60*1000,
        badgeText: `Janela 24h Aberta (${remaining}h rest.)`,
        badgeVariant: "action" as const,
      };
    } else {
      return {
        isOpen: false,
        hoursRemaining: 0,
        badgeText: "Janela 24h Expirada",
        badgeVariant: "danger" as const,
      };
    }
  };

  const channelBlockReason=getSendBlockReason?.(selectedThread);
  const windowInfo:WindowInfo = {...computeWindowInfo(),...(channelBlockReason?{sendBlockedReason:channelBlockReason,badgeText:channelBlockReason,badgeVariant:"danger" as const}:{})};

  const latestWindow=useRef(windowInfo);latestWindow.current=windowInfo;

  const refreshMessages = useCallback(async () => {
    if (!selectedThreadId) return;
    setIsLoadingMessages(true);
    setSendError(null);
    try {
      await loadMessages(selectedThreadId, true);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [selectedThreadId, loadMessages]);

  // Keep the draft until the API accepts the intention. Retries reuse the original key and uploaded asset.
  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed=messageInput.trim();
    if((!trimmed&&!attachedFile)||!selectedThread||!activeWorkspace?.id||!token||!userId||isSendingMessage||sendLock.current)return;
    setSendNotice(null);
    const blocked=sendGuard.current?.(selectedThread)||freeformSendBlockReason(latestWindow.current);if(blocked){setSendError(blocked+" O rascunho foi preservado.");return;}
    const scope={workspaceId:activeWorkspace.id,threadId:selectedThread.id,token,userId};
    const isCurrent=()=>currentContext.current.workspaceId===scope.workspaceId && currentContext.current.threadId===scope.threadId && currentContext.current.token===scope.token && currentContext.current.userId===scope.userId&&sendLock.current===sendRequest;
    const fileToSend=attachedFile;
    if(fileToSend && !fileIds.current.has(fileToSend))fileIds.current.set(fileToSend,crypto.randomUUID());
    const identity=JSON.stringify([scope.userId,scope.workspaceId,scope.threadId,selectedThread.channelInstanceId,selectedThread.channelProvider,selectedThread.contactId,selectedThread.contactPhone,trimmed,fileToSend?fileIds.current.get(fileToSend):null]);
    let intention=pendingIntents.current.get(identity);
    if(!intention){intention={idempotencyKey:crypto.randomUUID()};pendingIntents.current.set(identity,intention);}
    const draftKey=getDraftKey(scope.workspaceId,scope.threadId);
    const originalDraft=messageInput;
    const sendRequest=Symbol();sendLock.current=sendRequest;
    setIsSendingMessage(true);setSendError(null);
    let accepted=false,acceptedNotice="Mensagem aceita para envio. Acompanhe envio e entrega na conversa.";
    try {
      if(fileToSend && !intention.mediaUrl){
        const upload=await apiClient.uploadMedia(scope.workspaceId,fileToSend,{token:scope.token});
        intention.mediaUrl=upload.mediaUrl;intention.category=upload.category;
        if(!isCurrent())return;
      }
      if(!isCurrent())return;
      const currentRecipient=latestSelectedThread.current;
      if(!currentRecipient||currentRecipient.id!==selectedThread.id||currentRecipient.workspaceId!==scope.workspaceId||currentRecipient.channelInstanceId!==selectedThread.channelInstanceId||currentRecipient.channelProvider!==selectedThread.channelProvider||currentRecipient.contactId!==selectedThread.contactId||currentRecipient.contactPhone!==selectedThread.contactPhone){
        setSendError("O destinatário ou o canal da conversa mudou durante a preparação. Revise os dados antes de enviar; o rascunho foi preservado.");return;
      }
      const blockedNow=sendGuard.current?.(currentRecipient)||freeformSendBlockReason(latestWindow.current);if(blockedNow){if(isCurrent())setSendError(blockedNow+" O rascunho foi preservado.");return;}
      const result=await apiClient.sendOutboundMessage(scope.workspaceId,selectedThread.channelInstanceId,{
        recipientPhoneE164:selectedThread.contactPhone,
        contentType:intention.category||"text",
        body:trimmed||(fileToSend?fileToSend.name:"Anexo"),
        mediaUrl:intention.mediaUrl,
        idempotencyKey:intention.idempotencyKey,
      },{token:scope.token});
      accepted=true;pendingIntents.current.delete(identity);
      const statusNotice=result.deliveryStatus==='queued'?"Mensagem aceita para envio. Acompanhe envio e entrega na conversa."
        :result.deliveryStatus==='sent'?"Envio ao provedor registrado. A entrega ainda deve ser acompanhada na conversa."
        :result.deliveryStatus==='delivered'?"Entrega da mensagem registrada. Confira o histórico da conversa."
        :result.deliveryStatus==='read'?"Leitura da mensagem registrada. Confira o histórico da conversa."
        :result.deliveryStatus==='failed'?"Mensagem registrada com falha de envio. Consulte o histórico antes de decidir uma nova tentativa."
        :"Mensagem registrada; o estado de envio não foi confirmado. Consulte o histórico antes de outra tentativa.";
      acceptedNotice=(result.isIdempotentReplay===true?"Tentativa anterior localizada. Nenhum novo envio foi criado. ":"")+statusNotice;
      if(draftKey&&draftsByThreadRef.current[draftKey]===originalDraft){
        delete draftsByThreadRef.current[draftKey];
        try{sessionStorage.removeItem(draftKey);}catch{/* Storage can be unavailable. */}
      }
      if(isCurrent()){
        setMessageInput(current=>current===originalDraft?"":current);
        setAttachedFileState(current=>current===fileToSend?null:current);
        setSendNotice(acceptedNotice);
        try{await onThreadUpdated?.();}
        catch{if(isCurrent())setSendNotice(acceptedNotice+" A fila de conversas não pôde ser atualizada. Atualize a consulta; não repita o envio por esse motivo.");}
        if(isCurrent())await loadMessages(scope.threadId,true);
      }
    }catch(error){
      if(isCurrent()){if(accepted)setSendNotice(acceptedNotice+" A tela não pôde ser atualizada. Consulte as mensagens; não repita o envio por esse motivo.");else setSendError(userFacingError(error,"Não foi possível enviar a mensagem.")+" O rascunho foi preservado; você pode tentar novamente.");}
    }finally{if(sendLock.current===sendRequest){if(isCurrent())setIsSendingMessage(false);sendLock.current=null;}}
  };

  // Update thread status (human escalation or close)
  const handleUpdateStatus = async (newStatus: "waiting_human" | "closed" | "active") => {
    if(!selectedThread||!activeWorkspace?.id||!token||!userId||statusLock.current)return;
    const context=selectionKey,request=Symbol();statusLock.current=request;
    const valid=()=>selectionRef.current===context&&statusLock.current===request;
    setIsUpdatingStatus(true);setStatusNotice(null);setSendError(null);
    let accepted=false;
    try{
      let alreadyActive=false;
      if(newStatus==="active"){
        if(!Number.isFinite(Date.parse(selectedThread.updatedAt)))throw new Error("Consulte a conversa novamente antes de devolver à IA.");
        const result=await apiClient.resumeThreadAutomation(activeWorkspace.id,selectedThread.id,selectedThread.updatedAt,{token});alreadyActive=result.alreadyActive===true;
      }else await apiClient.updateThreadStatus(activeWorkspace.id,selectedThread.id,newStatus,{token});
      accepted=true;
      if(!valid())return;
      setStatusNotice(alreadyActive?"O atendimento já estava ativo. Nenhuma nova devolução foi registrada; confira o estado na conversa.":"Alteração do atendimento registrada. O estado atual deve ser conferido na consulta da conversa.");
      const refreshed=await refreshSelectedThread();
      if(valid()&&!refreshed)setStatusNotice("Alteração do atendimento registrada, mas a conversa não pôde ser consultada novamente. Atualize a consulta antes de repetir a ação.");
      if(valid())try{await onThreadUpdated?.();}catch{if(valid())setStatusNotice("Alteração do atendimento registrada, mas a fila não pôde ser atualizada. Consulte o atendimento; não repita a alteração por esse motivo.");}
      return;
    }catch(error){
      if(valid()){if(accepted)setStatusNotice("Alteração do atendimento registrada, mas a tela não pôde ser atualizada. Consulte o atendimento antes de outra ação.");else setSendError(userFacingError(error,"Não foi possível confirmar a alteração do atendimento. Consulte seu estado antes de repetir."));}
      return;
    }finally{if(statusLock.current===request){statusLock.current=null;setIsUpdatingStatus(false);}}
  };

  const feedbackVisible=activeThreadIdRef.current===selectedThreadId&&activeWorkspaceIdRef.current===activeWorkspace?.id&&activeUserIdRef.current===userId;
  return {
    selectedThread,isLoadingSelectedThread,selectedThreadError,refreshSelectedThread,
    messages:visibleMessages,
    isLoadingMessages:loadingCurrentMessages,
    messageInput,
    attachedFile,
    setAttachedFile,
    handleMessageInputChange,
    handleSendMessage,
    isSendingMessage,
    sendError:feedbackVisible?sendError:null,sendNotice:feedbackVisible?sendNotice:null,statusNotice:feedbackVisible?statusNotice:null,isUpdatingStatus,
    messagesError,
    windowInfo,
    handleUpdateStatus,
    refreshMessages,
  };
};
