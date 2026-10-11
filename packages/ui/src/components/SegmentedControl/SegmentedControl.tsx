import type { FC } from "react";
import type { SegmentedControlProps } from "./SegmentedControl.types";

export const SegmentedControl: FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  size,
  className = "",
  style,
  "aria-label": ariaLabel = "Filtros de Segmento",
}) => {
  const isCompact = size === "sm" || options.length >= 4;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`sos-segmented-control ${className}`}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        height: "var(--control-h-sm, 32px)",
        padding: "2px",
        backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
        borderRadius: "var(--radius-md, 8px)",
        boxSizing: "border-box",
        border: "1px solid var(--border-default, #E2E8F0)",
        gap: "2px",
        ...style,
      }}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            className={`sos-segmented-item ${isSelected ? "sos-segmented-item-selected" : ""}`}
            onClick={() => !option.disabled && onChange(option.value)}
            style={{
              flex: 1,
              minWidth: 0,
              height: "calc(var(--control-h-sm, 32px) - 6px)",
              padding: isCompact ? "0 4px" : "0 10px",
              border: "none",
              borderRadius: "calc(var(--radius-md, 8px) - 2px)",
              backgroundColor: isSelected ? "var(--bg-surface, #FFFFFF)" : "transparent",
              color: isSelected ? "var(--text-primary, #0F172A)" : "var(--text-secondary, #475569)",
              boxShadow: isSelected ? "var(--shadow-xs, 0 1px 2px 0 rgba(0, 0, 0, 0.05))" : "none",
              fontSize: isCompact ? "var(--font-size-xs, 0.75rem)" : "var(--font-size-sm, 0.875rem)",
              fontWeight: 500,
              fontFamily: "var(--font-sans, sans-serif)",
              cursor: option.disabled ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: isCompact ? "4px" : "6px",
              whiteSpace: "nowrap",
              transition: "background-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease), box-shadow var(--transition-fast, 150ms ease)",
              boxSizing: "border-box",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{option.label}</span>
            {option.badge !== undefined && (
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: "var(--radius-full, 9999px)",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: 600,
                  backgroundColor: isSelected
                    ? "var(--color-action-subtle, #E6F4F1)"
                    : "var(--bg-canvas, #F8FAFC)",
                  color: isSelected
                    ? "var(--color-action, #008069)"
                    : "var(--text-muted, #64748B)",
                }}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
