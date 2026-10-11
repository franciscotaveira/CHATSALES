import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Search, X, CornerDownLeft, ArrowUpDown } from "lucide-react";
import type { CommandPaletteProps, CommandCategory, CommandItem } from "./CommandPalette.types";

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: "Navegação Rápida",
  actions: "Ações do Sistema",
  workspaces: "Workspaces",
  entities: "Registros & Resultados",
};

const CATEGORY_ORDER: CommandCategory[] = ["navigation", "actions", "workspaces", "entities"];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export const CommandPalette: FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  items,
  placeholder = "Buscar páginas, comandos, ações ou alternar workspaces...",
  activeWorkspaceName,
  emptyMessage = "Nenhum resultado encontrado.",
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Filter items matching query
  const filteredItems = useMemo(() => {
    const cleanQuery = normalizeText(query);
    if (!cleanQuery) return items;

    return items.filter((item) => {
      const matchTitle = normalizeText(item.title).includes(cleanQuery);
      const matchSubtitle = item.subtitle ? normalizeText(item.subtitle).includes(cleanQuery) : false;
      const matchBadge = item.badge ? normalizeText(item.badge).includes(cleanQuery) : false;
      const matchKeywords = item.keywords?.some((k) => normalizeText(k).includes(cleanQuery)) ?? false;
      return matchTitle || matchSubtitle || matchBadge || matchKeywords;
    });
  }, [items, query]);

  // Group filtered items by category according to defined order
  const groupedItems = useMemo(() => {
    const groups: { category: CommandCategory; label: string; items: { item: CommandItem; globalIndex: number }[] }[] = [];
    let currentGlobalIndex = 0;

    for (const cat of CATEGORY_ORDER) {
      const catItems: { item: CommandItem; globalIndex: number }[] = [];
      for (const item of filteredItems) {
        if (item.category === cat) {
          catItems.push({ item, globalIndex: currentGlobalIndex });
          currentGlobalIndex++;
        }
      }
      if (catItems.length > 0) {
        groups.push({
          category: cat,
          label: CATEGORY_LABELS[cat] || cat,
          items: catItems,
        });
      }
    }

    // Catch any remaining categories not in predefined order
    const remainingItems: { item: CommandItem; globalIndex: number }[] = [];
    for (const item of filteredItems) {
      if (!CATEGORY_ORDER.includes(item.category)) {
        remainingItems.push({ item, globalIndex: currentGlobalIndex });
        currentGlobalIndex++;
      }
    }
    if (remainingItems.length > 0) {
      groups.push({
        category: "entities",
        label: "Outros",
        items: remainingItems,
      });
    }

    return groups;
  }, [filteredItems]);

  // Reset state when opened
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Reset selection index when query results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        selected.onSelect();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Busca Global e Paleta de Comandos"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "clamp(24px, 8vh, 80px) 16px 24px",
        boxSizing: "border-box",
        animation: "sos-fade-in 150ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "600px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderRadius: "var(--radius-xl, 16px)",
          boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border-default, #E2E8F0)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "clamp(380px, 70vh, 580px)",
          fontFamily: "var(--font-sans, sans-serif)",
          boxSizing: "border-box",
        }}
      >
        {/* Header / Input Region */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
            gap: "12px",
            backgroundColor: "var(--bg-surface, #FFFFFF)",
          }}
        >
          <Search size={18} color="var(--text-muted, #64748B)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
              fontSize: "1rem",
              color: "var(--text-primary, #0F172A)",
              fontFamily: "inherit",
              padding: 0,
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "2px",
                color: "var(--text-muted, #64748B)",
                display: "flex",
                alignItems: "center",
              }}
              title="Limpar busca"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd
              style={{
                fontSize: "0.75rem",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm, 4px)",
                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                border: "1px solid var(--border-default, #E2E8F0)",
                color: "var(--text-muted, #64748B)",
                fontWeight: 600,
              }}
            >
              ESC
            </kbd>
          )}
        </div>

        {/* Results Body */}
        <div
          ref={listRef}
          role="listbox"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0",
            maxHeight: "440px",
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                color: "var(--text-muted, #64748B)",
                fontSize: "0.875rem",
              }}
            >
              <p style={{ margin: "0 0 6px 0", fontWeight: 500, color: "var(--text-primary, #0F172A)" }}>
                {emptyMessage}
              </p>
              <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                Tente buscar por termos como <em>"cockpit"</em>, <em>"contatos"</em>, <em>"produtos"</em> ou o nome de um workspace.
              </p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.category} style={{ marginBottom: "6px" }}>
                <div
                  style={{
                    padding: "6px 16px 4px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted, #94A3B8)",
                  }}
                >
                  {group.label}
                </div>
                {group.items.map(({ item, globalIndex }) => {
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(globalIndex, el);
                        else itemRefs.current.delete(globalIndex);
                      }}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        item.onSelect();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      style={{
                        padding: "8px 16px",
                        margin: "0 8px",
                        borderRadius: "var(--radius-md, 8px)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        backgroundColor: isSelected
                          ? "var(--color-action-subtle, #E6F4F1)"
                          : "transparent",
                        transition: "background-color 100ms ease",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-md, 8px)",
                          backgroundColor: isSelected
                            ? "var(--color-action, #008069)"
                            : "var(--bg-canvas, #F8FAFC)",
                          color: isSelected ? "#FFFFFF" : "var(--text-secondary, #475569)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all 120ms ease",
                        }}
                      >
                        {item.icon || <Search size={16} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.875rem",
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected
                              ? "var(--color-action, #008069)"
                              : "var(--text-primary, #0F172A)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted, #64748B)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              marginTop: "1px",
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>

                      {item.badge && (
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full, 9999px)",
                            backgroundColor: isSelected
                              ? "rgba(0, 128, 105, 0.15)"
                              : "var(--bg-canvas, #F1F5F9)",
                            color: isSelected
                              ? "var(--color-action, #008069)"
                              : "var(--text-secondary, #475569)",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {item.badge}
                        </span>
                      )}

                      {isSelected && (
                        <CornerDownLeft
                          size={14}
                          color="var(--color-action, #008069)"
                          style={{ flexShrink: 0, opacity: 0.8 }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer Bar with Keyboard Shortcuts */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border-subtle, #F1F5F9)",
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "var(--text-muted, #64748B)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ArrowUpDown size={12} /> Navegar
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <kbd
                style={{
                  padding: "1px 4px",
                  borderRadius: "3px",
                  background: "var(--bg-surface, #FFF)",
                  border: "1px solid var(--border-default, #E2E8F0)",
                }}
              >
                ↵
              </kbd>{" "}
              Selecionar
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <kbd
                style={{
                  padding: "1px 4px",
                  borderRadius: "3px",
                  background: "var(--bg-surface, #FFF)",
                  border: "1px solid var(--border-default, #E2E8F0)",
                }}
              >
                ESC
              </kbd>{" "}
              Fechar
            </span>
          </div>

          {activeWorkspaceName && (
            <div
              style={{
                fontSize: "0.6875rem",
                color: "var(--text-secondary, #475569)",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "180px",
              }}
            >
              Workspace: <strong>{activeWorkspaceName}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
