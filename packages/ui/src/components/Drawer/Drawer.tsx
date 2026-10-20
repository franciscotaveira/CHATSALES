import { useRef, useId, type FC } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useModalSurface } from "../../hooks/useModalSurface";
import type { DrawerProps } from "./Drawer.types";

export const Drawer: FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  position = "right",
  width = "380px",
  height,
  children,
  footer,
}) => {
  const { isMobile } = useBreakpoint();
  const drawerRef = useRef<HTMLDivElement>(null);
  useModalSurface(isOpen, drawerRef, onClose);

  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;

  if (!isOpen) return null;

  const effectivePosition = isMobile && position !== "left" ? "bottom" : position;
  const isLeft = effectivePosition === "left";
  const isBottom = effectivePosition === "bottom";

  const drawerElement = (
    <div data-sos-overlay="drawer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        justifyContent: isLeft ? "flex-start" : isBottom ? "center" : "flex-end",
        alignItems: isBottom ? "flex-end" : "stretch",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="sos-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(11, 15, 23, 0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`sos-drawer sos-drawer-${effectivePosition}`}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: isBottom ? "100%" : width,
          height: isBottom ? (height || "auto") : "100%",
          maxHeight: isBottom ? (height || "85dvh") : "100%",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          outline: "none",
          fontFamily: "var(--font-sans, sans-serif)",
          zIndex: 1,
          borderRadius: isBottom ? "var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0" : 0,
          borderTop: isBottom ? "1px solid var(--border-default, #CBD5E1)" : "none",
          borderLeft: isLeft ? "none" : isBottom ? "none" : "1px solid var(--border-default, #CBD5E1)",
          borderRight: isLeft ? "1px solid var(--border-default, #CBD5E1)" : "none",
        }}
      >
        {/* Mobile drag handle for bottom sheet */}
        {isBottom && (
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "var(--border-strong, #CBD5E1)",
              margin: "8px auto 0 auto",
            }}
            aria-hidden="true"
          />
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default, #E2E8F0)",
          }}
        >
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: "var(--font-size-lg, 1.125rem)",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
              }}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "var(--font-size-sm, 0.875rem)",
                  color: "var(--text-secondary, #475569)",
                }}
              >
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted, #64748B)",
              padding: "8px",
              minWidth: "40px",
              minHeight: "40px",
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm, 6px)",
              display: "inline-flex",
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "20px",
            overflowY: "auto",
            overflowX: "auto",
            minHeight: 0,
            flex: 1,
            color: "var(--text-primary, #0F172A)",
            fontSize: "var(--font-size-sm, 0.875rem)",
            lineHeight: "var(--line-height-normal, 1.5)",
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: isBottom
                ? "14px 20px calc(14px + env(safe-area-inset-bottom, 0px))"
                : "14px 20px",
              borderTop: "1px solid var(--border-default, #E2E8F0)",
              backgroundColor: "var(--bg-surface-subtle, #F8FAFC)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            flexWrap: "wrap",
            flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? drawerElement : createPortal(drawerElement, document.body);
};
