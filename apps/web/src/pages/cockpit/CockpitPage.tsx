import {freeformSendBlockReason} from "./utils/freeformSendAvailability";
import {channelSendBlockReason} from "./utils/channelSendAvailability";
import {HistoryImportDialog} from "../settings/HistoryImportDialog";
import {ProposalPixDialog} from "./drawers/ProposalPixDialog";
import {buildProductOfferMessage} from "../products/product-offer-message";
import {OpportunityDetailDialog} from '../opportunities/OpportunityDetailDialog';
import {NewOpportunityDialog} from '../opportunities/NewOpportunityDialog';
import {STAGES} from '../opportunities/stages';
import {userFacingError} from '../../utils/user-facing-error';
import { type FC, useState, useEffect, useRef, useCallback } from "react";
import { Drawer, EmptyState, Button, useBreakpoint } from "@sos-sales/ui";
import { MessageSquare } from "lucide-react";
import { useSession, type UseSessionReturn } from "../../hooks/useSession";
import { apiClient, ApiError, type CommercialProposalSummary, type ProductRecord, type ContactSummary, type JourneySummary, type JourneyStage } from "../../services/api-client";
import { type CustomStagesMap } from "../opportunities/stages";
import { useInbox } from "./hooks/useInbox";
import { useConversation } from "./hooks/useConversation";
import { useCockpitLayout } from "./hooks/useCockpitLayout";
import { InboxList } from "./InboxList/InboxList";
import { ConversationHeader } from "./Conversation/ConversationHeader";
import { MessageList } from "./Conversation/MessageList";
import { Composer } from "./Conversation/Composer";
import { ContextPanel } from "./ContextPanel/ContextPanel";
import { CockpitDrawers, type DrawerType } from "./drawers/CockpitDrawers";
import {appendSuggestedDraft} from "./utils/appendSuggestedDraft";
import { panelFrame, PANEL_GAP } from "./utils/panelFrame";

interface CockpitPageProps {
  session?: UseSessionReturn;
}

export const CockpitPage: FC<CockpitPageProps> = ({ session: propSession }) => {
  const fallbackSession = useSession(null);
  const session = propSession || fallbackSession;
  const { isMobile, isTablet, isTabletCompact } = useBreakpoint();
  const isSinglePane = isMobile || Boolean(isTabletCompact);
  const [wideContext,setWideContext]=useState(()=>typeof window==='undefined'||window.innerWidth>=1440);
  useEffect(()=>{const resize=()=>setWideContext(window.innerWidth>=1440);window.addEventListener('resize',resize);resize();return()=>window.removeEventListener('resize',resize);},[]);
  const contextAsDrawer=isMobile||isTablet||!wideContext;
  const layout = useCockpitLayout();
  const [returnFocusThreadId,setReturnFocusThreadId]=useState<string|null>(null);
  const handleBackToList=()=>{setReturnFocusThreadId(layout.selectedThreadId);layout.handleBackToList();};
  useEffect(()=>setReturnFocusThreadId(null),[session.activeWorkspace?.id,session.token]);
  const inbox = useInbox(session);
  const conversation = useConversation(layout.selectedThreadId, session, inbox.refreshThreads,thread=>channelSendBlockReason(thread,inbox.channels,Boolean(inbox.channelsLoading),inbox.channelError??null,Boolean(session.isLoadingMe||session.isLoadingWorkspace||session.error)));

  const currentDraft=useRef(conversation.messageInput);currentDraft.current=conversation.messageInput;
  const [pixRefreshKey,setPixRefreshKey]=useState(0);
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [proposals, setProposals] = useState<CommercialProposalSummary[]>([]);
  const [proposalsLoading,setProposalsLoading]=useState(false);
  const [proposalBusy,setProposalBusy]=useState(false);
  const [proposalReview,setProposalReview]=useState(false);
  const proposalSequence=useRef(0),proposalEpoch=useRef(0),proposalLock=useRef(false);
  const proposalScope=useRef("");proposalScope.current=`${session.activeWorkspace?.id}:${session.token}:${layout.selectedThreadId}`;
  const [proposalPix,setProposalPix]=useState<{proposal:CommercialProposalSummary;scope:string}|null>(null);
  useEffect(()=>{setProposalPix(null);},[session.activeWorkspace?.id,session.token,layout.selectedThreadId]);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactSummary | null>(null);
  const [customStages, setCustomStages] = useState<CustomStagesMap>({});
  const currentContext=useRef({workspaceId:session.activeWorkspace?.id,threadId:layout.selectedThreadId,token:session.token});
  currentContext.current={workspaceId:session.activeWorkspace?.id,threadId:layout.selectedThreadId,token:session.token};
  const [isResumingAutomation,setIsResumingAutomation]=useState(false);
  const resumeLock=useRef<symbol|null>(null);
  const [automationError,setAutomationError]=useState<string|null>(null);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [stageError,setStageError]=useState<string|null>(null);
  const [stageReview,setStageReview]=useState<{requestedStage:JourneyStage;journey:JourneySummary|null;contacts:ContactSummary[];threadId:string;contactId:string}|null>(null);
  const stageLock=useRef(false),stageEpoch=useRef(0),stageScope=useRef('');stageScope.current=`${session.activeWorkspace?.id}:${session.token}:${layout.selectedThreadId}`;
  useEffect(()=>{stageEpoch.current++;stageLock.current=false;setIsUpdatingStage(false);setStageError(null);setStageReview(null);return()=>{stageEpoch.current++;};},[session.activeWorkspace?.id,session.token,layout.selectedThreadId]);

  useEffect(() => {
    let cancelled=false;setCustomStages({});
    if(session.activeWorkspace?.id&&session.token) apiClient.getStageLabels(session.activeWorkspace.id,{token:session.token})
      .then(result=>{if(!cancelled)setCustomStages(result.labels);}).catch(()=>{});
    return()=>{cancelled=true;};
  }, [session.activeWorkspace?.id,session.token]);

  useEffect(() => {
    if (!conversation.selectedThread || !session.activeWorkspace?.id || !session.token) {
      setSelectedContact(null);
      return;
    }
    let cancelled = false;
    setSelectedContact(null);
    apiClient
      .getContacts(
        session.activeWorkspace.id,
        { search: conversation.selectedThread.contactPhone, status: "all", limit: 1 },
        { token: session.token }
      )
      .then((res) => {
        if (!cancelled) setSelectedContact(res.contacts.find((contact) => contact.id === conversation.selectedThread?.contactId) || null);
      })
      .catch(() => { if (!cancelled) setSelectedContact(null); });
    return () => { cancelled = true; };
  }, [conversation.selectedThread?.id, conversation.selectedThread?.contactPhone, session.activeWorkspace?.id, session.token]);

  const handleSaveNotes = async (notes: string) => {
    if (!session.activeWorkspace?.id || !session.token || !selectedContact ||
        selectedContact.id !== conversation.selectedThread?.contactId) {
      throw new Error("Aguarde o carregamento da ficha do cliente para salvar.");
    }
    const scope = { ...currentContext.current };
    const stillCurrent = () => scope.workspaceId === currentContext.current.workspaceId && scope.threadId === currentContext.current.threadId && scope.token === currentContext.current.token;
    try {
      const result = await apiClient.updateContact(
        session.activeWorkspace.id,
        selectedContact.id,
        { metadata: { notes }, expectedNotes: selectedContact.metadata?.notes ?? null },
        { token: session.token }
      );
      if (stillCurrent()) setSelectedContact((current) => current?.id === result.contact.id ? result.contact : current);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.title === "Nota alterada") {
        try {
          const result = await apiClient.getContacts(session.activeWorkspace.id, { search: selectedContact.phoneE164, status: "all", limit: 1 }, { token: session.token });
          const refreshed = result.contacts.find(contact => contact.id === selectedContact.id);
          if (refreshed && stillCurrent()) setSelectedContact(refreshed);
        } catch { /* Keep the original conflict and the local draft when refreshing fails. */ }
      }
      throw error;
    }
  };

  const handleUpdateLeadStage = async (newStage: string) => {
    if(!conversation.selectedThread||!session.activeWorkspace?.id||!session.token||stageLock.current||!STAGES.some(stage=>stage.id===newStage))return;
    const workspaceId=session.activeWorkspace.id,thread=conversation.selectedThread,requestedScope=stageScope.current,epoch=stageEpoch.current;
    const valid=()=>requestedScope===stageScope.current&&epoch===stageEpoch.current;
    stageLock.current=true;setIsUpdatingStage(true);setStageError(null);
    try{
      const res=await apiClient.getThreadJourney(workspaceId,thread.id,{token:session.token});if(!valid())return;
      if(res.journey){if(res.journey.threadId!==thread.id||res.journey.contactId!==thread.contactId)throw new Error('A negociação não corresponde à conversa. Atualize o atendimento antes de alterar.');setStageReview({requestedStage:newStage as JourneyStage,journey:res.journey,contacts:[],threadId:thread.id,contactId:thread.contactId});}
      else{const result=await apiClient.getContacts(workspaceId,{search:thread.contactPhone,status:'all',limit:100},{token:session.token});if(!valid())return;const contact=result.contacts.find(item=>item.id===thread.contactId);if(!contact)throw new Error('Não foi possível localizar a ficha desta conversa para criar a oportunidade. Confira o cadastro.');setStageReview({requestedStage:newStage as JourneyStage,journey:null,contacts:[contact],threadId:thread.id,contactId:thread.contactId});}
    }catch(e){if(valid())setStageError(userFacingError(e,'Não foi possível consultar a negociação. Nenhuma alteração foi solicitada; tente novamente.'));}
    finally{if(valid()){stageLock.current=false;setIsUpdatingStage(false);}}
  };
  const afterStageCreated=async()=>{
    if(!stageReview||!session.activeWorkspace?.id||!session.token)return;
    const requestedScope=stageScope.current,epoch=stageEpoch.current,review=stageReview;
    const result=await apiClient.getThreadJourney(session.activeWorkspace.id,review.threadId,{token:session.token});
    if(requestedScope!==stageScope.current||epoch!==stageEpoch.current)return;
    if(!result.journey)throw new Error('A oportunidade foi criada, mas a consulta ainda não a retornou. Atualize o atendimento antes de repetir.');
    await inbox.refreshThreads();
    if(requestedScope!==stageScope.current||epoch!==stageEpoch.current)return;
    if(review.requestedStage==='won'||review.requestedStage==='lost')setStageReview({...review,journey:result.journey});else setStageReview(null);
  };

  const refreshProposals=useCallback(async(propagateError=false)=>{
    if(!layout.selectedThreadId||!session.activeWorkspace?.id||!session.token)return;
    const requestedScope=proposalScope.current,sequence=++proposalSequence.current;
    const valid=()=>requestedScope===proposalScope.current&&sequence===proposalSequence.current;
    setProposalsLoading(true);setProposalError(null);
    try{const res=await apiClient.getThreadProposals(session.activeWorkspace.id,layout.selectedThreadId,{token:session.token});if(valid()){if(!Array.isArray(res?.items))throw new Error("A consulta não confirmou uma lista válida de propostas. Consulte novamente antes de decidir.");setProposals(res.items);setProposalReview(false);}}
    catch(e){if(valid()){setProposalReview(true);setProposalError(userFacingError(e,'Não foi possível consultar as propostas. Tente novamente.'));if(propagateError)throw e;}}
    finally{if(valid())setProposalsLoading(false);}
  },[layout.selectedThreadId,session.activeWorkspace?.id,session.token]);
  useEffect(()=>{proposalEpoch.current++;proposalLock.current=false;setProposalBusy(false);setProposalReview(false);setProposals([]);setProposalError(null);setProposalsLoading(false);void refreshProposals();return()=>{proposalSequence.current++;proposalEpoch.current++;};},[refreshProposals]);

  const handleUpdateProposalStatus = async (proposalId: string, status: CommercialProposalSummary["status"]) => {
    if(!session.activeWorkspace?.id||!session.token||proposalLock.current||proposalsLoading||proposalReview)return;
    const proposal=proposals.find(item=>item.id===proposalId);if(!proposal)return;
    const requestedScope=proposalScope.current,epoch=proposalEpoch.current;
    const valid=()=>requestedScope===proposalScope.current&&epoch===proposalEpoch.current;
    proposalLock.current=true;setProposalBusy(true);setProposalError(null);proposalSequence.current++;setProposalsLoading(false);let committed=false;
    try{await apiClient.patchProposalStatus(session.activeWorkspace.id,proposalId,{status,expectedVersion:proposal.stateVersion},{token:session.token});committed=true;if(valid())await refreshProposals(true);}
    catch(e){if(valid()){setProposalReview(true);const conflict=e instanceof ApiError?e.status===409:e instanceof Error&&/^\[409\]/.test(e.message);setProposalError(committed?'A alteração da proposta foi salva, mas a lista não pôde ser atualizada. Consulte as propostas novamente antes de outra alteração.':conflict?'A proposta foi alterada por outra pessoa. Consulte as propostas novamente antes de repetir.':userFacingError(e,'Não foi possível confirmar a alteração. Consulte as propostas novamente antes de repetir.'));}}
    finally{if(valid()){proposalLock.current=false;setProposalBusy(false);}}
  };

  const openProposalPix=(proposal:CommercialProposalSummary)=>{
    if(proposalLock.current||proposalsLoading||proposalReview||proposal.status!=="accepted"||proposal.threadId!==layout.selectedThreadId)return;
    const current=proposals.find(item=>item.id===proposal.id&&item.stateVersion===proposal.stateVersion);if(!current)return;
    setActiveDrawer(null);layout.setIsContextDrawerOpen(false);setProposalPix({proposal:current,scope:proposalScope.current});
  };

  const latestWindow=useRef(conversation.windowInfo);latestWindow.current=conversation.windowInfo;
  const handleShareProducts = async (products:ProductRecord[],idempotencyKey?:string) => {
    if(!conversation.selectedThread||!session.activeWorkspace?.id||!session.token)throw new Error("Selecione uma conversa e confirme o acesso à empresa antes de enviar.");
    const blocked=freeformSendBlockReason(latestWindow.current);if(blocked)throw new Error(blocked);
    const requestedContext=currentContext.current;
    const {message}=buildProductOfferMessage(products,conversation.selectedThread.channelProvider);
    await apiClient.sendOutboundMessage(session.activeWorkspace.id,conversation.selectedThread.channelInstanceId,{...message,idempotencyKey,recipientPhoneE164:conversation.selectedThread.contactPhone},{token:session.token});
    if(requestedContext.workspaceId===currentContext.current.workspaceId&&requestedContext.threadId===currentContext.current.threadId&&requestedContext.token===currentContext.current.token)void conversation.refreshMessages().catch(()=>{});
  };
  const handleSendProduct=(product:ProductRecord,idempotencyKey?:string)=>handleShareProducts([product],idempotencyKey);
  const handleSendProducts=(products:ProductRecord[],idempotencyKey?:string)=>handleShareProducts(products,idempotencyKey);

  useEffect(()=>{resumeLock.current=null;setAutomationError(null);setIsResumingAutomation(false);},[session.activeWorkspace?.id,session.token,layout.selectedThreadId]);

  const isThreadActive = Boolean(layout.selectedThreadId);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", backgroundColor: "var(--bg-canvas)", gap: isSinglePane ? 0 : PANEL_GAP, padding: isSinglePane ? 0 : PANEL_GAP, boxSizing: "border-box" }}>
      {/* 1. Inbox List Panel */}
      {(!isSinglePane || !isThreadActive) && (
        <InboxList
          customStages={customStages}
          requiresRefresh={inbox.requiresThreadRefresh}
          hasMore={inbox.pagination?.hasMore}
          isLoadingMore={inbox.isLoadingMoreThreads}
          isRefreshing={inbox.isRefreshingThreads}
          onLoadMore={()=>void inbox.loadMoreThreads?.()}
          threads={inbox.filteredThreads}
          selectedThreadId={layout.selectedThreadId}
          restoreFocusThreadId={returnFocusThreadId}
          onSelectThread={id=>{setReturnFocusThreadId(null);layout.setSelectedThreadId(id);}}
          queueFilter={inbox.queueFilter}
          onQueueFilterChange={inbox.setQueueFilter}
          searchQuery={inbox.searchQuery}
          onSearchQueryChange={inbox.setSearchQuery}
          isCollapsed={layout.isLeftCollapsed}
          onToggleCollapse={layout.toggleLeft}
          activeChannel={inbox.activeChannel}
          channels={inbox.channels}
          selectedChannelId={inbox.selectedChannelId}
          onSelectChannelId={inbox.setSelectedChannelId}
          isMobile={isSinglePane}
          onSync={() => inbox.syncActiveChannel()}
          isSyncing={inbox.isSyncing}
          canImportHistory={inbox.historyImportAvailable}
          isLoading={inbox.isLoadingThreads || session.isLoadingMe || session.isLoadingWorkspace}
          error={inbox.error}
          notice={inbox.notice}
          onRetry={()=>void inbox.retry()}
        />
      )}

      {/* 2. Conversation / Empty State Area */}
      {(!isSinglePane || isThreadActive) && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight:0,minWidth: 0, backgroundColor: "var(--bg-surface)", ...panelFrame(isSinglePane) }}>
          {layout.selectedThreadId&&<>
            {conversation.statusNotice&&<p role="status" style={{padding:"12px 16px",fontSize:13}}>{conversation.statusNotice}</p>}
            {conversation.sendNotice&&<p role="status" style={{padding:"12px 16px",fontSize:13}}>{conversation.sendNotice}</p>}
            {conversation.sendError&&<p role="alert" style={{padding:"12px 16px",color:"var(--color-danger)",fontSize:13}}>{conversation.sendError}</p>}
          </>}
          {conversation.selectedThread ? (
            <>
              {stageError&&<p role="alert">{stageError}</p>}
              <ConversationHeader
                thread={conversation.selectedThread}
                onBack={handleBackToList}
                isMobile={isSinglePane}
                onRefresh={async () => {
                  await Promise.all([conversation.refreshMessages(), inbox.refreshThreads(),conversation.refreshSelectedThread?.()]);
                }}
                isRefreshing={conversation.isLoadingMessages}
                onOpenRadar={() => setActiveDrawer("radar")}
                onOpenDossier={() => setActiveDrawer("dossier")}
                onToggleContext={() => contextAsDrawer ? layout.setIsContextDrawerOpen(!layout.isContextDrawerOpen) : layout.toggleRight()}
                isContextOpen={contextAsDrawer ? layout.isContextDrawerOpen : !layout.isRightCollapsed}
                isResumingAutomation={isResumingAutomation||Boolean(conversation.isUpdatingStatus)}
                automationError={automationError}
                onResumeAutomation={async () => {
                  if(!session.activeWorkspace?.id||!session.token||isResumingAutomation||conversation.isUpdatingStatus||resumeLock.current)return;
                  const request=Symbol();resumeLock.current=request;
                  const scope={workspaceId:session.activeWorkspace.id,threadId:layout.selectedThreadId,token:session.token};
                  const isCurrent=()=>currentContext.current.workspaceId===scope.workspaceId && currentContext.current.threadId===scope.threadId && currentContext.current.token===scope.token&&resumeLock.current===request;
                  setIsResumingAutomation(true);setAutomationError(null);
                  try {
                    const result=await apiClient.getAiAutomationAvailability(scope.workspaceId,{token:scope.token});
                    if(!isCurrent())return;
                    if(!result.success||typeof result.activeEnabled!=="boolean"){setAutomationError("Não foi possível confirmar a configuração em uso da IA. Consulte as configurações antes de devolver a conversa.");return;}
                    if(!result.activeEnabled){setAutomationError("A IA está desativada na configuração em uso desta empresa. Continue o atendimento manual ou revise a configuração antes de devolver a conversa.");return;}
                    await conversation.handleUpdateStatus("active");
                  }catch(error){if(isCurrent())setAutomationError(userFacingError(error,"Não foi possível confirmar a devolução. Consulte o estado do atendimento antes de repetir."));}
                  finally{if(resumeLock.current===request){resumeLock.current=null;setIsResumingAutomation(false);}}
                }}
                onUpdateStage={handleUpdateLeadStage}
                customStages={customStages}
                isUpdatingStage={isUpdatingStage}
              />
              <MessageList key={JSON.stringify(["messages",session.user?.id,session.activeWorkspace?.id,conversation.selectedThread.id])} emptyDescription={conversation.windowInfo.sendBlockedReason?"Não há mensagens registradas nesta consulta. Você pode preparar um rascunho e conferir a disponibilidade do canal abaixo.":undefined} messages={conversation.messages} isLoading={conversation.isLoadingMessages} error={conversation.messagesError} onRetry={()=>void conversation.refreshMessages()}/>
              <Composer
                key={JSON.stringify([session.user?.id,session.activeWorkspace?.id,conversation.selectedThread.id])}
                draft={conversation.messageInput}
                onDraftChange={conversation.handleMessageInputChange}
                attachedFile={conversation.attachedFile}
                onAttachFile={conversation.setAttachedFile}
                onSend={conversation.handleSendMessage}
                isSending={conversation.isSendingMessage}
                windowInfo={conversation.windowInfo}
                isCheckingChannel={inbox.channelsLoading||Boolean(conversation.windowInfo.isLoading)}
                onRefreshChannel={()=>{void inbox.retry();void conversation.refreshMessages();}}
                onOpenTemplates={() => setActiveDrawer("template")}
                onOpenCatalog={() => setActiveDrawer("catalog")}
                onOpenFlows={() => setActiveDrawer("flow")}
                onOpenPix={() => setActiveDrawer("pix")}
                isMobile={isSinglePane}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6, 24px)" }}>
              {layout.selectedThreadId?<div style={{display:"grid",gap:12,maxWidth:420}}>
                <p role={conversation.selectedThreadError?"alert":"status"}>{conversation.selectedThreadError||"Consultando a conversa selecionada…"}</p>
                {conversation.selectedThreadError&&<Button onClick={()=>void conversation.refreshSelectedThread?.()}>Tentar consultar a conversa novamente</Button>}
                <Button variant="secondary" onClick={handleBackToList}>Voltar para a fila</Button>
              </div>:<EmptyState icon={<MessageSquare size={48}/>} title="Selecione uma conversa" description="Escolha um lead na fila de atendimento à esquerda para iniciar o atendimento comercial."/>}
            </div>
          )}
        </main>
      )}

      {/* 3. Context Panel (Desktop Inline, Tablet / Mobile in Drawer) */}
      {!contextAsDrawer && !layout.isRightCollapsed && conversation.selectedThread && (
        <ContextPanel
          thread={conversation.selectedThread}
          contact={selectedContact}
          notes={selectedContact?.id === conversation.selectedThread.contactId ? selectedContact.metadata?.notes || "" : ""}
          onSaveNotes={selectedContact?.id === conversation.selectedThread.contactId ? handleSaveNotes : undefined}
          onClose={layout.toggleRight}
          journeyStage={conversation.selectedThread.journeyStage}
          onUpdateStage={handleUpdateLeadStage}
          customStages={customStages}
          isUpdatingStage={isUpdatingStage}
          stageError={stageError}
          onEditLead={() => setActiveDrawer("dossier")}
          proposals={proposals}
          onCreateProposal={() => setActiveDrawer("proposal")}
          onUpdateProposalStatus={handleUpdateProposalStatus}
          onGenerateProposalPix={openProposalPix}
          proposalError={proposalError}
          proposalsLoading={proposalsLoading}
          proposalBusy={proposalBusy}
          proposalReview={proposalReview}
          onRefreshProposals={()=>{if(!proposalLock.current)void refreshProposals();}}
          workspaceId={session.activeWorkspace?.id}
          token={session.token??undefined}
          pixRefreshKey={pixRefreshKey}
          onGeneratePix={() => setActiveDrawer("pix")}
        />
      )}

      {contextAsDrawer && conversation.selectedThread && (
        <Drawer
          isOpen={layout.isContextDrawerOpen}
          onClose={() => layout.setIsContextDrawerOpen(false)}
          title="Contexto do Lead"
          position={isMobile ? "bottom" : "right"}
        >
          <ContextPanel
            thread={conversation.selectedThread}
            contact={selectedContact}
            notes={selectedContact?.id === conversation.selectedThread.contactId ? selectedContact.metadata?.notes || "" : ""}
            onSaveNotes={selectedContact?.id === conversation.selectedThread.contactId ? handleSaveNotes : undefined}
            onClose={() => layout.setIsContextDrawerOpen(false)}
            journeyStage={conversation.selectedThread.journeyStage}
            onUpdateStage={handleUpdateLeadStage}
            customStages={customStages}
            isUpdatingStage={isUpdatingStage}
            stageError={stageError}
          onEditLead={() => setActiveDrawer("dossier")}
            proposals={proposals}
            onCreateProposal={() => setActiveDrawer("proposal")}
            onUpdateProposalStatus={handleUpdateProposalStatus}
          onGenerateProposalPix={openProposalPix}
            proposalError={proposalError}
          proposalsLoading={proposalsLoading}
          proposalBusy={proposalBusy}
          proposalReview={proposalReview}
          onRefreshProposals={()=>{if(!proposalLock.current)void refreshProposals();}}
            workspaceId={session.activeWorkspace?.id}
          token={session.token??undefined}
          pixRefreshKey={pixRefreshKey}
          onGeneratePix={() => setActiveDrawer("pix")}
            isMobile={true}
          />
        </Drawer>
      )}

      <HistoryImportDialog refreshTarget="atendimento" channel={inbox.historyReview??null} pending={inbox.isSyncing} acknowledged={Boolean(inbox.historyAcknowledged)} result={inbox.historyResult??null} error={inbox.historyError??null} refreshError={Boolean(inbox.historyRefreshError)} onAcknowledge={value=>inbox.setHistoryAcknowledged?.(value)} onConfirm={()=>void inbox.confirmHistoryImport?.()} onClose={()=>inbox.closeHistoryImport?.()}/>
      {stageReview&&session.activeWorkspace?.id&&session.token&&<>
        <OpportunityDetailDialog journey={stageReview.journey} requestedStage={stageReview.requestedStage} contact={selectedContact?.id===stageReview.contactId?selectedContact:undefined} workspaceId={session.activeWorkspace.id} token={session.token} customStages={customStages} onClose={()=>setStageReview(null)} onChanged={async()=>{await inbox.refreshThreads();}}/>
        <NewOpportunityDialog isOpen={!stageReview.journey} workspaceId={session.activeWorkspace.id} token={session.token} contacts={stageReview.contacts} thread={{id:stageReview.threadId,contactId:stageReview.contactId}} initialStage={stageReview.requestedStage==='won'||stageReview.requestedStage==='lost'?'proposal':stageReview.requestedStage} customStages={customStages} onClose={()=>setStageReview(previous=>previous?.journey?previous:null)} onCreated={afterStageCreated}/>
      </>}
      {proposalPix&&proposalPix.scope===proposalScope.current&&session.activeWorkspace?.id&&session.token&&<ProposalPixDialog key={JSON.stringify([proposalPix.scope,proposalPix.proposal.id,proposalPix.proposal.stateVersion])} proposal={proposalPix.proposal} workspaceId={session.activeWorkspace.id} token={session.token} onClose={()=>setProposalPix(null)} onCreated={()=>setPixRefreshKey(value=>value+1)} onViewCharges={()=>{setProposalPix(null);setActiveDrawer("pix");}}/>}
      <CockpitDrawers
        textSendBlockedReason={freeformSendBlockReason(conversation.windowInfo)}
        sendBlockedReason={conversation.windowInfo.sendBlockedReason}
        onRefreshChannel={()=>{void inbox.retry();void conversation.refreshMessages();}}
        isCheckingChannel={inbox.channelsLoading||Boolean(conversation.windowInfo.isLoading)}
        activeDrawer={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        selectedThread={conversation.selectedThread}
        session={session}
        onTemplateSent={conversation.refreshMessages}
        onProposalCreated={()=>refreshProposals(true)}
        onPixCreated={()=>{setPixRefreshKey(value=>value+1);void conversation.refreshMessages();}}
        radarCurrentDraft={conversation.messageInput}
        onRadarDraftApplied={(draft) => conversation.handleMessageInputChange(appendSuggestedDraft(currentDraft.current,draft))}
        onSendProduct={handleSendProduct}
        onSendProducts={handleSendProducts}
        onContactUpdated={(contact) => setSelectedContact(contact)}
      />
    </div>
  );
};

export default CockpitPage;
