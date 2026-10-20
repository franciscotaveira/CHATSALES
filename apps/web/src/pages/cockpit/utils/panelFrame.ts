import type { CSSProperties } from "react";

export const panelFrame = (isMobile: boolean): CSSProperties =>
  isMobile
    ? {
        borderBottom: "1px solid var(--border-default, #CBD5E1)",
      }
    : {
        border: "1px solid var(--border-default, #CBD5E1)",
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "var(--shadow-panel, 0 1px 3px rgba(15, 23, 42, 0.08), 0 6px 16px -4px rgba(15, 23, 42, 0.06))",
        overflow: "hidden",
      };

/** Gutter between framed panels on the canvas. */
export const PANEL_GAP = "var(--space-4, 16px)";
