import {hasWorkspacePermission} from '@sos-sales/contracts';
import {hasEstimatedValue,hasRecurringIndication,summarizeEstimates} from './opportunity-filters';
import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import { PageHeader, Button, LoadingState, EmptyState, Badge, Input, useBreakpoint } from "@sos-sales/ui";
import { Plus, TrendingUp, RefreshCw, GripVertical, Eye, Search, Sliders, X, Filter } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ContactSummary, type JourneySummary } from "../../services/api-client";
import { STAGES, formatCents, getStageLabel, type CustomStagesMap } from "./stages";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { CustomizeStagesDialog } from "./CustomizeStagesDialog";
import { userFacingError } from "../../utils/user-facing-error";
import {confirmedStage} from './journey-confirmation';

// API caps: contacts query max(100) (zod), journeys clamped to 100 in packages/database/src/commercial.ts
const LIST_LIMIT = 100;
function readJourneyRows(value:unknown):JourneySummary[]{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de oportunidades. Atualize novamente.");
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||ids.has(row.id)||typeof row.contactId!=="string"||!row.contactId.trim()||!STAGES.some(stage=>stage.id===row.stage)||(row.title!=null&&typeof row.title!=="string"))throw new Error("A consulta retornou uma oportunidade com identidade ou etapa não reconhecida. Atualize novamente; os registros anteriores foram preservados.");
  ids.add(row.id);
 }
 return value as JourneySummary[];
}
function readJourneyContacts(value:unknown):ContactSummary[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.some(row=>!row||typeof row!=="object"||typeof row.id!=="string"||typeof row.phoneE164!=="string"||(row.name!=null&&typeof row.name!=="string")))throw new Error("A consulta retornou contatos incompatíveis com o funil. Atualize novamente.");
 return value as ContactSummary[];
}

export const OpportunitiesPage:FC<{session:UseSessionReturn}>=props=><OpportunityBoard key={JSON.stringify([props.session.activeWorkspace?.id,props.session.token,props.session.activeWorkspace?.role])} {...props}/>;
const OpportunityBoard: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const {isMobile}=useBreakpoint();
  const { activeWorkspace, token } = session;
  const role=session.isLoadingMe||session.isLoadingWorkspace||session.error?undefined:activeWorkspace?.role;
  const canReadContacts=hasWorkspacePermission(role,'cockpit:access');
  const canEdit=hasWorkspacePermission(role,'journey:transition_stage');
  const canCustomize=hasWorkspacePermission(role,'workspace:manage');
  const [contactsWarning,setContactsWarning]=useState<string|null>(null);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [journeyPage,setJourneyPage]=useState<{hasMore:boolean;nextCursor:{updatedAt:string;id:string}|null}>({hasMore:false,nextCursor:null});
  const [moreLoading,setMoreLoading]=useState(false);
  const moreBusy=useRef(false),seenCursors=useRef(new Set<string>()),loadedPages=useRef(1);
  const [paginationBlocked,setPaginationBlocked]=useState(false);
  const cursorKey=(cursor:{updatedAt:string;id:string}|null|undefined)=>cursor?JSON.stringify([cursor.updatedAt,cursor.id]):"";
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded,setHasLoaded]=useState(false);
  const [lastCheckedAt,setLastCheckedAt]=useState<string|null>(null);
  const [refreshFailed,setRefreshFailed]=useState(false);
  const [stageError,setStageError]=useState<string|null>(null);
  const [stagesLoading,setStagesLoading]=useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customStages, setCustomStages] = useState<CustomStagesMap>({});
  const [selectedJourney, setSelectedJourney] = useState<JourneySummary | null>(null);
  const [draggedJourneyId, setDraggedJourneyId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const currentScope = useRef("");
  currentScope.current = `${activeWorkspace?.id ?? ""}:${token ?? ""}:${role??""}`;
  const loadSequence = useRef(0);
  const stagesSequence = useRef(0);
  const moveEpoch=useRef(0),reviewRequired=useRef(new Set<string>());
  const [reviewIds,setReviewIds]=useState(new Set<string>());
  const busy = isLoading || session.isLoadingMe || session.isLoadingWorkspace;

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch,setAppliedSearch]=useState("");
  const [profileFilter, setProfileFilter] = useState<"all" | "recurring" | "new">("all");
  const [valueFilter, setValueFilter] = useState<"all" | "has_value" | "no_value">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d">("all");

  const loadCustomStages=useCallback(async()=>{
    if(!activeWorkspace?.id||!token||!canReadContacts)return;
    const scope=currentScope.current, sequence=++stagesSequence.current;
    setStagesLoading(true);setStageError(null);
    try{const result=await apiClient.getStageLabels(activeWorkspace.id,{token});if(scope===currentScope.current&&sequence===stagesSequence.current)setCustomStages(result.labels);}
    catch(e){if(scope===currentScope.current&&sequence===stagesSequence.current)setStageError(userFacingError(e,"Falha ao carregar os nomes das etapas."));}
    finally{if(scope===currentScope.current&&sequence===stagesSequence.current)setStagesLoading(false);}
  },[activeWorkspace?.id,token,role,canReadContacts]);
  useEffect(()=>{setCustomStages({});setStageError(null);setStagesLoading(false);void loadCustomStages();return()=>{stagesSequence.current++;};},[loadCustomStages]);

  const load = useCallback(async (propagateError=false) => {
    if (!activeWorkspace || !token) return;
    const workspaceId = activeWorkspace.id;
    const scope = currentScope.current, sequence = ++loadSequence.current;
    moreBusy.current=false;setMoreLoading(false);
    setIsLoading(true);setRefreshFailed(false);
    setErrorMsg(null);
    try {
      const [firstJourneyRes, contactRes] = await Promise.all([
        apiClient.listJourneys(workspaceId, { limit: LIST_LIMIT,...(appliedSearch?{search:appliedSearch}:{}),...(profileFilter!=="all"?{profile:profileFilter}:{}),...(valueFilter!=="all"?{value:valueFilter}:{}),...(dateFilter!=="all"?{period:dateFilter}:{}) }, { token }),
        canReadContacts?apiClient.getContacts(workspaceId,{limit:LIST_LIMIT},{token}).then(result=>{if(!Array.isArray(result?.contacts))throw new Error("A consulta não confirmou a lista de contatos do funil.");return {...result,contacts:readJourneyContacts(result.contacts),warning:null as string|null};}).catch(e=>({contacts:[] as ContactSummary[],warning:userFacingError(e,'Não foi possível consultar os contatos.')})):Promise.resolve({contacts:[] as ContactSummary[],warning:null as string|null}),
      ]);
      if (scope !== currentScope.current || sequence !== loadSequence.current) return;
      let journeyRes=firstJourneyRes,records=readJourneyRows(journeyRes?.items),recordContacts=readJourneyContacts(journeyRes.contacts),pages=1;
      const seen=new Set<string>();
      const validate=(used?:string)=>{const next=cursorKey(journeyRes.pagination?.nextCursor);if(journeyRes.pagination?.hasMore&&(!next||next===used||seen.has(next)))throw new Error("A consulta não confirmou uma continuação válida. Atualize as oportunidades antes de continuar.");};
      validate();
      while(pages<loadedPages.current&&journeyRes.pagination?.hasMore){
        const cursor=journeyRes.pagination.nextCursor!;seen.add(cursorKey(cursor));
        journeyRes=await apiClient.listJourneys(workspaceId,{limit:LIST_LIMIT,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id,...(appliedSearch?{search:appliedSearch}:{}),...(profileFilter!=="all"?{profile:profileFilter}:{}),...(valueFilter!=="all"?{value:valueFilter}:{}),...(dateFilter!=="all"?{period:dateFilter}:{})},{token});
        if(scope!==currentScope.current||sequence!==loadSequence.current)return;
        validate(cursorKey(cursor));records=Array.from(new Map([...records,...readJourneyRows(journeyRes.items)].map(item=>[item.id,item])).values());recordContacts=Array.from(new Map([...recordContacts,...readJourneyContacts(journeyRes.contacts)].map(item=>[item.id,item])).values());pages++;
      }
      seenCursors.current=seen;loadedPages.current=pages;setPaginationBlocked(false);
      setContactsWarning(contactRes.warning);
      setJourneys(records);setHasLoaded(true);setLastCheckedAt(new Date().toISOString());
      setJourneyPage(journeyRes.pagination??{hasMore:false,nextCursor:null});
      setContacts(Array.from(new Map([...(contactRes.contacts||[]),...recordContacts].map(c=>[c.id,c])).values()));
      reviewRequired.current.clear();setReviewIds(new Set());
    } catch (err: unknown) {
      if (scope !== currentScope.current || sequence !== loadSequence.current) return;
      setPaginationBlocked(true);setRefreshFailed(true);setErrorMsg(userFacingError(err, "Falha ao carregar oportunidades. Tente atualizar novamente."));
      if(propagateError)throw err;
    } finally {
      if (scope === currentScope.current && sequence === loadSequence.current) setIsLoading(false);
    }
  }, [activeWorkspace?.id, token,role,canReadContacts,appliedSearch,profileFilter,valueFilter,dateFilter]);

  useEffect(() => {
    seenCursors.current.clear();loadedPages.current=1;setPaginationBlocked(false);moreBusy.current=false;setMoreLoading(false);setJourneyPage({hasMore:false,nextCursor:null});setJourneys([]);setHasLoaded(false);setLastCheckedAt(null);setRefreshFailed(false);setContacts([]);setContactsWarning(null);setSelectedJourney(null);setIsDialogOpen(false);setIsCustomizeOpen(false);
    void load();
    return () => { loadSequence.current++; };
  }, [load]);

  const loadMore=async()=>{
    if(!activeWorkspace||!token||busy||refreshFailed||paginationBlocked||moreBusy.current||moving.current.size>0||!journeyPage.nextCursor)return;
    const scope=currentScope.current,request=loadSequence.current,cursor=journeyPage.nextCursor;
    const valid=()=>scope===currentScope.current&&request===loadSequence.current;
    moreBusy.current=true;setMoreLoading(true);setErrorMsg(null);
    try{const result=await apiClient.listJourneys(activeWorkspace.id,{limit:LIST_LIMIT,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id,...(appliedSearch?{search:appliedSearch}:{}),...(profileFilter!=="all"?{profile:profileFilter}:{}),...(valueFilter!=="all"?{value:valueFilter}:{}),...(dateFilter!=="all"?{period:dateFilter}:{})},{token});if(!valid())return;
      const rows=readJourneyRows(result?.items),rowContacts=readJourneyContacts(result.contacts);
      const next=cursorKey(result.pagination?.nextCursor);
      if(result.pagination?.hasMore&&(!next||next===cursorKey(cursor)||seenCursors.current.has(next))){setPaginationBlocked(true);throw new Error("A consulta não confirmou uma continuação válida. Atualize as oportunidades antes de continuar.");}
      seenCursors.current.add(cursorKey(cursor));loadedPages.current++;
      setJourneys(previous=>Array.from(new Map([...previous,...rows].map(j=>[j.id,j])).values()));setJourneyPage(result.pagination??{hasMore:false,nextCursor:null});setLastCheckedAt(new Date().toISOString());
      if(rowContacts.length)setContacts(previous=>Array.from(new Map([...previous,...rowContacts].map(c=>[c.id,c])).values()));
    }catch(e){if(valid())setErrorMsg(userFacingError(e,'Não foi possível carregar mais oportunidades. A consulta anterior foi preservada.'));}
    finally{if(valid()){moreBusy.current=false;setMoreLoading(false);}}
  };

  useEffect(()=>{setSearchQuery("");setAppliedSearch("");setProfileFilter("all");setValueFilter("all");setDateFilter("all");},[activeWorkspace?.id,token,role]);
  const applySearch=()=>{if(!busy&&!moreBusy.current&&moving.current.size===0)setAppliedSearch(searchQuery.trim());};

  const contactMap = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const contactNames = useMemo(
    () => new Map(contacts.map((c) => [c.id, c.name || c.phoneE164])),
    [contacts]
  );

  const filteredJourneys=journeys;

  const columns = useMemo(
    () =>
      STAGES.map((stage) => {
        const items = filteredJourneys.filter((j) => j.stage === stage.id);
        const estimate = summarizeEstimates(items.map(j=>j.estimatedValueCents));
        const displayLabel = getStageLabel(stage.id, customStages);
        return { ...stage, label: displayLabel, items, estimate };
      }),
    [filteredJourneys, customStages]
  );

  const isAnyFilterActive = appliedSearch !== "" || searchQuery.trim() !== "" || profileFilter !== "all" || valueFilter !== "all" || dateFilter !== "all";

  const clearFilters = () => {
    if(busy||moreBusy.current||moving.current.size>0)return;
    setSearchQuery("");setAppliedSearch("");
    setProfileFilter("all");
    setValueFilter("all");
    setDateFilter("all");
  };

  const moving=useRef(new Set<string>());
  const [movingIds,setMovingIds]=useState(new Set<string>());
  useEffect(()=>{moveEpoch.current++;reviewRequired.current.clear();setReviewIds(new Set());moving.current=new Set();setMovingIds(new Set());setDraggedJourneyId(null);setDropStage(null);return()=>{moveEpoch.current++;};},[activeWorkspace?.id,token,role]);
  const moveJourney = async (journeyId: string, stage: JourneySummary["stage"]) => {
    const journey=journeys.find(item=>item.id===journeyId);
    if(!canEdit||busy||moreBusy.current||!journey||!activeWorkspace||!token||moving.current.has(journeyId)||reviewRequired.current.has(journeyId)||journey.stage==="won"||journey.stage==="lost"||stage===journey.stage)return;
    if(stage==="won"||stage==="lost"){setSelectedJourney(journey);return;}
    const requestedScope=currentScope.current,requestedEpoch=moveEpoch.current;
    const valid=()=>requestedScope===currentScope.current&&requestedEpoch===moveEpoch.current;
    loadSequence.current++;setIsLoading(false);moving.current.add(journeyId);setMovingIds(new Set(moving.current));setErrorMsg(null);
    try {
      const result=await apiClient.updateJourneyStage(activeWorkspace.id, journeyId, stage, { token },journey.updatedAt);
      if(!valid())return;
      if(!confirmedStage(result,journeyId,journey.contactId,stage))throw new Error("O retorno não confirmou a mudança desta oportunidade. Atualize o funil para conferir o resultado antes de repetir.");
      setJourneys(items=>items.map(item=>item.id===journeyId?{...item,stage,updatedAt:result.journey.updatedAt}:item));
    } catch (err: unknown) {
      if(valid()){reviewRequired.current.add(journeyId);setReviewIds(new Set(reviewRequired.current));setErrorMsg(userFacingError(err,"Não foi possível confirmar a mudança de etapa. Atualize as oportunidades antes de repetir."));}
    }finally{if(valid()){moving.current.delete(journeyId);setMovingIds(new Set(moving.current));}}
  };

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
      <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
        <PageHeader
          title="Oportunidades"
          description="Funil de vendas por etapa, com valor estimado e inteligência de clientes recorrentes."
          actions={
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {canCustomize&&<Button size="sm" variant="ghost" prefixIcon={<Sliders size={14} />} disabled={!activeWorkspace||!token||session.isLoadingMe||session.isLoadingWorkspace} onClick={() => setIsCustomizeOpen(true)}>
                Personalizar Estágios
              </Button>}
              <Button size="sm" variant="secondary" prefixIcon={<RefreshCw size={14} />} onClick={()=>void load()} disabled={isLoading||moreLoading||movingIds.size>0}>
                {isLoading ? "Atualizando..." : "Atualizar"}
              </Button>
              {canEdit&&<Button size="sm" variant="primary" prefixIcon={<Plus size={14} />} disabled={!activeWorkspace||!token||session.isLoadingMe||session.isLoadingWorkspace} onClick={() => setIsDialogOpen(true)}>
                Nova Oportunidade
              </Button>}
            </div>
          }
        />

        {!canEdit&&<p role="status">Consulta de oportunidades conforme seu perfil. Alterações exigem permissão da empresa.</p>}
        {!canReadContacts&&<p>Dados dos contatos e nomes personalizados das etapas não estão disponíveis para seu perfil. As etapas abaixo usam os nomes padrão. A busca considera o título da oportunidade.</p>}
        {contactsWarning&&<div role="alert">Não foi possível atualizar os contatos. As oportunidades continuam disponíveis; nomes e perfis podem estar incompletos. {contactsWarning} Use Atualizar para tentar novamente.</div>}
        {appliedSearch&&<p role="status">Busca na empresa: “{appliedSearch}”. Perfil, valor e data são consultados na empresa antes da paginação.</p>}
        {stagesLoading&&<p role="status">Consultando os nomes das etapas… Os nomes disponíveis continuam visíveis.</p>}
        {stageError&&<div role="alert" style={{padding:12,border:'1px solid var(--border-default)',borderRadius:8,overflowWrap:'anywhere'}}><p>Não foi possível atualizar os nomes das etapas. Os nomes disponíveis podem ser os padrões ou uma consulta anterior.</p><p>{stageError}</p><Button size="sm" variant="secondary" disabled={stagesLoading} onClick={()=>void loadCustomStages()}>Consultar nomes das etapas novamente</Button></div>}
        {/* Barra de Filtros Inteligentes */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            padding: "12px 14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <Input
              aria-label="Buscar oportunidades por lead, telefone ou serviço"
              placeholder="Buscar por lead, telefone ou serviço..."
              value={searchQuery}
              maxLength={200}
              onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();applySearch();}}}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefixIcon={<Search size={14} color="var(--text-muted)" />}
              style={{ height: "34px", fontSize: "var(--font-size-xs)" }}
            />
          </div>

          <Button type="button" size="sm" disabled={busy||moreLoading||movingIds.size>0} onClick={applySearch}>Buscar oportunidades</Button>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", maxWidth:"100%",minWidth:0 }}>
            <Filter size={14} color="var(--text-muted)" style={{flexShrink:0}} />
            <select
              aria-label="Filtrar oportunidades por perfil do cliente"
              value={profileFilter}
              disabled={!canReadContacts||busy||moreLoading||movingIds.size>0}
              onChange={(e) => setProfileFilter(e.target.value as any)}
              style={{
                minWidth:0,
                maxWidth:"100%",
                flexShrink:1,
                height: "34px",
                padding: "0 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-canvas)",
                fontSize: "var(--font-size-xs)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">Todos os Perfis</option>
              <option value="recurring">⭐ Com indicação de recorrência</option>
              <option value="new">Sem indicação de recorrência</option>
            </select>
          </div>

          <select
            aria-label="Filtrar oportunidades por valor estimado"
            disabled={busy||moreLoading||movingIds.size>0} value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value as any)}
            style={{
              height: "34px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">Qualquer Valor</option>
            <option value="has_value">Com Valor Estimado</option>
            <option value="no_value">Sem Valor Estimado</option>
          </select>

          <select
            aria-label="Filtrar oportunidades por data"
            disabled={busy||moreLoading||movingIds.size>0} value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            style={{
              height: "34px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">Todas as Datas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>

          {isAnyFilterActive && (
            <Button size="xs" variant="ghost" prefixIcon={<X size={12} />} disabled={busy||moreLoading||movingIds.size>0} onClick={clearFilters}>
              Limpar Filtros
            </Button>
          )}

          <div style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {hasLoaded?<>Exibindo <strong>{filteredJourneys.length}</strong> de {journeys.length} carregadas</>:busy?"Consultando oportunidades…":"Contagem ainda não disponível"}
          </div>
        </div>

        {hasLoaded&&isLoading&&<p role="status">Atualizando oportunidades… Os registros e valores exibidos são da última consulta concluída.</p>}
        {hasLoaded&&refreshFailed&&<p role="status">A atualização falhou. Os registros e valores exibidos podem estar desatualizados.</p>}
        {hasLoaded&&lastCheckedAt&&<p style={{fontSize:12,color:"var(--text-secondary)",margin:0}}>Última consulta concluída: <time dateTime={lastCheckedAt}>{new Date(lastCheckedAt).toLocaleString("pt-BR")}</time>.</p>}
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {errorMsg}
          </div>
        )}

        {journeyPage.hasMore && (
          <div
            role="status"
            style={{
              padding: "8px 14px",
              backgroundColor: "var(--bg-surface-elevated)",
              color: "var(--text-secondary)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Há mais oportunidades disponíveis. Os filtros são aplicados na empresa; as estimativas consideram apenas os registros carregados; a ordem reflete a última atualização e pode mudar enquanto a operação continua. Atualizar reconsulta as páginas já abertas; mudar filtros inicia uma nova lista.
          </div>
        )}

        {journeyPage.hasMore&&<Button variant="secondary" disabled={busy||paginationBlocked||refreshFailed||moreLoading||movingIds.size>0} onClick={()=>void loadMore()}>{moreLoading?'Carregando mais oportunidades…':'Carregar mais oportunidades'}</Button>}
        {!activeWorkspace||!token?<EmptyState title="Selecione uma empresa" description="Escolha uma empresa para consultar suas oportunidades."/>: (busy||!hasLoaded&&!errorMsg) && journeys.length === 0 ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando oportunidades..." />
        ) : journeys.length===0&&errorMsg?null:journeys.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={48} />}
            title={isAnyFilterActive?"Nenhuma oportunidade com estes filtros":"Nenhuma oportunidade ainda"}
            description={isAnyFilterActive?"Ajuste o termo ou limpe os filtros para consultar novamente.":"Crie uma oportunidade para um lead e acompanhe-a pelo funil até o fechamento."}
          />
        ) : (
          <div role="region" aria-label="Etapas do funil" tabIndex={0} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(6, minmax(160px, 1fr))", gap: "var(--space-4, 16px)", alignItems: "start",minWidth:0,overflowX:"auto",paddingBottom:4 }}>
            {columns.map((col) => (
              <section
                key={col.id}
                aria-label={col.label}
                onDragOver={(event) => { event.preventDefault(); setDropStage(col.id); }}
                onDragLeave={() => setDropStage((current) => current === col.id ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  const journeyId = event.dataTransfer.getData("text/plain") || draggedJourneyId;
                  setDropStage(null);
                  setDraggedJourneyId(null);
                  if (journeyId) void moveJourney(journeyId, col.id);
                }}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: dropStage === col.id ? "2px solid var(--color-operational)" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <header
                  style={{
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-strong)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)",minWidth:0,overflowWrap:"anywhere" }}>{col.label}</span>
                    <Badge variant="neutral">{col.items.length}</Badge>
                  </div>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {col.estimate.totalCents===null?'Estimativa indisponível':col.items.length>0&&col.estimate.knownCount===0?'Estimativa não informada':`${col.estimate.missingCount?'Subtotal informado':'Estimativa consultada'}: ${formatCents(col.estimate.totalCents)}`}
                    {col.estimate.missingCount>0&&<span style={{display:'block'}}>{col.estimate.missingCount} oportunidade(s) sem valor informado válido.</span>}
                  </span>
                </header>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px" }}>
                  {col.items.length === 0 ? (
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>
                      Vazio
                    </span>
                  ) : (
                    col.items.map((j) => (
                      <article
                        key={j.id}
                        aria-disabled={busy||moreLoading||movingIds.has(j.id)||reviewIds.has(j.id)}
                        draggable={canEdit&&!busy&&!moreLoading&&!movingIds.has(j.id)&&!reviewIds.has(j.id)&&j.stage !== "won" && j.stage !== "lost"}
                        onDragStart={(event) => { setDraggedJourneyId(j.id); event.dataTransfer.setData("text/plain", j.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDraggedJourneyId(null); setDropStage(null); }}
                        onClick={() => {if(!busy&&!moreBusy.current&&!moving.current.has(j.id)&&!reviewRequired.current.has(j.id))setSelectedJourney(j);}}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " "){event.preventDefault();if(!busy&&!moreBusy.current&&!moving.current.has(j.id)&&!reviewRequired.current.has(j.id))setSelectedJourney(j);} }}
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          cursor: "pointer",
                          opacity: draggedJourneyId === j.id ? 0.55 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {canEdit&&<GripVertical size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                          <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)", color: "var(--text-primary)", flex: 1,minWidth:0,overflowWrap:"anywhere" }}>{contactNames.get(j.contactId) ?? "Lead"}</span>
                          <Eye size={14} style={{ color: "var(--color-operational)", flexShrink: 0 }} />
                        </div>
                        {(() => {
                          const contact = contactMap.get(j.contactId);
                          if(!canReadContacts)return null;
                          const isRec = hasRecurringIndication(contact);
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                              {isRec ? (
                                <Badge variant="action" style={{maxWidth:"100%",height:"auto",minHeight:20,whiteSpace:"normal",lineHeight:1.3,padding:"2px 8px",overflowWrap:"anywhere"}}>⭐ Recorrência informada</Badge>
                              ) : (
                                <Badge variant="neutral" style={{maxWidth:"100%",height:"auto",minHeight:20,whiteSpace:"normal",lineHeight:1.3,padding:"2px 8px",overflowWrap:"anywhere"}}>Sem recorrência informada</Badge>
                              )}
                              {Number.isSafeInteger(contact?.metadata?.totalOrders)&&Number(contact?.metadata?.totalOrders)>0 ? (
                                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                                  ({contact?.metadata?.totalOrders} {contact?.metadata?.totalOrders === 1 ? "compra informada" : "compras informadas"})
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                        {movingIds.has(j.id)&&<span role="status">Movendo...</span>}
                        {reviewIds.has(j.id)&&<span role="status">Resultado não confirmado. Atualize a lista para conferir.</span>}
                        {j.title && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)",overflowWrap:"anywhere" }}>{j.title}</span>}
                        <div style={{ display: "flex", justifyContent: "space-between",flexWrap:"wrap",gap:"4px 8px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {hasEstimatedValue(j.estimatedValueCents) ? formatCents(j.estimatedValueCents) : "Não informado"}
                          </span>
                          <span>{new Date(j.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {activeWorkspace && token && (
        <NewOpportunityDialog
          isOpen={canEdit&&isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onCreated={()=>load(true)}
          workspaceId={activeWorkspace.id}
          token={token}
          contacts={contacts}
          customStages={customStages}
        />
      )}

      {activeWorkspace && token && (
        <OpportunityDetailDialog
          journey={selectedJourney}
          readOnly={!canEdit}
          contact={contacts.find((item) => item.id === selectedJourney?.contactId)}
          workspaceId={activeWorkspace.id}
          token={token}
          onClose={() => setSelectedJourney(null)}
          onChanged={()=>load(true)}
          customStages={customStages}
        />
      )}

      {activeWorkspace && (
        <CustomizeStagesDialog
          isOpen={canCustomize&&isCustomizeOpen}
          onClose={() => setIsCustomizeOpen(false)}
          workspaceId={activeWorkspace.id}
          token={token ?? undefined}
          onSaved={labels=>{stagesSequence.current++;setStagesLoading(false);setStageError(null);setCustomStages(labels);}}
        />
      )}
    </div>
  );
};

export default OpportunitiesPage;
