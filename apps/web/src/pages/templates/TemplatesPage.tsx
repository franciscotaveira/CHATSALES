import { hasWorkspacePermission } from "@sos-sales/contracts";
import { useState, useEffect, useCallback, useRef, type FC } from "react";
import {
  PageHeader,
  Button,
  Input,
  EmptyState,
  LoadingState,
  SegmentedControl,
  useBreakpoint,
} from "@sos-sales/ui";
import { Plus, FileText, Search, Send, Sparkles } from "lucide-react";
import { apiClient, type MessageTemplateSummary } from "../../services/api-client";
import type { UseSessionReturn } from "../../hooks/useSession";
import { CreateTemplateDialog } from "./CreateTemplateDialog";
import { TemplateDetailDialog } from "./TemplateDetailDialog";
import { BroadcastTemplateDialog } from "./BroadcastTemplateDialog";
import { TemplatesTable } from "./TemplatesTable";
import { TemplateLibrarySection } from "./TemplateLibrarySection";
import {userFacingError} from "../../utils/user-facing-error";
import { CampaignsList } from "./CampaignsList";

interface TemplatesPageProps {
  broadcastRequest?: number;
  broadcastRequestScope?: string;
  session: UseSessionReturn;
}

export const TemplatesPage: FC<TemplatesPageProps> = ({ session,broadcastRequest=0,broadcastRequestScope }) => {
  const {isMobile}=useBreakpoint();
  const workspaceId = session.activeWorkspace?.id;
  const token = session.token;
  const workspaceRole=session.activeWorkspace?.role;
  const sessionLoading=Boolean(session.isLoadingMe||session.isLoadingWorkspace);
  const canSyncTemplates=hasWorkspacePermission(workspaceRole,"workspace:manage");

  const [activeTab, setActiveTab] = useState<"TEMPLATES" | "LIBRARY" | "CAMPAIGNS">("TEMPLATES");
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTemplates,setHasLoadedTemplates]=useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [syncChannels, setSyncChannels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [syncChannelId, setSyncChannelId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplateSummary | null>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const lastBroadcastRequest=useRef(0);
  const [broadcastTemplate, setBroadcastTemplate] = useState<MessageTemplateSummary | null>(null);

  const [loadError,setLoadError]=useState("");
  const [channelError,setChannelError]=useState("");
  const [loadingChannels,setLoadingChannels]=useState(false);
  const sequence=useRef(0),channelSequence=useRef(0),generation=useRef(0),syncBusy=useRef(false),scope=useRef("");
  const scopeKey=`${workspaceId}:${token}:${workspaceRole}:${sessionLoading}`;scope.current=scopeKey;
  const fetchTemplates = useCallback(async (propagateError=false) => {
    if (sessionLoading || !workspaceId || !token){setIsLoading(false);return;}
    const request=++sequence.current,requestedScope=scope.current;
    const valid=()=>request===sequence.current&&requestedScope===scope.current;
    setIsLoading(true);setLoadError("");
    try{const res=await apiClient.getTemplates(workspaceId,{}, {token});if(valid()){if(!Array.isArray(res?.templates))throw new Error("A consulta não confirmou uma lista válida de modelos. Tente consultar novamente.");setTemplates(res.templates);setHasLoadedTemplates(true);}}
    catch(e){if(valid()){setLoadError(userFacingError(e,"Não foi possível carregar os modelos."));if(propagateError)throw e;}}
    finally{if(valid())setIsLoading(false);}
  },[workspaceId,token,workspaceRole,sessionLoading]);
  const loadChannels=useCallback(async()=>{
    if(sessionLoading||!workspaceId||!token||!canSyncTemplates)return;
    const request=++channelSequence.current,requestedScope=scope.current;const valid=()=>request===channelSequence.current&&requestedScope===scope.current;
    setLoadingChannels(true);setChannelError("");
    try{const res=await apiClient.getChannels(workspaceId,{token});if(valid())setSyncChannels(res.channels.filter(c=>c.provider==="meta_waba"&&c.status==="connected"&&c.isActive));}
    catch(e){if(valid())setChannelError(userFacingError(e,"Não foi possível consultar os canais."));}
    finally{if(valid())setLoadingChannels(false);}
  },[workspaceId,token,workspaceRole,sessionLoading]);
  useEffect(()=>{
    generation.current++;sequence.current++;channelSequence.current++;syncBusy.current=false;lastBroadcastRequest.current=0;
    setTemplates([]);setHasLoadedTemplates(false);setSyncChannels([]);setSyncChannelId("");setSyncNotice("");setError("");setLoadError("");setChannelError("");setSyncing(false);setLoadingChannels(false);setIsCreateOpen(false);setPreviewTemplate(null);setIsBroadcastOpen(false);setBroadcastTemplate(null);
    void fetchTemplates();void loadChannels();
    return()=>{generation.current++;sequence.current++;channelSequence.current++;};
  },[fetchTemplates,loadChannels]);
  useEffect(()=>{
    if(sessionLoading)return;
    if(broadcastRequest===0){lastBroadcastRequest.current=0;setIsBroadcastOpen(false);return;}
    if(broadcastRequestScope!==undefined&&broadcastRequestScope!==`${workspaceId}:${token}:${session.activeWorkspace?.role}`)return;
    if(broadcastRequest>lastBroadcastRequest.current&&workspaceId&&token){lastBroadcastRequest.current=broadcastRequest;setIsBroadcastOpen(true);}
  },[broadcastRequest,broadcastRequestScope,workspaceId,token,session.activeWorkspace?.role,sessionLoading]);
  async function syncTemplates(){
    if(sessionLoading||!workspaceId||!token||!canSyncTemplates||!syncChannelId||!syncChannels.some(c=>c.id===syncChannelId)||syncBusy.current||loadingChannels||channelError)return;
    const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
    sequence.current++;setIsLoading(true);syncBusy.current=true;setSyncing(true);setError("");setSyncNotice("");let committed=false;
    try{const result=await apiClient.syncMetaTemplates(workspaceId,syncChannelId,{token});committed=true;if(!valid())return;setSyncNotice(`${result.imported} modelos consultados na Meta (pt_BR). Confira o estado de cada um antes de enviar.`);await fetchTemplates(true);}
    catch(e){if(valid())setError(committed?"A consulta à Meta foi concluída, mas a lista não foi atualizada. Atualize os modelos antes de repetir a sincronização.":userFacingError(e,"Não foi possível concluir a sincronização."));}
    finally{if(valid()){syncBusy.current=false;setSyncing(false);setIsLoading(false);}}
  }

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const matchName = t.name.toLowerCase().includes(term);
      const matchBody = t.bodyText.toLowerCase().includes(term);
      if (!matchName && !matchBody) return false;
    }
    return true;
  });

  if(sessionLoading)return <div><p role="status">Conferindo acesso aos modelos e campanhas…</p><LoadingState variant="skeleton" lines={4}/></div>;
  if(!workspaceId||!token)return <EmptyState title={!workspaceId?"Selecione uma empresa":"Acesso não confirmado"} description={!workspaceId?"Escolha uma empresa para consultar modelos e campanhas.":"Entre novamente para consultar modelos e campanhas desta empresa."}/>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: isMobile?"var(--space-4)":"var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1080px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <PageHeader
          title={
            activeTab === "TEMPLATES"
              ? "Modelos WABA"
              : activeTab === "LIBRARY"
              ? "Biblioteca de Modelos (Prontos)"
              : "Campanhas & Testes A/B"
          }
          description={
            activeTab === "TEMPLATES"
              ? "Cadastre rascunhos e confira o estado de aprovação no provedor antes de usar em campanhas."
              : activeTab === "LIBRARY"
              ? "Modelos testados de alta conversão para 13 segmentos comerciais brasileiros com Pix e validação Meta WABA."
              : "Consulte os resultados registrados. Envio, entrega, leitura e cliques dependem das confirmações disponíveis em cada canal."
          }
          actions={
            <div style={{ display: "flex", gap: "8px", alignItems: "center",flexWrap:"wrap",maxWidth:"100%" }}>
              {activeTab === "TEMPLATES" && (
                <Button
                  size="sm"
                  variant="secondary"
                  prefixIcon={<Sparkles size={14} />}
                  onClick={() => setActiveTab("LIBRARY")}
                >
                  Explorar Biblioteca (70+)
                </Button>
              )}
              {activeTab === "LIBRARY" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setActiveTab("TEMPLATES")}
                >
                  Meus Modelos ({templates.length})
                </Button>
              )}
              <Button
                size="sm"
                variant={activeTab === "CAMPAIGNS" ? "primary" : "secondary"}
                disabled={!workspaceId||!token}
                prefixIcon={<Send size={14} />}
                onClick={() => {
                  setBroadcastTemplate(null);
                  setIsBroadcastOpen(true);
                }}
              >
                Disparo em Massa
              </Button>
              {activeTab === "TEMPLATES" && (
                <Button
                  size="sm"
                  variant="primary"
                  prefixIcon={<Plus size={14} />}
                  disabled={!workspaceId||!token}
                  onClick={() => setIsCreateOpen(true)}
                >
                  Novo Modelo
                </Button>
              )}
            </div>
          }
        />

        {error && <p role="alert">{error}</p>}
        {loadError&&<div role="alert">{loadError}</div>}
        {channelError&&<div role="alert">{channelError} <Button disabled={loadingChannels||syncing} onClick={()=>void loadChannels()}>Consultar canais novamente</Button></div>}
        {activeTab === "TEMPLATES"&&<div><Button disabled={!workspaceId||!token||isLoading||syncing} onClick={()=>{if(isLoading||syncBusy.current)return;void fetchTemplates();}}>Atualizar modelos</Button><p style={{fontSize:12,color:"var(--text-secondary)"}}>Reconsulta os registros do SOS Vendas. Para consultar aprovações no provedor, use a sincronização da Meta.</p></div>}
        {activeTab === "TEMPLATES"&&hasLoadedTemplates&&isLoading&&<p role="status">Atualizando modelos… A lista exibida é da última consulta concluída.</p>}
        {activeTab === "TEMPLATES"&&hasLoadedTemplates&&loadError&&<p role="status">A lista exibida é da última consulta concluída e pode estar desatualizada.</p>}
        {syncNotice && <p role="status">{syncNotice}</p>}
        {activeTab === "TEMPLATES" && !canSyncTemplates && <p role="status">Sincronizar modelos da Meta exige proprietário ou administrador desta empresa. Você pode consultar os modelos cadastrados.</p>}
        {activeTab === "TEMPLATES" && canSyncTemplates && <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <label style={{display:"grid",gap:6,maxWidth:"100%",minWidth:0}}>Canal Meta para consultar modelos <select style={{maxWidth:"100%",minWidth:0,minHeight:40}} value={syncChannelId} onChange={e=>setSyncChannelId(e.target.value)} disabled={syncing||loadingChannels||!!channelError}>
            <option value="">Selecione um canal conectado</option>{syncChannels.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select></label>
          <Button disabled={!syncChannelId || syncing||loadingChannels||!!channelError} loading={syncing} onClick={()=>void syncTemplates()}>Sincronizar modelos da Meta</Button>
          {loadingChannels?<span role="status">Consultando canais...</span>:!channelError&&!syncChannels.length && <span>Conecte um canal Meta para consultar as aprovações reais.</span>}
        </div>}
        {/* Tab Switch: Modelos vs Biblioteca vs Campanhas */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {isMobile?<label style={{display:"grid",gap:6,width:"100%"}}>Área de mensagens<select value={activeTab} onChange={e=>setActiveTab(e.target.value as typeof activeTab)} style={{minHeight:40,width:"100%"}}><option value="TEMPLATES">Modelos cadastrados</option><option value="LIBRARY">Biblioteca de modelos prontos</option><option value="CAMPAIGNS">Campanhas e testes A/B</option></select></label>:(
          <SegmentedControl aria-label="Área de mensagens"
            value={activeTab}
            onChange={(val) => setActiveTab(val as typeof activeTab)}
            options={[
              { value: "TEMPLATES", label: !workspaceId||!token?"Modelos cadastrados":!hasLoadedTemplates?(isLoading?"Modelos (carregando…)":"Modelos (consulta falhou)"):`Modelos cadastrados (${templates.length})` },
              { value: "LIBRARY", label: "Biblioteca de Modelos (Prontos)" },
              { value: "CAMPAIGNS", label: "Campanhas & Testes A/B" },
            ]}
          />
          )}
        </div>

        {activeTab === "TEMPLATES" ? (
          <>
            {/* Filters Bar */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ maxWidth: "340px", width: "100%" }}>
                <Input
                  aria-label="Buscar modelos por nome ou conteúdo"
                  placeholder="Buscar por nome ou conteúdo..."
                  prefixIcon={<Search size={16} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {isMobile?<label style={{display:"grid",gap:6,width:"100%"}}>Categoria dos modelos<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={{minHeight:40,width:"100%"}}><option value="ALL">Todas</option><option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Autenticação</option></select></label>:(
              <SegmentedControl aria-label="Categoria dos modelos"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "ALL", label: hasLoadedTemplates?`Todos (${templates.length})`:"Todos" },
                  { value: "UTILITY", label: "Utilidade" },
                  { value: "MARKETING", label: "Marketing" },
                  { value: "AUTHENTICATION", label: "Autenticação" },
                ]}
              />
              )}
            </div>

            {/* Content Section */}
            {isLoading && templates.length === 0 ? (
              <div style={{ padding: "32px 0" }}>
                <LoadingState variant="skeleton" lines={4} text="Carregando modelos cadastrados..." />
              </div>
            ) : !workspaceId||!token?<EmptyState title="Selecione uma empresa" description="Escolha uma empresa para consultar seus modelos."/> : loadError&&templates.length===0?null : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={<FileText size={48} />}
                title={templates.length?"Nenhum modelo neste filtro":"Nenhum modelo cadastrado"}
                description={templates.length?"Altere a busca ou a categoria para ver outros modelos.":"Crie um rascunho local, explore nossa biblioteca com 70+ modelos prontos ou sincronize os modelos da Meta."}
                action={templates.length?<Button onClick={()=>{setSearch("");setCategoryFilter("ALL");}}>Limpar filtros</Button>:
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      prefixIcon={<Sparkles size={14} />}
                      onClick={() => setActiveTab("LIBRARY")}
                    >
                      Explorar Biblioteca de Modelos
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      prefixIcon={<Plus size={14} />}
                      onClick={() => setIsCreateOpen(true)}
                    >
                      Cadastrar Manualmente
                    </Button>
                  </div>
                }
              />
            ) : (
              <TemplatesTable
                templates={filteredTemplates}
                onSelectPreview={(t) => setPreviewTemplate(t)}
                onSelectBroadcast={(t) => {
                  setBroadcastTemplate(t);
                  setIsBroadcastOpen(true);
                }}
              />
            )}
          </>
        ) : activeTab === "LIBRARY" ? (
          workspaceId && token && (
            <TemplateLibrarySection
              workspaceId={workspaceId}
              token={token}
              onImportSuccess={async () => {
                await fetchTemplates();
                setActiveTab("TEMPLATES");
              }}
            />
          )
        ) : (
          workspaceId && token && (
            <CampaignsList
              workspaceRole={session.activeWorkspace?.role}
              workspaceId={workspaceId}
              token={token}
              onOpenNewBroadcast={() => {
                setBroadcastTemplate(null);
                setIsBroadcastOpen(true);
              }}
            />
          )
        )}
      </div>

      {workspaceId && token && (
        <CreateTemplateDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          workspaceId={workspaceId}
          token={token}
          onCreated={()=>fetchTemplates(true)}
        />
      )}

      {workspaceId && token && (
        <BroadcastTemplateDialog
          isOpen={isBroadcastOpen}
          onClose={() => {
            setIsBroadcastOpen(false);
            setBroadcastTemplate(null);
          }}
          workspaceId={workspaceId}
          token={token}
          initialTemplate={broadcastTemplate}
          onBroadcastSuccess={() => {
            fetchTemplates();
            setActiveTab("CAMPAIGNS");
          }}
        />
      )}

      <TemplateDetailDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </div>
  );
};
