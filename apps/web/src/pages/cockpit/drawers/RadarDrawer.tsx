import { useEffect, useState, useRef, type FC } from "react";
import { Drawer, Button, Badge, LoadingState } from "@sos-sales/ui";
import { Check, X, RefreshCw, Radar } from "lucide-react";
import {userFacingError} from "../../../utils/user-facing-error";
import { apiClient, type IntegrationSuggestionSummary } from "../../../services/api-client";

interface RadarDrawerProps {
  isOpen: boolean; onClose: () => void; workspaceId?: string; token?: string;
  currentDraft?:string;
  threadId?: string; onDraftApplied?: (draft: string) => void;
}

const readSuggestions=(value:unknown):IntegrationSuggestionSummary[]=>{
 const invalid=()=>new Error("A consulta não confirmou uma lista válida de sugestões. Atualize o Radar antes de decidir.");
 if(!value||typeof value!=="object"||!Array.isArray((value as {items?:unknown}).items))throw invalid();
 const items=(value as {items:unknown[]}).items,seen=new Set<string>();
 for(const item of items){
  if(!item||typeof item!=="object"||Array.isArray(item))throw invalid();
  const row=item as Record<string,unknown>;
  if(typeof row.id!=="string"||!row.id.trim()||seen.has(row.id)||typeof row.title!=="string"||typeof row.body!=="string"||(row.threadId!==null&&typeof row.threadId!=="string")||(row.draftMessage!==null&&typeof row.draftMessage!=="string")||typeof row.stateVersion!=="number"||!Number.isSafeInteger(row.stateVersion)||row.stateVersion<1||row.status!=="pending"||typeof row.priority!=="string"||!["low","normal","high","urgent"].includes(row.priority))throw invalid();
  seen.add(row.id);
 }
 return items as IntegrationSuggestionSummary[];
};

export const RadarDrawer: FC<RadarDrawerProps> = ({ isOpen, onClose, workspaceId, token, threadId, currentDraft="", onDraftApplied }) => {
  const [suggestions, setSuggestions] = useState<IntegrationSuggestionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [scanNotice,setScanNotice]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshButton=useRef<HTMLButtonElement>(null),restoreRefreshFocus=useRef<string|null>(null);
  useEffect(()=>{
    if(!isOpen||isLoading||!restoreRefreshFocus.current)return;
    const owned=restoreRefreshFocus.current===scope.current;restoreRefreshFocus.current=null;
    if(owned&&refreshButton.current&&(document.activeElement===document.body||document.activeElement===refreshButton.current))refreshButton.current.focus();
  });
  const [loadError,setLoadError]=useState("");
  const [deciding,setDeciding]=useState<string|null>(null);
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${threadId}:${isOpen}`;
  const generation=useRef(0),sequence=useRef(0),busy=useRef(false);
  const load=async()=>{
    if(!isOpen||!workspaceId||!token)return;
    const requestedScope=scope.current,request=++sequence.current;const valid=()=>requestedScope===scope.current&&request===sequence.current;
    setIsLoading(true);setLoadError("");
    try{const result=await apiClient.getIntegrationSuggestions(workspaceId,{status:"pending",threadId,limit:50},{token});if(valid())setSuggestions(readSuggestions(result));}
    catch(error){if(valid())setLoadError(userFacingError(error,"Não foi possível carregar o Radar."));}
    finally{if(valid())setIsLoading(false);}
  };
  useEffect(()=>{
    generation.current++;sequence.current++;busy.current=false;restoreRefreshFocus.current=null;setSuggestions([]);setEnabled(null);setScanNotice(null);setError(null);setLoadError("");setIsLoading(false);setIsScanning(false);setDeciding(null);
    if(isOpen)void load();return()=>{generation.current++;sequence.current++;};
  },[isOpen,workspaceId,token,threadId]);
  const scan=async()=>{
    if(!workspaceId||!token||busy.current)return;
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    busy.current=true;setIsScanning(true);setError(null);setScanNotice(null);
    try{const result=await apiClient.scanRadar(workspaceId,{minHoursSinceLastMessage:12,limit:1,threadId},{token});if(!valid())return;if(!result||typeof result.enabled!=="boolean"||!Number.isSafeInteger(result.candidates)||result.candidates<0||!Number.isSafeInteger(result.created)||result.created<0)throw new Error("A resposta não confirmou o resultado da análise. Atualize as sugestões antes de iniciar outra análise.");setEnabled(result.enabled);if(!result.enabled){setError("O Radar está desativado para esta empresa.");return;}setScanNotice(`Resultado da última análise: ${result.candidates} conversa(s) candidata(s) encontrada(s); ${result.created} nova(s) sugestão(ões) registrada(s). Esta execução processa até uma conversa e não envia mensagens.`);await load();}
    catch(error){if(valid())setError(userFacingError(error,"Falha ao analisar as conversas."));}
    finally{if(valid()){busy.current=false;setIsScanning(false);}}
  };
  const decide=async(suggestion:IntegrationSuggestionSummary,status:"accepted"|"dismissed")=>{
    if(!workspaceId||!token||busy.current||isLoading||loadError)return;
    if(status==="accepted"&&(!threadId||suggestion.threadId!==threadId||!onDraftApplied)){setError("Abra a conversa desta sugestão para usar o rascunho.");return;}
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    busy.current=true;setDeciding(suggestion.id);setError(null);
    try{
      const result=await apiClient.decideIntegrationSuggestion(workspaceId,suggestion.id,{status,stateVersion:suggestion.stateVersion},{token});if(!valid())return;
      if(!result||result.id!==suggestion.id||result.status!==status||result.threadId!==suggestion.threadId||!Number.isSafeInteger(result.stateVersion)||result.stateVersion<=suggestion.stateVersion||(status==="accepted"&&(typeof result.draftMessage!=="string"||!result.draftMessage.trim()||result.draftMessage.length>2000))){
        throw new Error("A resposta não confirmou a decisão desta sugestão e conversa. Seu texto foi preservado; confira as sugestões atualizadas antes de continuar.");
      }
      setSuggestions(current=>current.filter(item=>item.id!==suggestion.id));
      if(status==="accepted"&&result.draftMessage){onDraftApplied?.(result.draftMessage);onClose();}
    }catch(error){if(valid()){setError(userFacingError(error,"Não foi possível registrar a decisão. Confira as sugestões atualizadas."));await load();}}
    finally{if(valid()){busy.current=false;setDeciding(null);}}
  };

  return <Drawer isOpen={isOpen} onClose={()=>{if(!deciding)onClose();}} title="Radar de Oportunidades"
    description="Analisa conversas paradas e clientes aguardando retorno. Nenhuma mensagem é enviada sem sua aprovação."
    footer={<div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8,flexWrap:"wrap" }}>
      <Button ref={refreshButton} size="sm" variant="secondary" onClick={()=>{if(!busy.current){restoreRefreshFocus.current=document.activeElement===refreshButton.current?scope.current:null;void load();}}} disabled={isScanning||isLoading||!!deciding}>Atualizar sugestões</Button>
      <Button size="sm" variant="secondary" prefixIcon={<RefreshCw size={14}/>} onClick={scan} disabled={isScanning || isLoading||!!deciding}>{isScanning ? "Analisando..." : "Analisar agora"}</Button>
      <Button size="sm" variant="secondary" disabled={!!deciding} onClick={onClose}>Fechar</Button>
    </div>}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      {currentDraft.trim()&&<section aria-label="Texto atual da conversa" style={{padding:12,border:"1px solid var(--border-default)",borderRadius:8,overflowWrap:"anywhere"}}><strong>Seu texto será mantido</strong><p style={{whiteSpace:"pre-wrap"}}>{currentDraft}</p><p style={{fontSize:12}}>Ao usar uma sugestão, o rascunho será adicionado ao final. Confira e edite na conversa antes de enviar.</p></section>}
      {scanNotice&&<p role="status" style={{fontSize:13}}>{scanNotice}</p>}
      {error && <div role="alert" style={{ padding: 12, borderRadius: 8, color: "var(--color-danger)", background: "var(--color-danger-subtle)", fontSize: 13 }}>{error}</div>}
      {loadError&&<div role="alert"><p>{loadError}</p><Button size="sm" onClick={()=>{if(!busy.current)void load();}}>Tentar novamente</Button></div>}
      {isLoading&&(suggestions.length?<p role="status">Atualizando sugestões; os registros anteriores permanecem visíveis.</p>:<LoadingState variant="skeleton" lines={3} text="Consultando oportunidades..." />)}
      {loadError&&suggestions.length>0&&<p role="status">As sugestões exibidas são da última consulta concluída. Atualize com sucesso antes de registrar uma decisão.</p>}
      {(loadError||isLoading||error)&&suggestions.length===0?null:suggestions.length === 0 ? <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
          <Radar size={36} style={{ marginBottom: 10 }}/>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Nenhuma sugestão pendente</div>
          <div style={{ fontSize: 13 }}>{enabled === false ? "O módulo precisa ser ativado nas configurações." : "Clique em “Analisar agora” para examinar as conversas paradas há pelo menos 12 horas."}</div>
        </div>
      : suggestions.map((sug) => <div key={sug.id} style={{ padding: 14, background: "var(--bg-canvas)", border: "1px solid var(--border-default)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 14 }}>{sug.title}</strong><Badge variant={sug.priority === "high" || sug.priority === "urgent" ? "warning" : "ai"}>{sug.priority === "urgent"?"Urgente":sug.priority === "high" ? "Prioridade" : "Sugestão"}</Badge></div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{sug.body}</p>
          {sug.draftMessage && <div style={{ padding: 10, background: "var(--bg-surface)", borderRadius: 8, fontSize: 13 }}><div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Rascunho sugerido</div>{sug.draftMessage}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button size="xs" variant="ghost" prefixIcon={<X size={12}/>} disabled={!!deciding||isScanning||isLoading||Boolean(loadError)} onClick={() => void decide(sug, "dismissed")}>Ignorar</Button>
            <Button size="xs" variant="primary" prefixIcon={<Check size={12}/>} disabled={!!deciding||isScanning||isLoading||Boolean(loadError)||!sug.draftMessage||!threadId||sug.threadId!==threadId||!onDraftApplied} onClick={() => void decide(sug, "accepted")}>{deciding===sug.id?"Registrando...":currentDraft.trim()?"Adicionar rascunho ao texto":"Usar rascunho"}</Button>
          </div>
        </div>)}
    </div>
  </Drawer>;
};
