import { useEffect, useRef, useId, type FC } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const hasInitiallyFocusedRef = useRef(false);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;

  // Focus restoration when dialog transitions from open -> closed
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      hasInitiallyFocusedRef.current = false;
      previouslyFocusedElementRef.current?.focus();
    }
  }, [isOpen]);

  // Clean-up on unmount if dialog was open
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        previouslyFocusedElementRef.current?.focus();
      }
    };
  }, []);

  // Focus trap & Escape listener
  useEffect(() => {
    if (!isOpen) {
      hasInitiallyFocusedRef.current = false;
      return;
    }

    // Store active element to restore focus on close (only once upon open)
    if (!hasInitiallyFocusedRef.current) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const isReverseTab = e.shiftKey;

        if (isReverseTab) {
          if (document.activeElement === firstElement && lastElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement && firstElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Initial focus on dialog container or first focusable ONLY ONCE on opening
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!hasInitiallyFocusedRef.current) {
      hasInitiallyFocusedRef.current = true;
      timer = setTimeout(() => {
        if (dialogRef.current) {
          // If user or browser already focused something inside the dialog, do not steal it
          if (dialogRef.current.contains(document.activeElement)) {
            return;
          }
          const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
            'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            dialogRef.current.focus();
          }
        }
      }, 50);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const dialogElement = (
    <div
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
          maxHeight: "calc(100vh - 32px)",
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
          <div>
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
              padding: "4px",
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
