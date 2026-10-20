import { useState, useMemo, type FC } from "react";
import {
  Button,
  Input,
  Dialog,
  SegmentedControl,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Search,
  DownloadCloud,
  Eye,
  CheckCircle2,
  Sparkles,
  Tag,
} from "lucide-react";
import {
  apiClient,
  type MessageTemplateSummary,
} from "../../services/api-client";
import {
  CANONICAL_TEMPLATE_LIBRARY,
  TEMPLATE_SEGMENTS,
  type TemplateLibraryItem,
  type TemplateCategory,
  type TemplateSegment,
} from "@sos-sales/contracts";
import { userFacingError } from "../../utils/user-facing-error";

interface TemplateLibrarySectionProps {
  workspaceId: string;
  token: string;
  onImportSuccess: (imported: MessageTemplateSummary) => void | Promise<void>;
}

export const TemplateLibrarySection: FC<TemplateLibrarySectionProps> = ({
  workspaceId,
  token,
  onImportSuccess,
}) => {
  const { isMobile } = useBreakpoint();
  const [search, setSearch] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<TemplateSegment | "ALL">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | "ALL">("ALL");
  const [previewItem, setPreviewItem] = useState<TemplateLibraryItem | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return CANONICAL_TEMPLATE_LIBRARY.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;
      if (selectedSegment !== "ALL" && item.segment !== selectedSegment) return false;
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(term);
        const matchBody = item.bodyText.toLowerCase().includes(term);
        const matchSegment = item.segmentLabel.toLowerCase().includes(term);
        const matchName = item.name.toLowerCase().includes(term);
        if (!matchTitle && !matchBody && !matchSegment && !matchName) return false;
      }
      return true;
    });
  }, [selectedCategory, selectedSegment, search]);

  const handleImport = async (item: TemplateLibraryItem) => {
    if (!workspaceId || !token || importingId) return;
    setImportingId(item.id);
    setImportError(null);
    setImportSuccessMsg(null);
    try {
      const res = await apiClient.importTemplateFromLibrary(workspaceId, item.id, { token });
      setImportSuccessMsg(`Modelo "${res.template.name}" importado com sucesso!`);
      await onImportSuccess(res.template);
      setPreviewItem(null);
    } catch (err) {
      setImportError(userFacingError(err, "Não foi possível importar o modelo. Tente novamente."));
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Banner REA Soberano */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(43,92,230,0.12) 0%, rgba(34,184,240,0.08) 100%)",
          border: "1px solid rgba(43,92,230,0.25)",
          borderRadius: "16px",
          padding: isMobile ? "16px" : "20px 24px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--primary)",
                background: "rgba(43,92,230,0.15)",
                padding: "2px 8px",
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Sparkles size={12} /> Biblioteca Canônica Soberana
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {CANONICAL_TEMPLATE_LIBRARY.length} modelos prontos para o Brasil
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: isMobile ? "18px" : "20px", color: "var(--text-primary)" }}>
            Modelos de Alta Conversão com Pix e Validação Meta WABA
          </h3>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)", maxWidth: "700px" }}>
            Modelos testados para 13 segmentos comerciais, estruturados para aprovação imediata na Meta,
            com ganchos nativos para Pix Copia e Cola, conciliação e janela gratuita de 7 dias de anúncios (WAME/CTWA).
          </p>
        </div>
      </div>

      {importSuccessMsg && (
        <div
          role="status"
          style={{
            background: "rgba(22,163,74,0.12)",
            border: "1px solid rgba(22,163,74,0.3)",
            color: "#16a34a",
            padding: "12px 16px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} /> {importSuccessMsg}
        </div>
      )}

      {importError && (
        <div
          role="alert"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
            padding: "12px 16px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {importError}
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ maxWidth: "360px", width: "100%" }}>
            <Input
              aria-label="Buscar modelos na biblioteca"
              placeholder="Buscar por nicho, título ou texto..."
              prefixIcon={<Search size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isMobile ? (
            <label style={{ display: "grid", gap: 6, width: "100%" }}>
              Filtrar por Categoria
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                style={{ minHeight: 40, width: "100%" }}
              >
                <option value="ALL">Todas as Categorias</option>
                <option value="UTILITY">Utilidade (Custo Reduzido)</option>
                <option value="MARKETING">Marketing (Comercial)</option>
                <option value="AUTHENTICATION">Autenticação (OTP)</option>
              </select>
            </label>
          ) : (
            <SegmentedControl
              aria-label="Categoria do modelo"
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val as any)}
              options={[
                { value: "ALL", label: `Todas (${filteredItems.length})` },
                { value: "UTILITY", label: "Utilidade" },
                { value: "MARKETING", label: "Marketing" },
                { value: "AUTHENTICATION", label: "Autenticação" },
              ]}
            />
          )}
        </div>

        {/* Chips de Segmentos */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "4px",
            scrollbarWidth: "thin",
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedSegment("ALL")}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              border: "1px solid var(--border-subtle)",
              background: selectedSegment === "ALL" ? "var(--primary)" : "var(--bg-surface)",
              color: selectedSegment === "ALL" ? "#fff" : "var(--text-secondary)",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            Todos os Nichos
          </button>
          {TEMPLATE_SEGMENTS.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => setSelectedSegment(seg.key)}
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                border: "1px solid var(--border-subtle)",
                background: selectedSegment === seg.key ? "var(--primary)" : "var(--bg-surface)",
                color: selectedSegment === seg.key ? "#fff" : "var(--text-secondary)",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Modelos */}
      {filteredItems.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: "var(--bg-surface)",
            borderRadius: "16px",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0 }}>
            Nenhum modelo encontrado para esta combinação de nicho e filtro.
          </p>
          <Button
            size="sm"
            style={{ marginTop: "12px" }}
            onClick={() => {
              setSearch("");
              setSelectedCategory("ALL");
              setSelectedSegment("ALL");
            }}
          >
            Limpar Filtros
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredItems.map((item) => {
            const isUtility = item.category === "UTILITY";
            const isMarketing = item.category === "MARKETING";

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "16px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "transform 0.15s, border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Tags Superiores */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: isUtility
                          ? "rgba(22,163,74,0.12)"
                          : isMarketing
                          ? "rgba(245,158,11,0.12)"
                          : "rgba(99,102,241,0.12)",
                        color: isUtility ? "#16a34a" : isMarketing ? "#d97706" : "#6366f1",
                      }}
                    >
                      {item.category === "UTILITY" ? "Utilidade" : item.category === "MARKETING" ? "Marketing" : "Autenticação"}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Tag size={12} /> {item.segmentLabel}
                    </span>
                  </div>

                  {/* Título */}
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {item.title}
                  </h4>

                  {/* Snippet do Corpo */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13.5px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.45",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.bodyText}
                  </p>

                  {/* Dica Tática Soberana */}
                  <div
                    style={{
                      background: "rgba(43,92,230,0.06)",
                      borderLeft: "3px solid var(--primary)",
                      padding: "8px 10px",
                      borderRadius: "0 8px 8px 0",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.35",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--primary)" }}>Dica Tática: </span>
                    {item.tacticalTip}
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: "flex", gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    style={{ flex: 1 }}
                    prefixIcon={<Eye size={14} />}
                    onClick={() => setPreviewItem(item)}
                  >
                    Prévia
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    style={{ flex: 1.2 }}
                    loading={importingId === item.id}
                    prefixIcon={<DownloadCloud size={14} />}
                    onClick={() => void handleImport(item)}
                  >
                    Importar (1-Clique)
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Prévia Real WhatsApp */}
      {previewItem && (
        <Dialog
          isOpen={Boolean(previewItem)}
          onClose={() => setPreviewItem(null)}
          title={`Prévia: ${previewItem.title}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Simulador de WhatsApp */}
            <div
              style={{
                background: "#E5DDD5",
                borderRadius: "16px",
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxWidth: "380px",
                margin: "0 auto",
                width: "100%",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                boxSizing: "border-box",
              }}
            >
              {/* Balão de Mensagem */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: "4px 14px 14px 14px",
                  padding: "12px 14px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  color: "#111b21",
                  fontSize: "14px",
                  lineHeight: "1.45",
                }}
              >
                {previewItem.headerText && (
                  <b style={{ color: "#111b21", fontSize: "14px" }}>{previewItem.headerText}</b>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>{previewItem.bodyText}</div>
                {previewItem.footerText && (
                  <span style={{ fontSize: "11px", color: "#667781", marginTop: "2px" }}>
                    {previewItem.footerText}
                  </span>
                )}
              </div>

              {/* Botões do WhatsApp */}
              {previewItem.buttons?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {previewItem.buttons.map((btn, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "#fff",
                        borderRadius: "8px",
                        padding: "8px",
                        textAlign: "center",
                        color: "#00a884",
                        fontWeight: 600,
                        fontSize: "13.5px",
                        boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
                        cursor: "default",
                      }}
                    >
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadados e Dica */}
            <div
              style={{
                background: "var(--bg-canvas)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "13px",
              }}
            >
              <div>
                <b>Nome WABA (Meta):</b> <code style={{ color: "var(--primary)" }}>{previewItem.name}</code>
              </div>
              <div>
                <b>Categoria Meta:</b> {previewItem.category} | <b>Nicho:</b> {previewItem.segmentLabel}
              </div>
              <div>
                <b>Variáveis:</b> {previewItem.variables.map((v) => `{{${v}}}`).join(", ")}
              </div>
              <div style={{ marginTop: "4px", color: "var(--text-secondary)" }}>
                <b>Estratégia:</b> {previewItem.tacticalTip}
              </div>
            </div>

            {/* Ações do Modal */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="secondary" onClick={() => setPreviewItem(null)}>
                Fechar
              </Button>
              <Button
                variant="primary"
                loading={importingId === previewItem.id}
                prefixIcon={<DownloadCloud size={14} />}
                onClick={() => void handleImport(previewItem)}
              >
                Importar para Meus Modelos
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
