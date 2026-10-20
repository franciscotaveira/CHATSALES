import type { FC } from "react";
import type { NavItem } from "./AppShell.types";

interface MobileNavProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  hidden?: boolean;
}

export const MobileNav: FC<MobileNavProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
  hidden = false,
}) => {
  if (hidden) return null;

  // Mobile nav shows up to 5 primary items
  const displayItems = navItems.slice(0, 5);

  return (
    <nav
      aria-label="Navegação Inferior Mobile"
      className="sos-mobile-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(var(--mobile-nav-h, 56px) + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        borderTop: "1px solid var(--border-default, #CBD5E1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        zIndex: 30,
        boxShadow: "0 -2px 10px rgba(15, 23, 42, 0.08)",
      }}
    >
      {displayItems.map((item) => {
        const isActive = item.id === activeNavId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.onClick) item.onClick();
              onNavSelect(item.id);
            }}
            aria-label={item.label}
            title={item.label}
            aria-current={isActive ? "page" : undefined}
            disabled={item.disabled}
            style={{
              flex: "1 1 0",
              minWidth:0,
              padding:"4px",
              height: "100%",
              minHeight: "44px", // Accessible touch target
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              background: "none",
              border: "none",
              color: isActive
                ? "var(--color-action, #008069)"
                : "var(--text-secondary, #64748B)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              fontSize: "11px",
              fontWeight: isActive ? 600 : 500,
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center",flexShrink:0 }}>
              {item.icon}
            </span>
            <span style={{whiteSpace:"normal",overflowWrap:"anywhere",maxWidth:"100%",lineHeight:1.15,textAlign:"center"}}>
              {item.mobileLabel || item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
