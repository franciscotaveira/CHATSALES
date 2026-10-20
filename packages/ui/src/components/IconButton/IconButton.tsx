import { forwardRef, type CSSProperties } from "react";
import type { IconButtonProps } from "./IconButton.types";

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      "aria-label": ariaLabel,
      icon,
      size = "sm",
      variant = "ghost",
      tooltip,
      loading = false,
      disabled = false,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Strict square dimension matching control height scale
    const sizeDimensions: Record<string, string> = {
      xs: "var(--control-h-xs, 28px)",
      sm: "var(--control-h-sm, 32px)",
      md: "var(--control-h-md, 40px)",
    };

    const side = sizeDimensions[size] || "var(--control-h-sm, 32px)";

    const variantStyles: Record<string, CSSProperties> = {
      ghost: {
        backgroundColor: "transparent",
        color: "var(--text-secondary, #475569)",
        border: "1px solid transparent",
      },
      secondary: {
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        color: "var(--text-primary, #0F172A)",
        border: "1px solid var(--border-strong, #CBD5E1)",
        boxShadow: "var(--shadow-xs)",
      },
      outline: {
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        color: "var(--text-primary, #0F172A)",
        border: "1px solid var(--border-strong, #CBD5E1)",
      },
      primary: {
        backgroundColor: "var(--color-action, #008069)",
        backgroundImage: "linear-gradient(180deg, #00A884 0%, #008069 100%)",
        color: "var(--text-inverse, #FFFFFF)",
        border: "1px solid rgba(0, 100, 80, 0.45)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 1px 2px rgba(15, 23, 42, 0.12)",
      },
      danger: {
        backgroundColor: "var(--color-danger, #DC2626)",
        backgroundImage: "linear-gradient(180deg, #EF4444 0%, #DC2626 100%)",
        color: "var(--text-inverse, #FFFFFF)",
        border: "1px solid rgba(185, 28, 28, 0.45)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.20), 0 1px 2px rgba(15, 23, 42, 0.12)",
      },
    };

    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        title={tooltip || ariaLabel}
        disabled={isDisabled}
        aria-busy={loading}
        className={`sos-icon-button sos-icon-button-${variant} sos-icon-button-${size} ${className}`}
        style={{
          width: side,
          height: side,
          minWidth: side,
          minHeight: side,
          maxWidth: side,
          maxHeight: side,
          padding: 0,
          borderRadius: "var(--radius-md, 8px)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.6 : 1,
          transition: "background-color var(--transition-fast, 150ms ease), border-color var(--transition-fast, 150ms ease), opacity var(--transition-fast, 150ms ease)",
          boxSizing: "border-box",
          flexShrink: 0,
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <span
            style={{
              width: "14px",
              height: "14px",
              border: "2px solid currentColor",
              borderRightColor: "transparent",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.6s linear infinite",
            }}
            aria-hidden="true"
          />
        ) : (
          icon
        )}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
