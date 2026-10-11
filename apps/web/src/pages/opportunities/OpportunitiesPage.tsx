import { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { PageHeader, Button, LoadingState, EmptyState, Badge, Input } from "@sos-sales/ui";
import { Plus, TrendingUp, RefreshCw, GripVertical, Eye, Search, Sliders, X, Filter } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ContactSummary, type JourneySummary } from "../../services/api-client";
import { STAGES, formatCents, getCustomStages, getStageLabel, type CustomStagesMap } from "./stages";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { CustomizeStagesDialog } from "./CustomizeStagesDialog";

// API caps: contacts query max(100) (zod), journeys clamped to 100 in packages/database/src/commercial.ts
const LIST_LIMIT = 100;

export const OpportunitiesPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customStages, setCustomStages] = useState<CustomStagesMap>({});
  const [selectedJourney, setSelectedJourney] = useState<JourneySummary | null>(null);
  const [draggedJourneyId, setDraggedJourneyId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState<"all" | "recurring" | "new">("all");
  const [valueFilter, setValueFilter] = useState<"all" | "has_value" | "no_value">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d">("all");

  const loadCustomStages = useCallback(() => {
    if (activeWorkspace?.id) {
      setCustomStages(getCustomStages(activeWorkspace.id));
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    loadCustomStages();
  }, [loadCustomStages]);

  const load = useCallback(async () => {
    if (!activeWorkspace || !token) return;
    const workspaceId = activeWorkspace.id;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [journeyRes, contactRes] = await Promise.all([
        apiClient.listJourneys(workspaceId, { limit: LIST_LIMIT }, { token }),
        apiClient.getContacts(workspaceId, { limit: LIST_LIMIT }, { token }),
      ]);
      if (activeWorkspace.id !== workspaceId) return;
      setJourneys(journeyRes.items || []);
      setContacts(contactRes.contacts || []);
    } catch (err: unknown) {
      if (activeWorkspace.id !== workspaceId) return;
      setErrorMsg((err as Error).message || "Falha ao carregar oportunidades.");
    } finally {
      if (activeWorkspace.id === workspaceId) setIsLoading(false);
    }
  }, [activeWorkspace, token]);

  useEffect(() => {
    load();
  }, [load]);

  const contactMap = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const contactNames = useMemo(
    () => new Map(contacts.map((c) => [c.id, c.name || c.phoneE164])),
    [contacts]
  );

  // Filtered journeys according to active filters
  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      const contact = contactMap.get(j.contactId);
      const contactName = contact?.name?.toLowerCase() || "";
      const contactPhone = contact?.phoneE164 || "";
      const title = j.title?.toLowerCase() || "";

      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches = contactName.includes(q) || contactPhone.includes(q) || title.includes(q);
        if (!matches) return false;
      }

      // 2. Profile Filter
      if (profileFilter !== "all") {
        const isRec = Boolean(
          contact?.metadata?.isRecurring ||
          (contact?.metadata?.totalOrders && contact.metadata.totalOrders > 0) ||
          contact?.metadata?.tags?.includes("cliente_recorrente")
        );
        if (profileFilter === "recurring" && !isRec) return false;
        if (profileFilter === "new" && isRec) return false;
      }

      // 3. Value Filter
      if (valueFilter === "has_value" && (!j.estimatedValueCents || j.estimatedValueCents <= 0)) return false;
      if (valueFilter === "no_value" && j.estimatedValueCents && j.estimatedValueCents > 0) return false;

      // 4. Date Filter
      if (dateFilter !== "all") {
        const createdMs = new Date(j.createdAt).getTime();
        const nowMs = Date.now();
        const days = dateFilter === "7d" ? 7 : 30;
        if (nowMs - createdMs > days * 24 * 60 * 60 * 1000) return false;
      }

      return true;
    });
  }, [journeys, contactMap, searchQuery, profileFilter, valueFilter, dateFilter]);

  const columns = useMemo(
    () =>
      STAGES.map((stage) => {
        const items = filteredJourneys.filter((j) => j.stage === stage.id);
        const totalCents = items.reduce((sum, j) => sum + (j.estimatedValueCents ?? 0), 0);
        const displayLabel = getStageLabel(stage.id, customStages);
        return { ...stage, label: displayLabel, items, totalCents };
      }),
    [filteredJourneys, customStages]
  );

  const isAnyFilterActive = searchQuery.trim() !== "" || profileFilter !== "all" || valueFilter !== "all" || dateFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setProfileFilter("all");
    setValueFilter("all");
    setDateFilter("all");
  };

  const moveJourney = async (journeyId: string, stage: JourneySummary["stage"]) => {
    if (!activeWorkspace || !token || stage === "won" || stage === "lost") {
      const journey = journeys.find((item) => item.id === journeyId);
      if (journey) setSelectedJourney(journey);
      return;
    }
    const previous = journeys;
    setJourneys((items) => items.map((item) => item.id === journeyId ? { ...item, stage } : item));
    setErrorMsg(null);
    try {
      await apiClient.updateJourneyStage(activeWorkspace.id, journeyId, stage, { token });
    } catch (err: unknown) {
      setJourneys(previous);
      setErrorMsg((err as Error).message || "Não foi possível mover a oportunidade.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
        <PageHeader
          title="Oportunidades"
          description="Funil de vendas por etapa, com valor estimado e inteligência de clientes recorrentes."
          actions={
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Button size="sm" variant="ghost" prefixIcon={<Sliders size={14} />} onClick={() => setIsCustomizeOpen(true)}>
                Personalizar Estágios
              </Button>
              <Button size="sm" variant="secondary" prefixIcon={<RefreshCw size={14} />} onClick={load} disabled={isLoading}>
                {isLoading ? "Atualizando..." : "Atualizar"}
              </Button>
              <Button size="sm" variant="primary" prefixIcon={<Plus size={14} />} onClick={() => setIsDialogOpen(true)}>
                Nova Oportunidade
              </Button>
            </div>
          }
        />

        {/* Barra de Filtros Inteligentes */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            padding: "12px 14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <div style={{ flex: "1 1 240px", minWidth: "200px" }}>
            <Input
              placeholder="Buscar por lead, telefone ou serviço..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefixIcon={<Search size={14} color="var(--text-muted)" />}
              style={{ height: "34px", fontSize: "var(--font-size-xs)" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value as any)}
              style={{
                height: "34px",
                padding: "0 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-canvas)",
                fontSize: "var(--font-size-xs)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">Todos os Perfis</option>
              <option value="recurring">⭐ Clientes Recorrentes (Já Compraram)</option>
              <option value="new">🌱 Novos Leads (Primeira Compra)</option>
            </select>
          </div>

          <select
            value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value as any)}
            style={{
              height: "34px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">Qualquer Valor</option>
            <option value="has_value">Com Valor Estimado</option>
            <option value="no_value">Sem Valor Estimado</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            style={{
              height: "34px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">Todas as Datas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>

          {isAnyFilterActive && (
            <Button size="xs" variant="ghost" prefixIcon={<X size={12} />} onClick={clearFilters}>
              Limpar Filtros
            </Button>
          )}

          <div style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            Exibindo <strong>{filteredJourneys.length}</strong> de {journeys.length}
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {errorMsg}
          </div>
        )}

        {journeys.length >= LIST_LIMIT && (
          <div
            role="status"
            style={{
              padding: "8px 14px",
              backgroundColor: "var(--bg-surface-elevated)",
              color: "var(--text-secondary)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Mostrando apenas as primeiras {LIST_LIMIT} oportunidades. Pode haver mais não exibidas.
          </div>
        )}

        {isLoading && journeys.length === 0 ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando oportunidades..." />
        ) : journeys.length === 0 && !errorMsg ? (
          <EmptyState
            icon={<TrendingUp size={48} />}
            title="Nenhuma oportunidade ainda"
            description="Crie uma oportunidade para um lead e acompanhe-a pelo funil até o fechamento."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4, 16px)", alignItems: "start" }}>
            {columns.map((col) => (
              <section
                key={col.id}
                aria-label={col.label}
                onDragOver={(event) => { event.preventDefault(); setDropStage(col.id); }}
                onDragLeave={() => setDropStage((current) => current === col.id ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  const journeyId = event.dataTransfer.getData("text/plain") || draggedJourneyId;
                  setDropStage(null);
                  setDraggedJourneyId(null);
                  if (journeyId) void moveJourney(journeyId, col.id);
                }}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: dropStage === col.id ? "2px solid var(--color-operational)" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <header
                  style={{
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-strong)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>{col.label}</span>
                    <Badge variant="neutral">{col.items.length}</Badge>
                  </div>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {formatCents(col.totalCents)}
                  </span>
                </header>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px" }}>
                  {col.items.length === 0 ? (
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>
                      Vazio
                    </span>
                  ) : (
                    col.items.map((j) => (
                      <article
                        key={j.id}
                        draggable={j.stage !== "won" && j.stage !== "lost"}
                        onDragStart={(event) => { setDraggedJourneyId(j.id); event.dataTransfer.setData("text/plain", j.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDraggedJourneyId(null); setDropStage(null); }}
                        onClick={() => setSelectedJourney(j)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedJourney(j); }}
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          cursor: "pointer",
                          opacity: draggedJourneyId === j.id ? 0.55 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <GripVertical size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)", color: "var(--text-primary)", flex: 1 }}>{contactNames.get(j.contactId) ?? "Lead"}</span>
                          <Eye size={14} style={{ color: "var(--color-operational)", flexShrink: 0 }} />
                        </div>
                        {(() => {
                          const contact = contactMap.get(j.contactId);
                          const isRec = Boolean(
                            contact?.metadata?.isRecurring ||
                            (contact?.metadata?.totalOrders && Number(contact.metadata.totalOrders) > 0) ||
                            contact?.metadata?.tags?.includes("cliente_recorrente")
                          );
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                              {isRec ? (
                                <Badge variant="action">⭐ Recorrente</Badge>
                              ) : (
                                <Badge variant="neutral">🌱 Novo Lead</Badge>
                              )}
                              {contact?.metadata?.totalOrders ? (
                                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                                  ({contact.metadata.totalOrders} {contact.metadata.totalOrders === 1 ? "compra" : "compras"})
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                        {j.title && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>{j.title}</span>}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {j.estimatedValueCents != null ? formatCents(j.estimatedValueCents) : "—"}
                          </span>
                          <span>{new Date(j.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {activeWorkspace && token && (
        <NewOpportunityDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onCreated={load}
          workspaceId={activeWorkspace.id}
          token={token}
          contacts={contacts}
        />
      )}

      {activeWorkspace && token && (
        <OpportunityDetailDialog
          journey={selectedJourney}
          contact={contacts.find((item) => item.id === selectedJourney?.contactId)}
          workspaceId={activeWorkspace.id}
          token={token}
          onClose={() => setSelectedJourney(null)}
          onChanged={load}
        />
      )}

      {activeWorkspace && (
        <CustomizeStagesDialog
          isOpen={isCustomizeOpen}
          onClose={() => setIsCustomizeOpen(false)}
          workspaceId={activeWorkspace.id}
          onSaved={loadCustomStages}
        />
      )}
    </div>
  );
};

export default OpportunitiesPage;
