import type { FC } from "react";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import type { NavItem } from "./AppShell.types";

interface SidebarProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: FC<SidebarProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
  collapsed,
  onToggleCollapse,
}) => {
  const width = collapsed ? "var(--sidebar-w-collapsed, 64px)" : "var(--sidebar-w, 232px)";

  return (
    <aside
      aria-label="Navegação Principal"
      style={{
        width,
        minWidth: width,
        height: "100dvh",
        backgroundColor: "var(--bg-sidebar, #0B132B)",
        color: "var(--text-sidebar, #F8FAFC)",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        transition: "width var(--transition-normal, 200ms cubic-bezier(0.4, 0, 0.2, 1))",
        zIndex: 20,
        position: "sticky",
        top: 0,
        overflowX: "hidden",
      }}
    >
      {/* Brand Logo Header */}
      <div
        style={{
          height: "var(--topbar-h, 56px)",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 16px" : "0 20px",
          gap: "12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-md, 8px)",
            backgroundColor: "var(--color-action, #008069)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "1rem",
            flexShrink: 0,
            boxShadow: "0 0 12px rgba(0, 128, 105, 0.35)",
          }}
          aria-hidden="true"
        >
          <MessageSquareText size={18} />
        </div>

        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <span
              style={{
                fontSize: "var(--font-size-base, 1rem)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#FFFFFF",
                whiteSpace: "nowrap",
              }}
            >
              SOS Vendas
            </span>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav
        style={{
          flex: 1,
          padding: "12px 6px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          overflowY: "auto",
        }}
      >
        {navItems.map((item) => {
          const isActive = item.id === activeNavId;

          return (
            <button
              key={item.id}
              data-nav-id={item.id}
              type="button"
              className={`sos-nav-item ${isActive ? "sos-nav-item-active" : ""}`}
              onClick={() => {
                if (item.onClick) item.onClick();
                onNavSelect(item.id);
              }}
              disabled={item.disabled}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
                height: "var(--control-h-md, 40px)",
                padding: collapsed ? "0" : "0 12px",
                borderRadius: "var(--radius-md, 8px)",
                border: "none",
                borderLeft: isActive
                  ? "3px solid var(--color-action-accent, #00A884)"
                  : "3px solid transparent",
                backgroundColor: isActive
                  ? "var(--bg-sidebar-hover, #152243)"
                  : "transparent",
                color: isActive
                  ? "var(--color-action-accent, #00A884)"
                  : item.disabled
                  ? "rgba(148, 163, 184, 0.4)"
                  : "var(--text-sidebar-muted, #94A3B8)",
                cursor: item.disabled ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "var(--font-sans, sans-serif)",
                fontSize: "var(--font-size-sm, 0.875rem)",
                fontWeight: 500,
                justifyContent: collapsed ? "center" : "flex-start",
                transition: "background-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  width: "20px",
                  height: "20px",
                  color: isActive ? "var(--color-action-accent, #00A884)" : "inherit",
                }}
              >
                {item.icon}
              </span>

              {!collapsed && (
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
              )}

              {!collapsed && item.badge !== undefined && (
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: "var(--radius-full, 9999px)",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    fontWeight: 500,
                    backgroundColor: isActive
                      ? "var(--color-action, #008069)"
                      : "rgba(255, 255, 255, 0.1)",
                    color: "#FFFFFF",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle Footer */}
      {onToggleCollapse && (
        <div
          style={{
            padding: "12px 8px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-sidebar-muted, #94A3B8)",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-sm, 6px)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      )}
    </aside>
  );
};
