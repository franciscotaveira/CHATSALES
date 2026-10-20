import {STAGES} from '../../opportunities/stages';
import {useEffect,useRef,useState,type FC} from "react";
import { Avatar, Button, IconButton } from "@sos-sales/ui";
import { ArrowLeft, RefreshCw, Sparkles, FileText, Info, AlertTriangle, UserCheck } from "lucide-react";
import type { CommercialThreadSummary } from "../../../services/api-client";
import {formatDateTimeFull} from "../utils/formatTime";
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
  onResumeAutomation?: () => void;
  isResumingAutomation?: boolean;
  automationError?: string | null;
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
  onResumeAutomation,
  isResumingAutomation = false,
  automationError,
  onUpdateStage,
  customStages,
  isUpdatingStage = false,
}) => {
  const contactHeading=useRef<HTMLHeadingElement|null>(null);
  useEffect(()=>{
    if(isMobile && document.activeElement===document.body)contactHeading.current?.focus({preventScroll:true});
  },[isMobile,thread.id]);
  const hasName = Boolean(thread.contactName && thread.contactName.trim());
  const displayName = hasName
    ? thread.contactName
    : formatPhone(thread.contactPhone) || "Contato sem nome";
  const formattedPhone = formatPhone(thread.contactPhone);
  const origin = thread.channelProvider ? ` · ${thread.channelProvider}` : "";

  const announcementDeadline=thread.fepExpiresAt?Date.parse(thread.fepExpiresAt):NaN;
  const [,refreshDeadline]=useState(0);
  useEffect(()=>{
    if(!Number.isFinite(announcementDeadline)||announcementDeadline<=Date.now())return;
    let timer:ReturnType<typeof setTimeout>;
    const check=()=>{
      const remaining=announcementDeadline-Date.now();
      if(remaining<=0){refreshDeadline(value=>value+1);return;}
      timer=setTimeout(check,Math.min(remaining,2147483647));
    };
    check();return()=>clearTimeout(timer);
  },[announcementDeadline]);
  const hasFutureAnnouncementDeadline=Number.isFinite(announcementDeadline)&&announcementDeadline>Date.now();

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", flexShrink: 0 }}>
      <header
        style={{
          height: "auto",
          minHeight: "var(--topbar-h, 56px)",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px var(--space-4, 16px)",
          flexWrap: "wrap",
          boxSizing: "border-box",
          gap: "12px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: "1 1 220px" }}>
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
                minWidth: 0,
              }}
            >
              <h2
                ref={contactHeading}
                tabIndex={-1}
                style={{
                  margin:0,
                  fontSize: "var(--font-size-sm, 0.875rem)",
                  fontWeight: 600,
                  flexBasis: "100%",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </h2>

              {hasFutureAnnouncementDeadline && (
                <span
                  title="Prazo informado pelo canal, no horário deste dispositivo. Confirme condições e tarifas no provedor; este aviso não autoriza envio."
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
                  Anúncio · até <time dateTime={new Date(announcementDeadline).toISOString()}>{formatDateTimeFull(thread.fepExpiresAt)}</time>
                </span>
              )}

              <select
                aria-label="Etapa do lead no funil"
                value={STAGES.some(stage=>stage.id===thread.journeyStage)?thread.journeyStage!:""}
                onChange={(e) => onUpdateStage?.(e.target.value)}
                disabled={isUpdatingStage}
                title="Selecione uma etapa para revisar a negociação antes de alterar"
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
                {!STAGES.some(stage=>stage.id===thread.journeyStage)&&<option value="" disabled>Etapa não informada</option>}
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

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginLeft: "auto" }}>
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
          {onOpenDossier && (
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
              aria-expanded={isContextOpen}
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
              aria-expanded={isContextOpen}
              onClick={onToggleContext}
              title="Veja etapa da venda, propostas, cobranças, jornada e próxima ação"
            >
              {isContextOpen ? "Ocultar contexto" : "Contexto do lead"}
            </Button>
          ))}
        </div>
      </header>

      {automationError && <p role="alert" style={{padding:"12px 16px",color:"var(--color-danger)",fontSize:13}}>{automationError}</p>}
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
                Cliente aguardando atendimento humano
              </div>
              <div style={{ color: "var(--text-primary)", marginTop: "2px" }}>
                <p>Atenda pela caixa de mensagem abaixo. A IA permanece em espera até a devolução.</p>
                <strong>Motivo:</strong>{" "}
                <span style={{ fontStyle: "italic" }}>
                  {thread.handoffReason?.trim() || "Motivo não informado."}
                </span>
              </div>
            </div>
          </div>

          {onResumeAutomation && (
            <Button
              size="sm"
              variant="secondary"
              prefixIcon={<UserCheck size={14} />}
              onClick={onResumeAutomation}
              disabled={isResumingAutomation}
              title="Devolve esta conversa à IA, se o atendimento automático da empresa estiver habilitado."
              style={{
                borderColor: "rgba(245, 158, 11, 0.4)",
                backgroundColor: "var(--bg-surface)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {isResumingAutomation ? "Verificando…" : "Devolver à IA"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
