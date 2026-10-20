import type { CSSProperties } from "react";
import { Button, Dialog, useBreakpoint } from "@sos-sales/ui";
import type { ChannelSummary } from "../../services/api-client";
export type ChannelActionReview = { kind: "billing" | "revoke" | "archive"; channel: ChannelSummary; targetBilling?: boolean };
export function ChannelActionDialog({review,pending,error,acknowledged,onAcknowledge,onConfirm,onClose,onReload}: {
  review: ChannelActionReview | null; pending: boolean; error: string | null; acknowledged: boolean;
  onAcknowledge: (value:boolean)=>void; onConfirm:()=>void; onClose:()=>void; onReload:()=>void;
}) {
  const { isMobile } = useBreakpoint();
  const actionStyle: CSSProperties | undefined = isMobile ? { width:"100%",minHeight:44,height:"auto",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.35 } : undefined;
  const enabling = review?.kind === "billing" && review.targetBilling === true;
  const title = review?.kind === "billing" ? enabling ? "Declarar faturamento Meta" : "Remover declaração de faturamento" : review?.kind === "archive" ? "Arquivar canal" : "Suspender canal no CHAT-SALES";
  return <Dialog isOpen={Boolean(review)} onClose={onClose} title={title} description="Confira o canal e o efeito da ação antes de confirmar.">
    {review && <div style={{display:"flex",flexDirection:"column",gap:16,overflowWrap:"anywhere"}}>
      <div><strong>{review.channel.displayName}</strong><p style={{margin:"4px 0"}}>{review.channel.phoneNumberE164 || "Número não informado"} · {review.channel.provider.toUpperCase()}</p></div>
      {review.kind === "billing" ? <>
        <p style={{margin:0}}>{enabling ? "Confira diretamente no Gerenciador da Meta se o faturamento deste número está configurado. O CHAT-SALES registra sua declaração; não cadastra cartão, não consulta limite e não confirma a situação financeira na Meta." : "A declaração será removida. Novos disparos e disparos pendentes que dependem dela serão bloqueados antes da execução. Uma chamada ao provedor que já começou pode concluir."}</p>
        {enabling && <label style={{display:"flex",alignItems:"flex-start",gap:10}}><input type="checkbox" style={{width:18,height:18,flexShrink:0,marginTop:2}} checked={acknowledged} disabled={pending || Boolean(error)} onChange={event=>onAcknowledge(event.target.checked)}/><span>Conferi o faturamento deste número na Meta e assumo a responsabilidade por esta declaração.</span></label>}
      </> : <p style={{margin:0}}>O canal deixará de operar no CHAT-SALES e seu histórico será preservado. Credenciais sem outro canal ativo associado serão revogadas no CHAT-SALES. Esta ação não desconecta o aparelho no WhatsApp nem encerra a sessão no provedor. Para isso, use o próprio provedor ou Aparelhos conectados no WhatsApp. Um envio que já começou pode concluir.</p>}
      {error && <div role="alert"><p>{error}</p><Button style={actionStyle} variant="secondary" size="sm" disabled={pending} onClick={onReload}>Atualizar canais e revisar novamente</Button></div>}
      {pending && <p role="status">Aplicando a ação… Aguarde a confirmação do servidor.</p>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap",flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} variant="secondary" disabled={pending} onClick={onClose}>Cancelar</Button><Button style={actionStyle} disabled={pending || Boolean(error) || (enabling && !acknowledged) || !review.channel.revision} loading={pending} onClick={onConfirm}>{review.kind === "billing" ? enabling ? "Confirmar declaração" : "Remover declaração" : review.kind === "archive" ? "Confirmar arquivamento" : "Confirmar suspensão"}</Button></div>
    </div>}
  </Dialog>;
}
