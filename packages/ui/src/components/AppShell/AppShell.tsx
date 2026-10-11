import { useState, type FC } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Drawer } from "../Drawer/Drawer";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import type { AppShellProps } from "./AppShell.types";

export const AppShell: FC<AppShellProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
  workspaces,
  activeWorkspace,
  onWorkspaceSelect,
  isLoadingWorkspaces,
  onCreateWorkspaceClick,
  userEmail,
  userRole,
  onLogout,
  systemStatus,
  children,
  headerActions,
  noPadding = false,
  hideMobileNav = false,
  onSearchClick,
  sidebarCollapsed: controlledCollapsed,
  onSidebarCollapseToggle,
}) => {
  const { isMobile, isTablet } = useBreakpoint();

  // Stored sidebar collapse state
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("sos_sales_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Tablet forces collapsed sidebar (64px) for compact efficiency
  const effectiveCollapsed = isTablet
    ? true
    : controlledCollapsed !== undefined
    ? controlledCollapsed
    : internalCollapsed;

  const handleToggleCollapse = () => {
    const next = !effectiveCollapsed;
    if (onSidebarCollapseToggle) {
      onSidebarCollapseToggle();
    } else {
      setInternalCollapsed(next);
    }
    try {
      localStorage.setItem("sos_sales_sidebar_collapsed", String(next));
    } catch {
      // Storage unavailable or disabled
    }
  };

  return (
    <div
      className="sos-app-shell"
      style={{
        display: "flex",
        height: "100dvh",
        maxHeight: "100dvh",
        backgroundColor: "var(--bg-canvas, #F8FAFC)",
        color: "var(--text-primary, #0F172A)",
        fontFamily: "var(--font-sans, sans-serif)",
        overflow: "hidden",
        width: "100%",
        maxWidth: "100vw",
      }}
    >
      {/* Desktop & Tablet Sidebar (Hidden on Mobile) */}
      {!isMobile && (
        <Sidebar
          navItems={navItems}
          activeNavId={activeNavId}
          onNavSelect={onNavSelect}
          collapsed={effectiveCollapsed}
          onToggleCollapse={isTablet ? undefined : handleToggleCollapse}
        />
      )}

      {/* Mobile Drawer Navigation */}
      {isMobile && (
        <Drawer
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          title="SOS Sales"
          description="Navegação do Operador"
          position="left"
          width="280px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {navItems.map((item) => {
              const isActive = item.id === activeNavId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.onClick) item.onClick();
                    onNavSelect(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={item.disabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "0 12px",
                    height: "var(--control-h-md, 40px)",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "none",
                    borderLeft: isActive
                      ? "3px solid var(--color-action, #008069)"
                      : "3px solid transparent",
                    backgroundColor: isActive
                      ? "var(--color-action-subtle, #E6F4F1)"
                      : "transparent",
                    color: isActive
                      ? "var(--color-action, #008069)"
                      : "var(--text-primary, #0F172A)",
                    cursor: item.disabled ? "not-allowed" : "pointer",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: isActive ? 600 : 500,
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Drawer>
      )}

      {/* Right Main Region: Header + Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100dvh",
          maxHeight: "100dvh",
          overflow: "hidden",
          paddingBottom: isMobile && !hideMobileNav
            ? "calc(var(--mobile-nav-h, 56px) + env(safe-area-inset-bottom, 0px))"
            : 0,
        }}
      >
        <Header
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onWorkspaceSelect={onWorkspaceSelect}
          isLoadingWorkspaces={isLoadingWorkspaces}
          onCreateWorkspaceClick={onCreateWorkspaceClick}
          userEmail={userEmail}
          userRole={userRole}
          onLogout={onLogout}
          systemStatus={systemStatus}
          onOpenMobileMenu={isMobile ? () => setIsMobileMenuOpen(true) : undefined}
          actions={headerActions}
          isMobile={isMobile}
          onSearchClick={onSearchClick}
        />

        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflowY: noPadding ? "hidden" : "auto",
            overflowX: "hidden",
            padding: noPadding
              ? 0
              : isMobile
              ? "var(--space-4, 16px)"
              : "var(--space-6, 24px)",
            outline: "none",
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <MobileNav
          navItems={navItems}
          activeNavId={activeNavId}
          onNavSelect={onNavSelect}
          hidden={hideMobileNav}
        />
      )}
    </div>
  );
};
