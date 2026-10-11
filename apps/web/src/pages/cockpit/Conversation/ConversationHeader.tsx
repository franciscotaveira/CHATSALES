import type { FC } from "react";
import { Avatar, Button, IconButton } from "@sos-sales/ui";
import { ArrowLeft, RefreshCw, Sparkles, FileText, Info, AlertTriangle, UserCheck } from "lucide-react";
import type { CommercialThreadSummary } from "../../../services/api-client";
import { formatPhone } from "../utils/formatPhone";

interface ConversationHeaderProps {
  thread: CommercialThreadSummary;
  onBack?: () => void;
  isMobile?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenRadar?: () => void;
  onOpenDossier?: () => void;
  onToggleContext?: () => void;
  isContextOpen?: boolean;
  onAssumeAttendance?: () => void;
  onUpdateStage?: (newStage: string) => Promise<void> | void;
  customStages?: Record<string, string>;
  isUpdatingStage?: boolean;
}

export const ConversationHeader: FC<ConversationHeaderProps> = ({
  thread,
  onBack,
  isMobile = false,
  onRefresh,
  isRefreshing = false,
  onOpenRadar,
  onOpenDossier,
  onToggleContext,
  isContextOpen = true,
  onAssumeAttendance,
  onUpdateStage,
  customStages,
  isUpdatingStage = false,
}) => {
  const hasName = Boolean(thread.contactName && thread.contactName.trim());
  const displayName = hasName
    ? thread.contactName
    : formatPhone(thread.contactPhone) || "Contato sem nome";
  const formattedPhone = formatPhone(thread.contactPhone);
  const origin = thread.channelProvider ? ` · ${thread.channelProvider}` : "";

  // Meta 2026 CTWA 7-Day (168h) Free Messaging Window Calculation
  const fepRemainingHours = thread.fepExpiresAt
    ? Math.max(0, Math.round((new Date(thread.fepExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))
    : null;
  const isFepActive = fepRemainingHours !== null && fepRemainingHours > 0;
  const fepRemainingDays = fepRemainingHours !== null ? Math.ceil(fepRemainingHours / 24) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", flexShrink: 0 }}>
      <header
        style={{
          height: "var(--topbar-h, 56px)",
          minHeight: "var(--topbar-h, 56px)",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--space-4, 16px)",
          boxSizing: "border-box",
          gap: "12px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          {isMobile && onBack && (
            <IconButton
              aria-label="Voltar para a fila"
              icon={<ArrowLeft size={18} />}
              size="sm"
              variant="ghost"
              onClick={onBack}
            />
          )}
          <Avatar
            id={thread.id}
            name={hasName && thread.contactName ? thread.contactName : undefined}
            size="md"
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  fontSize: "var(--font-size-sm, 0.875rem)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </span>

              {isFepActive && (
                <span
                  title="Janela Gratuita de Mensagens Meta (CTWA 7 dias): Conversas livres de cobrança de tarifas Meta por 168 horas."
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                  CTWA Grátis · {fepRemainingDays === 1 ? "1 dia" : `${fepRemainingDays}d`}
                </span>
              )}

              <select
                aria-label="Etapa do lead no funil"
                value={thread.journeyStage || "lead"}
                onChange={(e) => onUpdateStage?.(e.target.value)}
                disabled={isUpdatingStage}
                title="Clique para avançar ou alterar a etapa do lead no funil"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: "var(--bg-canvas)",
                  color: "var(--color-operational)",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: "1px solid var(--border-default)",
                  flexShrink: 0,
                  cursor: isUpdatingStage ? "wait" : "pointer",
                  outline: "none",
                }}
              >
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
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hasName ? `${formattedPhone}${origin}` : origin.replace(" · ", "") || "WhatsApp"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {onRefresh && (
            <IconButton
              aria-label="Atualizar mensagens"
              icon={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />}
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              tooltip="Atualizar conversa"
              disabled={isRefreshing}
            />
          )}
          {onOpenRadar && (
            <IconButton
              aria-label="Abrir Radar de Oportunidades"
              icon={<Sparkles size={16} />}
              size="sm"
              variant="ghost"
              onClick={onOpenRadar}
              tooltip="Radar de Oportunidades"
            />
          )}
          {onOpenDossier && !isMobile && (
            <IconButton
              aria-label="Abrir ficha do cliente"
              icon={<FileText size={16} />}
              size="sm"
              variant="ghost"
              onClick={onOpenDossier}
              tooltip="Ficha do Cliente"
            />
          )}
          {onToggleContext && (isMobile ? (
            <IconButton
              aria-label={isContextOpen ? "Ocultar contexto do lead" : "Exibir contexto do lead"}
              icon={<Info size={16} />}
              size="sm"
              variant={isContextOpen ? "secondary" : "ghost"}
              onClick={onToggleContext}
              tooltip="Etapa, proposta, Pix e histórico do lead"
            />
          ) : (
            <Button
              size="sm"
              variant={isContextOpen ? "secondary" : "primary"}
              prefixIcon={<Info size={15} />}
              onClick={onToggleContext}
              title="Veja etapa da venda, propostas, cobranças, jornada e próxima ação"
            >
              {isContextOpen ? "Ocultar contexto" : "Contexto do lead"}
            </Button>
          ))}
        </div>
      </header>

      {thread.status === "waiting_human" && (
        <div
          role="alert"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.3)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "var(--font-size-xs, 0.75rem)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-primary)", flex: 1, minWidth: "min(100%, 260px)" }}>
            <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: "#d97706", display: "flex", alignItems: "center", gap: "6px" }}>
                Transbordo Solicitado pela IA (Protocolo de Ignorância)
              </div>
              <div style={{ color: "var(--text-primary)", marginTop: "2px" }}>
                <strong>Motivo / Pergunta do Lead:</strong>{" "}
                <span style={{ fontStyle: "italic" }}>
                  &ldquo;{thread.handoffReason || "O lead fez uma pergunta ausente do catálogo/FAQ e aguarda atendimento humano."}&rdquo;
                </span>
              </div>
            </div>
          </div>

          {onAssumeAttendance && (
            <Button
              size="sm"
              variant="secondary"
              prefixIcon={<UserCheck size={14} />}
              onClick={onAssumeAttendance}
              style={{
                borderColor: "rgba(245, 158, 11, 0.4)",
                backgroundColor: "var(--bg-surface)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Assumir Conversa
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
