import { useEffect, useRef, useId, type FC } from "react";
import { X } from "lucide-react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
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

  // Focus restoration when drawer transitions from open -> closed
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      hasInitiallyFocusedRef.current = false;
      previouslyFocusedElementRef.current?.focus();
    }
  }, [isOpen]);

  // Clean-up on unmount if drawer was open
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        previouslyFocusedElementRef.current?.focus();
      }
    };
  }, []);

  // Keyboard trap & Escape listener & initial focus
  useEffect(() => {
    if (!isOpen) {
      hasInitiallyFocusedRef.current = false;
      return;
    }

    if (!hasInitiallyFocusedRef.current) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
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

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!hasInitiallyFocusedRef.current) {
      hasInitiallyFocusedRef.current = true;
      timer = setTimeout(() => {
        if (drawerRef.current) {
          // If user or browser already focused something inside the drawer, NEVER steal focus!
          if (drawerRef.current.contains(document.activeElement)) {
            return;
          }
          const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            drawerRef.current.focus();
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

  const effectivePosition = isMobile && position !== "left" ? "bottom" : position;
  const isLeft = effectivePosition === "left";
  const isBottom = effectivePosition === "bottom";

  return (
    <div
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
        className={`sos-drawer sos-drawer-${position}`}
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
          borderTop: isBottom ? "1px solid var(--border-default, #E2E8F0)" : "none",
          borderLeft: isLeft ? "none" : isBottom ? "none" : "1px solid var(--border-default, #E2E8F0)",
          borderRight: isLeft ? "1px solid var(--border-default, #E2E8F0)" : "none",
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
          <div>
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
              padding: "4px",
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
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
