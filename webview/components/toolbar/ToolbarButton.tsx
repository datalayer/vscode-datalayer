/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Reusable toolbar button component with VS Code native styling.
 * Used across all toolbars for consistent appearance.
 *
 * @module components/toolbar/ToolbarButton
 */

import React from "react";

export interface ToolbarButtonProps {
  /** Icon class name (e.g., "codicon codicon-add") */
  icon?: string;
  /** Button text label */
  label?: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button title (tooltip) */
  title?: string;
  /** Whether to show a loading spinner */
  loading?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
}

/**
 * Toolbar button component matching VS Code's native button appearance.
 * Supports icons, text labels, loading states, and disabled states.
 */
export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  title,
  loading = false,
  className = "",
  style = {},
}) => {
  const buttonClasses = [
    className,
    disabled ? "disabled" : "",
    loading ? "loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconClasses = loading
    ? "codicon codicon-loading codicon-modifier-spin"
    : icon;

  const handleClick = React.useCallback(() => {
    console.log("[ToolbarButton] CLICKED", {
      label,
      title,
      hasOnClick: !!onClick,
      disabled,
      loading,
    });
    if (onClick && !disabled && !loading) {
      onClick();
    }
  }, [onClick, label, title, disabled, loading]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      title={title}
      className={buttonClasses}
      style={{
        display: "flex",
        alignItems: "center",
        gap: label ? "6px" : "0",
        padding: label ? "2px 6px" : "4px",
        border: "1px solid transparent",
        borderRadius: "2px",
        backgroundColor: "transparent",
        color: "var(--vscode-foreground)",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        fontSize: "13px",
        fontFamily: "var(--vscode-font-family)",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color 0.1s, border-color 0.1s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.backgroundColor =
            "var(--vscode-toolbar-hoverBackground)";
          e.currentTarget.style.borderColor =
            "var(--vscode-contrastBorder, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {iconClasses && (
        <i
          className={iconClasses}
          style={{ fontSize: "16px", minWidth: "16px" }}
        />
      )}
      {label && (
        <span style={{ whiteSpace: "nowrap", fontWeight: "normal" }}>
          {label}
        </span>
      )}
    </button>
  );
};
