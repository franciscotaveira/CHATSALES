import {STAGES} from '../../opportunities/stages';
import {hasEstimatedValue,hasRecurringIndication} from '../../opportunities/opportunity-filters';
import type { FC } from "react";
import { Badge, Button } from "@sos-sales/ui";
import { Sparkles, Edit3 } from "lucide-react";
import type { CommercialThreadSummary, ContactSummary } from "../../../services/api-client";
import { formatPhone } from "../utils/formatPhone";

interface LeadSummaryProps {
  thread: CommercialThreadSummary;
  contact?: ContactSummary | null;
  journeyStage?: string | null;
  estimatedValueCents?: number | null;
  onUpdateStage?: (newStage: string) => Promise<void> | void;
  customStages?: Record<string, string>;
  isUpdatingStage?: boolean;
  error?:string|null;
  onEditLead?: () => void;
}

export const LeadSummary: FC<LeadSummaryProps> = ({
  thread,
  contact,
  journeyStage,
  estimatedValueCents,
  onUpdateStage,
  customStages,
  isUpdatingStage = false,error,
  onEditLead,
}) => {
  const formattedPhone = formatPhone(thread.contactPhone);
  const currentContact=contact?.id===thread.contactId?contact:undefined;
  const formattedValue=hasEstimatedValue(estimatedValueCents)?(estimatedValueCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
  const isRec=hasRecurringIndication(currentContact);
  const totalOrders=hasEstimatedValue(currentContact?.metadata?.totalOrders)?currentContact!.metadata.totalOrders!:null;
  const totalSpentCents=hasEstimatedValue(currentContact?.metadata?.totalSpentCents)?currentContact!.metadata.totalSpentCents!:null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {error&&<p role="alert">{error}</p>}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Telefone</span>
        <span style={{ fontWeight: 500, fontFamily: "var(--font-mono, monospace)" }}>
          {formattedPhone}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Origem</span>
        <Badge variant="operational">{thread.channelProvider || "WhatsApp"}</Badge>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Etapa do Funil</span>
        <select
          value={STAGES.some(stage=>stage.id===journeyStage)?journeyStage!:""}
          onChange={(e) => onUpdateStage?.(e.target.value)}
          disabled={isUpdatingStage||!onUpdateStage}
          title="Clique para alterar a etapa deste lead no funil de vendas"
          style={{
            height: "26px",
            padding: "0 8px",
            borderRadius: "6px",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-canvas)",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-operational)",
            cursor: isUpdatingStage ? "wait" : "pointer",
            outline: "none",
          }}
        >
          {!STAGES.some(stage=>stage.id===journeyStage)&&<option value="" disabled>Etapa não informada</option>}
          <option value="lead">🌱 {customStages?.lead || "Lead"}</option>
          <option value="qualified">🎯 {customStages?.qualified || "Qualificado"}</option>
          <option value="proposal">📄 {customStages?.proposal || "Proposta"}</option>
          <option value="scheduled">📅 {customStages?.scheduled || "Agendado"}</option>
          <option value="won">🎉 {customStages?.won || "Ganho"}</option>
          <option value="lost">❌ {customStages?.lost || "Perdido"}</option>
        </select>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Valor Estimado</span>
        <span
          style={{
            fontWeight: 600,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formattedValue}
        </span>
      </div>

      {/* Card de Inteligência de Recorrência & LTV */}
      <div
        style={{
          marginTop: "8px",
          padding: "10px 12px",
          backgroundColor: "var(--bg-canvas)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",flexWrap:"wrap",gap:6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
            <Sparkles size={12} style={{ color: "var(--color-action)" }} />
            Histórico informado
          </div>
          {isRec ? (
            <Badge variant="action">⭐ Recorrência informada</Badge>
          ) : (
            <Badge variant="neutral">Sem indicação de recorrência</Badge>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between",flexWrap:"wrap",gap:"4px 8px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <span>Compras informadas:</span>
          <strong style={{ color: "var(--text-primary)" }}>
            {totalOrders===null?'Não informado':`${totalOrders.toLocaleString('pt-BR')} ${totalOrders===1?'compra':'compras'}`}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between",flexWrap:"wrap",gap:"4px 8px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <span>Gasto acumulado informado:</span>
          <strong style={{ color: "var(--text-primary)" }}>
            {totalSpentCents===null?'Não informado':(totalSpentCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
          </strong>
        </div>

        <p style={{margin:0,fontSize:11,color:"var(--text-secondary)"}}>Dados do cadastro; não substituem a confirmação de pagamentos.</p>
        {onEditLead && (
          <Button
            size="xs"
            variant="ghost"
            prefixIcon={<Edit3 size={11} />}
            onClick={onEditLead}
            style={{ alignSelf: "flex-end", marginTop: "2px", fontSize: "11px", height: "22px" }}
          >
            Editar Histórico
          </Button>
        )}
      </div>
    </div>
  );
};
