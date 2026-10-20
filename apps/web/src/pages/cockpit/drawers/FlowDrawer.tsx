import { type FC, useState, useEffect, useRef } from "react";
import { Drawer, Button } from "@sos-sales/ui";
import { Send } from "lucide-react";
import { userFacingError } from "../../../utils/user-facing-error";
import { apiClient, type CommercialThreadSummary, type WhatsAppFlowSummary } from "../../../services/api-client";

interface FlowDrawerProps {
  sendBlockedReason?:string;
  onRefreshChannel?:()=>void;
  isCheckingChannel?:boolean;
  isOpen: boolean;
  onClose: () => void;
  thread?: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onFlowQueued?:()=>void|Promise<void>;
  onSendFlow?: (flow: WhatsAppFlowSummary,idempotencyKey?:string) => void | Promise<void>;
}

function readWorkspaceFlows(value:unknown,workspaceId:string):WhatsAppFlowSummary[]{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de formulários. Tente consultar novamente.");
 const ids=new Set<string>();
 for(const flow of value){if(!flow||typeof flow!=="object"||typeof flow.id!=="string"||!flow.id||flow.workspaceId!==workspaceId||ids.has(flow.id))throw new Error("A consulta não confirmou formulários únicos desta empresa. Tente consultar novamente.");ids.add(flow.id);}
 return value as WhatsAppFlowSummary[];
}

function flowReadinessIssue(flow:WhatsAppFlowSummary):string|null{
 if(flow.status!=="PUBLISHED")return "O formulário precisa estar publicado para preparar o envio.";
 if(typeof flow.metaFlowId!=="string"||!/^\d+$/.test(flow.metaFlowId))return "O identificador do formulário na Meta precisa de revisão.";
 if(typeof flow.bodyText!=="string"||!flow.bodyText.trim())return "O texto da mensagem do formulário não foi preenchido.";
 if(typeof flow.ctaLabel!=="string"||!flow.ctaLabel.trim())return "O texto do botão do formulário não foi preenchido.";
 if(typeof flow.initialScreen!=="string"||!flow.initialScreen.trim())return "A tela inicial do formulário não foi preenchida.";
 return null;
}

export const FlowDrawer: FC<FlowDrawerProps> = ({
  sendBlockedReason,onRefreshChannel,isCheckingChannel,
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onSendFlow,
  onFlowQueued,
}) => {
  const [selected,setSelected]=useState<WhatsAppFlowSummary|null>(null);
  const contextIssue=!workspaceId||!token?"Aguarde a confirmação do acesso à empresa para consultar formulários.":!thread?"Selecione uma conversa para consultar formulários.":thread.channelProvider!=="meta_waba"?"Os formulários nativos exigem um canal Meta Cloud API nesta conversa. Nenhum envio será preparado por este canal.":null;
  const [flows, setFlows] = useState<WhatsAppFlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const keys=useRef<Record<string,string>>({});
  const [loadError,setLoadError]=useState("");
  const [reload,setReload]=useState(0);
  const generation=useRef(0),inFlight=useRef(false);
  const sendBlock=useRef(sendBlockedReason);sendBlock.current=sendBlockedReason;
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${thread?.channelInstanceId}:${thread?.channelProvider}:${isOpen}`;
  async function send(flow:WhatsAppFlowSummary){
    if(!isOpen||sendBlock.current||loading||loadError||selected?.id!==flow.id||!workspaceId||!token||!thread||inFlight.current||thread.channelProvider!=="meta_waba"||Boolean(flowReadinessIssue(flow)))return;
    const requestedScope=scope.current,request=generation.current;
    const valid=()=>requestedScope===scope.current&&request===generation.current;
    inFlight.current=true;
    setSending(true);setError("");setNotice("");
    const identity=JSON.stringify([workspaceId,thread.id,thread.channelInstanceId,thread.channelProvider,flow]);
    const idempotencyKey=keys.current[identity]??crypto.randomUUID();keys.current[identity]=idempotencyKey;
    try{
      const response=await apiClient.getFlows(workspaceId,{},{token});if(!valid())return;
      const current=readWorkspaceFlows(response.flows,workspaceId);setFlows(current);const latest=current.find(item=>item.id===flow.id);
      if(!latest){setSelected(null);throw new Error("O formulário não foi encontrado na consulta atual. Revise a lista antes de enviar.");}
      setSelected(latest);
      const signature=(item:WhatsAppFlowSummary)=>JSON.stringify([item.id,item.status,item.metaFlowId,item.name,item.bodyText,item.initialScreen,item.ctaLabel]);
      if(signature(latest)!==signature(flow))throw new Error("Os dados do formulário mudaram. A prévia foi atualizada; revise antes de confirmar o envio novamente.");
      const readinessIssue=flowReadinessIssue(latest);if(readinessIssue)throw new Error(readinessIssue);
      if(sendBlock.current)throw new Error(sendBlock.current);
      if(onSendFlow)await onSendFlow(flow,idempotencyKey);else await apiClient.sendOutboundMessage(workspaceId,thread.channelInstanceId,{
        recipientPhoneE164:thread.contactPhone,contentType:"interactive",body:flow.bodyText,
        interactive:{type:"flow",body:{text:flow.bodyText},action:{name:"flow",parameters:{flow_message_version:"3",flow_id:flow.metaFlowId,flow_token:idempotencyKey,flow_cta:flow.ctaLabel,flow_action:"navigate",flow_action_payload:{screen:flow.initialScreen}}}},idempotencyKey,
      },{token});
      delete keys.current[identity];if(valid()){setSelected(null);setNotice("Formulário colocado na fila. Acompanhe o envio e a entrega na conversa.");try{await onFlowQueued?.();}catch{if(valid())setNotice("Formulário colocado na fila, mas a conversa não pôde ser atualizada. Atualize as mensagens para acompanhar envio e entrega; não repita o envio por esse motivo.");}}
    }catch(e){if(valid())setError(userFacingError(e,"Não foi possível preparar o formulário. Confira a conversa antes de tentar novamente."));}finally{if(valid()){inFlight.current=false;setSending(false);}}
  }

  useEffect(() => {
    let cancelled=false;generation.current++;inFlight.current=false;setSending(false);setSelected(null);setLoading(false);setFlows([]);setLoadError("");setError("");setNotice("");
    if (!isOpen || !workspaceId || !token || !thread || thread.channelProvider!=="meta_waba") return;
    setLoading(true);setError("");setNotice("");setFlows([]);
    apiClient
      .getFlows(workspaceId, {}, { token })
      .then((res) => {if(!cancelled)setFlows(readWorkspaceFlows(res.flows,workspaceId));})
      .catch((e) => {if(!cancelled)setLoadError(userFacingError(e,"Não foi possível carregar os formulários."));})
      .finally(() => {if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;generation.current++;};
  }, [isOpen, workspaceId, token,thread?.id,thread?.channelInstanceId,thread?.channelProvider,reload]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={()=>{if(!inFlight.current)onClose();}}
      title="Formulários do WhatsApp (Flows)"
      description="Selecione um formulário publicado. Enviar o formulário não confirma um agendamento."
      footer={
        <Button size="sm" variant="secondary" disabled={sending} onClick={()=>{if(!inFlight.current)onClose();}}>
          Fechar
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {sendBlockedReason&&<div role="status"><p>{sendBlockedReason}</p>{onRefreshChannel&&<Button size="sm" variant="secondary" disabled={sending||isCheckingChannel} onClick={onRefreshChannel}>Atualizar disponibilidade</Button>}</div>}
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        {contextIssue&&<p role="status">{contextIssue}</p>}
        {!contextIssue&&(loadError?<div role="alert"><p>{loadError}</p><Button size="sm" onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button></div>:loading ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Consultando formulários…
          </div>
        ) : flows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Nenhum formulário cadastrado nesta empresa.
          </div>
        ) : (
          flows.map((f) => (
            <div
              key={f.id}
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap:"wrap",gap:8,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                  {f.name}
                </div>
                <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Status no cadastro: {f.status}
                  {flowReadinessIssue(f)&&<p role="status">{flowReadinessIssue(f)}</p>}
                </div>
              </div>

              <Button size="xs" variant="primary" prefixIcon={<Send size={12}/>}
                disabled={sending||!thread||thread.channelProvider!=="meta_waba"||Boolean(flowReadinessIssue(f))} onClick={()=>{setSelected(f);setError("");setNotice("");}}>
                {sending?"Preparando…":"Revisar formulário"}
              </Button>
            </div>
          ))
        ) )}
        {!contextIssue&&selected&&<section aria-label="Revisão do formulário" style={{border:"1px solid var(--border-default)",borderRadius:8,padding:12,display:"grid",gap:10,overflowWrap:"anywhere"}}>
          <strong>Revisar antes de enviar</strong>
          <div>Destinatário: {thread?.contactName||"Contato da conversa"} · {thread?.contactPhone}</div>
          <div>Formulário: {selected.name}</div>
          <div>Status no cadastro: {selected.status}</div>
          {flowReadinessIssue(selected)&&<p role="alert">{flowReadinessIssue(selected)}</p>}
          <div>Texto da mensagem:<p style={{whiteSpace:"pre-wrap"}}>{selected.bodyText}</p></div>
          <div>Botão: {selected.ctaLabel}</div>
          <small>Prévia do cadastro local. O conteúdo interativo e a disponibilidade na Meta precisam ser homologados no canal. O envio não confirma resposta nem agendamento.</small>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <Button size="sm" variant="secondary" disabled={sending} onClick={()=>setSelected(null)}>Voltar à lista</Button>
            <Button size="sm" disabled={sending||loading||Boolean(loadError)||Boolean(sendBlockedReason)||Boolean(flowReadinessIssue(selected))} prefixIcon={<Send size={12}/>} onClick={()=>void send(selected)}>{sending?"Preparando…":"Confirmar envio do formulário"}</Button>
          </div>
        </section>}
      </div>
    </Drawer>
  );
};
