/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Generic overflow menu component for collapsing toolbar actions.
 * Used by LexicalToolbar to hide formatting buttons in a dropdown.
 *
 * @module components/toolbar/OverflowMenu
 */

import React, { useState, useRef, useEffect } from "react";
import { ToolbarButton } from "./ToolbarButton";

export interface OverflowMenuAction {
  /** Action identifier */
  id: string;
  /** Icon class name */
  icon?: string;
  /** Action label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Whether the action is disabled */
  disabled?: boolean;
  /** Whether the action is currently active/selected */
  active?: boolean;
}

export interface OverflowMenuProps {
  /** List of actions to display in the menu */
  actions: OverflowMenuAction[];
  /** Button icon (defaults to ellipsis) */
  icon?: string;
  /** Button title/tooltip */
  title?: string;
  /** Whether the menu button is disabled */
  disabled?: boolean;
}

/**
 * Overflow menu component with dropdown action list.
 * Clicking the button toggles a dropdown showing all available actions.
 */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  actions,
  icon = "codicon codicon-ellipsis",
  title = "More actions",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const pos = {
        top: rect.bottom + 4,
        left: rect.right - 200, // Align right edge with button
      };
      setMenuPosition(pos);
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Add listener after a small delay to prevent immediate close
      const timeoutId = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }

    return undefined;
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleActionClick = (action: OverflowMenuAction) => {
    action.onClick();
    setIsOpen(false);
  };

  return (
    <>
      <div ref={buttonRef} style={{ position: "relative" }}>
        <ToolbarButton
          icon={icon}
          onClick={handleToggle}
          disabled={disabled}
          title={title}
        />
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            backgroundColor: "var(--vscode-dropdown-background)",
            border: "1px solid var(--vscode-dropdown-border)",
            borderRadius: "3px",
            boxShadow: "0 2px 8px var(--vscode-widget-shadow)",
            minWidth: "200px",
            maxHeight: "400px",
            overflowY: "auto",
            zIndex: 10000,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              disabled={action.disabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "8px 12px",
                border: "none",
                backgroundColor: action.active
                  ? "var(--vscode-list-activeSelectionBackground)"
                  : "transparent",
                color: action.active
                  ? "var(--vscode-list-activeSelectionForeground)"
                  : "var(--vscode-dropdown-foreground)",
                cursor: action.disabled ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontFamily: "var(--vscode-font-family)",
                textAlign: "left",
                opacity: action.disabled ? 0.5 : 1,
                transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!action.disabled && !action.active) {
                  e.currentTarget.style.backgroundColor =
                    "var(--vscode-list-hoverBackground)";
                }
              }}
              onMouseLeave={(e) => {
                if (!action.active) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              {action.icon && (
                <i
                  className={action.icon}
                  style={{ fontSize: "16px", minWidth: "16px" }}
                />
              )}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
};
