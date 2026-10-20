import { useState, useEffect, useRef, useCallback, type FC } from "react";
import {hasWorkspacePermission} from "@sos-sales/contracts";
import { PageHeader, useBreakpoint, Alert, Button } from "@sos-sales/ui";
import { Radio, Bot, QrCode, LogOut, Braces, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ChannelSummary } from "../../services/api-client";
import { ChannelActionDialog, type ChannelActionReview } from "./ChannelActionDialog";
import {ChannelConnectionDialog} from "./ChannelConnectionDialog";
import {MetaSubscriptionDialog} from "./MetaSubscriptionDialog";
import {HistoryImportDialog,type HistoryImportResult} from "./HistoryImportDialog";
import { ChannelsSection } from "./ChannelsSection";
import { TeamSection } from "./TeamSection";
import { AiAgentSection } from "./AiAgentSection";
import { PixSection } from "./PixSection";
import { DangerSection } from "./DangerSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { ChannelWizardDialog } from "./ChannelWizardDialog";
import { QrCodeDialog } from "./QrCodeDialog";
import { useChannelQr } from "./useChannelQr";
import { requestNavigation } from "../../utils/request-navigation";
import { userFacingError } from "../../utils/user-facing-error";

type SettingsTab = "canais" | "equipe" | "ia" | "pix" | "integracoes" | "perigo";
function validateChannels(value:unknown,workspaceId:string):ChannelSummary[]{
  if(!Array.isArray(value))throw new Error('A consulta não confirmou uma lista válida de canais. Tente consultar novamente.');
  const ids=new Set<string>();
  for(const channel of value){
    if(!channel||typeof channel!=='object'||typeof channel.id!=='string'||!channel.id.trim()||ids.has(channel.id)||typeof channel.displayName!=='string'||typeof channel.provider!=='string'||!channel.provider.trim()||typeof channel.isActive!=='boolean'||(channel.workspaceId!=null&&channel.workspaceId!==workspaceId)||(channel.phoneNumberE164!=null&&typeof channel.phoneNumberE164!=='string')||(channel.status!=null&&typeof channel.status!=='string')||(channel.revision!=null&&(typeof channel.revision!=='string'||!channel.revision.trim()))||(channel.metaBillingConfigured!=null&&typeof channel.metaBillingConfigured!=='boolean')||(channel.metaSubscriptionStatus!=null&&typeof channel.metaSubscriptionStatus!=='string')||(channel.metaSubscriptionCheckedAt!=null&&(typeof channel.metaSubscriptionCheckedAt!=='string'||!Number.isFinite(Date.parse(channel.metaSubscriptionCheckedAt)))))throw new Error('A consulta trouxe dados de canal incompatíveis. Atualize a lista antes de operar sobre os canais.');
    ids.add(channel.id);
  }
  return value;
}

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const checkingAccess=Boolean(session.isLoadingMe||session.isLoadingWorkspace);
  const accessUnavailable=checkingAccess||Boolean(session.error);
  const role=accessUnavailable?undefined:activeWorkspace?.role;
  const canReadChannels=hasWorkspacePermission(role,'cockpit:access');
  const canManage=hasWorkspacePermission(role,'workspace:manage');
  const canSync=hasWorkspacePermission(role,'cockpit:access');
  const [activeTab, setActiveTab] = useState<SettingsTab>("canais");
  const allowedTabs:SettingsTab[]=[...(canReadChannels?["canais" as const]:[]),...(hasWorkspacePermission(role,"workspace:view")?["equipe" as const,"pix" as const]:[]),...(canManage?["ia" as const]:[]),...(hasWorkspacePermission(role,"integration:view")?["integracoes" as const]:[]),"perigo"];
  const selectedTab=allowedTabs.includes(activeTab)?activeTab:allowedTabs[0]!;

  const requestTab=(tab:SettingsTab)=>{if(tab!==activeTab)requestNavigation(()=>setActiveTab(tab));};

  // Channels state
  const [connectionReview,setConnectionReview]=useState<ChannelSummary|null>(null);
  const [metaSubscriptionReview,setMetaSubscriptionReview]=useState<ChannelSummary|null>(null);
  const [historyReview,setHistoryReview]=useState<ChannelSummary|null>(null),[historyAcknowledged,setHistoryAcknowledged]=useState(false),[historyResult,setHistoryResult]=useState<HistoryImportResult|null>(null),[historyError,setHistoryError]=useState<string|null>(null),[historyRefreshError,setHistoryRefreshError]=useState(false);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [actionReview, setActionReview] = useState<ChannelActionReview | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [billingAcknowledged, setBillingAcknowledged] = useState(false);
  const actionInFlight = useRef(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [channelError,setChannelError]=useState<string | null>(null);
  const [channelNotice,setChannelNotice]=useState<string | null>(null);
  const [channelsCheckedAt,setChannelsCheckedAt]=useState<string|null>(null);
  const [channelLoadFailed,setChannelLoadFailed]=useState(false);
  const channelsReady=channelsCheckedAt!==null&&!isLoadingChannels&&!channelLoadFailed;
  const scope=useRef("");scope.current=`${activeWorkspace?.id ?? ""}:${token ?? ""}:${role??""}`;
  const loadSequence=useRef(0);
  const epoch=useRef(0);
  const syncInFlight = useRef(false);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);

  // Dialogs
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const loadChannels = useCallback(async (propagateError=false) => {
    if (!activeWorkspace || !token || !canReadChannels || selectedTab!=="canais") return;
    const requestedScope=scope.current,requestedEpoch=epoch.current,sequence=++loadSequence.current;
    setIsLoadingChannels(true);
    setChannelError(null);
    try {
      const res = await apiClient.getChannels(activeWorkspace.id, { token, includeInactive: true });
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&sequence===loadSequence.current){const confirmed=validateChannels(res?.channels,activeWorkspace.id);setChannels(confirmed);setChannelsCheckedAt(new Date().toISOString());setChannelLoadFailed(false);}
    } catch (error) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&sequence===loadSequence.current){setChannelLoadFailed(true);setChannelError(userFacingError(error,"Não foi possível carregar os canais. Tente novamente."));if(propagateError)throw error;}
    } finally {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&sequence===loadSequence.current)setIsLoadingChannels(false);
    }
  },[activeWorkspace?.id,token,role,selectedTab,canReadChannels]);

  useEffect(() => {
    setHistoryReview(null);setHistoryAcknowledged(false);setHistoryResult(null);setHistoryError(null);setHistoryRefreshError(false);setConnectionReview(null);setMetaSubscriptionReview(null);qr.close();epoch.current++;actionInFlight.current=false;syncInFlight.current=false;setActionReview(null);setActionError(null);setActionPending(false);setBillingAcknowledged(false);setRevokingId(null);setDeletingId(null);setSyncingChannelId(null);setChannels([]);setChannelsCheckedAt(null);setChannelLoadFailed(false);setIsLoadingChannels(false);setChannelError(null);setChannelNotice(null);setIsWizardOpen(false);
    void loadChannels();
    return()=>{loadSequence.current++;epoch.current++;};
  }, [loadChannels]);

  const qr = useChannelQr(activeWorkspace?.id, token, () => { void loadChannels(); });
  const qrModal = qr.modal;
  const handleOpenQr = (id:string,name:string) => {if(canManage && channelsReady && !actionInFlight.current && !syncInFlight.current)void qr.open(id,name);};
  const handleRefreshQr = qr.refresh;

  const reviewChannelAction = (channelId: string, kind: ChannelActionReview["kind"], targetBilling?: boolean) => {
    if (!canManage || !channelsReady || actionInFlight.current || syncInFlight.current) return;
    const channel = channels.find(item => item.id === channelId);
    if (!channel?.revision) { setChannelError("Atualize os canais antes de revisar esta ação."); return; }
    setActionError(null); setBillingAcknowledged(false); setActionReview({ kind, channel, targetBilling });
  };
  const handleRevoke = (channelId: string) => reviewChannelAction(channelId, "revoke");
  const handleDelete = (channelId: string) => reviewChannelAction(channelId, "archive");
  const handleToggleBilling = (channelId: string, currentConfigured: boolean) => reviewChannelAction(channelId, "billing", !currentConfigured);
  const closeActionReview = () => { if (!actionInFlight.current) { setActionReview(null); setActionError(null); setBillingAcknowledged(false); } };
  const performChannelAction = async () => {
    if (!actionReview || actionError || !channelsReady || !canManage || !activeWorkspace || !token || actionInFlight.current || !actionReview.channel.revision) return;
    if (actionReview.kind === "billing" && actionReview.targetBilling && !billingAcknowledged) return;
    const requestedScope=scope.current, requestedEpoch=epoch.current, review=actionReview;
    actionInFlight.current=true;setActionPending(true);setActionError(null);setChannelError(null);setChannelNotice(null);
    if(review.kind==="revoke")setRevokingId(review.channel.id);
    if(review.kind==="archive")setDeletingId(review.channel.id);
    const isCurrent = () => requestedScope===scope.current && requestedEpoch===epoch.current;
    try {
      const options = {token,signal:AbortSignal.timeout(20_000)};
      const result = review.kind === "billing" ? await apiClient.updateChannelBilling(activeWorkspace.id,review.channel.id,{metaBillingConfigured:Boolean(review.targetBilling),expectedRevision:review.channel.revision!,acknowledgedDeclaration:billingAcknowledged},options)
        : review.kind === "archive" ? await apiClient.deleteChannel(activeWorkspace.id,review.channel.id,review.channel.revision!,options)
        : await apiClient.revokeChannel(activeWorkspace.id,review.channel.id,review.channel.revision!,options);
      if (!isCurrent()) return;
      if (result?.success!==true||(result.message!=null&&typeof result.message!=='string')||
        (review.kind==='billing'&&(!('channel' in result)||result.channel?.id!==review.channel.id||result.channel.metaBillingConfigured!==review.targetBilling))||
        (review.kind==='archive'&&(!('mode' in result)||result.mode!=='archived'))||
        (review.kind==='revoke'&&(!('channelId' in result)||result.channelId!==review.channel.id||result.status!=='revoked')))
        throw new Error("O servidor não confirmou a alteração solicitada. A ação pode ter sido aplicada. Atualize os canais antes de tentar novamente.");
      setActionReview(null);setBillingAcknowledged(false);
      setChannelNotice(result.message || "Ação confirmada pelo servidor.");
      await loadChannels();
    } catch(error) {
      if (isCurrent()) setActionError(error instanceof Error && ["AbortError","TimeoutError"].includes(error.name) ? "A consulta terminou sem confirmação. A ação pode ter sido aplicada. Atualize os canais antes de decidir se precisa repetir." : userFacingError(error,"Não foi possível confirmar a ação. Atualize os canais antes de tentar novamente."));
    } finally {
      if (isCurrent()) {actionInFlight.current=false;setActionPending(false);setRevokingId(null);setDeletingId(null);}
    }
  };

  const handleSyncChannel = (channelId:string) => {
    if(!channelsReady||!canSync||actionInFlight.current||syncInFlight.current)return;
    const channel=channels.find(row=>row.id===channelId);
    if(!channel||channel.provider!=="waha"||!channel.isActive||channel.status!=="connected")return;
    setHistoryAcknowledged(false);setHistoryResult(null);setHistoryError(null);setHistoryRefreshError(false);setHistoryReview(channel);
  };
  const confirmHistoryImport=async()=>{
    if(!activeWorkspace||!token||!historyReview||!historyAcknowledged||historyResult||historyError||!channelsReady||!canSync||actionInFlight.current||syncInFlight.current)return;
    const currentChannel=channels.find(row=>row.id===historyReview.id);
    if(!currentChannel||currentChannel.provider!=="waha"||!currentChannel.isActive||currentChannel.status!=="connected"||currentChannel.revision!==historyReview.revision){setHistoryReview(null);setChannelError("O canal mudou. Atualize os canais e revise novamente; a importação não foi iniciada.");return;}
    const requestedScope=scope.current,requestedEpoch=epoch.current;
    const current=()=>requestedScope===scope.current&&requestedEpoch===epoch.current;
    syncInFlight.current=true;setSyncingChannelId(historyReview.id);
    try{
      const result=await apiClient.syncChannelChats(activeWorkspace.id,historyReview.id,{token,signal:AbortSignal.timeout(60000)});
      if(!current())return;setHistoryResult(result);
      if(!result.success){setHistoryError(result.message||"O servidor não confirmou a importação.");return;}
      try{await loadChannels(true);}catch{if(current())setHistoryRefreshError(true);}
    }catch(error){if(current())setHistoryError(userFacingError(error,"Não foi possível confirmar o resultado da importação."));}
    finally{if(current()){syncInFlight.current=false;setSyncingChannelId(null);}}
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: "canais", label: "Canais WhatsApp", icon: Radio },
    { id: "equipe", label: "Equipe & Acessos", icon: Users },
    { id: "ia", label: "Atendimento IA & Skills", icon: Bot },
    { id: "pix", label: "Cobrança Pix", icon: QrCode },
    { id: "integracoes", label: "API & Webhooks", icon: Braces },
    { id: "perigo", label: "Sessão deste dispositivo", icon: LogOut },
  ].filter(tab=>allowedTabs.includes(tab.id as SettingsTab)) as Array<{id:SettingsTab;label:string;icon:LucideIcon}>;

  if(accessUnavailable)return <div style={{padding:"var(--space-6)",overflowY:"auto",height:"100%",boxSizing:"border-box"}}><div style={{maxWidth:1080,margin:"0 auto",display:"grid",gap:20}}>
    <PageHeader title="Configurações" description="Consulte e ajuste as configurações disponíveis para seu perfil nesta empresa."/>
    {checkingAccess?<p role="status">Conferindo seu acesso à empresa… As configurações serão exibidas ao concluir.</p>:<Alert variant="danger" title="Não foi possível confirmar seu acesso">Tente atualizar seu acesso antes de editar as configurações da empresa.</Alert>}
    <Button variant="secondary" disabled={checkingAccess} onClick={()=>requestNavigation(()=>void session.refreshSession())}>Atualizar meu acesso</Button>
    {activeTab==="perigo"?<DangerSection session={session}/>:<Button variant="secondary" onClick={()=>requestTab("perigo")}>Sessão deste dispositivo</Button>}
  </div></div>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Configurações"
          description="Consulte e ajuste as configurações disponíveis para seu perfil nesta empresa."
        />

        <Button variant="secondary" disabled={session.isLoadingMe||session.isLoadingWorkspace} onClick={()=>requestNavigation(()=>void session.refreshSession())}>Atualizar meu acesso</Button>
        {!role&&session.isLoadingMe?<p role="status">Carregando seu perfil de acesso…</p>:!canManage&&<Alert variant="info" title="Acesso conforme seu perfil">Você verá somente as configurações permitidas nesta empresa. Alterações de acesso, IA e credenciais exigem proprietário ou administrador. Se seu perfil mudou, use Atualizar meu acesso.</Alert>}
        {/* Layout: 200px Left Nav + 720px Right Content */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: "24px",
            alignItems: "flex-start",
          }}
        >
          {/* 220px Left Section Navigation Card */}
          {isMobile ? <label style={{display:"flex",flexDirection:"column",gap:8,width:"100%",fontSize:13,fontWeight:600}}>Seção de configuração
            <select aria-label="Seção de configuração" value={selectedTab} onChange={event=>requestTab(event.target.value as SettingsTab)} style={{minHeight:44,width:"100%",padding:"10px 12px",border:"1px solid var(--border-default)",borderRadius:8,background:"var(--bg-surface)",color:"var(--text-primary)",font:"inherit"}}>
              {tabs.map(tab=><option key={tab.id} value={tab.id}>{tab.label}</option>)}
            </select>
          </label> : <nav
            aria-label="Seções de Configuração"
            style={{
              width: isMobile ? "100%" : "220px",
              minWidth: isMobile ? "100%" : "220px",
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: "4px",
              overflowX: isMobile ? "auto" : "visible",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              padding: "8px",
              boxSizing: "border-box",
            }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = selectedTab === tab.id;


              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => requestTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive?"var(--color-action-subtle)":"transparent",
                    color: isActive?"var(--color-action)":"var(--text-secondary)",
                    boxShadow: "none",
                    whiteSpace: "nowrap",
                    transition: "background-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease)",
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>}

          {/* Max 720px Right Content Area */}
          <div style={{ flex: 1, maxWidth: "720px", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            {selectedTab === "canais" && (
              <>
              {channelError && <Alert variant="danger" title="Atenção">{channelError}<Button size="sm" onClick={()=>void loadChannels()} disabled={isLoadingChannels}>Tentar novamente</Button></Alert>}
              {channelNotice && <Alert variant="info" title="Resultado da operação">{channelNotice}</Alert>}
              <ChannelsSection
                channels={channels}
                isLoading={isLoadingChannels || session.isLoadingMe || session.isLoadingWorkspace}
                canManage={canManage}
                onOpenWizard={() => {if(canManage)setIsWizardOpen(true);}}
                onOpenQr={handleOpenQr}
                onRevoke={handleRevoke}
                revokingId={revokingId}
                onDelete={handleDelete}
                deletingId={deletingId}
                onToggleBilling={handleToggleBilling}
                onApproveConnection={channel=>{if(canManage&&channelsReady&&!actionInFlight.current&&!syncInFlight.current)setConnectionReview(channel);}}
                onCheckMetaSubscription={channel=>{if(canManage&&channelsReady&&!actionInFlight.current&&!syncInFlight.current)setMetaSubscriptionReview(channel);}}
                onSync={handleSyncChannel}
                syncingId={syncingChannelId}
                hasLoadError={channelLoadFailed}
                lastCheckedAt={channelsCheckedAt}
                isActionPending={actionPending}
                onReload={()=>void loadChannels()}
              />
              </>
            )}
            {selectedTab === "equipe" && <TeamSection session={session} />}
            {selectedTab === "ia" && <AiAgentSection workspaceId={activeWorkspace?.id} token={token ?? undefined} />}
            {selectedTab === "pix" && <PixSection session={session} />}
            {selectedTab === "integracoes" && <IntegrationsSection session={session} />}
            {selectedTab === "perigo" && <DangerSection session={session} />}
          </div>
        </div>
      </div>

      <ChannelActionDialog review={canManage && selectedTab==="canais" ? actionReview : null} pending={actionPending} error={actionError} acknowledged={billingAcknowledged} onAcknowledge={setBillingAcknowledged} onConfirm={()=>void performChannelAction()} onClose={closeActionReview} onReload={()=>{closeActionReview();void loadChannels();}} />
      {/* Connection Wizard Dialog */}
      <ChannelWizardDialog
        isOpen={canManage&&selectedTab==="canais"&&isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={activeWorkspace?.id}
        token={token ?? undefined}
        onChannelCreated={loadChannels}
        onReviewChannels={()=>void loadChannels()}
        onOpenQr={(id,name)=>{if(canManage&&!actionInFlight.current&&!syncInFlight.current)qr.open(id,name);}}
      />

      {metaSubscriptionReview&&canManage&&selectedTab==="canais"&&activeWorkspace&&token&&<MetaSubscriptionDialog key={`${scope.current}:${epoch.current}:${metaSubscriptionReview.id}`} channel={metaSubscriptionReview} workspaceId={activeWorkspace.id} token={token} onClose={()=>setMetaSubscriptionReview(null)} onUpdated={()=>loadChannels(true)}/>}

      {connectionReview&&canManage&&selectedTab==="canais"&&activeWorkspace&&token&&<ChannelConnectionDialog key={`${scope.current}:${epoch.current}:${connectionReview.id}`} channel={connectionReview} workspaceId={activeWorkspace.id} token={token} onClose={()=>setConnectionReview(null)} onUpdated={()=>loadChannels(true)}/>}

      <HistoryImportDialog channel={historyReview} pending={Boolean(syncingChannelId)} acknowledged={historyAcknowledged} result={historyResult} error={historyError} refreshError={historyRefreshError} onAcknowledge={setHistoryAcknowledged} onConfirm={()=>void confirmHistoryImport()} onClose={()=>{if(!syncInFlight.current)setHistoryReview(null);}}/>
      {/* WAHA QR Code Dialog */}
      <QrCodeDialog
        isOpen={canManage&&selectedTab==="canais"&&Boolean(qrModal)}
        onClose={qr.close}
        channelName={qrModal?.channelName || ""}
        qrDataUri={qrModal?.qrDataUri}
        isLoading={Boolean(qrModal?.isLoading)}
        isStarting={Boolean(qrModal?.isStarting)}
        isRefreshing={Boolean(qrModal?.isRefreshing)}
        isChecking={qr.checking}
        alreadyConnected={qrModal?.alreadyConnected}
        error={qrModal?.error}
        onRefresh={handleRefreshQr}
        connection={qrModal ?? undefined}
        reviewAction={qr.review?.action}
        isActing={qrModal?.isActing}
        actionNotice={qrModal?.actionNotice}
        pollingPaused={qrModal?.pollingPaused}
        onActionRequest={qr.requestAction}
        onActionConfirm={()=>void qr.confirmAction()}
        onCancelReview={qr.cancelReview}
      />
    </div>
  );
};

export default SettingsPage;
