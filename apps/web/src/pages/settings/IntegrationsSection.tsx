import {UnsavedChangesNotice,useDiscardChanges} from "../UnsavedChangesNotice";
import {WebhookJobList,validateWebhookJobs,type WebhookJob} from './WebhookJobList';
import {hasWorkspacePermission} from "@sos-sales/contracts";
import { useState, useEffect, useCallback, useRef, type FC, type CSSProperties } from "react";
import { Alert, Badge, Button, Input, Dialog, useBreakpoint } from "@sos-sales/ui";
import {
  Braces,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Send,
  Webhook,
  Key,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { userFacingError } from "../../utils/user-facing-error";
import {
  apiClient,ApiError,
  type OutboundWebhookSubscription,
  type WebhookTestResult,
} from "../../services/api-client";

const webhookFingerprint=(hook:OutboundWebhookSubscription)=>JSON.stringify([hook.id,hook.url,hook.events,hook.is_active,hook.supports_idempotency,hook.updated_at]);
const validateWebhookRows=(rows:unknown)=>{
 if(!Array.isArray(rows))throw new Error("A consulta não confirmou uma lista válida de integrações. Tente consultar novamente.");
 const ids=new Set<string>();
 for(const row of rows){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||ids.has(row.id)
   ||typeof row.url!=="string"||!row.url.trim()||typeof row.is_active!=="boolean"
   ||!Array.isArray(row.events)||row.events.some((event:unknown)=>typeof event!=="string"||!event.trim())
   ||row.description!=null&&typeof row.description!=="string"
   ||row.supports_idempotency!==undefined&&typeof row.supports_idempotency!=="boolean")throw new Error("A consulta retornou uma integração incompatível. Consulte novamente; os dados anteriores foram preservados.");
  ids.add(row.id);
  try{if(!["http:","https:"].includes(new URL(row.url).protocol))throw new Error();}
  catch{throw new Error("A consulta retornou um destino inválido. Consulte as integrações novamente.");}
 }
};
const validateJobPagination=(value:unknown,rowCount:number)=>{
 if(value===undefined)return;
 const invalid=()=>new Error("A consulta não confirmou uma continuação válida. Consulte a fila novamente antes de continuar.");
 if(!value||typeof value!=="object"||Array.isArray(value))throw invalid();
 const page=value as Record<string,unknown>,cursor=page.nextCursor;
 if(typeof page.hasMore!=="boolean")throw invalid();
 if(cursor!=null){
  if(typeof cursor!=="object"||Array.isArray(cursor))throw invalid();
  const fields=cursor as Record<string,unknown>;
  if(typeof fields.id!=="string"||!fields.id.trim()||typeof fields.createdAt!=="string"||!Number.isFinite(Date.parse(fields.createdAt)))throw invalid();
 }
 if(page.hasMore&&(!cursor||rowCount===0))throw invalid();
};
type WebhookTestObservation={source:string;checkedAt:string;result?:WebhookTestResult;error?:string};
const validateWebhookTest=(value:WebhookTestResult)=>{
 if(!value||typeof value!=="object"||typeof value.success!=="boolean"||!["delivered","failed"].includes(value.status)
  ||value.success!==(value.status==="delivered")||typeof value.durationMs!=="number"||!Number.isFinite(value.durationMs)||value.durationMs<0
  ||value.statusCode!=null&&(!Number.isInteger(value.statusCode)||value.statusCode<100||value.statusCode>599)
  ||value.success&&(value.statusCode==null||value.statusCode<200||value.statusCode>=300)
  ||value.errorMessage!=null&&typeof value.errorMessage!=="string")throw new Error("O servidor não confirmou um resultado válido para este teste. Confira a integração antes de decidir ativar.");
};

const AVAILABLE_EVENTS = [
  { id: "*", label: "Todos os Eventos (*)" },
  { id: "lead.created", label: "Novo Lead Criado" },
  { id: "message.received", label: "Mensagem Recebida" },
  { id: "proposal.created", label: "Proposta Comercial Criada" },
  { id: "payment.settled", label: "Pagamento Pix Confirmado" },
  { id: "stage.changed", label: "Mudança de Etapa / Funil" },
];

const eventLabel=(event:string)=>AVAILABLE_EVENTS.find(item=>item.id===event)?.label??"Evento não reconhecido";

export const IntegrationsSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const {isMobile}=useBreakpoint();
  const formActionStyle:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.35}:undefined;
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError,setCopyError]=useState<string|null>(null);
  const [webhooks, setWebhooks] = useState<OutboundWebhookSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkedAt,setCheckedAt]=useState<string|null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activationReview,setActivationReview]=useState<{id:string;url:string;events:string[];source:string;active:boolean}|null>(null);
  const [activationError,setActivationError]=useState<string|null>(null);
  const [activationNotice,setActivationNotice]=useState<string|null>(null);

  // Creation form state
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["*"]);
  const [supportsIdempotency,setSupportsIdempotency] = useState(false);
  const [jobs,setJobs] = useState<Record<string,WebhookJob[]>>({});
  const [jobErrors,setJobErrors]=useState<Record<string,string>>({});
  const [jobConsultedAt,setJobConsultedAt]=useState<Record<string,string>>({});
  const [loadingJobsId,setLoadingJobsId]=useState<string|null>(null);
  const refreshControl=useRef<HTMLButtonElement|null>(null);
  const pendingReadFocus=useRef<{button:HTMLButtonElement;scope:string;epoch:number}|null>(null);
  const rememberReadFocus=(button:HTMLButtonElement)=>{
    pendingReadFocus.current=document.activeElement===button?{button,scope:scope.current,epoch:epoch.current}:null;
  };
  useEffect(()=>{
    if(isLoading||loadingJobsId)return;
    const pending=pendingReadFocus.current;pendingReadFocus.current=null;
    if(!pending||pending.scope!==scope.current||pending.epoch!==epoch.current)return;
    if(document.activeElement!==document.body&&document.activeElement!==pending.button)return;
    (pending.button.isConnected?pending.button:refreshControl.current)?.focus();
  },[isLoading,loadingJobsId]);
  const [jobPages,setJobPages]=useState<Record<string,{hasMore:boolean;nextCursor:{createdAt:string;id:string}|null}>>({});
  const jobRanges=useRef<Record<string,{pages:number;seen:Set<string>}>>({});
  const [jobBlocked,setJobBlocked]=useState<Record<string,boolean>>({});
  const [customSecret, setCustomSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationUncertain,setCreationUncertain]=useState(false);

  // Testing feedback state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestObservation>>({});

  const workspaceId = session.activeWorkspace?.id || "";
  const token = session.token || "";
  const canView=hasWorkspacePermission(session.activeWorkspace?.role,"integration:view");
  const canManage=hasWorkspacePermission(session.activeWorkspace?.role,"integration:manage");
  const epoch=useRef(0);
  const baseUrl = apiClient.getBaseUrl();
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${session.activeWorkspace?.role??""}`;
  const sequence=useRef(0);
  const operation=useRef<symbol|null>(null);

  const urlRef=useRef<HTMLInputElement>(null);
  const creationDirty=isAdding&&!creationUncertain&&Boolean(newUrl.trim()||newDescription.trim()||customSecret.trim()||supportsIdempotency||selectedEvents.length!==1||selectedEvents[0]!=="*");
  const discard=useDiscardChanges(creationDirty,`${scope.current}:${isAdding}`,()=>urlRef.current,isAdding);
  const cancelCreation=()=>{if(operation.current)return;discard.requestExit(()=>{setIsAdding(false);setCreationUncertain(false);setCustomSecret("");setNewUrl("");setNewDescription("");setSelectedEvents(["*"]);setSupportsIdempotency(false);setErrorMsg(null);if(creationUncertain)void loadWebhooks();});};

  const copySequence=useRef(0),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const copy = async (key: string, value: string) => {
    if(!value)return;
    const requestedScope=scope.current,requestedEpoch=epoch.current,request=++copySequence.current;
    if(copyTimer.current)clearTimeout(copyTimer.current);
    setCopied(null);
    setCopyError(null);
    const current=()=>requestedScope===scope.current&&requestedEpoch===epoch.current&&request===copySequence.current;
    try {
      await navigator.clipboard.writeText(value);
      if(!current())return;
      setCopied(key);
      copyTimer.current=setTimeout(()=>{if(current())setCopied(null);},1800);
    } catch {
      if(current()){setCopied(null);setCopyError("Não foi possível copiar. Selecione o valor e copie manualmente quando estiver disponível.");}
    }
  };

  const loadWebhooks = useCallback(async () => {
    if (!workspaceId || !token || !canView) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current,request=++sequence.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.listWebhooks(workspaceId, { token });
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current){validateWebhookRows(res?.webhooks);setWebhooks(res.webhooks);setCheckedAt(new Date().toLocaleString("pt-BR"));}
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current)setLoadError(userFacingError(err,"Falha ao carregar webhooks."));
    } finally {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current)setIsLoading(false);
    }
  }, [workspaceId, token,canView,session.activeWorkspace?.role]);

  useEffect(() => {
    operation.current=null;epoch.current++;setActivationReview(null);setActivationError(null);setActivationNotice(null);setIsSubmitting(false);setTestingId(null);setBusyId(null);setIsLoading(false);setCheckedAt(null);setWebhooks([]);setJobs({});setJobErrors({});setJobConsultedAt({});setLoadingJobsId(null);setJobPages({});jobRanges.current={};setJobBlocked({});setTestResults({});setIsAdding(false);setCreationUncertain(false);setCustomSecret("");setNewUrl("");setNewDescription("");setSelectedEvents(["*"]);setSupportsIdempotency(false);setErrorMsg(null);setLoadError(null);setCopied(null);setCopyError(null);
    void loadWebhooks();
    return()=>{operation.current=null;sequence.current++;epoch.current++;copySequence.current++;if(copyTimer.current)clearTimeout(copyTimer.current);};
  }, [loadWebhooks]);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creationUncertain || discard.isPending || !workspaceId || !token || !canManage || !newUrl.trim() || operation.current) return;
    if(selectedEvents.length===0){setErrorMsg("Selecione pelo menos um evento para este destino.");return;}
    try {const url=new URL(newUrl.trim());if(!["http:","https:"].includes(url.protocol))throw new Error();}
    catch {setErrorMsg("Informe uma URL HTTP ou HTTPS válida para o destino.");return;}
    const requestedScope=scope.current,requestedEpoch=epoch.current;
    const ownedOperation=Symbol();operation.current=ownedOperation;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result=await apiClient.createWebhook(
        workspaceId,
        {
          url: newUrl.trim(),
          description: newDescription.trim() || undefined,
          events: selectedEvents,
          secret: customSecret.trim() || undefined,
          supportsIdempotency,
        },
        { token }
      );
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      validateWebhookRows([result?.webhook]);
      if(result.webhook.url!==newUrl.trim()||result.webhook.is_active!==false||result.webhook.supports_idempotency!==supportsIdempotency||JSON.stringify(result.webhook.events)!==JSON.stringify(selectedEvents))throw new Error("O servidor não confirmou a configuração inativa solicitada, incluindo a prevenção de duplicidade. Confira as integrações antes de repetir o cadastro; os dados foram preservados.");
      setNewUrl("");
      setNewDescription("");
      setSelectedEvents(["*"]);
      setCustomSecret("");
      setSupportsIdempotency(false);
      setIsAdding(false);
      await loadWebhooks();
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current){if(!(err instanceof ApiError&&err.status>=400&&err.status<500&&err.status!==408))setCreationUncertain(true);setErrorMsg(userFacingError(err,"Erro ao cadastrar webhook. Os dados foram preservados."));}
    } finally {
      if(operation.current===ownedOperation)operation.current=null;
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setIsSubmitting(false);
    }
  };

  const configurationReady=Boolean(checkedAt)&&!isLoading&&!loadError;
  const handleTestWebhook = async (webhookId: string) => {
    if (!configurationReady || !workspaceId || !token || !canManage || operation.current) return;
    const hook=webhooks.find(item=>item.id===webhookId);if(!hook)return;
    const source=webhookFingerprint(hook);
    const requestedScope=scope.current,requestedEpoch=epoch.current;
    const ownedOperation=Symbol();operation.current=ownedOperation;
    setTestingId(webhookId);
    setTestResults(prev=>{const next={...prev};delete next[webhookId];return next;});
    setErrorMsg(null);

    try {
      const result = await apiClient.testWebhook(workspaceId, webhookId, { token });
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      validateWebhookTest(result);
      setTestResults((prev) => ({ ...prev, [webhookId]: {source,checkedAt:new Date().toLocaleString("pt-BR"),result} }));
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setTestResults(prev=>({...prev,[webhookId]:{source,checkedAt:new Date().toLocaleString("pt-BR"),error:userFacingError(err,"Não foi possível confirmar o resultado do teste.")}}));
    } finally {
      if(operation.current===ownedOperation)operation.current=null;
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setTestingId(null);
    }
  };

  const reviewActivation=(hook:OutboundWebhookSubscription)=>{
    if(!configurationReady||!canManage||operation.current)return;
    setActivationError(null);setActivationNotice(null);
    setActivationReview({id:hook.id,url:hook.url,events:[...hook.events],source:webhookFingerprint(hook),active:!hook.is_active});
  };
  const handleActivation = async () => {
    if(!configurationReady||!workspaceId||!token||!canManage||operation.current||!activationReview)return;
    const review=activationReview,current=webhooks.find(item=>item.id===review.id);
    if(!current||webhookFingerprint(current)!==review.source){setActivationError("A configuração mudou. Cancele esta revisão, atualize as integrações e confira novamente.");return;}
    const requestedScope=scope.current,requestedEpoch=epoch.current;const ownedOperation=Symbol();operation.current=ownedOperation;setBusyId(review.id);setActivationError(null);
    try {
      const result=await apiClient.setWebhookActive(workspaceId,review.id,review.active,{token},{url:review.url,events:review.events,isActive:!review.active});
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      validateWebhookRows([result?.webhook]);
      if(result.webhook.id!==review.id||result.webhook.is_active!==review.active||result.webhook.url!==review.url||JSON.stringify(result.webhook.events)!==JSON.stringify(review.events)||(current.supports_idempotency!==undefined&&result.webhook.supports_idempotency!==current.supports_idempotency))throw new Error("Não foi possível confirmar a configuração retornada. Feche esta revisão e atualize as integrações antes de repetir.");
      setWebhooks(items=>items.map(item=>item.id===review.id?result.webhook:item));
      setActivationReview(null);setActivationNotice(review.active?"Envio habilitado pelo servidor. Pendências antigas continuam sujeitas à revisão.":"Envio suspenso pelo servidor. Histórico e pendências foram preservados.");
      await loadWebhooks();
    } catch(error){if(requestedScope===scope.current&&requestedEpoch===epoch.current){setCheckedAt(null);setActivationError(userFacingError(error,"Não foi possível confirmar a alteração. Feche esta revisão e atualize as integrações antes de repetir."));}}
    finally {if(operation.current===ownedOperation)operation.current=null;if(requestedScope===scope.current&&requestedEpoch===epoch.current)setBusyId(null);}
  };
  const handleJobs = async (id: string, more=false) => {
    if(!workspaceId||!token||!canView||operation.current)return;
    const cursor=more?jobPages[id]?.nextCursor:undefined;
    if(more&&(!cursor||jobBlocked[id]))return;
    const requestedScope=scope.current,requestedEpoch=epoch.current;const ownedOperation=Symbol();operation.current=ownedOperation;setBusyId(id);setLoadingJobsId(id);setJobErrors(prev=>({...prev,[id]:""}));
    try {
      const current=()=>requestedScope===scope.current&&requestedEpoch===epoch.current;
      const cursorKey=(value:{createdAt:string;id:string}|null|undefined)=>value?JSON.stringify([value.createdAt,value.id]):"";
      let result=await apiClient.listWebhookJobs(workspaceId,id,{token},cursor??undefined);if(!current())return;
      const range=jobRanges.current[id],seen=more?new Set(range?.seen):new Set<string>();
      const validate=(used?:string)=>{validateWebhookJobs(result?.jobs);validateJobPagination(result.pagination,result.jobs.length);const next=cursorKey(result.pagination?.nextCursor);if(result.pagination?.hasMore&&(!next||next===used||seen.has(next))){setJobBlocked(prev=>({...prev,[id]:true}));throw new Error("A consulta não confirmou uma continuação válida. Consulte a fila novamente antes de continuar.");}};
      validate(cursorKey(cursor));
      let records=result.jobs,pages=1;
      if(more)seen.add(cursorKey(cursor));
      while(!more&&pages<(range?.pages??1)&&result.pagination?.hasMore){
        const next=result.pagination.nextCursor!;seen.add(cursorKey(next));
        result=await apiClient.listWebhookJobs(workspaceId,id,{token},next);if(!current())return;
        validate(cursorKey(next));records=Array.from(new Map([...records,...result.jobs].map(job=>[job.id,job])).values());pages++;
      }
      jobRanges.current[id]={pages:more?(range?.pages??1)+1:pages,seen};
      setJobBlocked(prev=>({...prev,[id]:false}));
      setJobs(prev=>{const all=more?[...(prev[id]??[]),...records]:records;return {...prev,[id]:Array.from(new Map(all.map(job=>[job.id,job])).values())};});
      setJobPages(prev=>({...prev,[id]:result.pagination??{hasMore:false,nextCursor:null}}));
      setJobConsultedAt(prev=>({...prev,[id]:new Date().toLocaleString("pt-BR")}));
    }
    catch(error){if(requestedScope===scope.current&&requestedEpoch===epoch.current){if(!more)setJobBlocked(prev=>({...prev,[id]:true}));setJobErrors(prev=>({...prev,[id]:userFacingError(error,"Falha ao consultar fila.")}));}}
    finally {if(operation.current===ownedOperation)operation.current=null;if(requestedScope===scope.current&&requestedEpoch===epoch.current){setBusyId(null);setLoadingJobsId(null);}}
  };

  const toggleEvent = (eventId: string) => {
    if (eventId === "*") {
      setSelectedEvents(selectedEvents.includes("*") ? [] : ["*"]);
      return;
    }
    const filtered = selectedEvents.filter((e) => e !== "*");
    if (filtered.includes(eventId)) {
      const next = filtered.filter((e) => e !== eventId);
      setSelectedEvents(next);
    } else {
      setSelectedEvents([...filtered, eventId]);
    }
  };

  const endpoints = [
    {
      method: "GET",
      path: `/v1/workspaces/${workspaceId}/integrations/candidates`,
      use: "Ler conversas candidatas para uma automação.",
    },
    {
      method: "POST",
      path: `/v1/workspaces/${workspaceId}/integrations/suggestions`,
      use: "Devolver uma sugestão governada ao Radar.",
    },
    {
      method: "POST",
      path: `/v1/workspaces/${workspaceId}/integrations/radar/scan`,
      use: "Executar a análise nativa sob demanda.",
    },
  ];

  if(!canView)return <Alert variant="info" title="Integrações restritas">Seu perfil não permite consultar integrações desta empresa.</Alert>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {activationNotice&&<p role="status">{activationNotice}</p>}
      {copyError&&<p role="alert">{copyError}</p>}
      {copied&&<p role="status">Valor copiado para a área de transferência.</p>}
      {!canManage&&<Alert variant="info" title="Integrações em consulta">Você pode consultar integrações e filas. Criar, testar, ativar ou suspender exige proprietário ou administrador.</Alert>}
      {errorMsg && (
        <Alert variant="danger" title="Atenção">
          {errorMsg}
        </Alert>
      )}
      {loadError && <Alert variant="danger" title="Não foi possível carregar as integrações">{loadError} <Button size="sm" disabled={isLoading} onClick={()=>void loadWebhooks()}>Tentar novamente</Button></Alert>}

      {/* 1. API de Integracoes */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap:"wrap", gap: 12 }}>
          <div>
            <h2 style={title}>
              <Braces size={17} /> API de Integrações
            </h2>
            <p style={description}>
              Conecte n8n, sistemas internos ou agentes ao Chat Sales sem entregar controle direto do WhatsApp.
            </p>
          </div>
          <Badge variant="neutral">Referência da API</Badge>
        </div>
        <Alert variant="info" title="Como funciona">
          O sistema externo lê candidatos e devolve sugestões. O operador revisa no Radar antes de qualquer mensagem ser enviada.
        </Alert>
        <CopyRow label="URL base" value={baseUrl} copied={copied === "base"} onCopy={() => copy("base", baseUrl)} />
        <CopyRow label="Workspace" value={workspaceId} copied={copied === "workspace"} onCopy={() => copy("workspace", workspaceId)} />
        <div style={{ display: "grid", gap: 8 }}>
          {endpoints.map((item) => (
            <div key={item.path} style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant={item.method === "GET" ? "operational" : "ai"}>{item.method}</Badge>
                <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>{item.path}</code>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>{item.use}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Webhooks de saída: teste, liberação e fila de eventos. */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap:"wrap", gap: 12 }}>
          <div>
            <h2 style={title}>
              <Webhook size={17} /> Webhooks de Saída
            </h2>
            <p style={description}>
              Envie eventos em tempo real para o n8n ou seu backend quando ocorrerem ações no Chat Sales (leads, mensagens, propostas, pagamentos Pix).
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              ref={refreshControl}
              size="xs"
              variant="outline"
              prefixIcon={<RefreshCw size={13} />}
              onClick={event=>{rememberReadFocus(event.currentTarget);void loadWebhooks();}}
              disabled={isLoading}
            >
              Atualizar
            </Button>
            {canManage&&!isAdding && (
              <Button
                size="xs"
                variant="primary"
                prefixIcon={<Plus size={13} />}
                onClick={() => setIsAdding(true)}
              >
                Novo Webhook
              </Button>
            )}
          </div>
        </div>

        {/* Formulario de Novo Webhook */}
        {canManage&&isAdding && (
          <form
            onSubmit={handleCreateWebhook}
            style={{
              padding: 16,
              background: "var(--bg-canvas)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Cadastrar Novo Destino de Webhook
            </div>

            {creationUncertain&&<p role="alert">Não foi possível confirmar se o webhook foi cadastrado. Não repita antes de conferir a lista. Fechar este rascunho não desfaz um possível cadastro.</p>}
            {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard}/>}
            <fieldset disabled={creationUncertain||isSubmitting||discard.isPending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:12}}>
            <Input ref={urlRef}
              label="URL de Destino (Endpoint HTTP/HTTPS)"
              type="url"
              placeholder="https://meu-n8n.meudominio.com/webhook/chat-sales"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              required
              disabled={isSubmitting}
            />

            <Input
              label="Descrição / Identificação (Opcional)"
              placeholder="Ex: n8n Produção - Disparo de E-mail de Boas Vindas"
              value={newDescription}
              disabled={isSubmitting}
              onChange={(e) => setNewDescription(e.target.value)}
            />

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                Eventos a Notificar
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {AVAILABLE_EVENTS.map((ev) => {
                  const isChecked = selectedEvents.includes(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      aria-pressed={isChecked}
                      disabled={isSubmitting}
                      onClick={() => toggleEvent(ev.id)}
                      style={{
                        padding: "4px 10px",
                        minHeight:isMobile?44:undefined,
                        fontSize: 12,
                        borderRadius: 16,
                        border: isChecked ? "1px solid var(--color-primary)" : "1px solid var(--border-default)",
                        backgroundColor: isChecked ? "var(--bg-surface-elevated)" : "var(--bg-surface)",
                        color: isChecked ? "var(--color-primary)" : "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {isChecked && <Check size={12} />}
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Input
              label="Segredo HMAC-SHA256 (Opcional — gerado automaticamente se vazio)"
              type="password"
              autoComplete="new-password"
              placeholder="whsec_..."
              value={customSecret}
              disabled={isSubmitting}
              onChange={(e) => setCustomSecret(e.target.value)}
            />

            {selectedEvents.length===0&&<p role="status" style={{fontSize:12,margin:0}}>Nenhum evento selecionado. Escolha os eventos que este destino deve receber.</p>}
            <label style={{fontSize:12}}><input type="checkbox" checked={supportsIdempotency} disabled={isSubmitting} onChange={e=>setSupportsIdempotency(e.target.checked)}/> O destino evita duplicidade usando Idempotency-Key (permite repetir falhas temporárias com limite)</label>
            </fieldset>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4, flexDirection:isMobile?"column":undefined }}>
              <Button style={formActionStyle} type="button" size="xs" variant="ghost" onClick={cancelCreation} disabled={isSubmitting||discard.isPending}>
                {creationUncertain?"Fechar e conferir integrações":"Cancelar"}
              </Button>
              <Button style={formActionStyle} size="xs" variant="primary" type="submit" disabled={creationUncertain || discard.isPending || isSubmitting || Boolean(testingId || busyId) || selectedEvents.length===0}>
                {isSubmitting ? "Salvando..." : "Salvar Webhook inativo"}
              </Button>
            </div>
          </form>
        )}

        <p style={{fontSize:12}}>Novos destinos começam inativos. Teste a conexão e ative explicitamente. Eventos operacionais informam o identificador do recurso para consulta pela integração.</p>
        {checkedAt&&<p role="status" style={{fontSize:12}}>Última consulta concluída: {checkedAt}. {isLoading?"Atualizando; os registros anteriores permanecem visíveis.":loadError?"Os registros exibidos são da consulta anterior. Atualize antes de testar ou alterar o envio.":"Este registro não comprova entrega de eventos."}</p>}
        {/* Lista de Webhooks Cadastrados */}
        {webhooks.length === 0 && loadError ? null : webhooks.length === 0 && !isAdding ? (
          <div
            style={{
              padding: 24,
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {isLoading ? "Carregando assinaturas de webhook..." : "Nenhum webhook de saída cadastrado neste workspace."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {webhooks.map((wh) => {
              const entry=testResults[wh.id];
              const observation=entry?.source===webhookFingerprint(wh)?entry:undefined;
              const testRes=observation?.result;
              return (
                <div
                  key={wh.id}
                  style={{
                    padding: 14,
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--bg-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap:"wrap", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <code style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                          {wh.url}
                        </code>
                        <Badge variant={wh.is_active ? "operational" : "neutral"}>
                          {wh.is_active ? "Envio habilitado" : "Envio suspenso"}
                        </Badge>
                      </div>
                      {wh.description && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                          {wh.description}
                        </div>
                      )}
                      <p style={{fontSize:12,margin:"6px 0 0",color:"var(--text-secondary)"}}>
                        {wh.supports_idempotency===true?"O destino declara prevenção de duplicidade. Falhas temporárias elegíveis podem ser repetidas com limite.":wh.supports_idempotency===false?"O destino não declara prevenção de duplicidade. Falhas não são repetidas automaticamente.":"Prevenção de duplicidade não informada nesta consulta."}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexWrap:"wrap", gap: 6, minWidth:0 }}>
                      {canManage&&<Button
                        size="xs"
                        variant="outline"
                        prefixIcon={<Send size={12} />}
                        onClick={() => handleTestWebhook(wh.id)}
                        disabled={!configurationReady||Boolean(testingId || busyId || isSubmitting)}
                      >
                        {testingId === wh.id ? "Testando..." : "Testar (Ping)"}
                      </Button>}
                      {canManage&&<Button size="xs" variant="outline" disabled={!configurationReady||Boolean(testingId || busyId || isSubmitting)} onClick={()=>reviewActivation(wh)}>{busyId===wh.id?"Aguarde...":wh.is_active?"Suspender":"Ativar após teste"}</Button>}
                      <Button size="xs" variant="outline" disabled={!configurationReady||Boolean(testingId || busyId || isSubmitting)} onClick={event=>{rememberReadFocus(event.currentTarget);void handleJobs(wh.id);}}>{loadingJobsId===wh.id?"Consultando fila...":"Consultar fila"}</Button>

                    </div>
                  </div>

                  {loadingJobsId===wh.id&&<p role="status">Consultando eventos desta integração…</p>}
                  {jobErrors[wh.id]&&<div role="alert"><p>{jobErrors[wh.id]}</p><p>{jobs[wh.id]?"Os eventos exibidos foram preservados da última consulta concluída. Esta tentativa não confirmou o estado atual.":"A fila ainda não foi consultada com sucesso. Use Consultar fila para tentar novamente."}</p></div>}
                  {jobConsultedAt[wh.id]&&<p style={{fontSize:12}}>Última página recebida: {jobConsultedAt[wh.id]} (horário deste dispositivo). A fila pode mudar após a consulta.</p>}
                  {jobs[wh.id] && <><WebhookJobList jobs={jobs[wh.id]!} hasMore={jobPages[wh.id]?.hasMore}/>{jobPages[wh.id]?.hasMore&&<Button style={formActionStyle} size="sm" disabled={Boolean(testingId||busyId||isSubmitting)||jobBlocked[wh.id]} onClick={event=>{rememberReadFocus(event.currentTarget);void handleJobs(wh.id,true);}}>Carregar eventos anteriores</Button>}</>}

                  {/* Detalhes: Eventos e Segredo */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Eventos:</span>
                      {wh.events.map((ev) => (
                        <Badge key={ev} variant="neutral">
                          {eventLabel(ev)}
                        </Badge>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Key size={12} /> Segredo:
                      </span>
                      <code style={{ fontSize: 11, background: "var(--bg-canvas)", padding: "2px 6px", borderRadius: 4 }}>
                        {wh.secret ? "Protegido" : "Indisponível para este acesso"}
                      </code>
                      <Button
                        size="xs"
                        variant="ghost"
                        prefixIcon={copied === wh.id ? <Check size={12} /> : <Copy size={12} />}
                        disabled={!canManage || !wh.secret}
                        aria-label={`Copiar segredo da integração ${wh.description || wh.url}`}
                        onClick={() => copy(wh.id, wh.secret || "")}
                      >
                        {copied === wh.id ? "Copiado" : "Copiar"}
                      </Button>
                    </div>
                  </div>

                  {testingId===wh.id&&<p role="status">Aguardando o resultado deste teste. Nenhum teste anterior confirma esta tentativa.</p>}
                  {observation&&<p style={{fontSize:12}}>Teste consultado em {observation.checkedAt} (horário deste dispositivo). A resposta vale para a configuração testada naquele momento; não comprova a conclusão da automação externa.</p>}
                  {observation?.error&&<p role="alert">{observation.error} O resultado desta tentativa não foi confirmado.</p>}
                  {/* Feedback de Teste */}
                  {testRes && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        backgroundColor: testRes.success ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        border: testRes.success ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                        color: testRes.success ? "var(--color-success, #10B981)" : "var(--color-danger, #EF4444)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        {testRes.success
                          ? `✓ Destino respondeu HTTP ${testRes.statusCode} com sucesso (${testRes.durationMs}ms)`
                          : `✕ Falha no teste: ${testRes.errorMessage || `HTTP ${testRes.statusCode}`}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ShieldCheck size={14} color="var(--color-primary)" /> Assinatura Criptográfica HMAC SHA-256
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Cada payload enviado pelo Chat Sales inclui o cabeçalho <code>X-ChatSales-Signature-256: sha256=&lt;hash&gt;</code>. Valide esse hash no n8n usando o segredo do webhook para garantir autenticidade e evitar requisições forjadas.
          </p>
        </div>
      </section>

      {/* 3. Instrucoes n8n */}
      <section style={card}>
        <h2 style={title}>
          <ExternalLink size={17} /> Configuração no n8n
        </h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
          <li>
            Para <strong>receber eventos</strong>: crie um node <strong>Webhook</strong> no n8n e cadastre a URL gerada na seção de Webhooks acima.
          </li>
          <li>
            Para <strong>enviar dados / ler candidatos</strong>: use o node <strong>HTTP Request</strong> apontando para os endpoints da API.
          </li>
          <li>Adicione <code>X-Workspace-Id</code> com o identificador do workspace.</li>
          <li>Autentique chamadas à API com <code>Authorization: Bearer</code> usando sua credencial de integração.</li>
        </ol>
      </section>
      <Dialog isOpen={Boolean(activationReview)} onClose={()=>{if(!busyId){setActivationReview(null);setActivationError(null);}}} title={activationReview?.active?"Revisar ativação da integração":"Revisar suspensão da integração"} description="Confira o destino e o efeito antes de confirmar.">
        {activationReview&&<div style={{display:"grid",gap:12,overflowWrap:"anywhere"}}>
          <p>Destino: <strong>{activationReview.url}</strong></p>
          <div><strong>Eventos incluídos nesta revisão</strong>
            {activationReview.events.length?<ul style={{paddingLeft:20}}>{activationReview.events.map((event,index)=><li key={`${event}:${index}`} style={{marginTop:6}}>{eventLabel(event)} <code style={{fontSize:12}}>({event})</code></li>)}</ul>:<p>Nenhum evento selecionado</p>}
          </div>
          <p>{activationReview.active?"O servidor exige um teste aprovado da configuração atual antes de habilitar novos envios. Pendências antigas não são liberadas automaticamente.":"Novas execuções serão suspensas. Histórico e pendências serão preservados. Uma ação já em andamento pode ter chegado ao destino e precisa de conferência."}</p>
          {activationError&&<p role="alert">{activationError}</p>}
          {busyId&&<p role="status">Aguardando confirmação do servidor…</p>}
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <Button type="button" variant="secondary" disabled={Boolean(busyId)} onClick={()=>{setActivationReview(null);setActivationError(null);}}>Cancelar</Button>
            <Button type="button" disabled={!configurationReady||Boolean(busyId)} onClick={()=>void handleActivation()}>{activationReview.active?"Confirmar ativação":"Confirmar suspensão"}</Button>
          </div>
        </div>}
      </Dialog>

    </div>
  );
};

const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const title: React.CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
  color: "var(--text-primary)",
};

const description: React.CSSProperties = {
  margin: "5px 0 0",
  fontSize: 12,
  color: "var(--text-secondary)",
  lineHeight: 1.55,
};

const CopyRow: FC<{ label: string; value: string; copied: boolean; onCopy: () => void }> = ({
  label,
  value,
  copied,
  onCopy,
}) => (
  <div
    style={{
      padding: 12,
      background: "var(--bg-canvas)",
      borderRadius: 8,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
      <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{value || "Indisponível"}</code>
    </div>
    <Button
      size="xs"
      variant="ghost"
      prefixIcon={copied ? <Check size={13} /> : <Copy size={13} />}
      onClick={onCopy}
      aria-label={`Copiar ${label}`}
      disabled={!value}
    >
      {copied ? "Copiado" : "Copiar"}
    </Button>
  </div>
);
