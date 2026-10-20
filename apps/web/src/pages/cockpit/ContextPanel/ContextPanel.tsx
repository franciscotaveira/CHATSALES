import type { FC } from "react";
import { Button, IconButton } from "@sos-sales/ui";
import {
  X,
  User,
  FileText,
  QrCode,
  GitCommit,
  StickyNote,
  Award,
  Edit3,
} from "lucide-react";
import type {
  CommercialThreadSummary,
  CommercialProposalSummary,
  ContactSummary,
} from "../../../services/api-client";
import { LeadSummary } from "./LeadSummary";
import { PixStatus } from "./PixStatus";
import { OutcomeActions } from "./OutcomeActions";
import { Notes } from "./Notes";
import { ProposalsSection } from "./ProposalsSection";
import { panelFrame } from "../utils/panelFrame";
import { JourneyTimeline } from "./JourneyTimeline";

interface ContextPanelProps {
  thread: CommercialThreadSummary;
  contact?: ContactSummary | null;
  onClose?: () => void;
  // Journey & lead
  journeyStage?: string | null;
  estimatedValueCents?: number | null;
  onEditLead?: () => void;
  onUpdateStage?: (newStage: string) => Promise<void> | void;
  customStages?: Record<string, string>;
  isUpdatingStage?: boolean;
  stageError?:string|null;
  // Proposals (F3)
  proposals?: CommercialProposalSummary[];
  onCreateProposal?: () => void;
  onUpdateProposalStatus?: (
    proposalId: string,
    status: CommercialProposalSummary["status"]
  ) => Promise<void>;
  onGenerateProposalPix?: (proposal: CommercialProposalSummary) => void;
  proposalError?: string | null;
  proposalsLoading?:boolean;
  proposalBusy?:boolean;
  proposalReview?:boolean;
  onRefreshProposals?:()=>void;
  // Pix
  workspaceId?:string;
  token?:string;
  pixRefreshKey?:number;
  onGeneratePix?: () => void;
  // Notes
  notes?: string;
  onSaveNotes?: (notes: string) => Promise<void> | void;
  isSavingNotes?: boolean;
  // Outcome
  onMarkWon?: () => void;
  onMarkLost?: () => void;
  currentOutcome?: "won" | "lost" | null;
  // Action History
  isMobile?: boolean;
}

export const ContextPanel: FC<ContextPanelProps> = ({
  thread,
  contact,
  onClose,
  journeyStage,
  estimatedValueCents,
  onEditLead,
  onUpdateStage,
  customStages,
  isUpdatingStage,stageError,
  proposals = [],
  onCreateProposal,
  onUpdateProposalStatus,
  onGenerateProposalPix,
  proposalError,proposalsLoading,proposalBusy,proposalReview,onRefreshProposals,
  workspaceId,token,pixRefreshKey,
  onGeneratePix,
  notes,
  onSaveNotes,
  isSavingNotes,
  onMarkWon,
  onMarkLost,
  currentOutcome,
  isMobile = false,
}) => {
  return (
    <aside
      aria-label="Painel de Contexto do Lead"
      style={{
        width: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        minWidth: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        maxWidth: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        height: isMobile ? "auto" : "100%",
        minHeight: 0,
        backgroundColor: "var(--bg-surface-subtle)",
        ...panelFrame(isMobile),
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* The containing drawer already provides a title and close action. */}
      {!isMobile && <div
        style={{
          height: "var(--topbar-h, 56px)",
          minHeight: "var(--topbar-h, 56px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--space-4, 16px)",
          borderBottom: "2px solid var(--border-strong)",
          backgroundColor: "var(--bg-surface-elevated)",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-sm, 0.875rem)",
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          Contexto do Lead
        </span>
        {onClose && (
          <IconButton
            aria-label="Fechar contexto do lead"
            icon={<X size={16} />}
            size="sm"
            variant="ghost"
            onClick={onClose}
          />
        )}
      </div>}

      {/* Scrollable Sections as Framed Cards */}
      <div
        style={{
          flex: isMobile ? undefined : 1,
          minHeight: 0,
          overflowY: isMobile ? "visible" : "auto",
          padding: isMobile ? 0 : "var(--space-3, 12px) var(--space-4, 16px)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Card 1: Lead & Origem */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg, 10px)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <User size={14} style={{ color: "var(--color-action)" }} />
              <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>Lead & Origem</span>
            </div>
            {onEditLead && <Button size="xs" variant="secondary" prefixIcon={<Edit3 size={12}/>} onClick={onEditLead}>Editar ficha</Button>}
          </div>
          <LeadSummary
            thread={thread}
            contact={contact}
            journeyStage={journeyStage}
            estimatedValueCents={estimatedValueCents}
            onUpdateStage={onUpdateStage}
            customStages={customStages}
            isUpdatingStage={isUpdatingStage}
            error={stageError}
            onEditLead={onEditLead}
          />
        </section>

        {/* Card 2: Propostas Comerciais */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg, 10px)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: "8px",
            }}
          >
            <FileText size={14} style={{ color: "var(--color-operational)" }} />
            <span
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
              }}
            >
              Propostas Comerciais
            </span>
          </div>
          <ProposalsSection
            proposals={proposals}
            onCreateProposal={onCreateProposal}
            onUpdateStatus={onUpdateProposalStatus}
            onGeneratePix={onGenerateProposalPix}
            error={proposalError}
            isLoading={proposalsLoading}
            busy={proposalBusy}
            reviewRequired={proposalReview}
            onRefresh={onRefreshProposals}
          />
        </section>

        {/* Card 3: Cobrança Pix */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg, 10px)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: "8px",
            }}
          >
            <QrCode size={14} style={{ color: "var(--color-action)" }} />
            <span
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
              }}
            >
              Cobranças Pix
            </span>
          </div>
          <PixStatus
            workspaceId={workspaceId}
            token={token}
            threadId={thread.id}
            refreshKey={pixRefreshKey}
            onGeneratePix={onGeneratePix}
          />
        </section>

        {/* Card 4: Jornada do Cliente */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg, 10px)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: "8px",
            }}
          >
            <GitCommit size={14} style={{ color: "var(--color-ai)" }} />
            <span
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
              }}
            >
              Negociação & Registros
            </span>
          </div>
          <JourneyTimeline
            workspaceId={workspaceId}
            threadId={thread.id}
            token={token}
            customStages={customStages}
            refreshKey={`${pixRefreshKey}:${journeyStage}:${proposals.map(proposal=>`${proposal.id}:${proposal.stateVersion}`).join(",")}`}
          />
        </section>

        {/* Card 5: Notas Comerciais */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg, 10px)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: "8px",
            }}
          >
            <StickyNote size={14} style={{ color: "var(--color-warning)" }} />
            <span
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
              }}
            >
              Notas Comerciais
            </span>
          </div>
          <Notes
            key={thread.id}
            initialNotes={notes}
            onSaveNotes={onSaveNotes}
            isSaving={isSavingNotes}
          />
        </section>

        {/* Card 6: Fechamento / Outcome */}
        {onMarkWon && onMarkLost && (
          <section
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg, 10px)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderBottom: "1px solid var(--border-default)",
                paddingBottom: "8px",
              }}
            >
              <Award size={14} style={{ color: "var(--color-action)" }} />
              <span
                style={{
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--text-secondary)",
                }}
              >
                Fechamento do Negócio
              </span>
            </div>
            <OutcomeActions
              onMarkWon={onMarkWon}
              onMarkLost={onMarkLost}
              currentOutcome={currentOutcome}
            />
          </section>
        )}
      </div>
    </aside>
  );
};
