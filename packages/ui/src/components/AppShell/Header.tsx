import { useState, useRef, useEffect, type FC, type ReactNode } from "react";
import { Building2, ChevronDown, Check, Menu, Search, LogOut, Plus } from "lucide-react";
import type { WorkspaceItem } from "./AppShell.types";

interface HeaderProps {
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem | null;
  onWorkspaceSelect?: (workspace: WorkspaceItem) => void;
  isLoadingWorkspaces?: boolean;
  onCreateWorkspaceClick?: () => void;
  userEmail?: string;
  userRole?: string;
  onLogout?: () => void;
  systemStatus?: {
    label: string;
    shortLabel?: string;
    tooltip?: string;
    variant: "action" | "operational" | "warning" | "danger" | "neutral";
  };
  onOpenMobileMenu?: () => void;
  actions?: ReactNode;
  isMobile?: boolean;
  onSearchClick?: () => void;
}

export const Header: FC<HeaderProps> = ({
  workspaces = [],
  activeWorkspace,
  onWorkspaceSelect,
  isLoadingWorkspaces = false,
  onCreateWorkspaceClick,
  userEmail,
  userRole = "owner",
  onLogout,
  systemStatus,
  onOpenMobileMenu,
  actions,
  isMobile = false,
  onSearchClick,
}) => {
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isMobileView = isMobile || Boolean(onOpenMobileMenu);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setIsWorkspaceDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Compute initials for Avatar
  const getInitials = () => {
    if (!userEmail) return "U";
    const namePart = userEmail.split("@")[0] || "U";
    const clean = namePart.replace(/[^a-zA-Z]/g, "").toUpperCase();
    return clean.slice(0, 2) || "U";
  };

  // Status dot color mapping
  const statusDotColor =
    systemStatus?.variant === "action"
      ? "var(--color-action, #008069)"
      : systemStatus?.variant === "danger"
      ? "var(--color-danger, #DC2626)"
      : systemStatus?.variant === "warning"
      ? "var(--color-warning, #D97706)"
      : "var(--color-operational, #2563EB)";

  const formattedRole = userRole
    ? userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
    : "Owner";

  return (
    <header
      className="sos-app-header"
      style={{
        height: "var(--topbar-h, 56px)",
        backgroundColor: "rgba(255, 255, 255, 0.90)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-default, #E2E8F0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobileView ? "0 12px" : "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 15,
        fontFamily: "var(--font-sans, sans-serif)",
        width: "100%",
        boxSizing: "border-box",
        gap: "12px",
      }}
    >
      {/* 1. Left Region: Mobile Trigger + Workspace Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu de navegação"
            className="sos-mobile-menu-btn"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary, #0F172A)",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm, 6px)",
              width: "var(--control-h-sm, 32px)",
              height: "var(--control-h-sm, 32px)",
              flexShrink: 0,
            }}
          >
            <Menu size={20} />
          </button>
        )}

        {/* Workspace Selector Dropdown (sm: 32px) */}
        <div ref={workspaceRef} style={{ position: "relative", minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
            aria-expanded={isWorkspaceDropdownOpen}
            aria-haspopup="listbox"
            className="sos-workspace-trigger"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 10px",
              height: "var(--control-h-sm, 32px)",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              color: "var(--text-primary, #0F172A)",
              fontSize: "var(--font-size-sm, 0.875rem)",
              fontWeight: 500,
              cursor: "pointer",
              transition: "border-color var(--transition-fast, 150ms ease)",
              maxWidth: isMobileView ? "160px" : "220px",
              boxSizing: "border-box",
            }}
          >
            <Building2 size={15} color="var(--color-action, #008069)" style={{ flexShrink: 0 }} />
            <span
              style={{
                maxWidth: isMobileView ? "90px" : "150px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "var(--font-size-sm, 0.875rem)",
              }}
            >
              {isLoadingWorkspaces
                ? "Carregando..."
                : activeWorkspace?.name || "Selecionar Negócio"}
            </span>
            <ChevronDown size={14} color="var(--text-muted, #64748B)" style={{ flexShrink: 0 }} />
          </button>

          {isWorkspaceDropdownOpen && (
            <div
              role="listbox"
              aria-label="Workspaces disponíveis"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                width: "260px",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-default, #E2E8F0)",
                borderRadius: "var(--radius-md, 8px)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  padding: "6px 8px",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--text-muted, #64748B)",
                  letterSpacing: "0.04em",
                }}
              >
                Negócios Ativos
              </div>

              {workspaces.length === 0 ? (
                <div
                  style={{
                    padding: "8px",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    color: "var(--text-muted, #64748B)",
                  }}
                >
                  Nenhum workspace vinculado.
                </div>
              ) : (
                workspaces.map((ws) => {
                  const isSelected = activeWorkspace?.id === ws.id;

                  return (
                    <button
                      key={ws.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        if (onWorkspaceSelect) onWorkspaceSelect(ws);
                        setIsWorkspaceDropdownOpen(false);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        height: "var(--control-h-md, 40px)",
                        borderRadius: "var(--radius-sm, 6px)",
                        border: "none",
                        backgroundColor: isSelected
                          ? "var(--color-action-subtle, #E6F4F1)"
                          : "transparent",
                        color: isSelected
                          ? "var(--color-action, #008069)"
                          : "var(--text-primary, #0F172A)",
                        fontSize: "var(--font-size-sm, 0.875rem)",
                        fontWeight: isSelected ? 600 : 400,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ws.name}
                      </span>
                      {isSelected && (
                        <Check size={14} color="var(--color-action, #008069)" />
                      )}
                    </button>
                  );
                })
              )}

              {onCreateWorkspaceClick && (
                <div style={{ borderTop: "1px solid var(--border-default, #E2E8F0)", marginTop: "4px", paddingTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorkspaceDropdownOpen(false);
                      onCreateWorkspaceClick();
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm, 6px)",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--color-action, #008069)",
                      fontSize: "var(--font-size-sm, 0.875rem)",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background-color 150ms ease",
                      boxSizing: "border-box",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-action-subtle, #E6F4F1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <Plus size={15} style={{ flexShrink: 0 }} />
                    <span>Criar Nova Empresa</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Center Region: Global Search (Desktop/Tablet) */}
      {!isMobileView && (
        <div
          role="button"
          tabIndex={0}
          className="sos-search-trigger"
          onClick={onSearchClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSearchClick?.();
            }
          }}
          style={{
            flex: 1,
            maxWidth: "380px",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            height: "var(--control-h-sm, 32px)",
            borderRadius: "var(--radius-md, 8px)",
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            border: "1px solid var(--border-default, #E2E8F0)",
            color: "var(--text-muted, #64748B)",
            fontSize: "var(--font-size-sm, 0.875rem)",
            gap: "8px",
            cursor: "pointer",
          }}
          title="Busca global em conversas, leads e produtos (⌘K)"
        >
          <Search size={14} />
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Buscar no sistema...
          </span>
          <kbd
            style={{
              fontSize: "0.6875rem",
              padding: "1px 5px",
              borderRadius: "var(--radius-sm, 4px)",
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              border: "1px solid var(--border-default, #E2E8F0)",
              color: "var(--text-muted, #64748B)",
              fontWeight: 600,
            }}
          >
            ⌘K
          </kbd>
        </div>
      )}

      {/* 3. Right Region: Status Indicator + Actions + User Avatar Menu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        {isMobileView && onSearchClick && (
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Abrir busca global"
            style={{
              border: "none",
              background: "none",
              padding: "6px",
              cursor: "pointer",
              color: "var(--text-secondary, #475569)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md, 8px)",
            }}
            title="Busca global (⌘K)"
          >
            <Search size={18} />
          </button>
        )}

        {actions}

        {/* System Connection Dot with xs text */}
        {systemStatus && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "var(--radius-full, 9999px)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-secondary, #475569)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
            title={systemStatus.tooltip || systemStatus.label}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: statusDotColor,
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            <span>{isMobileView && systemStatus.shortLabel ? systemStatus.shortLabel : systemStatus.label}</span>
          </div>
        )}

        {/* User Profile Avatar with dropdown menu */}
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            aria-expanded={isUserMenuOpen}
            aria-label="Menu do Usuário"
            className="sos-user-avatar-btn"
            style={{
              width: "var(--control-h-sm, 32px)",
              height: "var(--control-h-sm, 32px)",
              borderRadius: "50%",
              backgroundColor: "var(--color-action-subtle, #E6F4F1)",
              border: "1px solid var(--color-action-border, #80C0B4)",
              color: "var(--color-action, #008069)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {getInitials()}
          </button>

          {isUserMenuOpen && (
            <div
              role="menu"
              aria-label="Opções do Usuário"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: "220px",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-default, #E2E8F0)",
                borderRadius: "var(--radius-md, 8px)",
                boxShadow: "var(--shadow-md)",
                padding: "6px",
                zIndex: 50,
              }}
            >
              {/* User Profile Info */}
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-default, #E2E8F0)" }}>
                <div
                  style={{
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 500,
                    color: "var(--text-primary, #0F172A)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {userEmail || "Operador"}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-muted, #64748B)",
                    marginTop: "2px",
                  }}
                >
                  Papel: <strong style={{ color: "var(--text-primary, #0F172A)" }}>{formattedRole}</strong>
                </div>
              </div>

              {/* Sair action */}
              {onLogout && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 10px",
                    marginTop: "4px",
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "none",
                    background: "none",
                    color: "var(--color-danger, #DC2626)",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <LogOut size={14} />
                  <span>Sair da Conta</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
