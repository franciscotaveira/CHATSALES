import { useState, useEffect, useRef, type FC } from "react";
import { PageHeader, Badge, EmptyState, Button, LoadingState, useBreakpoint } from "@sos-sales/ui";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient } from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";
import { RefreshCw, TrendingUp, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface ConversionItem {
  id: string;
  journeyId: string;
  outcomeId: string | null;
  eventName: string;
  valueCents: number | null;
  currency: string;
  status: string;
  providerReceipt: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

const validateConversionRows=(value:unknown)=>{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de conversões. Atualize a consulta.");
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||ids.has(row.id)
    ||typeof row.eventName!=="string"||typeof row.status!=="string"||typeof row.createdAt!=="string"
    ||row.errorMessage!=null&&typeof row.errorMessage!=="string")throw new Error("A consulta retornou um evento incompatível. Atualize a consulta; os registros anteriores foram preservados.");
  ids.add(row.id);
 }
};
const readConversionCursor=(pagination:unknown,rowCount:number):string|null=>{
 if(pagination===undefined)return null;
 const invalid=()=>new Error("A consulta não confirmou uma continuação válida. Atualize a consulta.");
 if(!pagination||typeof pagination!=="object"||Array.isArray(pagination))throw invalid();
 const page=pagination as Record<string,unknown>;
 if(typeof page.hasMore!=="boolean"||page.nextCursor!=null&&(typeof page.nextCursor!=="string"||!page.nextCursor.trim()))throw invalid();
 if(!page.hasMore)return null;
 if(typeof page.nextCursor!=="string"||!page.nextCursor.trim()||rowCount===0)throw invalid();
 return page.nextCursor;
};

const conversionEventLabel=(name:string)=>{
  const labels:Record<string,string>={LeadCaptured:"Captura de contato",LeadQualified:"Qualificação de contato",AppointmentScheduled:"Agendamento",ProposalAccepted:"Aceite de proposta",PurchaseCompleted:"Compra",PurchaseRefunded:"Reembolso"};
  return Object.prototype.hasOwnProperty.call(labels,name)?labels[name]:"Evento não reconhecido";
};

export const ConversoesPage: FC<{ session: UseSessionReturn }> = ({ session }) => <ConversionsPanel key={JSON.stringify([session.activeWorkspace?.id,session.token])} session={session}/>;
const ConversionsPanel: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const requestGeneration=useRef(0);
  const [nextCursor,setNextCursor]=useState<string|null>(null),[moreLoading,setMoreLoading]=useState(false),[pageError,setPageError]=useState<string|null>(null);
  const moreBusy=useRef(false),loadedPages=useRef(1),seenCursors=useRef(new Set<string>());
  const [error,setError]=useState<string|null>(null);
  const [items, setItems] = useState<ConversionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const panelRef=useRef<HTMLDivElement|null>(null),moreButton=useRef<HTMLButtonElement|null>(null);
  const restoreMoreFocus=useRef(false),firstAddedId=useRef<string|null>(null);
  useEffect(()=>{
    if(moreLoading||!restoreMoreFocus.current)return;
    restoreMoreFocus.current=false;
    if(document.activeElement!==document.body&&document.activeElement!==moreButton.current)return;
    const added=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-conversion-id]')??[]).find(row=>row.dataset.conversionId===firstAddedId.current);
    (added||moreButton.current||refreshButton.current)?.focus();
  },[moreLoading,items]);
  const refreshButton=useRef<HTMLButtonElement|null>(null),restoreRefreshFocus=useRef(false);
  useEffect(()=>{
    if(isLoading||!restoreRefreshFocus.current)return;
    restoreRefreshFocus.current=false;
    if(document.activeElement===document.body||document.activeElement===refreshButton.current)refreshButton.current?.focus();
  },[isLoading]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const available=Boolean(lastRefreshedAt&&!error&&!isLoading&&!session.isLoadingMe&&!session.isLoadingWorkspace);
  const formatValue=(item:ConversionItem)=>{
    if(item.valueCents===null||item.valueCents===undefined)return "Não informado";
    if(typeof item.valueCents!=="number"||!Number.isSafeInteger(item.valueCents)||item.valueCents<0)return "Valor não reconhecido";
    if(typeof item.currency!=="string"||!/^[A-Z]{3}$/.test(item.currency))return "Moeda não informada ou inválida";
    try{return (item.valueCents/100).toLocaleString("pt-BR",{style:"currency",currency:item.currency});}
    catch{return "Moeda não informada ou inválida";}
  };
  const formatEventDate=(value:string)=>{
    const date=new Date(value);
    return value&&Number.isFinite(date.getTime())?date.toLocaleString("pt-BR"):"Data não informada ou inválida";
  };

  const loadConversions = async () => {
    if(session.isLoadingMe||session.isLoadingWorkspace)return;
    if (!activeWorkspace || !token) {setIsLoading(false);setError(!activeWorkspace?"Selecione uma empresa para consultar as conversões.":"O acesso ainda não foi confirmado. Entre novamente para consultar as conversões.");return;}
    const generation=++requestGeneration.current;
    restoreMoreFocus.current=false;
    setIsLoading(true);setError(null);setPageError(null);moreBusy.current=false;setMoreLoading(false);
    try {
      const seen=new Set<string>();let pages=1;
      let res=await apiClient.getConversions(activeWorkspace.id,{token});
      if(generation!==requestGeneration.current)return;
      validateConversionRows(res?.items);
      let records=res.items;
      const validate=()=>{validateConversionRows(res?.items);const next=readConversionCursor(res.pagination,res.items.length);if(next&&seen.has(next))throw new Error("A consulta não confirmou uma continuação válida. Atualize a consulta.");};
      validate();
      while(pages<loadedPages.current&&res.pagination?.hasMore){
        const cursor=res.pagination.nextCursor!;seen.add(cursor);
        res=await apiClient.getConversions(activeWorkspace.id,{token,beforeId:cursor});
        if(generation!==requestGeneration.current)return;
        validate();records=Array.from(new Map([...records,...res.items].map(item=>[item.id,item])).values());pages++;
      }
      loadedPages.current=pages;seenCursors.current=seen;
      setNextCursor(readConversionCursor(res.pagination,res.items.length));
      setItems(records);
      setLastRefreshedAt(new Date());
    } catch (e) {
      if(generation===requestGeneration.current)setError(userFacingError(e,"Não foi possível carregar as conversões."));
    } finally {
      if(generation===requestGeneration.current)setIsLoading(false);
    }
  };

  const loadMore=async()=>{
    if(!activeWorkspace||!token||isLoading||error||moreBusy.current||!nextCursor)return;
    const generation=requestGeneration.current,cursor=nextCursor;moreBusy.current=true;setMoreLoading(true);setPageError(null);
    restoreMoreFocus.current=document.activeElement===moreButton.current;firstAddedId.current=null;
    try{
      const res=await apiClient.getConversions(activeWorkspace.id,{token,beforeId:cursor});
      if(generation!==requestGeneration.current)return;
      validateConversionRows(res?.items);
      const next=readConversionCursor(res.pagination,res.items.length);
      if(next&&(next===cursor||seenCursors.current.has(next))){setNextCursor(null);throw new Error("A consulta não confirmou uma continuação válida. Atualize a consulta.");}
      seenCursors.current.add(cursor);loadedPages.current++;
      firstAddedId.current=res.items.find(row=>!items.some(item=>item.id===row.id))?.id??null;
      setItems(previous=>Array.from(new Map([...previous,...res.items].map(item=>[item.id,item])).values()));
      setNextCursor(next);setLastRefreshedAt(new Date());
    }catch(e){if(generation===requestGeneration.current)setPageError(userFacingError(e,"Não foi possível carregar eventos anteriores. Os registros consultados foram preservados."));}
    finally{if(generation===requestGeneration.current){moreBusy.current=false;setMoreLoading(false);}}
  };

  useEffect(() => {
    loadConversions();
    return()=>{++requestGeneration.current;};
  }, [activeWorkspace?.id, token,session.isLoadingMe,session.isLoadingWorkspace]);

  const acceptedCount = items.filter((i) => i.status === "ACCEPTED").length;
  const queuedCount = items.filter((i) => i.status === "QUEUED").length;
  const failedCount = items.filter((i) => i.status === "FAILED").length;

  const additionalStatuses=[
    {code:"PROCESSING",label:"Em processamento"},
    {code:"SIMULATED",label:"Simulado — sem envio real"},
    {code:"NOT_CONFIGURED",label:"Integração não configurada"},
    {code:"NOT_APPLICABLE",label:"Não aplicável"},
    {code:"DISCARDED",label:"Descartado"},
  ];
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACCEPTED":return <Badge variant="action">Aceito pela Meta</Badge>;
      case "QUEUED":return <Badge variant="warning">Aguardando envio</Badge>;
      case "FAILED":return <Badge variant="danger">Falha no envio</Badge>;
      default:return <Badge variant="neutral">{additionalStatuses.find(item=>item.code===status)?.label||"Estado não reconhecido"}</Badge>;
    }
  };
  const unknownCount=items.filter(item=>!["ACCEPTED","QUEUED","FAILED",...additionalStatuses.map(status=>status.code)].includes(item.status)).length;


  return (
    <div
      ref={panelRef}
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
          title="Conversões"
          description={`Acompanhe os eventos enviados à Meta e suas confirmações.${available ? ` Consulta concluída às ${lastRefreshedAt!.toLocaleTimeString("pt-BR")}.` : " Aguardando consulta válida."}`}
          actions={
            <Button
              ref={refreshButton}
              size="sm"
              variant="secondary"
              prefixIcon={<RefreshCw size={14} className={isLoading ? "animate-spin" : undefined} />}
              onClick={()=>{restoreRefreshFocus.current=document.activeElement===refreshButton.current;void loadConversions();}}
              disabled={moreLoading||isLoading||session.isLoadingMe||session.isLoadingWorkspace||!activeWorkspace||!token}
            >
              Atualizar
            </Button>
          }
        />

        {error && <div role="alert">{error} Os indicadores estão indisponíveis até uma nova consulta. Os registros anteriores, quando exibidos, podem estar desatualizados.</div>}
        <p>Aceite de um evento pela Meta não comprova atribuição de venda a anúncio. Os números abaixo refletem os eventos carregados nesta consulta, em páginas de até 50 registros. Carregue os anteriores para ampliar o alcance.</p>
        {/* KPI Metrics Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Card 1: Total */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Eventos nesta consulta
              </span>
              <TrendingUp size={16} style={{ color: "var(--color-operational)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {available ? items.length : "—"}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Registros desta consulta
            </span>
          </div>

          {/* Card 2: Aceitos pela Meta */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Aceitos pela Meta
              </span>
              <CheckCircle size={16} style={{ color: "var(--color-action)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-action)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {available ? acceptedCount : "—"}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {available && items.length > 0 ? `${Math.round((acceptedCount / items.length) * 100)}% dos registros aceitos` : "Sem dados disponíveis"}
            </span>
          </div>

          {/* Card 3: Na Fila */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Aguardando envio
              </span>
              <Clock size={16} style={{ color: "var(--color-warning)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-warning)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {available ? queuedCount : "—"}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Pendente de confirmação do destino
            </span>
          </div>

          {/* Card 4: Falhas */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Falhas
              </span>
              <AlertTriangle size={16} style={{ color: "var(--color-danger)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-danger)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {available ? failedCount : "—"}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Necessitam intervenção
            </span>
          </div>
        </div>

        {available&&(unknownCount>0||additionalStatuses.some(status=>items.some(item=>item.status===status.code)))&&<section aria-label="Demais estados dos eventos">
          <p>Os demais estados são apresentados separadamente e não contam como aceite pela Meta.</p>
          <ul>{additionalStatuses.filter(status=>items.some(item=>item.status===status.code)).map(status=><li key={status.code}>{status.label}: {items.filter(item=>item.status===status.code).length}</li>)}
            {unknownCount>0&&<li>Estado não reconhecido: {unknownCount}. Consulte os registros antes de concluir o resultado.</li>}
          </ul>
        </section>}
        {/* Content Section */}
        {(isLoading || session.isLoadingMe || session.isLoadingWorkspace) && items.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <LoadingState variant="skeleton" lines={4} text="Carregando eventos CAPI..." />
          </div>
        ) : error && items.length===0 ? null : items.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={48} />}
            title="Nenhuma conversão registrada"
            description="Os eventos aparecerão conforme as regras e integrações habilitadas para esta empresa."
          />
        ) : isMobile ? <div style={{display:"grid",gap:12}}>{items.map(item=><article key={item.id} data-conversion-id={item.id} tabIndex={-1} style={{padding:16,border:"1px solid var(--border-default)",borderRadius:12,background:"var(--bg-surface)",overflowWrap:"anywhere"}}>
          <strong>{conversionEventLabel(item.eventName)}</strong><div style={{marginTop:8}}>{getStatusBadge(item.status)}</div>
          <p>{formatValue(item)} · {formatEventDate(item.createdAt)}</p>
          <details><summary>Detalhes do evento</summary><p>Tipo registrado: {item.eventName}</p><p>Identificador: {item.id}</p>{item.errorMessage&&<p>{userFacingError(new Error(item.errorMessage),"O destino recusou o evento. Revise a integração.")}</p>}</details>
        </article>)}</div> : (
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-sm)" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderBottom: "1px solid var(--border-default)",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Evento
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Status
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Valor
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const formattedValue = formatValue(item);

                  return (
                    <tr
                      key={item.id}
                      data-conversion-id={item.id}
                      tabIndex={-1}
                      style={{
                        height: "48px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <td style={{ padding: "0 16px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {conversionEventLabel(item.eventName)}
                        <details style={{fontSize:12,fontWeight:400,marginTop:4}}><summary>Detalhes</summary><p>Tipo registrado: {item.eventName}</p><p>Identificador: {item.id}</p>{item.errorMessage&&<p>{userFacingError(new Error(item.errorMessage),"O destino recusou o evento. Revise a integração.")}</p>}</details>
                      </td>
                      <td style={{ padding: "0 16px" }}>
                        {getStatusBadge(item.status)}
                      </td>
                      <td
                        style={{
                          padding: "0 16px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {formattedValue}
                      </td>
                      <td style={{ padding: "0 16px", color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                        {formatEventDate(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageError&&<p role="alert">{pageError}</p>}
        {nextCursor&&<Button ref={moreButton} disabled={isLoading||moreLoading||!!error} onClick={()=>void loadMore()}>{moreLoading?"Carregando eventos anteriores…":"Carregar eventos anteriores"}</Button>}
      </div>
    </div>
  );
};

export const CampaignsPage = ConversoesPage;
export default ConversoesPage;
