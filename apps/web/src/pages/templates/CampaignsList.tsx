import {CampaignRecipientsDialog} from "./CampaignRecipientsDialog";
import { hasWorkspacePermission } from "@sos-sales/contracts";
import { useState, useEffect, useCallback, useRef, type FC } from "react";
import {
  Badge,
  Dialog,
  Button,
  Input,
  LoadingState,
  EmptyState,
  SegmentedControl,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Send,
  RefreshCw,
  Search,
  CheckCircle2,
  Eye,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Layers,
  Award,
  Clock,
  Radio,
  CircleDollarSign,
} from "lucide-react";
import {
  apiClient,
  type BroadcastCampaignSummary,
} from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";

const statusLabels:Record<string,string>={queued:"Na fila",partial:"Resultado parcial",completed:"Processamento concluído",cancelled:"Cancelada",failed:"Falha",processing:"Em processamento"};
const statusLabel=(status:string)=>Object.prototype.hasOwnProperty.call(statusLabels,status)?statusLabels[status]:"Estado não reconhecido";

const statusDescriptions:Record<string,string>={
 queued:"Há envios em fila. Preparação não comprova envio, entrega ou leitura.",
 partial:"Parte da preparação ou dos envios apresentou falhas ou bloqueios. Confira os resultados registrados; ainda pode haver trabalho pendente.",
 completed:"O processamento dos envios foi concluído. Entrega e leitura dependem das confirmações do provedor.",
 cancelled:"Novos envios foram bloqueados. Ações já iniciadas podem ter sido concluídas; confira as confirmações do provedor.",
 failed:"O processamento registrou falha. Confira os envios confirmados antes de decidir uma nova ação.",
 processing:"O processamento está em andamento. Os resultados podem mudar após esta consulta.",
};
const statusDescription=(status:string)=>Object.prototype.hasOwnProperty.call(statusDescriptions,status)?statusDescriptions[status]:"O estado não foi reconhecido. Atualize os dados e peça revisão antes de decidir uma nova ação.";
const recordedFailures=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;

const observedSales=(campaign:BroadcastCampaignSummary)=>{
 const value=(...values:unknown[])=>values.find((v):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0) ?? null;
 return {count:value(campaign.sales?.count,campaign.metrics.salesCount),cents:value(campaign.sales?.totalCents,campaign.metrics.salesCents)};
};
const observedRate=(rate:unknown,delivered:unknown)=>{
 if(typeof delivered!=="number"||!Number.isSafeInteger(delivered)||delivered<0)return "Base não informada";
 if(delivered===0)return "Sem base";
 return typeof rate==="number"&&Number.isFinite(rate)&&rate>=0?`${rate}%`:"Taxa não informada";
};
const observedWinner=(report:NonNullable<BroadcastCampaignSummary["abReport"]>)=>{
 const confirmed=[report.variantA,report.variantB].every(variant=>[variant.sent,variant.delivered,variant.read,variant.replied].every(value=>recordedFailures(value)!==null));
 return confirmed?report.winner:"UNCONFIRMED";
};
const money=(cents:number)=>(cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const campaignObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const readCampaignCursor=(pagination:unknown,rowCount:number):{createdAt:string;id:string}|null=>{
 if(pagination===undefined)return null;
 const invalid=()=>new Error("A consulta de campanhas retornou uma continuação inválida. Atualize as métricas antes de continuar.");
 if(!campaignObject(pagination)||typeof pagination.hasMore!=="boolean")throw invalid();
 const cursor=pagination.nextCursor;
 if(cursor!=null&&(!campaignObject(cursor)||typeof cursor.id!=="string"||!cursor.id.trim()||typeof cursor.createdAt!=="string"||!Number.isFinite(Date.parse(cursor.createdAt))))throw invalid();
 if(!pagination.hasMore)return null;
 if(!cursor||rowCount===0)throw invalid();
 return cursor as {createdAt:string;id:string};
};
const readCampaigns=(value:unknown):BroadcastCampaignSummary[]=>{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de campanhas. Atualize as métricas.");
 for(const row of value){
  if(!campaignObject(row)||typeof row.id!=="string"||!row.id.trim()||typeof row.name!=="string"||typeof row.status!=="string"||!campaignObject(row.metrics)||!campaignObject(row.channel)||!campaignObject(row.template))throw new Error("A consulta retornou uma campanha incompleta. Atualize as métricas; os registros anteriores foram preservados.");
  const metrics=row.metrics;
  if([row.totalTargeted,...["sent","delivered","read","replied","clicked"].map(key=>metrics[key])].some(value=>typeof value!=="number"||!Number.isSafeInteger(value)||value<0))throw new Error("A consulta retornou contadores de campanha não confirmados. Atualize as métricas; os registros anteriores foram preservados.");
  if(row.isAbTest&&row.abReport!=null&&(!campaignObject(row.abReport)||!campaignObject(row.abReport.variantA)||!campaignObject(row.abReport.variantB)))throw new Error("O relatório A/B está incompleto. Atualize as métricas; os registros anteriores foram preservados.");
  if(row.isAbTest&&campaignObject(row.abReport))for(const variant of [row.abReport.variantA,row.abReport.variantB]){
   if(!campaignObject(variant)||["templateName","category","salesFormatted"].some(key=>variant[key]!=null&&typeof variant[key]!=="string"))throw new Error("O relatório A/B contém informações incompatíveis. Atualize as métricas; os registros anteriores foram preservados.");
  }
 }
 return value as BroadcastCampaignSummary[];
};

interface CampaignsListProps {
  workspaceId: string;
  token: string;
  workspaceRole?: string;
  onOpenNewBroadcast: () => void;
}

export const CampaignsList:FC<CampaignsListProps> = props => <CampaignResults key={`${props.workspaceId}:${props.token}:${props.workspaceRole??"unconfirmed"}`} {...props}/>;
const CampaignResults: FC<CampaignsListProps> = ({
  workspaceId,
  token,
  workspaceRole,
  onOpenNewBroadcast,
}) => {
  const { isMobile } = useBreakpoint();
  const canCancel=hasWorkspacePermission(workspaceRole,"workspace:manage");
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [campaigns, setCampaigns] = useState<BroadcastCampaignSummary[]>([]);
  const [error,setError]=useState("");
  const [cancelling,setCancelling]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [recipientTarget,setRecipientTarget]=useState<BroadcastCampaignSummary|null>(null);
  const [cancelTarget,setCancelTarget]=useState<BroadcastCampaignSummary|null>(null);
  const [cancelError,setCancelError]=useState("");
  const cancelInFlight=useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchInput=useRef<HTMLInputElement>(null);
  const [appliedSearch,setAppliedSearch]=useState("");
  const [filterType, setFilterType] = useState<"ALL" | "AB_ONLY" | "SINGLE">("ALL");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [loadError,setLoadError]=useState("");
  const scope=useRef("");scope.current=`${workspaceId}:${token}`;
  const sequence=useRef(0),queryBusy=useRef(false);
  const [nextCursor,setNextCursor]=useState<{createdAt:string;id:string}|null>(null);
  const [loadingMore,setLoadingMore]=useState(false),[moreError,setMoreError]=useState("");
  const moreBusy=useRef(false);
  const available=Boolean(lastRefreshedAt&&!loadError&&!isLoading);
  const loadedRange=useRef(0),usedCursors=useRef(new Set<string>());
  const cursorKey=(cursor:{createdAt:string;id:string})=>JSON.stringify([cursor.createdAt,cursor.id]);

  const loadCampaigns = useCallback(async (afterCancellation=false) => {
    if (!workspaceId || !token || queryBusy.current || (cancelInFlight.current&&!afterCancellation)) return;
    queryBusy.current=true;
    const requestedScope=scope.current,request=++sequence.current;
    setIsLoading(true);setLoadingMore(false);moreBusy.current=false;setMoreError("");
    setLoadError("");
    try {
      const target=Math.max(1,loadedRange.current),rows=new Map<string,BroadcastCampaignSummary>(),seen=new Set<string>();
      let cursor:{createdAt:string;id:string}|null=null,complete=false;
      const maxPages=Math.ceil(target/50)+1;
      for(let page=0;page<maxPages;page++){
        const res=await apiClient.getBroadcastCampaigns(workspaceId,{token},cursor?{...cursor,...(appliedSearch?{search:appliedSearch}:{}),...(filterType!=="ALL"?{type:filterType}:{})}:appliedSearch||filterType!=="ALL"?{search:appliedSearch||undefined,type:filterType}:undefined);
        if(requestedScope!==scope.current||request!==sequence.current)return;
        const pageRows=readCampaigns(res?.campaigns);
        for(const row of pageRows)rows.set(row.id,row);
        const next=readCampaignCursor(res.pagination,pageRows.length);
        if(next&&seen.has(cursorKey(next)))throw new Error("A consulta de campanhas repetiu a continuação. Atualize as métricas antes de continuar.");
        cursor=next??null;
        if(rows.size>=target||!cursor){complete=true;break;}
        seen.add(cursorKey(cursor));
      }
      if(!complete)throw new Error("Não foi possível atualizar todo o alcance carregado. Os cartões anteriores foram preservados; tente atualizar as métricas novamente.");
      const refreshed=[...rows.values()];loadedRange.current=refreshed.length;usedCursors.current=seen;
      setCampaigns(refreshed);setNextCursor(cursor);setLastRefreshedAt(new Date());
      setCancelTarget(current=>current?refreshed.find(row=>row.id===current.id&&["queued","partial","processing"].includes(row.status))??null:null);
    } catch (err) {
      if(requestedScope===scope.current&&request===sequence.current)setLoadError(userFacingError(err,"Não foi possível carregar as campanhas."));
    } finally {
      if(requestedScope===scope.current&&request===sequence.current){queryBusy.current=false;setIsLoading(false);}
    }
  }, [workspaceId, token,appliedSearch,filterType]);

  useEffect(() => {
    loadedRange.current=0;usedCursors.current=new Set();setNextCursor(null);setMoreError("");setLoadingMore(false);moreBusy.current=false;
    queryBusy.current=false;setCancelTarget(null);setCancelError("");setCampaigns([]);setLastRefreshedAt(null);setError("");setNotice("");
    void loadCampaigns();
    return()=>{sequence.current++;};
  }, [loadCampaigns]);

  const loadMore=async()=>{
    if(!nextCursor||!available||queryBusy.current||moreBusy.current||cancelInFlight.current)return;
    const requestedScope=scope.current,request=++sequence.current;
    const valid=()=>requestedScope===scope.current&&request===sequence.current;
    moreBusy.current=true;setLoadingMore(true);setMoreError("");
    try{
      const result=await apiClient.getBroadcastCampaigns(workspaceId,{token},{...nextCursor,...(appliedSearch?{search:appliedSearch}:{}),...(filterType!=="ALL"?{type:filterType}:{})});
      if(!valid())return;
      const pageRows=readCampaigns(result?.campaigns);
      const next=readCampaignCursor(result.pagination,pageRows.length);
      if(next&&(cursorKey(next)===cursorKey(nextCursor)||usedCursors.current.has(cursorKey(next)))){
        setLoadError("A continuação das campanhas não avançou. Atualize as métricas para retomar; os cartões anteriores foram preservados.");return;
      }
      usedCursors.current.add(cursorKey(nextCursor));
      setCampaigns(current=>{const rows=new Map(current.map(row=>[row.id,row]));for(const row of pageRows)if(!rows.has(row.id))rows.set(row.id,row);loadedRange.current=rows.size;return [...rows.values()];});
      setNextCursor(next??null);
    }catch(error){if(valid())setMoreError(userFacingError(error,"Não foi possível carregar as campanhas anteriores. Os registros já carregados foram mantidos."));}
    finally{if(valid()){moreBusy.current=false;setLoadingMore(false);}}
  };

  const filteredCampaigns=campaigns;

  // Calculate aggregated top-line metrics across all campaigns
  const totals = campaigns.reduce(
    (acc, c) => {
      acc.sent += c.metrics.sent;
      acc.delivered += c.metrics.delivered;
      acc.read += c.metrics.read;
      acc.replied += c.metrics.replied;
      acc.clicked += c.metrics.clicked;
      const sales=observedSales(c);
      acc.salesCount += sales.count ?? 0;
      acc.salesCents += sales.cents ?? 0;
      if(sales.count===null)acc.missingSalesCount++;
      if(sales.cents===null)acc.missingSalesCents++;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, salesCount: 0, salesCents: 0, missingSalesCount:0, missingSalesCents:0 }
  );

  const avgDeliveryRate = totals.sent > 0 ? ((totals.delivered / totals.sent) * 100).toFixed(1) : "0.0";
  const avgOpenRate = totals.delivered > 0 ? ((totals.read / totals.delivered) * 100).toFixed(1) : "0.0";
  const avgReplyRate = totals.delivered > 0 ? ((totals.replied / totals.delivered) * 100).toFixed(1) : "0.0";
  const avgCtr = totals.delivered > 0 ? ((totals.clicked / totals.delivered) * 100).toFixed(1) : "0.0";
  const avgSalesConvRate = totals.delivered > 0 ? ((totals.salesCount / totals.delivered) * 100).toFixed(2) : "0.00";
  const formattedTotalRevenue = (totals.salesCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  async function cancelCampaign(){
    if(!canCancel||!active.current||cancelInFlight.current||queryBusy.current||moreBusy.current||!available||!cancelTarget||!campaigns.some(row=>row.id===cancelTarget.id&&["queued","partial","processing"].includes(row.status)))return;
    const requestedScope=scope.current,id=cancelTarget.id;
    cancelInFlight.current=true;setCancelling(id);setCancelError("");setNotice("");
    try{
      const result=await apiClient.cancelBroadcast(workspaceId,id,{token});
      if(!active.current||requestedScope!==scope.current)return;
      setCancelTarget(null);setNotice(result.detail);
      setCampaigns(current=>current.map(c=>c.id===id?{...c,status:"cancelled"}:c));
      await loadCampaigns(true);
    }catch(e){if(active.current&&requestedScope===scope.current)setCancelError(userFacingError(e,"Não foi possível cancelar os próximos envios. Confira o estado antes de tentar novamente."));}
    finally{if(active.current&&requestedScope===scope.current){cancelInFlight.current=false;setCancelling(null);}}
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Header de Ações e Métricas Globais */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {available ? `Consulta concluída às ${lastRefreshedAt!.toLocaleTimeString("pt-BR")}` : "Métricas indisponíveis até concluir a consulta"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            prefixIcon={<RefreshCw size={12} className={isLoading ? "animate-spin" : undefined} />}
            onClick={()=>void loadCampaigns()}
            disabled={isLoading||Boolean(cancelling)}
          >
            Atualizar Métricas
          </Button>
        </div>

        <Button
          size="sm"
          variant="primary"
          prefixIcon={<Send size={14} />}
          onClick={onOpenNewBroadcast}
        >
          Novo Disparo / Teste A/B
        </Button>
      </div>

      {lastRefreshedAt&&<p role="status">{isLoading?"Atualizando campanhas. Os cartões ainda exibem a última consulta concluída.":loadError?"Os cartões são da última consulta concluída e podem estar desatualizados.":`Campanhas carregadas: ${campaigns.length}. Indicadores abrangem os registros carregados com os filtros aplicados. Busca e tipo consultam também campanhas ainda não carregadas.`}{nextCursor?" Há campanhas anteriores para carregar.":""}</p>}
      <p style={{fontSize:"var(--font-size-xs)",color:"var(--text-secondary)"}}>Enviadas são mensagens confirmadas pelo provedor, não apenas colocadas na fila. Vendas usam resposta vinculada à mesma negociação em até 7 dias; o último vínculo elegível recebe crédito principal. Isso é uma regra de atribuição, não prova de causalidade. Sem vínculo, a venda não é atribuída.</p>
      {!canCancel&&campaigns.some(c=>["queued","partial","processing"].includes(c.status))&&<p role="status">Cancelar próximos envios exige proprietário ou administrador desta empresa.</p>}
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {loadError&&<p role="alert">{loadError} <Button size="sm" onClick={()=>void loadCampaigns()} disabled={isLoading||Boolean(cancelling)}>Tentar novamente</Button></p>}
      {/* 2. Barra de Métricas Estilo E-mail Marketing */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" : "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
        }}
      >
        {/* KPI 1: Total Enviadas */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              Total Enviadas
            </span>
            <Send size={14} style={{ color: "var(--color-primary)" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {available ? totals.sent : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {available ? `Em ${campaigns.length} disparos` : "Sem consulta válida"}
          </span>
        </div>

        {/* KPI 2: Taxa de Entrega */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              Taxa de Entrega
            </span>
            <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#10b981" }}>
            {available && totals.sent>0 ? `${avgDeliveryRate}%` : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {available ? `${totals.delivered} de ${totals.sent} recebidas` : "Sem consulta válida"}
          </span>
        </div>

        {/* KPI 3: Taxa de Abertura / Leitura */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              Taxa de Leitura
            </span>
            <Eye size={14} style={{ color: "#3b82f6" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#3b82f6" }}>
            {available && totals.delivered>0 ? `${avgOpenRate}%` : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {available ? `${totals.read} mensagens lidas` : "Sem consulta válida"}
          </span>
        </div>

        {/* KPI 4: Taxa de Resposta */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              Taxa de Resposta
            </span>
            <MessageSquare size={14} style={{ color: "#8b5cf6" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#8b5cf6" }}>
            {available && totals.delivered>0 ? `${avgReplyRate}%` : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {available ? `${totals.replied} contatos responderam` : "Sem consulta válida"}
          </span>
        </div>

        {/* KPI 5: CTR de Botões CTA */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              CTR de Botões
            </span>
            <TrendingUp size={14} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f59e0b" }}>
            {available && totals.delivered>0 ? `${avgCtr}%` : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {available ? `${totals.clicked} cliques em botões CTA` : "Sem consulta válida"}
          </span>
        </div>

        {/* KPI 6: Faturamento Pix Gerado */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500,flex:"1 1 0",minWidth:0,overflowWrap:"anywhere" }}>
              Faturamento Pix
            </span>
            <CircleDollarSign size={14} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
            {available&&totals.missingSalesCents===0 ? formattedTotalRevenue : "—"}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {!available?"Sem consulta válida":totals.missingSalesCount>0?"Quantidade de vendas indisponível":`${totals.salesCount} vendas${totals.delivered>0 ? ` (${avgSalesConvRate}% conv.)` : " · sem base para taxa"}`}
            {available&&(totals.missingSalesCount>0||totals.missingSalesCents>0)&&<span style={{display:"block"}}>Dados de vendas incompletos — campanhas sem quantidade: {totals.missingSalesCount}; sem valor: {totals.missingSalesCents}.</span>}
          </span>
        </div>
      </div>

      {appliedSearch&&<p>Busca aplicada: {appliedSearch}</p>}
      {/* 3. Filtros da Lista */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
        <form onSubmit={event=>{event.preventDefault();if(!cancelInFlight.current){searchInput.current?.focus();setAppliedSearch(search.trim());}}} style={{ maxWidth: "480px", width: "100%",display:"flex",gap:8,flexDirection:isMobile?"column":"row",alignItems:isMobile?"stretch":"center" }}>
          <Input
            ref={searchInput}
            disabled={Boolean(cancelling)}
            maxLength={200}
            aria-label="Buscar campanhas por nome, modelo ou canal"
            placeholder="Buscar por nome, modelo ou canal..."
            prefixIcon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" size="sm" style={isMobile?{minHeight:44}:undefined} disabled={isLoading||loadingMore||Boolean(cancelling)}>Buscar campanhas</Button>
        </form>

        {isMobile?<label style={{display:"grid",gap:6,width:"100%",fontSize:"var(--font-size-xs)"}}>Tipo de campanha<select disabled={Boolean(cancelling)} value={filterType} onChange={event=>{if(!cancelInFlight.current)setFilterType(event.target.value as typeof filterType);}} style={{width:"100%",minHeight:44}}><option value="ALL">Todas carregadas{lastRefreshedAt&&filterType==="ALL"?` (${campaigns.length})`:""}</option><option value="AB_ONLY">Testes A/B</option><option value="SINGLE">Disparos simples</option></select></label>:(
        <SegmentedControl aria-label="Tipo de campanha"
          value={filterType}
          onChange={(v) => {if(!cancelInFlight.current)setFilterType(v as typeof filterType);}}
          options={[
            { value: "ALL", disabled:Boolean(cancelling), label: lastRefreshedAt?(filterType==="ALL"?`Todas carregadas (${campaigns.length})`:"Todas"):isLoading?"Todas (carregando…)":"Todas (consulta falhou)" },
            { value: "AB_ONLY", disabled:Boolean(cancelling), label: "Testes A/B" },
            { value: "SINGLE", disabled:Boolean(cancelling), label: "Disparos Simples" },
          ]}
        />
        )}
      </div>

      {/* 4. Lista de Campanhas & Detalhes A/B */}
      {isLoading && campaigns.length === 0 ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingState variant="skeleton" lines={4} text="Carregando campanhas e telemetria de disparos..." />
        </div>
      ) : loadError && campaigns.length===0 ? null : filteredCampaigns.length === 0 ? (
        <EmptyState
          icon={<Send size={48} />}
          title="Nenhuma campanha encontrada"
          description={appliedSearch||filterType!=="ALL" ? "Nenhuma campanha corresponde à busca e ao tipo selecionados." : "Nenhuma campanha foi registrada para esta empresa nesta consulta."}
          action={appliedSearch||filterType!=="ALL" ? <Button size="sm" onClick={()=>{searchInput.current?.focus();setSearch("");setAppliedSearch("");setFilterType("ALL");}}>Limpar filtros</Button> :
            <Button variant="primary" size="sm" prefixIcon={<Send size={14} />} onClick={onOpenNewBroadcast}>
              Novo Disparo em Massa
            </Button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredCampaigns.map((camp) => {
            const sales=observedSales(camp);
            const formattedDate = new Date(camp.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={camp.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-default)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  boxShadow: "var(--shadow-sm)",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Top Header do Card da Campanha */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {camp.name}
                      </h4>
                      {camp.isAbTest ? (
                        <Badge variant="warning">
                          <Layers size={11} style={{ marginRight: "3px" }} /> Teste A/B (50/50)
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Disparo Simples</Badge>
                      )}
                      <Badge variant={camp.status==="completed"?"action":camp.status==="queued"||camp.status==="partial"?"warning":"neutral"}>
                        {statusLabel(camp.status)}
                      </Badge>
                    </div>

                    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: isMobile ? "4px" : "10px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} /> {formattedDate}
                      </span>
                      {!isMobile&&<span>·</span>}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Radio size={12} /> {camp.channel.name}
                      </span>
                      <span>
                        Público:{" "}
                        <strong>
                          {camp.audienceType === "ALL_CONTACTS"
                            ? "Sem bloqueio comercial"
                            : camp.audienceType === "BY_STAGE"
                            ? `Estágio ${camp.audienceStage}`
                            : camp.audienceType === "SMART_FILTER"
                            ? `Filtro Inteligente (${
                                camp.audienceStage === "NON_BUYERS"
                                  ? "Não Compradores"
                                  : camp.audienceStage === "PIX_ABANDONED"
                                  ? "⚡ Recuperação de Pix"
                                  : camp.audienceStage === "INACTIVE_30_DAYS"
                                  ? "Inativos > 30d"
                                  : camp.audienceStage === "CTWA_RESCUE"
                                  ? "Leads de Anúncio Meta"
                                  : camp.audienceStage || "Segmentado"
                              })`
                            : camp.audienceType === "IMPORT_LIST"
                            ? "Planilha Importada"
                            : "Lista Manual"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: isMobile ? "left" : "right", display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Estado: {statusLabel(camp.status)}</span>
                    <Button size="xs" variant="secondary" disabled={!available||Boolean(cancelling)||loadingMore} aria-label={`Ver destinatários de ${camp.name}`} onClick={()=>setRecipientTarget(camp)}>Ver destinatários</Button>
                    {canCancel&&["queued","partial","processing"].includes(camp.status)&&<Button size="xs" variant="secondary" disabled={!!cancelling||!available||loadingMore} onClick={()=>{if(!queryBusy.current&&!moreBusy.current&&!cancelInFlight.current&&available){setCancelTarget(camp);setCancelError("");}}}>Cancelar próximos envios</Button>}
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Envios confirmados</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {camp.metrics.sent} contatos
                    </span>
                  </div>
                </div>

                <div aria-label={`Situação operacional de ${camp.name}`} style={{fontSize:"var(--font-size-xs)",overflowWrap:"anywhere"}}>
                  <p>{statusDescription(camp.status)}</p>
                  <p>Falhas ou bloqueios registrados: <strong>{recordedFailures(camp.metrics.failed)??"Não informado"}</strong>.</p>
                </div>
                {/* Funil Visual de Entrega e Conversão */}
                <div
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)",
                    gap: "12px",
                  }}
                >
                  {/* Etapa 1: Enviados */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      1. Enviadas
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {camp.metrics.sent}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{camp.totalTargeted>0?`${camp.metrics.sent} de ${camp.totalTargeted} destinatários`:"Sem destinatários"}</span>
                  </div>

                  {/* Etapa 2: Entregues */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      2. Entregues
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981" }}>
                      {camp.metrics.delivered}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 600 }}>
                      {camp.metrics.sent>0?`${observedRate(camp.metrics.deliveryRate,camp.metrics.sent)} · taxa de entrega`:"Sem envios para calcular"}
                    </span>
                  </div>

                  {/* Etapa 3: Lidos */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      3. Lidas (Abertas)
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#3b82f6" }}>
                      {camp.metrics.read}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#3b82f6", fontWeight: 600 }}>
                      {camp.metrics.delivered>0?`${observedRate(camp.metrics.openRate,camp.metrics.delivered)} · taxa de leitura`:"Sem entregas para calcular"}
                    </span>
                  </div>

                  {/* Etapa 4: Respostas */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      4. Respondidas
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#8b5cf6" }}>
                      {camp.metrics.replied}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#8b5cf6", fontWeight: 600 }}>
                      {camp.metrics.delivered>0?`${observedRate(camp.metrics.replyRate,camp.metrics.delivered)} · respostas`:"Sem entregas para calcular"}
                    </span>
                  </div>

                  {/* Etapa 5: Cliques CTA */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      5. Cliques Botão
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#f59e0b" }}>
                      {camp.metrics.clicked}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#f59e0b", fontWeight: 600 }}>
                      {camp.metrics.delivered>0?`${observedRate(camp.metrics.ctr,camp.metrics.delivered)} · CTR`:"Sem entregas para calcular"}
                    </span>
                  </div>

                  {/* Etapa 6: Vendas Pix */}
                  <div role="group" aria-label={`Vendas de ${camp.name}`} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "#10b981", textTransform: "uppercase", fontWeight: 700 }}>
                      6. Vendas Pix
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
                      {sales.cents===null?"Valor não informado":money(sales.cents)}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {sales.count===null?"Quantidade não informada":`${sales.count} pagas`} · {sales.count!==null&&camp.metrics.delivered>0?`${Number((sales.count/camp.metrics.delivered*100).toFixed(2))}%`:"sem base para taxa"}
                    </span>
                  </div>
                </div>

                {/* Seção Exclusiva de Teste A/B: Comparador Lado a Lado e Vencedor */}
                {camp.isAbTest && camp.abReport && (
                  <div role="region" aria-label={`Comparação A/B de ${camp.name}`}
                    style={{
                      borderTop: "1px dashed var(--border-subtle)",
                      paddingTop: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Sparkles size={14} color="#8b5cf6" />
                        Comparação do Teste A/B — resultado descritivo
                      </span>

                      {(observedWinner(camp.abReport) === "A" || observedWinner(camp.abReport) === "B") ? (
                        <div
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid #10b981",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--font-size-xs)",
                            fontWeight: 700,
                            color: "#059669",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Award size={14} /> Maior resultado observado: Variante {observedWinner(camp.abReport)}
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "var(--bg-canvas)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--font-size-xs)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {observedWinner(camp.abReport)!=="TIED"?"Comparação não reconhecida. Atualize as métricas antes de concluir qual variante teve maior resultado.":camp.abReport.variantA.delivered===0&&camp.abReport.variantB.delivered===0 ? "Sem entregas confirmadas para comparar taxas" : "Resultados iguais nesta consulta"}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                      {/* Card Variante A */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: observedWinner(camp.abReport) === "A" ? "rgba(16, 185, 129, 0.05)" : "var(--bg-canvas)",
                          border: observedWinner(camp.abReport) === "A" ? "2px solid #10b981" : "1px solid var(--border-default)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
                          <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                            Variante A
                          </span>
                          {observedWinner(camp.abReport) === "A" && (
                            <Badge variant="action">
                              <Award size={11} style={{ marginRight: "3px" }} /> Maior resultado observado
                            </Badge>
                          )}
                        </div>

                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          Modelo: <strong>{camp.abReport.variantA.templateName || "Não informado"}</strong> ({camp.abReport.variantA.category || "Categoria não informada"})<div>{recordedFailures(camp.abReport.variantA.sent) ?? "Não informado"} envios · {recordedFailures(camp.abReport.variantA.delivered) ?? "Não informado"} entregas confirmadas</div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1.2fr", gap: "8px", marginTop: "4px" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Leitura</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>
                              {observedRate(camp.abReport.variantA.openRate,camp.abReport.variantA.delivered)}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{recordedFailures(camp.abReport.variantA.read) ?? "Não informado"} lidas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Resposta</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#8b5cf6" }}>
                              {observedRate(camp.abReport.variantA.replyRate,camp.abReport.variantA.delivered)}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{recordedFailures(camp.abReport.variantA.replied) ?? "Não informado"} respostas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Vendas Pix</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
                              {camp.abReport.variantA.salesFormatted ?? "Não informado"}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                              {recordedFailures(camp.abReport.variantA.salesCount)===null?"Quantidade de vendas não informada":`${camp.abReport.variantA.salesCount} vendas`} · {observedRate(camp.abReport.variantA.conversionRate,camp.abReport.variantA.delivered)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Variante B */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: observedWinner(camp.abReport) === "B" ? "rgba(16, 185, 129, 0.05)" : "var(--bg-canvas)",
                          border: observedWinner(camp.abReport) === "B" ? "2px solid #10b981" : "1px solid var(--border-default)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",gap:8 }}>
                          <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                            Variante B
                          </span>
                          {observedWinner(camp.abReport) === "B" && (
                            <Badge variant="action">
                              <Award size={11} style={{ marginRight: "3px" }} /> Maior resultado observado
                            </Badge>
                          )}
                        </div>

                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          Modelo: <strong>{camp.abReport.variantB.templateName || "Não informado"}</strong> ({camp.abReport.variantB.category || "Categoria não informada"})<div>{recordedFailures(camp.abReport.variantB.sent) ?? "Não informado"} envios · {recordedFailures(camp.abReport.variantB.delivered) ?? "Não informado"} entregas confirmadas</div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1.2fr", gap: "8px", marginTop: "4px" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Leitura</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>
                              {observedRate(camp.abReport.variantB.openRate,camp.abReport.variantB.delivered)}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{recordedFailures(camp.abReport.variantB.read) ?? "Não informado"} lidas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Resposta</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#8b5cf6" }}>
                              {observedRate(camp.abReport.variantB.replyRate,camp.abReport.variantB.delivered)}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{recordedFailures(camp.abReport.variantB.replied) ?? "Não informado"} respostas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Vendas Pix</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
                              {camp.abReport.variantB.salesFormatted ?? "Não informado"}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                              {recordedFailures(camp.abReport.variantB.salesCount)===null?"Quantidade de vendas não informada":`${camp.abReport.variantB.salesCount} vendas`} · {observedRate(camp.abReport.variantB.conversionRate,camp.abReport.variantB.delivered)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {moreError&&<p role="alert">{moreError}</p>}
      {nextCursor&&<Button variant="secondary" disabled={!available||loadingMore||Boolean(cancelling)} loading={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"Carregando campanhas anteriores…":moreError?"Tentar carregar mais campanhas":"Carregar mais campanhas"}</Button>}
      {recipientTarget&&<CampaignRecipientsDialog workspaceId={workspaceId} token={token} campaignId={recipientTarget.id} campaignName={recipientTarget.name} onClose={()=>setRecipientTarget(null)}/>}
      <Dialog isOpen={Boolean(cancelTarget)} onClose={()=>{if(!cancelInFlight.current)setCancelTarget(null);}} title="Cancelar próximos envios?" description="Esta ação interrompe os envios que ainda não começaram." footer={<>
        <Button variant="secondary" disabled={!!cancelling} onClick={()=>{if(!cancelInFlight.current)setCancelTarget(null);}}>Manter campanha</Button>
        <Button disabled={!!cancelling||!available||loadingMore} onClick={()=>void cancelCampaign()}>{cancelling?"Cancelando...":"Confirmar cancelamento"}</Button>
      </>}>
        <p style={{overflowWrap:"anywhere"}}>Campanha: <strong>{cancelTarget?.name}</strong></p>
        <p>Mensagens já enviadas não serão removidas. Envios que já começaram podem ser concluídos; confira os resultados após cancelar.</p>
        {cancelError&&<p role="alert">{cancelError}</p>}
      </Dialog>
    </div>
  );
};
