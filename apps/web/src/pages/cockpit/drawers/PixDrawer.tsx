import {hasVerifiedPixReceipt,readConversationPixCharges,pixChargeStateLabel,confirmedPixSettlement} from '../utils/pix-receipt';
import {UnsavedChangesNotice,useDiscardChanges} from "../../UnsavedChangesNotice";
import {CheckoutRequestsPanel} from './CheckoutRequestsPanel';
import { type FC, useState, useEffect, useCallback, useRef } from "react";
import { Drawer, Dialog, Button, Input, Badge, SegmentedControl, LoadingState, EmptyState } from "@sos-sales/ui";
import {
  QrCode,
  AlertCircle,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import {
  apiClient,
  type CommercialThreadSummary,
  type PixChargeSummary,
} from "../../../services/api-client";

import {userFacingError} from "../../../utils/user-facing-error";
export function parsePixAmountCents(value:string):number{
 const raw=value.trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))return 0;
 const [units,fraction=""]=raw.replace(/\./g,"").split(",");const cents=Number(units)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents<=2147483647?cents:0;
}
interface PixDrawerProps {
  sendBlockedReason?:string;
  onRefreshChannel?:()=>void;
  isCheckingChannel?:boolean;
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onPixCreated?: () => void|Promise<void>;
}

export const PixDrawer: FC<PixDrawerProps> = ({
  sendBlockedReason,onRefreshChannel,isCheckingChannel,
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onPixCreated,
}) => {
  const [activeTab, setActiveTab] = useState<"list" | "new">("list");
  const [charges, setCharges] = useState<PixChargeSummary[]>([]);
  const [isLoadingCharges, setIsLoadingCharges] = useState(false);
  const [settlingChargeId, setSettlingChargeId] = useState<string | null>(null);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState<string | null>(null);
  const [viewingQrChargeId, setViewingQrChargeId] = useState<string | null>(null);

  // New Charge Generation Form State
  const [title, setTitle] = useState("Fechamento Comercial");
  const [amount, setAmount] = useState("");
  const [expiresMinutes, setExpiresMinutes] = useState("60");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdNow,setCreatedNow]=useState(false),[openingLinkedCharge,setOpeningLinkedCharge]=useState(false);
  const [generatedCharge,setGeneratedCharge]=useState<PixChargeSummary|null>(null);
  const [,refreshExpiry]=useState(0);
  useEffect(()=>{
    if(!isOpen)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{
      const now=Date.now();
      const deadlines=[...charges,...(generatedCharge?[generatedCharge]:[])].filter(charge=>charge.status==="PENDING").map(charge=>Date.parse(charge.expiresAt)).filter(expiry=>Number.isFinite(expiry)&&expiry>now);
      if(!deadlines.length)return;
      timer=setTimeout(()=>{refreshExpiry(value=>value+1);schedule();},Math.min(Math.min(...deadlines)-now,2147483647));
    };
    schedule();return()=>clearTimeout(timer);
  },[isOpen,charges,generatedCharge]);
  const [copiedId,setCopiedId]=useState<string|null>(null);
  const [loadError,setLoadError]=useState("");
  const [sendAttempted,setSendAttempted]=useState(false),[refreshError,setRefreshError]=useState(false);
  const sendBlock=useRef(sendBlockedReason);sendBlock.current=sendBlockedReason;
  const [sendState,setSendState]=useState<"idle"|"pending"|"queued">("idle");
  const [confirmTarget,setConfirmTarget]=useState<PixChargeSummary|null>(null);
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${isOpen}`;
  const generation=useRef(0),readSequence=useRef(0),busy=useRef(false);
  const creationKeys=useRef(new Map<string,string>());
  const copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const loadCharges=useCallback(async()=>{
    if(!isOpen||!thread||!workspaceId||!token||busy.current)return;
    const requestedScope=scope.current,request=++readSequence.current;
    setIsLoadingCharges(true);setLoadError("");
    try{const result=await apiClient.getPixChargesByThread(workspaceId,thread.id,{token});if(requestedScope===scope.current&&request===readSequence.current)setCharges(readConversationPixCharges(result.charges,workspaceId,thread.id));}
    catch(error){if(requestedScope===scope.current&&request===readSequence.current)setLoadError(userFacingError(error,"Não foi possível carregar as cobranças. Tente novamente."));}
    finally{if(requestedScope===scope.current&&request===readSequence.current)setIsLoadingCharges(false);}
  },[isOpen,workspaceId,token,thread?.id]);
  useEffect(()=>{
    generation.current++;readSequence.current++;busy.current=false;clearTimeout(copyTimer.current);
    setCharges([]);setGeneratedCharge(null);setCreatedNow(false);setOpeningLinkedCharge(false);setError(null);setLoadError("");setConfirmSuccessMessage(null);setConfirmTarget(null);setActiveTab("list");setTitle("Cobrança Pix");setAmount("");setExpiresMinutes("60");setIsSubmitting(false);setSettlingChargeId(null);setViewingQrChargeId(null);setCopiedId(null);setSendState("idle");setSendAttempted(false);setRefreshError(false);
    void loadCharges();return()=>{generation.current++;readSequence.current++;clearTimeout(copyTimer.current);};
  },[loadCharges]);
  const titleRef=useRef<HTMLInputElement>(null);
  const draftChanged=title!=="Cobrança Pix"||amount!==""||expiresMinutes!=="60";
  const discard=useDiscardChanges(isOpen&&!generatedCharge&&draftChanged,scope.current,()=>titleRef.current,isOpen);
  const requestClose=()=>{if(!busy.current&&!isSubmitting&&!settlingChargeId)discard.requestExit(onClose);};
  const prepareCharge=(charge:PixChargeSummary)=>{discard.keepEditing();setCreatedNow(false);setTitle("Cobrança Pix");setAmount("");setExpiresMinutes("60");setGeneratedCharge(charge);setSendState("idle");setSendAttempted(false);setError(null);setRefreshError(false);setActiveTab("new");};
  const viewLinkedCharge=(chargeId:string)=>{
    if(busy.current||!thread||!workspaceId||!token)return;
    discard.requestExit(()=>{
      const requestedScope=scope.current,request=generation.current,read=++readSequence.current;const valid=()=>requestedScope===scope.current&&request===generation.current&&read===readSequence.current;
      busy.current=true;setIsSubmitting(true);setIsLoadingCharges(true);setLoadError("");setOpeningLinkedCharge(true);setError(null);
      void apiClient.getPixChargesByThread(workspaceId,thread.id,{token}).then(result=>{
        if(!valid())return;
        const charges=readConversationPixCharges(result.charges,workspaceId,thread.id);setCharges(charges);const charge=charges.find(item=>item.id===chargeId);
        if(!charge){setError("A cobrança vinculada não foi encontrada nesta conversa. Atualize a consulta ou peça revisão à equipe.");return;}
        prepareCharge(charge);
      }).catch(error=>{if(valid())setError(userFacingError(error,"Não foi possível consultar a cobrança vinculada. Nenhuma cobrança foi criada ou alterada."));}).finally(()=>{if(valid()){busy.current=false;setIsSubmitting(false);setIsLoadingCharges(false);setOpeningLinkedCharge(false);}});
    });
  };
  const chargeIsSendable=(charge:PixChargeSummary)=>charge.status==="PENDING"&&Number.isFinite(Date.parse(charge.expiresAt))&&Date.parse(charge.expiresAt)>Date.now();
  const notifyChange=async(valid:()=>boolean)=>{try{await onPixCreated?.();}catch{if(valid())setRefreshError(true);}};
  const sendCharge=async(charge:PixChargeSummary,valid:()=>boolean)=>{
    if(!thread||!workspaceId||!token)return false;
    if(sendBlock.current)throw new Error(sendBlock.current);
    const response=await apiClient.getPixChargesByThread(workspaceId,thread.id,{token});if(!valid())return false;
    const charges=readConversationPixCharges(response.charges,workspaceId,thread.id);setCharges(charges);const latest=charges.find(item=>item.id===charge.id);
    if(!latest)throw new Error("A cobrança não foi encontrada na consulta atual. Atualize a lista antes de enviar.");
    setGeneratedCharge(latest);
    if(!chargeIsSendable(latest))throw new Error("Esta cobrança não está pendente e válida para envio. Confira seu estado e gere uma nova se necessário.");
    const signature=(item:PixChargeSummary)=>JSON.stringify([item.id,item.title,item.amountCents,item.pixCode,item.expiresAt,item.status]);
    if(signature(latest)!==signature(charge))throw new Error("Os dados da cobrança mudaram. A prévia foi atualizada; revise antes de enviar novamente.");
    if(sendBlock.current)throw new Error(sendBlock.current);
    await apiClient.sendOutboundMessage(workspaceId,thread.channelInstanceId,{recipientPhoneE164:thread.contactPhone,contentType:"text",body:`*Cobrança Pix — Chat Sales*\n\n*Item:* ${latest.title}\n*Valor:* ${latest.amountFormatted}\n\n*Pix Copia e Cola:*\n${latest.pixCode}\n\nValidade: ${new Date(latest.expiresAt).toLocaleString("pt-BR")}`,metadata:{chargeId:latest.id},idempotencyKey:`pix_charge_${latest.id}`},{token});return true;
  };
  async function handleGenerate(){
    if(!thread||!workspaceId||!token||generatedCharge||busy.current||discard.isPending||isLoadingCharges||loadError)return;
    const amountCents=parsePixAmountCents(amount),validity=Number(expiresMinutes);
    if(amountCents<100){setError("Informe um valor válido de pelo menos R$ 1,00, usando vírgula para centavos.");return;}
    if(!Number.isInteger(validity)||validity<5||validity>1440){setError("A validade deve ser um número inteiro entre 5 e 1440 minutos.");return;}
    if(!title.trim()||title.trim().length>120){setError("Informe uma descrição de até 120 caracteres.");return;}
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    const fingerprint=JSON.stringify([requestedScope,title.trim(),amountCents,validity]);const requestKey=creationKeys.current.get(fingerprint)||crypto.randomUUID();creationKeys.current.set(fingerprint,requestKey);
    busy.current=true;setIsSubmitting(true);setError(null);setSendState("idle");setSendAttempted(false);setRefreshError(false);
    try{
      const result=await apiClient.createPixCharge(workspaceId,thread.id,{requestKey,contactId:thread.contactId,productId:null,title:title.trim(),amountCents,expiresMinutes:validity},{token});
      if(!valid())return;
      readConversationPixCharges([result.charge],workspaceId,thread.id);
      if(result.charge.contactId!==thread.contactId)throw new Error("A resposta de criação não corresponde ao contato desta conversa. Consulte as cobranças antes de repetir.");
      creationKeys.current.delete(fingerprint);
      discard.keepEditing();setTitle("Cobrança Pix");setAmount("");setExpiresMinutes("60");setCreatedNow(true);setGeneratedCharge(result.charge);setCharges(current=>[result.charge,...current.filter(c=>c.id!==result.charge.id)]);await notifyChange(valid);
    }catch(error){if(valid()){setSendState("idle");setError(userFacingError(error,"Não foi possível confirmar a criação. Confira a lista; repetir com os mesmos dados reutiliza esta solicitação."));}}
    finally{if(valid()){busy.current=false;setIsSubmitting(false);}}
  }
  async function retryChargeSend(){
    if(!generatedCharge||busy.current||sendState==="queued"||sendBlock.current||!chargeIsSendable(generatedCharge))return;
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    busy.current=true;setIsSubmitting(true);setError(null);setSendState("pending");setSendAttempted(true);
    try{const queued=await sendCharge(generatedCharge,valid);if(valid()&&queued){setSendState("queued");await notifyChange(valid);}}
    catch(error){if(valid()){setSendState("idle");setError(userFacingError(error,"Não foi possível preparar a mensagem. A cobrança continua criada."));}}
    finally{if(valid()){busy.current=false;setIsSubmitting(false);}}
  }
  async function handleConfirmPayment(chargeId:string){
    if(!workspaceId||!token||!thread||busy.current||loadError||isLoadingCharges)return;
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    busy.current=true;setSettlingChargeId(chargeId);setConfirmSuccessMessage(null);setError(null);
    try{const result=await apiClient.confirmPixPayment(workspaceId,chargeId,{token});if(!valid())return;if(!result.success)throw new Error("A confirmação não foi concluída. Atualize as cobranças antes de tentar novamente.");const original=charges.find(charge=>charge.id===chargeId);if(!original||result.charge?.id!==chargeId)throw new Error("A resposta não corresponde à cobrança conferida. Consulte as cobranças antes de repetir.");const confirmed=confirmedPixSettlement(original,result.charge);readConversationPixCharges([confirmed],workspaceId,thread.id);setCharges(current=>current.map(c=>c.id===chargeId?confirmed:c));setConfirmTarget(null);setConfirmSuccessMessage((result.alreadySettled?"O recebimento já estava registrado. Esta confirmação não gerou outro recebimento.":"Recebimento registrado no caixa.")+" "+(result.notification==="queued"?"Aviso ao cliente colocado na fila; envio e entrega devem ser acompanhados na conversa.":result.notification==="not_queued"?"Nenhum aviso ao cliente foi colocado na fila. Revise a disponibilidade do canal.":result.notification==="unchanged"?"Nenhum novo aviso foi preparado por esta confirmação.":"Não foi possível determinar o estado do aviso ao cliente. Consulte a conversa antes de repetir qualquer envio.")+(result.commercialOutcome==="unchanged"?" A oportunidade não foi alterada; revise o desfecho comercial separadamente.":""));await notifyChange(valid);}
    catch(error){if(valid()){setConfirmTarget(null);setLoadError("O resultado do registro precisa de conferência. Consulte as cobranças antes de tentar novamente.");setError(userFacingError(error,"Não foi possível confirmar o recebimento. Atualize a lista antes de tentar novamente."));}}
    finally{if(valid()){busy.current=false;setSettlingChargeId(null);}}
  }
  async function handleCopy(code:string,id:string){
    const requestedScope=scope.current,request=generation.current;
    try{await navigator.clipboard.writeText(code);if(requestedScope!==scope.current||request!==generation.current)return;clearTimeout(copyTimer.current);setCopiedId(id);copyTimer.current=setTimeout(()=>setCopiedId(null),2000);}
    catch{if(requestedScope===scope.current&&request===generation.current)setError("Não foi possível copiar. Selecione o código e copie manualmente.");}
  }

  const pendingCount = charges.filter(chargeIsSendable).length;

  return (
    <>
    <Drawer
      isOpen={isOpen}
      onClose={requestClose}
      title="Cobrança Pix & Caixa"
      description="Consulte recebimentos e crie cobranças Pix. Enviar a cobrança ao cliente exige uma ação separada."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",flexWrap:"wrap",gap:8 }}>
          <Button
            size="sm"
            variant="ghost"
            prefixIcon={<RefreshCw size={14} className={isLoadingCharges ? "animate-spin" : ""} />}
            onClick={loadCharges}
            disabled={isLoadingCharges||isSubmitting||!!settlingChargeId||discard.isPending}
          >
            Atualizar
          </Button>

          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" disabled={isSubmitting||!!settlingChargeId||discard.isPending} onClick={requestClose}>
              Fechar
            </Button>
            {activeTab === "new" && !generatedCharge && (
              <Button
                size="sm"
                variant="primary"
                disabled={isSubmitting||isLoadingCharges||!!loadError||!thread||discard.isPending}
                onClick={()=>void handleGenerate()}
                prefixIcon={<QrCode size={14} />}
              >
                {isSubmitting ? "Gerando..." : "Criar cobrança Pix"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={isSubmitting||Boolean(settlingChargeId)}/>}
      <fieldset disabled={discard.isPending} style={{border:0,margin:0,padding:0,minWidth:0,display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Navigation Tabs */}
        <SegmentedControl aria-label="Área de cobranças Pix"
          value={activeTab}
          onChange={(val) => {
            if(isSubmitting||settlingChargeId||discard.isPending)return;
            setActiveTab(val as "list" | "new");
            setError(null);
          }}
          options={[
            {
              value: "list",
              label: isLoadingCharges||loadError?"Cobranças (indisponível)":`Cobranças (${charges.length})${pendingCount > 0 ? ` · ${pendingCount} pendente(s) válida(s)` : ""}`,
            },
            {
              value: "new",
              label: "+ Nova Cobrança",
            },
          ]}
        />

        {sendBlockedReason&&<div role="status"><p>{sendBlockedReason}</p><p>Você pode criar e consultar cobranças. O envio pela conversa depende da disponibilidade do canal e da janela de atendimento.</p>{onRefreshChannel&&<Button size="sm" variant="secondary" disabled={isCheckingChannel||isSubmitting} onClick={onRefreshChannel}>Atualizar disponibilidade</Button>}</div>}
        {refreshError&&<p role="alert">O resultado da cobrança foi preservado, mas a conversa não foi atualizada. Atualize as mensagens sem criar outra cobrança nem repetir o envio por esse motivo.</p>}
        {loadError&&<div role="alert"><p>{loadError}</p><Button size="sm" onClick={()=>void loadCharges()}>Tentar novamente</Button></div>}
        {!thread&&<p>Selecione uma conversa para consultar e criar cobranças.</p>}
        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {confirmSuccessMessage && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-action-subtle)",
              color: "var(--color-action)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{confirmSuccessMessage}</span>
          </div>
        )}

        {activeTab==='list'&&isOpen&&workspaceId&&token&&thread&&<CheckoutRequestsPanel key={`${workspaceId}:${thread.id}`} workspaceId={workspaceId} threadId={thread.id} token={token} onViewCharge={viewLinkedCharge} isOpeningCharge={openingLinkedCharge}/>}
        {/* TAB 1: Lista de Cobranças da Conversa */}
        {activeTab === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {isLoadingCharges ? (
              <LoadingState text="Carregando cobranças Pix desta conversa..." />
            ) : loadError ? null : charges.length === 0 ? (
              <EmptyState
                icon={<Receipt size={32} />}
                title="Nenhuma cobrança gerada"
                description="Não há cobranças Pix ativas ou históricas nesta conversa."
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    prefixIcon={<Plus size={14} />}
                    onClick={() => setActiveTab("new")}
                  >
                    Gerar Primeira Cobrança
                  </Button>
                }
              />
            ) : (
              charges.map((charge) => {
                const pendingInRecord=charge.status === "PENDING";
                const expiry=Date.parse(charge.expiresAt);
                const localExpired=pendingInRecord&&Number.isFinite(expiry)&&expiry<=Date.now();
                const invalidExpiry=pendingInRecord&&!Number.isFinite(expiry);
                const isPending = pendingInRecord&&!localExpired&&!invalidExpiry;
                const knownState=["PENDING","PAID","EXPIRED","CANCELLED"].includes(charge.status);
                const isPaid = hasVerifiedPixReceipt(charge);
                const receiptNeedsReview=charge.status==="PAID"&&!isPaid;
                const isExpired = charge.status === "EXPIRED";
                const isSettling = settlingChargeId === charge.id;
                const isViewingQr = viewingQrChargeId === charge.id;

                return (
                  <div
                    key={charge.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      padding: "14px",
                      borderRadius: "var(--radius-md, 8px)",
                      backgroundColor: "var(--bg-canvas)",
                      border: isPaid
                        ? "1px solid var(--color-action)"
                        : isPending
                        ? "1px solid var(--color-warning)"
                        : "1px solid var(--border-default)",
                      boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
                    }}
                  >
                    {/* Header: Title and Status Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)", color: "var(--text-primary)" }}>
                          {charge.title}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          Gerado em: {new Date(charge.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      {isPaid && (
                        <Badge variant="action">
                          <CheckCircle2 size={12} style={{ marginRight: "4px" }} /> Pago
                        </Badge>
                      )}
                      {receiptNeedsReview&&<Badge variant="warning">Pagamento informado — revisar confirmação</Badge>}
                      {isPending && (
                        <Badge variant="warning">
                          <Clock size={12} style={{ marginRight: "4px" }} /> Pendente
                        </Badge>
                      )}
                      {localExpired&&<Badge variant="neutral">Validade vencida neste dispositivo</Badge>}
                      {invalidExpiry&&<Badge variant="warning">Validade para revisar</Badge>}
                      {charge.status==="CANCELLED"&&<Badge variant="neutral">Cancelada</Badge>}
                      {!knownState&&<Badge variant="warning">Estado não reconhecido</Badge>}
                      {isExpired && (
                        <Badge variant="neutral">
                          Expirado
                        </Badge>
                      )}
                    </div>

                    {pendingInRecord&&<p style={{fontSize:12,margin:0}}>Validade informada: {Number.isFinite(expiry)?new Date(expiry).toLocaleString("pt-BR"):"Data inválida; consulte a origem da cobrança."}{localExpired?" O prazo informado venceu; o estado bancário deve ser consultado separadamente.":""}</p>}
                    {!knownState&&<p role="status">O estado recebido não foi reconhecido. Atualize a consulta e confira a origem antes de agir.</p>}
                    {receiptNeedsReview&&<p role="status">O registro está marcado como pago, mas faltam dados válidos de confirmação. Confira a origem e o crédito antes de considerar o recebimento confirmado.</p>}
                    {charge.proposalId&&<p style={{fontSize:12,margin:0}}>Origem: proposta comercial vinculada. O valor foi definido pela proposta.</p>}
                    {/* Amount & Details */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          color: isPaid ? "var(--color-action)" : "var(--text-primary)",
                        }}
                      >
                        {charge.amountFormatted}
                      </span>

                      {isPaid && charge.verificationMethod && (
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                          <ShieldCheck size={13} style={{ color: "var(--color-action)" }} />
                          {charge.verificationMethod === "BANK_WEBHOOK"
                            ? "Confirmado via Webhook Bancário"
                            : "Confirmado pelo Caixa"}
                        </span>
                      )}
                    </div>

                    {/* QR Code toggle if available */}
                    {isViewingQr && charge.pixQrUrl && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "10px", backgroundColor: "#fff", borderRadius: "8px" }}>
                        <img src={charge.pixQrUrl} alt="QR Code Pix" style={{ width: "160px", height: "160px" }} />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      <Button
                        size="xs"
                        variant="secondary"
                        prefixIcon={copiedId === charge.id ? <Check size={12} /> : <Copy size={12} />}
                        onClick={() => handleCopy(charge.pixCode, charge.id)}
                      >
                        {copiedId === charge.id ? "Copiado!" : "Copiar Pix"}
                      </Button>

                      {chargeIsSendable(charge)&&<Button size="xs" variant="secondary" disabled={isSubmitting||Boolean(settlingChargeId)} onClick={()=>{if(busy.current)return;discard.requestExit(()=>prepareCharge(charge));}}>Preparar envio desta cobrança</Button>}
                      {charge.pixQrUrl && (
                        <Button
                          size="xs"
                          variant="ghost"
                          prefixIcon={<QrCode size={12} />}
                          onClick={() => setViewingQrChargeId(isViewingQr ? null : charge.id)}
                        >
                          {isViewingQr ? "Ocultar QR" : "Ver QR Code"}
                        </Button>
                      )}

                      {/* Cashier Settlement Button */}
                      {pendingInRecord && (
                        <Button
                          size="xs"
                          variant="primary"
                          disabled={!!settlingChargeId||isSubmitting}
                          onClick={() => {setConfirmTarget(charge);setError(null);}}
                          prefixIcon={<CheckCircle2 size={12} />}
                        >
                          {isSettling ? "Confirmando..." : "Confirmar Recebimento (Caixa)"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: Formulário de Nova Cobrança */}
        {activeTab === "new" && (
          <div>
            {!generatedCharge ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Input
                  disabled={isSubmitting||!!loadError||isLoadingCharges}
                  ref={titleRef}
                  label="Descrição da Cobrança"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Pagamento Oferta Relâmpago"
                />

                <Input
                  disabled={isSubmitting||!!loadError||isLoadingCharges}
                  label="Valor (R$)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100,00"
                />

                <Input
                  disabled={isSubmitting||!!loadError||isLoadingCharges}
                  label="Tempo de Validade (Minutos)"
                  type="number"
                  min={5}
                  max={1440}
                  value={String(expiresMinutes)}
                  onChange={(e) => setExpiresMinutes(e.target.value)}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" }}>
                <div
                  style={{
                    padding: "10px 16px",
                    backgroundColor: "var(--color-action-subtle)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontWeight: 600,
                    color: "var(--color-action)",
                    fontSize: "var(--font-size-base, 1rem)",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {createdNow?"Cobrança criada":"Cobrança consultada"}: {generatedCharge.amountFormatted}
                </div>

                <p style={{margin:0,overflowWrap:"anywhere"}}><strong>{generatedCharge.title}</strong></p>
                <p style={{margin:0}}>Situação na última consulta: {pixChargeStateLabel(generatedCharge)}</p>
                <p style={{margin:0}}>Validade informada: {Number.isFinite(Date.parse(generatedCharge.expiresAt))?new Date(generatedCharge.expiresAt).toLocaleString("pt-BR"):"Data indisponível; atualize a consulta."}</p>
                <p role="status">{sendState==="queued"?"Mensagem preparada na fila. Acompanhe envio e entrega na conversa.":sendState==="pending"?"Preparando mensagem...":sendAttempted?"O envio da mensagem ainda não foi confirmado.":"O envio desta cobrança exige uma confirmação separada."}</p>
                {!chargeIsSendable(generatedCharge)&&<p role="status">Esta cobrança não está pendente e válida para envio. Consulte seu estado antes de compartilhar.</p>}
                {sendState==="idle"&&<Button disabled={isSubmitting||Boolean(sendBlockedReason)||!chargeIsSendable(generatedCharge)} onClick={()=>void retryChargeSend()}>{sendAttempted?"Tentar enviar esta cobrança":"Enviar esta cobrança"}</Button>}
                {generatedCharge.pixQrUrl && (
                  <img
                    src={generatedCharge.pixQrUrl}
                    alt="QR Code Pix"
                    style={{ width: "180px", height: "180px", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--border-default)" }}
                  />
                )}

                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500 }}>
                    Chave Copia e Cola:
                  </span>
                  <div
                    style={{
                      padding: "8px 10px",
                      backgroundColor: "var(--bg-canvas)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md, 8px)",
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      wordBreak: "break-all",
                      maxHeight: "80px",
                      overflowY: "auto",
                    }}
                  >
                    {generatedCharge.pixCode}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      prefixIcon={copiedId === "new" ? <Check size={14} /> : <Copy size={14} />}
                      onClick={() => handleCopy(generatedCharge.pixCode, "new")}
                    >
                      {copiedId === "new" ? "Copiado!" : "Copiar Chave Pix"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => {
                        setGeneratedCharge(null);
                        setActiveTab("list");
                      }}
                    >
                      Ver Lista de Cobranças
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </fieldset>
    </Drawer>
    <Dialog isOpen={Boolean(confirmTarget)} onClose={()=>{if(!settlingChargeId)setConfirmTarget(null);}} title="Registrar recebimento no caixa?" description="Faça a conferência no banco antes de registrar. A mensagem do cliente ou um comprovante não confirmam o crédito. Esta ação registra o recebimento; o desfecho da oportunidade deve ser revisado separadamente." footer={<><Button variant="secondary" disabled={!!settlingChargeId} onClick={()=>setConfirmTarget(null)}>Voltar sem confirmar</Button><Button disabled={!!settlingChargeId} onClick={()=>{if(confirmTarget)void handleConfirmPayment(confirmTarget.id);}}>{settlingChargeId?"Registrando...":"Conferi o crédito e confirmo o recebimento"}</Button></>}>
      <p>O sistema tentará preparar um aviso ao cliente se o canal estiver disponível. Isso não comprova envio nem entrega da mensagem.</p>
      <p style={{overflowWrap:"anywhere"}}><strong>{confirmTarget?.title}</strong> · {confirmTarget?.amountFormatted}</p>
      {error&&<p role="alert">{error}</p>}
    </Dialog>
    </>
  );
};
