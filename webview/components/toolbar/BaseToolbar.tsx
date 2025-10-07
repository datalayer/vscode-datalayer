/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Base toolbar component providing consistent layout and styling with automatic overflow handling.
 * Used by both NotebookToolbar and LexicalToolbar.
 *
 * @module components/toolbar/BaseToolbar
 */

import React, { useRef, useState, useEffect } from "react";
import { OverflowMenu } from "./OverflowMenu";
import type { OverflowMenuAction } from "./OverflowMenu";

export interface ToolbarAction {
  id: string;
  icon?: string;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  priority: number;
  active?: boolean;
}

export interface BaseToolbarProps {
  /** Toolbar actions with priority-based ordering (lower priority = shown first) */
  actions?: ToolbarAction[];
  /** Custom rendered left content (rendered before actions) */
  leftContent?: React.ReactNode;
  /** Right-aligned toolbar content (runtime controls) */
  rightContent?: React.ReactNode;
  /** Whether the toolbar should stick to the top */
  sticky?: boolean;
  /** Whether to show a shadow when content is scrolled */
  showScrollShadow?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Estimated width per button for overflow calculation (default: 80px) */
  estimatedButtonWidth?: number;
  /** Reserved width for right content (default: calculated from rightContent) */
  reservedRightWidth?: number;
  /** Reserved width for left content (default: 0) */
  reservedLeftWidth?: number;
  /** Function to render action buttons (allows custom rendering) */
  renderAction?: (action: ToolbarAction) => React.ReactNode;
  /** Whether actions are disabled */
  disabled?: boolean;
}

/**
 * Base toolbar component with consistent styling, layout, and automatic overflow handling.
 * Provides left/right content areas matching VS Code's native toolbar appearance.
 * Automatically manages overflow menu when actions don't fit in available width.
 */
export const BaseToolbar: React.FC<BaseToolbarProps> = ({
  actions = [],
  leftContent,
  rightContent,
  sticky = false,
  className = "",
  estimatedButtonWidth = 80,
  reservedRightWidth,
  reservedLeftWidth = 0,
  renderAction,
  disabled = false,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(actions.length);

  // Measure and adjust visible count based on available width
  useEffect(() => {
    if (!actions.length) return undefined;

    const adjustVisibleButtons = () => {
      if (!toolbarRef.current) return;

      const toolbarWidth = toolbarRef.current.offsetWidth;
      const rightContentWidth = reservedRightWidth ?? 220; // Default estimate if not provided
      const leftContentWidth = reservedLeftWidth;
      const reservedForOverflow = 40; // Space for overflow menu button
      const availableWidth =
        toolbarWidth -
        rightContentWidth -
        leftContentWidth -
        reservedForOverflow -
        20;

      const maxButtons = Math.floor(availableWidth / estimatedButtonWidth);
      setVisibleCount(Math.max(0, Math.min(maxButtons, actions.length)));
    };

    adjustVisibleButtons();
    window.addEventListener("resize", adjustVisibleButtons);
    return () => window.removeEventListener("resize", adjustVisibleButtons);
  }, [
    actions.length,
    estimatedButtonWidth,
    reservedRightWidth,
    reservedLeftWidth,
  ]);

  const visibleActions = actions.slice(0, visibleCount);
  const overflowActions: OverflowMenuAction[] = actions
    .slice(visibleCount)
    .map((a) => ({
      id: a.id,
      icon: a.icon,
      label: a.label,
      onClick: a.onClick,
      disabled: a.disabled || disabled,
      active: a.active,
    }));

  return (
    <div
      ref={toolbarRef}
      className={className}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2px 8px",
        backgroundColor: "var(--vscode-editor-background)",
        borderBottom: "none",
        position: sticky ? "sticky" : "relative",
        top: sticky ? 0 : undefined,
        zIndex: sticky ? 100 : undefined,
        minHeight: "32px",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "2px",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {leftContent}
        {actions.length > 0 && (
          <>
            {visibleActions.map((action) =>
              renderAction ? (
                <React.Fragment key={action.id}>
                  {renderAction(action)}
                </React.Fragment>
              ) : (
                <button
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled || disabled}
                  title={action.title}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    border: "none",
                    background: "transparent",
                    color: "var(--vscode-foreground)",
                    cursor: action.disabled ? "not-allowed" : "pointer",
                    opacity: action.disabled ? 0.5 : 1,
                  }}
                >
                  {action.icon && <i className={action.icon} />}
                  <span>{action.label}</span>
                </button>
              ),
            )}
            {overflowActions.length > 0 && (
              <OverflowMenu actions={overflowActions} />
            )}
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexShrink: 0,
          marginLeft: "auto",
        }}
      >
        {rightContent}
      </div>
    </div>
  );
};
