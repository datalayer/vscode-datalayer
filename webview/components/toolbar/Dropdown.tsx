/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module Dropdown
 * VSCode-native dropdown component for toolbar menus.
 */

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

export interface DropdownProps {
  /** Button label when no selection */
  buttonLabel: string;
  /** Icon for the button */
  buttonIcon?: string;
  /** Whether to show arrow */
  showArrow?: boolean;
  /** Dropdown items */
  items: DropdownItem[];
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional button class */
  buttonClassName?: string;
  /** Aria label */
  ariaLabel?: string;
  /** Fixed minimum width to prevent jumping (e.g., "120px") */
  minWidth?: string;
}

/**
 * VSCode-styled dropdown menu component.
 * Matches native VS Code dropdown appearance and behavior.
 */
export const Dropdown: React.FC<DropdownProps> = ({
  buttonLabel,
  buttonIcon,
  showArrow = true,
  items,
  disabled = false,
  buttonClassName = "",
  ariaLabel,
  minWidth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  const dropdownMenu = isOpen ? (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        minWidth: "200px",
        maxHeight: "400px",
        overflowY: "auto",
        backgroundColor: "var(--vscode-dropdown-background)",
        border: "1px solid var(--vscode-dropdown-border)",
        borderRadius: "3px",
        boxShadow: "0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.16))",
        zIndex: 999999,
        padding: "4px 0",
      }}
    >
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && (
            <div
              style={{
                height: "1px",
                backgroundColor: "var(--vscode-dropdown-border)",
                margin: "4px 0",
              }}
            />
          )}
          <button
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "6px 12px",
              border: "none",
              backgroundColor: item.active
                ? "var(--vscode-list-activeSelectionBackground)"
                : "transparent",
              color: item.disabled
                ? "var(--vscode-disabledForeground)"
                : item.active
                  ? "var(--vscode-list-activeSelectionForeground)"
                  : "var(--vscode-dropdown-foreground)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontFamily: "var(--vscode-font-family)",
              textAlign: "left",
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled && !item.active) {
                e.currentTarget.style.backgroundColor =
                  "var(--vscode-list-hoverBackground)";
              }
            }}
            onMouseLeave={(e) => {
              if (!item.active) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {item.icon && (
                <i className={item.icon} style={{ fontSize: "16px" }} />
              )}
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <span
                style={{
                  fontSize: "11px",
                  opacity: 0.7,
                  fontFamily: "var(--vscode-font-family)",
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-label={ariaLabel || buttonLabel}
        className={buttonClassName}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          border: "1px solid transparent",
          borderRadius: "2px",
          backgroundColor: isOpen
            ? "var(--vscode-toolbar-activeBackground)"
            : "transparent",
          color: "var(--vscode-foreground)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontFamily: "var(--vscode-font-family)",
          opacity: disabled ? 0.5 : 1,
          transition: "background-color 0.1s",
          minWidth: minWidth,
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor =
              "var(--vscode-toolbar-hoverBackground)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        {buttonIcon && (
          <i className={buttonIcon} style={{ fontSize: "16px" }} />
        )}
        <span style={{ whiteSpace: "nowrap" }}>{buttonLabel}</span>
        {showArrow && (
          <i
            className="codicon codicon-chevron-down"
            style={{ fontSize: "12px", opacity: 0.7 }}
          />
        )}
      </button>
      {dropdownMenu && createPortal(dropdownMenu, document.body)}
    </>
  );
};
