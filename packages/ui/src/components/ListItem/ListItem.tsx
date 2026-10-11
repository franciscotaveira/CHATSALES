import type { FC } from "react";
import type { ListItemProps, ListItemHeight } from "./ListItem.types";

export const ListItem: FC<ListItemProps> = ({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  height = "lg",
  selected = false,
  onClick,
  className = "",
  style,
  disabled = false,
  "aria-label": ariaLabel,
}) => {
  const heightMap: Record<ListItemHeight, string> = {
    sm: "56px",
    md: "64px",
    lg: "72px",
  };

  const currentHeight = heightMap[height];

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-selected={selected}
      aria-label={ariaLabel}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={(e) => {
        if (!disabled && onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`sos-list-item ${selected ? "sos-list-item-selected" : ""} ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        height: currentHeight,
        minHeight: currentHeight,
        maxHeight: currentHeight,
        padding: "0 var(--space-4, 16px)",
        backgroundColor: selected
          ? "var(--color-action-subtle, #E6F4F1)"
          : "var(--bg-surface, #FFFFFF)",
        borderLeft: selected
          ? "3px solid var(--color-action, #008069)"
          : "3px solid transparent",
        borderBottom: "1px solid var(--border-default, #E2E8F0)",
        cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color var(--transition-fast, 150ms ease), border-color var(--transition-fast, 150ms ease)",
        boxSizing: "border-box",
        width: "100%",
        gap: "var(--space-3, 12px)",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Leading Slot (e.g. Avatar / Checkbox) */}
      {leading && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          {leading}
        </div>
      )}

      {/* Main Column: Title + Subtitle */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
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
            {title}
          </div>

          {meta && (
            <div
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-muted, #64748B)",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {meta}
            </div>
          )}
        </div>

        {subtitle && (
          <div
            style={{
              fontSize: "var(--font-size-sm, 0.875rem)",
              fontWeight: 400,
              color: "var(--text-secondary, #475569)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Trailing Slot (e.g. Unread badge, icon, chevron) */}
      {trailing && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          {trailing}
        </div>
      )}
    </div>
  );
};
