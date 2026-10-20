import {userFacingError} from "../../../utils/user-facing-error";
import {productPriceLabel} from "../../products/product-price";
import { type FC, useState, useRef, useEffect } from "react";
import { Badge, Button, Dialog } from "@sos-sales/ui";
import { Plus, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import type { CommercialProposalSummary } from "../../../services/api-client";

interface ProposalsSectionProps {
  proposals: CommercialProposalSummary[];
  onCreateProposal?: () => void;
  onUpdateStatus?: (proposalId: string, status: CommercialProposalSummary["status"]) => Promise<void>;
  onGeneratePix?: (proposal: CommercialProposalSummary) => void;
  error?: string | null;
  isLoading?:boolean;
  busy?:boolean;
  reviewRequired?:boolean;
  onRefresh?:()=>void;
}

export const ProposalsSection: FC<ProposalsSectionProps> = ({
  proposals,
  onCreateProposal,
  onUpdateStatus,
  onGeneratePix,
  error,isLoading=false,busy=false,reviewRequired=false,onRefresh,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError,setActionError]=useState<string|null>(null);
  const [decision,setDecision]=useState<{proposal:CommercialProposalSummary;status:"accepted"|"rejected";fingerprint:string}|null>(null);
  const decisionRef=useRef(decision);decisionRef.current=decision;
  const fingerprint=(proposal:CommercialProposalSummary)=>JSON.stringify([proposal.id,proposal.threadId,proposal.contactId,proposal.stateVersion,proposal.status,proposal.title,proposal.totalCents,proposal.currency,proposal.validUntil,proposal.conditions,proposal.items]);
  const currentDecision=decision?proposals.find(item=>item.id===decision.proposal.id):null;
  const decisionCurrent=Boolean(decision&&onUpdateStatus&&currentDecision&&fingerprint(currentDecision)===decision.fingerprint&&!isLoading&&!busy&&!reviewRequired);
  const reviewDecision=(proposal:CommercialProposalSummary,status:"accepted"|"rejected")=>{
    if(!onUpdateStatus||actionBusy.current||isLoading||busy||reviewRequired||decisionRef.current||proposal.status!=="sent")return;
    setActionError(null);setDecision({proposal,status,fingerprint:fingerprint(proposal)});
  };

  const actionBusy=useRef<symbol|null>(null),live=useRef(true);
  const actionScope=JSON.stringify(proposals.map(item=>item.id).sort());
  const currentScope=useRef(actionScope);currentScope.current=actionScope;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{actionBusy.current=null;setUpdatingId(null);setActionError(null);setDecision(null);},[actionScope]);
  const displayedError=error||actionError;

  const getStatusBadge = (status: CommercialProposalSummary["status"]) => {
    switch (status) {
      case "accepted":
        return <Badge variant="action">Aceita</Badge>;
      case "sent":
        return <Badge variant="operational">Enviada</Badge>;
      case "draft":
        return <Badge variant="neutral">Rascunho</Badge>;
      case "rejected":
        return <Badge variant="danger">Recusada</Badge>;
      case "expired":
        return <Badge variant="warning">Expirada</Badge>;
      case "cancelled":
        return <Badge variant="neutral">Cancelada</Badge>;
      default:
        return <Badge variant="neutral">Estado não reconhecido</Badge>;
    }
  };

  const handleStatusChange = async (proposalId: string, nextStatus: CommercialProposalSummary["status"]) => {
    if(!onUpdateStatus||actionBusy.current||isLoading||busy||reviewRequired)return false;
    const request=Symbol(),requestedScope=currentScope.current;actionBusy.current=request;setActionError(null);setUpdatingId(proposalId);
    try {
      await onUpdateStatus(proposalId, nextStatus);
      return true;
    } catch(failure) {
      if(live.current&&currentScope.current===requestedScope&&actionBusy.current===request)setActionError(userFacingError(failure,"Não foi possível confirmar a alteração. Consulte as propostas antes de repetir."));
      return false;
    } finally {
      if(actionBusy.current===request){actionBusy.current=null;if(live.current&&currentScope.current===requestedScope)setUpdatingId(null);}
    }
  };

  const confirmDecision=async()=>{
    const target=decisionRef.current;
    if(!target||!decisionCurrent||actionBusy.current)return;
    const done=await handleStatusChange(target.proposal.id,target.status);
    if(done&&live.current&&decisionRef.current===target)setDecision(null);
  };

  return (
    <>
    {decision&&<Dialog isOpen onClose={()=>{if(!actionBusy.current&&!busy)setDecision(null);}} title="Revisar decisão da proposta" description="Registre somente a decisão já informada pelo cliente. Esta ação não coleta assinatura, não envia mensagem e não confirma pagamento." footer={<><Button variant="secondary" disabled={Boolean(updatingId)||busy} onClick={()=>{if(!actionBusy.current&&!busy)setDecision(null);}}>Voltar sem registrar</Button><Button disabled={!decisionCurrent||Boolean(updatingId)} onClick={()=>void confirmDecision()}>{updatingId?"Registrando…":decision.status==="accepted"?"Confirmar registro de aceite":"Confirmar registro de recusa"}</Button></>}>
      <p><strong>{decision.proposal.title}</strong></p>
      <p>Valor: {productPriceLabel(decision.proposal.totalCents,decision.proposal.currency)}</p>
      <details><summary>Conferir itens e condições</summary>{decision.proposal.items.map((item,index)=><p key={index} style={{overflowWrap:"anywhere"}}>{item.title||"Item do catálogo"} · {item.quantity} × {productPriceLabel(item.unitPriceCents,decision.proposal.currency)}</p>)}<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{decision.proposal.conditions||"Nenhuma condição adicional registrada."}</p></details>
      <p>Decisão a registrar: <strong>{decision.status==="accepted"?"Aceite":"Recusa"}</strong></p>
      <p>{decision.proposal.validUntil?(Number.isFinite(Date.parse(decision.proposal.validUntil))?`Validade registrada: ${new Date(decision.proposal.validUntil).toLocaleString("pt-BR")}`:"Validade não reconhecida; consulte a proposta."):"Sem validade registrada."}</p>
      {!decisionCurrent&&!updatingId&&!busy&&<p role="alert">Os dados ou a disponibilidade da consulta mudaram. Volte e confira a proposta atual antes de registrar a decisão.</p>}
      {displayedError&&<p role="alert">{displayedError}</p>}
    </Dialog>}
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
          {isLoading?"Consultando propostas…":displayedError&&proposals.length===0?"Consulta indisponível":`${proposals.length} proposta(s)`}
        </span>
        <Button
          size="xs"
          variant="secondary"
          prefixIcon={<Plus size={13} />}
          onClick={onCreateProposal}
          disabled={!onCreateProposal}
        >
          Nova Proposta
        </Button>
      </div>

      {!onCreateProposal&&<p>Criar proposta não está disponível neste contexto.</p>}
      {!onUpdateStatus&&proposals.some(proposal=>proposal.status==="draft"||proposal.status==="sent")&&<p>Alterar o estado das propostas não está disponível neste contexto.</p>}
      {onRefresh&&<Button size="xs" variant="secondary" disabled={isLoading||busy||Boolean(updatingId)} onClick={()=>{if(isLoading||busy||actionBusy.current)return;setActionError(null);onRefresh();}}>Consultar propostas novamente</Button>}
      {isLoading&&<p role="status">Atualizando propostas; os registros anteriores podem estar desatualizados.</p>}
      {displayedError && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            backgroundColor: "var(--color-danger-subtle)",
            color: "var(--color-danger)",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: "var(--font-size-xs, 0.75rem)",
          }}
        >
          <AlertCircle size={14} />
          <span>{displayedError}</span>
        </div>
      )}

      {proposals.length === 0 ? (isLoading||displayedError?null:(
        <div
          style={{
            fontSize: "var(--font-size-xs, 0.75rem)",
            color: "var(--text-secondary)",
            fontStyle: "italic",
          }}
        >
          Nenhuma proposta comercial registrada.
        </div>
      )) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {proposals.map((proposal) => {
            const formattedTotal = productPriceLabel(proposal.totalCents,proposal.currency);

            return (
              <div
                key={proposal.id}
                style={{
                  padding: "8px 10px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  overflowWrap:"anywhere",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                    {proposal.title}
                  </span>
                  {getStatusBadge(proposal.status)}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-primary)",
                    }}
                  >
                    {formattedTotal}
                  </span>
                  {proposal.items.length > 0 && (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {proposal.items.length} item(ns)
                    </span>
                  )}
                </div>

                <details>
                  <summary>Conferir itens, condições e validade</summary>
                  <div style={{display:"grid",gap:8,paddingTop:8,fontSize:12}}>
                    <div>{proposal.validUntil?(Number.isFinite(Date.parse(proposal.validUntil))?<>Validade: {new Date(proposal.validUntil).toLocaleString("pt-BR")} (horário deste dispositivo)</>:"Validade não reconhecida; revise o cadastro."):"Sem validade registrada."}</div>
                    {proposal.items.map((item,index)=><div key={index}>{index+1}. {item.title||"Item do catálogo"} · Quantidade: {item.quantity} · Valor unitário: {productPriceLabel(item.unitPriceCents,proposal.currency)}</div>)}
                    <div style={{whiteSpace:"pre-wrap"}}>Condições: {proposal.conditions||"Nenhuma condição adicional registrada."}</div>
                  </div>
                </details>
                {proposal.status==="draft"&&<small>Marcar enviada apenas registra a etapa; não envia uma mensagem ao cliente.</small>}
                {proposal.status==="sent"&&<small>Registre a decisão já informada pelo cliente. Alterar este status não coleta assinatura, não envia mensagem e não confirma pagamento.</small>}
                {proposal.status==="accepted"&&<small>Aceite registrado; pagamento precisa de confirmação própria.</small>}
                {/* State Machine Transition Actions */}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                  {proposal.status === "draft" && (
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={!onUpdateStatus||Boolean(updatingId)||isLoading||busy||reviewRequired}
                      aria-label={`Marcar enviada a proposta ${proposal.title}`}
                      onClick={() => handleStatusChange(proposal.id, "sent")}
                    >
                      Marcar Enviada
                    </Button>
                  )}
                  {proposal.status === "sent" && (
                    <>
                      <Button
                        size="xs"
                        variant="primary"
                        prefixIcon={<CheckCircle size={12} />}
                        disabled={!onUpdateStatus||Boolean(updatingId)||isLoading||busy||reviewRequired}
                        aria-label={`Registrar aceite da proposta ${proposal.title}`}
                        onClick={() => reviewDecision(proposal, "accepted")}
                      >
                        Registrar aceite
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        prefixIcon={<XCircle size={12} />}
                        disabled={!onUpdateStatus||Boolean(updatingId)||isLoading||busy||reviewRequired}
                        aria-label={`Registrar recusa da proposta ${proposal.title}`}
                        onClick={() => reviewDecision(proposal, "rejected")}
                      >
                        Registrar recusa
                      </Button>
                    </>
                  )}
                  {proposal.status === "accepted" && onGeneratePix && (
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={Boolean(updatingId)||isLoading||busy||reviewRequired}
                      aria-label={`Revisar cobrança Pix da proposta ${proposal.title}`}
                      onClick={() => onGeneratePix(proposal)}
                    >
                      Revisar cobrança Pix
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
};
