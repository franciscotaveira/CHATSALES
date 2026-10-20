import { useRef, useId, type FC } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalSurface } from "../../hooks/useModalSurface";
import type { DialogProps } from "./Dialog.types";

export const Dialog: FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "520px",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalSurface(isOpen, dialogRef, onClose);

  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;

  if (!isOpen) return null;

  const dialogElement = (
    <div
      data-sos-overlay="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
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

      {/* Modal Dialog Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="sos-dialog bounded-container"
        style={{
          position: "relative",
          width: "100%",
          maxWidth,
          boxSizing: "border-box",
          overflow: "hidden",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100dvh - 32px)",
          outline: "none",
          fontFamily: "var(--font-sans, sans-serif)",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-default, #E2E8F0)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: "1.125rem",
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
                  fontSize: "0.875rem",
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
            aria-label="Fechar diálogo"
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

        {/* Body */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            minHeight: 0,
            flex: 1,
            overflowX: "hidden",
            width: "100%",
            boxSizing: "border-box",
            color: "var(--text-primary, #0F172A)",
            fontSize: "0.875rem",
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--border-default, #E2E8F0)",
              backgroundColor: "var(--bg-surface-subtle, #F8FAFC)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              flexWrap: "wrap",
              borderBottomLeftRadius: "var(--radius-lg, 12px)",
              borderBottomRightRadius: "var(--radius-lg, 12px)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(dialogElement, document.body);
  }

  return dialogElement;
};
