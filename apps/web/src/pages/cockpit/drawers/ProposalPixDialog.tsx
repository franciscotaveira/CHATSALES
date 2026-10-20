import {useEffect,useRef,useState} from "react";
import {Dialog,Button,Input} from "@sos-sales/ui";
import {apiClient,ApiError,type CommercialProposalSummary,type PixChargeSummary} from "../../../services/api-client";
import {productPriceLabel} from "../../products/product-price";
import {userFacingError} from "../../../utils/user-facing-error";
interface Props {proposal:CommercialProposalSummary;workspaceId:string;token:string;onClose:()=>void;onCreated:()=>void|Promise<void>;onViewCharges:()=>void;}
export function ProposalPixDialog(props:Props){
 const p=props.proposal;
 return <ProposalPixReview key={JSON.stringify([props.workspaceId,props.token,p.id,p.stateVersion,p.threadId,p.contactId,p.totalCents,p.currency,p.status,p.validUntil])} {...props}/>;
}
function ProposalPixReview(props:Props){
 const {proposal,workspaceId,token,onClose,onCreated,onViewCharges}=props;
 const [minutes,setMinutes]=useState("30"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false),[charge,setCharge]=useState<PixChargeSummary|null>(null);
 const lock=useRef(false),live=useRef(true),keys=useRef(new Map<string,string>()),errorRef=useRef<HTMLParagraphElement>(null),resultRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(error)errorRef.current?.focus();else if(charge)resultRef.current?.focus();},[error,charge]);
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  const update=()=>setNow(Date.now());const threshold=proposal.validUntil?Date.parse(proposal.validUntil)-5*60_000:null;
  const timer=threshold!==null&&Number.isFinite(threshold)&&threshold>now?setTimeout(update,Math.min(60000,Math.max(1,threshold-Date.now()+1))):undefined;
  window.addEventListener("focus",update);document.addEventListener("visibilitychange",update);
  return()=>{clearTimeout(timer);window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);};
 },[proposal.validUntil,now]);
 const eligibleAt=(time:number)=>proposal.status==="accepted"&&proposal.currency==="BRL"&&Number.isSafeInteger(proposal.totalCents)&&proposal.totalCents>=100&&(!proposal.validUntil||Date.parse(proposal.validUntil)>time+5*60_000);
 const ttl=Number(minutes),valid=Number.isInteger(ttl)&&ttl>=5&&ttl<=1440;
 const eligible=eligibleAt(now);
 async function generate(){
  if(lock.current||!valid||charge||uncertain)return;
  if(!eligibleAt(Date.now())){setNow(Date.now());setError("A proposta não está disponível para esta emissão. Confira a situação e a validade antes de continuar.");return;}
  const fingerprint=JSON.stringify([workspaceId,proposal.id,proposal.stateVersion,ttl]);const requestKey=keys.current.get(fingerprint)??crypto.randomUUID();keys.current.set(fingerprint,requestKey);
  lock.current=true;setBusy(true);setError("");let confirmed=false;
  try{const result=await apiClient.createProposalPixCharge(workspaceId,proposal.id,{requestKey,expectedVersion:proposal.stateVersion,expiresMinutes:ttl},{token});
   if(!live.current)return;
   if(result.charge.proposalId!==proposal.id||result.charge.threadId!==proposal.threadId||result.charge.contactId!==proposal.contactId||result.charge.amountCents!==proposal.totalCents||result.charge.currency!==proposal.currency)throw new Error("Não foi possível conferir o vínculo retornado. Consulte as cobranças antes de repetir.");
   confirmed=true;setCharge(result.charge);await onCreated();
  }catch(e){if(live.current){if(!confirmed&&!(e instanceof ApiError&&e.status>=400&&e.status<500&&e.status!==408))setUncertain(true);setError(confirmed?"Cobrança disponível, mas a tela anterior não foi atualizada. Consulte as cobranças; não repita a criação.":userFacingError(e,"Não foi possível confirmar a cobrança. Consulte as cobranças antes de repetir."));}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 return <Dialog isOpen onClose={()=>{if(!lock.current)onClose();}} title="Revisar cobrança da proposta" description="Confira a origem e o valor. Criar a cobrança não envia mensagem nem confirma pagamento.">
  <p><strong>{proposal.title}</strong></p><p>Valor da proposta: {productPriceLabel(proposal.totalCents,proposal.currency)}</p>
  <p>{proposal.validUntil?`Validade da proposta: ${(Number.isFinite(Date.parse(proposal.validUntil))?new Date(proposal.validUntil).toLocaleString("pt-BR"):"data indisponível; atualize a proposta")} (horário deste dispositivo).`:"Proposta sem validade registrada."}</p>
  {!eligible&&!charge&&<p role="alert">Use uma proposta aceita, em reais, com valor mínimo de R$ 1,00 e pelo menos cinco minutos de validade. Atualize a proposta se necessário.</p>}
  {error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
  {uncertain&&<p role="status">O resultado não foi confirmado. Não repita antes de consultar as cobranças da conversa. Fechar não cancela uma cobrança que possa ter sido criada.</p>}
  {!charge&&<><Input label="Validade da cobrança em minutos" type="number" min={5} max={1440} value={minutes} disabled={busy||uncertain} onChange={e=>setMinutes(e.target.value)}/><p>De 5 a 1440 minutos, limitada à validade restante da proposta. Uma cobrança pendente compatível será recuperada; pagamento já registrado bloqueia nova emissão.</p></>}
  {charge&&<div ref={resultRef} tabIndex={-1} role="status"><strong>Cobrança vinculada disponível</strong><p>{charge.amountFormatted} · {charge.status==="PAID"?"Pagamento já registrado; confira a origem na lista.":"Consulte o estado na lista de cobranças antes de enviar ao cliente."}</p><p>Válida até {(Number.isFinite(Date.parse(charge.expiresAt))?new Date(charge.expiresAt).toLocaleString("pt-BR"):"data indisponível; consulte a lista")}.</p><p>Nenhuma mensagem foi enviada por esta ação.</p></div>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button disabled={busy} variant="secondary" onClick={()=>{if(!lock.current)onClose();}}>Fechar</Button><Button disabled={busy} variant="secondary" onClick={()=>{if(!lock.current)onViewCharges();}}>Ver cobranças da conversa</Button>{!charge&&<Button disabled={busy||uncertain||!valid||!eligible} onClick={()=>void generate()}>{busy?"Consultando e preparando…":"Criar cobrança vinculada"}</Button>}</div>
 </Dialog>;
}
