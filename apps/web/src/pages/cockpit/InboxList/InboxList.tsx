import type {CustomStagesMap} from "../../opportunities/stages";
import {useEffect, useRef, type FC} from "react";
import { Badge, Button, IconButton, Input, SegmentedControl, EmptyState, LoadingState, useBreakpoint } from "@sos-sales/ui";
import { PanelLeftClose, PanelLeftOpen, Search, MessageSquare, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import { Avatar } from "@sos-sales/ui";
import type { CommercialThreadSummary, ChannelSummary } from "../../../services/api-client";
import { ConversationRow } from "./ConversationRow";
import type { QueueFilter } from "../hooks/useInbox";
import { panelFrame } from "../utils/panelFrame";

export type { QueueFilter };

interface InboxListProps {
  restoreFocusThreadId?: string | null;
  customStages?:CustomStagesMap;
  requiresRefresh?:boolean;hasMore?:boolean;isLoadingMore?:boolean;isRefreshing?:boolean;onLoadMore?:()=>void;
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
  canImportHistory?: boolean;
  onOpenPosSale?: () => void;
  isLoading?: boolean;
  error?: string | null;
  notice?: string | null;
  onRetry?: () => void;
}

export const InboxList: FC<InboxListProps> = ({
  restoreFocusThreadId,
  threads,
  requiresRefresh=false,hasMore=false,isLoadingMore=false,isRefreshing=false,onLoadMore,
  customStages,
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
  canImportHistory=false,
  onOpenPosSale,
  isLoading = false, error, notice, onRetry,
}) => {
  const { isMobile: hookMobile } = useBreakpoint();
  const isMobile = isMobileProp ?? hookMobile;
  const queueRef = useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!restoreFocusThreadId || !queueRef.current || document.activeElement && document.activeElement!==document.body)return;
    const row=Array.from(queueRef.current.querySelectorAll<HTMLElement>('[data-thread-id]')).find(element=>element.dataset.threadId===restoreFocusThreadId);
    const target=row?.matches('button,[role="button"]')?row:row?.querySelector<HTMLElement>('button,[role="button"]');
    (target || queueRef.current.querySelector<HTMLInputElement>('input'))?.focus();
  },[restoreFocusThreadId]);

  // If desktop and collapsed, render compact 58px contact rail
  if (!isMobile && isCollapsed) {
    return (
      <aside
        ref={queueRef}
        aria-label="Trilho Rápido de Contatos"
        aria-busy={isLoading || isRefreshing}
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

        {onOpenPosSale && (
          <IconButton
            aria-label="Nova Venda Balcão / POS"
            icon={<Zap size={16} style={{ color: "#10B981" }} />}
            size="sm"
            variant="ghost"
            onClick={onOpenPosSale}
            tooltip="⚡ Nova Venda Balcão / POS"
          />
        )}

        {(error || requiresRefresh) && (
          <div role="alert">
            <IconButton
              aria-label="A fila precisa de revisão. Expandir para consultar o aviso"
              icon={<AlertTriangle size={16} color="var(--color-danger)" />}
              size="sm"
              variant="ghost"
              onClick={onToggleCollapse}
              tooltip={error || "A atualização da fila falhou. Expanda para revisar a consulta."}
            />
          </div>
        )}
        {(isLoading || isRefreshing) && (
          <span role="status" aria-label="Atualizando fila de conversas" title="Atualizando fila de conversas">
            <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
          </span>
        )}
        {hasMore && (
          <IconButton
            aria-label="Há mais conversas. Expandir fila para carregar"
            icon={<MessageSquare size={16} />}
            size="sm"
            variant="ghost"
            onClick={onToggleCollapse}
            tooltip="Há mais conversas além das carregadas. Expanda a fila para continuar."
          />
        )}

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
            const activityLabel = thread.status === "waiting_human"
              ? "Aguardando atendimento humano"
              : thread.lastMessage?.direction === "inbound"
                ? "Última mensagem recebida do cliente"
                : null;
            const contactLabel = thread.contactName?.trim() || thread.contactPhone || "Contato sem nome";
            const accessibleLabel = `${contactLabel}${activityLabel ? ` (${activityLabel})` : ""}`;

            return (
              <button
                data-thread-id={thread.id}
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                title={accessibleLabel}
                aria-label={accessibleLabel}
                aria-pressed={isSelected}
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
                {activityLabel && (
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
      ref={queueRef}
      aria-label="Fila de Conversas Inbox"
      aria-busy={isLoading}
      style={{
        width: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        minWidth: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        maxWidth: isMobile ? "100%" : "var(--inbox-list-w, 340px)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-surface-elevated, #F8FAFC)",
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
            <span title="Conversas carregadas nesta consulta"><Badge variant="action">{threads.length}{hasMore?"+":""}</Badge></span>
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
            {onOpenPosSale && (
              <IconButton
                aria-label="Nova Venda Balcão / POS"
                icon={<Zap size={14} style={{ color: "#10B981" }} />}
                size="sm"
                variant="ghost"
                onClick={onOpenPosSale}
                tooltip="⚡ Nova Venda Balcão / POS (NF + Pós-Venda)"
              />
            )}
            {onSync && (
              <IconButton
                aria-label="Revisar importação do histórico recente"
                icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                size="sm"
                variant="ghost"
                onClick={onSync}
                disabled={isSyncing || !canImportHistory}
                tooltip={isSyncing ? "Importando histórico recente..." : canImportHistory?"Revisar importação do histórico recente":"Selecione um canal WAHA ativo e conectado para importar histórico"}
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
          aria-label="Buscar conversa ou telefone"
          maxLength={200}
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

      {isRefreshing&&threads.length>0&&<small role="status" style={{padding:"4px 16px"}}>Atualizando conversas consultadas…</small>}
      {error && <div role="alert" style={{padding:"12px 16px",fontSize:13,color:"var(--color-danger)"}}>
        {error}{onRetry&&<Button size="sm" variant="secondary" disabled={isLoading} onClick={onRetry}>Tentar novamente</Button>}
      </div>}
      {requiresRefresh&&threads.length>0&&<p role="status" style={{padding:"4px 16px",fontSize:12}}>A atualização da fila falhou. As conversas anteriores foram preservadas; atualize a consulta antes de carregar mais.</p>}
      {notice && <p role="status" style={{padding:"12px 16px",fontSize:13}}>{notice}</p>}
      {queueFilter==="needs_attention"&&<p style={{margin:0,padding:"8px 16px",fontSize:11,color:"var(--text-secondary)"}}>Conversas abertas aguardando pessoa ou com tarefa vencida ou prevista nas próximas 24 horas.</p>}
      {/* 2. Scrollable Thread List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isLoading && threads.length===0 ? <LoadingState text="Carregando conversas…"/> : threads.length === 0 && !error ? (
          <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
            <EmptyState
              icon={<MessageSquare size={36} color="var(--text-muted)" />}
              title={searchQuery ? "Nenhuma conversa encontrada" : queueFilter==="closed" ? "Nenhuma conversa fechada" : queueFilter==="needs_attention" ? "Nenhuma conversa aguardando atenção" : queueFilter==="all" ? "Nenhuma conversa encontrada" : "Nenhuma conversa aberta"}
              description={
                searchQuery
                  ? "Nenhum contato encontrado para o termo pesquisado."
                  : queueFilter==="needs_attention" ? "Nenhuma conversa corresponde aos critérios de atenção nesta consulta." : !activeChannel ? "Conecte um canal em Configurações para receber novas conversas." : "As conversas deste filtro aparecerão aqui."
              }
            />
            {onSync && activeChannel && !searchQuery && (
              <Button
                size="sm"
                variant="primary"
                prefixIcon={<RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />}
                onClick={onSync}
                disabled={isSyncing || !canImportHistory}
              >
                {isSyncing ? "Importando histórico..." : "Revisar importação do histórico"}
              </Button>
            )}
          </div>
        ) : (
          threads.map((thread) => (
            <div key={thread.id} data-thread-id={thread.id} style={{flexShrink:0}}><ConversationRow
              key={thread.id}
              thread={thread}
              customStages={customStages}
              selected={thread.id === selectedThreadId}
              onSelect={onSelectThread}
            /></div>
          ))
        )}
        {hasMore&&onLoadMore&&<Button size="sm" variant="secondary" disabled={requiresRefresh||isLoadingMore||isRefreshing||isLoading} onClick={onLoadMore}>{isLoadingMore?"Carregando mais conversas…":"Carregar mais conversas"}</Button>}
      </div>
    </aside>
  );
};
