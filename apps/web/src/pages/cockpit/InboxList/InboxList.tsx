import type { FC } from "react";
import { Badge, Button, IconButton, Input, SegmentedControl, EmptyState, useBreakpoint } from "@sos-sales/ui";
import { PanelLeftClose, PanelLeftOpen, Search, MessageSquare, RefreshCw } from "lucide-react";
import { Avatar } from "@sos-sales/ui";
import type { CommercialThreadSummary, ChannelSummary } from "../../../services/api-client";
import { ConversationRow } from "./ConversationRow";
import type { QueueFilter } from "../hooks/useInbox";
import { panelFrame } from "../utils/panelFrame";

export type { QueueFilter };

interface InboxListProps {
  threads: CommercialThreadSummary[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  queueFilter: QueueFilter;
  onQueueFilterChange: (filter: QueueFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  activeChannel: ChannelSummary | null;
  channels?: ChannelSummary[];
  selectedChannelId?: string | "all";
  onSelectChannelId?: (channelId: string | "all") => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
}

export const InboxList: FC<InboxListProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  queueFilter,
  onQueueFilterChange,
  searchQuery,
  onSearchQueryChange,
  activeChannel,
  channels,
  selectedChannelId,
  onSelectChannelId,
  isCollapsed,
  onToggleCollapse,
  isMobile: isMobileProp,
  onSync,
  isSyncing,
}) => {
  const { isMobile: hookMobile } = useBreakpoint();
  const isMobile = isMobileProp ?? hookMobile;

  // If desktop and collapsed, render compact 58px contact rail
  if (!isMobile && isCollapsed) {
    return (
      <aside
        aria-label="Trilho Rápido de Contatos"
        style={{
          width: "58px",
          minWidth: "58px",
          backgroundColor: "var(--bg-surface)",
          ...panelFrame(false),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 0",
          gap: "8px",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <IconButton
          aria-label="Expandir Fila de Atendimento"
          icon={<PanelLeftOpen size={16} />}
          size="sm"
          variant="ghost"
          onClick={onToggleCollapse}
          tooltip="Expandir Fila (320px)"
        />

        <div
          style={{
            flex: 1,
            width: "100%",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "6px",
          }}
        >
          {threads.map((thread) => {
            const isSelected = thread.id === selectedThreadId;
            const hasUnread = thread.status === "waiting_human" || thread.lastMessage?.direction === "inbound";

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                title={`${thread.contactName || thread.contactPhone}${hasUnread ? " (Aguardando atendimento)" : ""}`}
                style={{
                  position: "relative",
                  background: "none",
                  border: "none",
                  padding: "2px",
                  cursor: "pointer",
                  borderRadius: "50%",
                  outline: isSelected ? "2px solid var(--color-action)" : "none",
                  outlineOffset: "2px",
                  display: "inline-flex",
                }}
              >
                <Avatar
                  id={thread.id}
                  name={thread.contactName ?? undefined}
                  size="md"
                />
                {hasUnread && (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-action)",
                      border: "2px solid var(--bg-surface)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  const filterOptions: { value: QueueFilter; label: string }[] = [
    { value: "open", label: "Abertas" },
    { value: "needs_attention", label: "Atenção" },
    { value: "all", label: "Todas" },
    { value: "closed", label: "Fechadas" },
  ];

  return (
    <aside
      aria-label="Fila de Conversas Inbox"
      style={{
        width: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        minWidth: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        maxWidth: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-surface)",
        boxSizing: "border-box",
        overflow: "hidden",
        ...panelFrame(isMobile),
      }}
    >
      {/* 1. Header with title, badge count, active channel, and collapse toggle */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "2px solid var(--border-strong)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          backgroundColor: "var(--bg-surface-elevated)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "var(--font-size-lg)",
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Inbox
            </h1>
            <Badge variant="action">{threads.length}</Badge>
            {channels && channels.length > 1 && onSelectChannelId ? (
              <select
                value={selectedChannelId || "all"}
                onChange={(e) => onSelectChannelId(e.target.value)}
                aria-label="Filtrar por canal"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "2px 6px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  maxWidth: "130px",
                  outline: "none",
                }}
              >
                <option value="all">Todos ({channels.length})</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName || c.phoneNumberE164 || c.provider}
                  </option>
                ))}
              </select>
            ) : activeChannel ? (
              <Badge variant="neutral">
                {(activeChannel.provider || "WhatsApp").toUpperCase()}
              </Badge>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {onSync && (
              <IconButton
                aria-label="Sincronizar conversas do WhatsApp"
                icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                size="sm"
                variant="ghost"
                onClick={onSync}
                disabled={isSyncing}
                tooltip={isSyncing ? "Sincronizando conversas..." : "Sincronizar conversas do WhatsApp"}
              />
            )}
            {!isMobile && (
              <IconButton
                aria-label="Recolher Fila de Conversas"
                icon={<PanelLeftClose size={16} />}
                size="sm"
                variant="ghost"
                onClick={onToggleCollapse}
                tooltip="Recolher Fila (58px)"
              />
            )}
          </div>
        </div>

        {/* Search Bar */}
        <Input
          placeholder="Buscar conversa ou telefone..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          prefixIcon={<Search size={14} color="var(--text-muted)" />}
          style={{ height: "var(--control-h-sm, 32px)", fontSize: "var(--font-size-sm)" }}
        />

        {/* 32px SegmentedControl Filters */}
        <SegmentedControl
          size="sm"
          options={filterOptions}
          value={queueFilter}
          onChange={(val) => onQueueFilterChange(val as QueueFilter)}
          aria-label="Filtro da Fila"
        />
      </div>

      {/* 2. Scrollable Thread List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {threads.length === 0 ? (
          <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
            <EmptyState
              icon={<MessageSquare size={36} color="var(--text-muted)" />}
              title="Nenhuma conversa ativa"
              description={
                searchQuery
                  ? "Nenhum contato encontrado para o termo pesquisado."
                  : "Aguardando novos leads e mensagens no canal."
              }
            />
            {onSync && !searchQuery && (
              <Button
                size="sm"
                variant="primary"
                prefixIcon={<RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />}
                onClick={onSync}
                disabled={isSyncing}
              >
                {isSyncing ? "Sincronizando Conversas..." : "Sincronizar Conversas do WhatsApp"}
              </Button>
            )}
          </div>
        ) : (
          threads.map((thread) => (
            <ConversationRow
              key={thread.id}
              thread={thread}
              selected={thread.id === selectedThreadId}
              onSelect={onSelectThread}
            />
          ))
        )}
      </div>
    </aside>
  );
};
