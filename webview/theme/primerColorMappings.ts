/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Maps VSCode CSS variables to Primer color tokens.
 * These mappings define how Primer React components should be themed
 * to match the active VSCode theme.
 *
 * @module theme/primerColorMappings
 */

/**
 * VSCode CSS variable mappings for Primer theme colors.
 * Organized by semantic color categories matching Primer's structure.
 */
export const PRIMER_VSCODE_COLOR_MAP = {
  /**
   * Canvas backgrounds - main surface colors
   */
  canvas: {
    default: "--vscode-editor-background",
    overlay: "--vscode-editorWidget-background",
    inset: "--vscode-input-background",
    subtle: "--vscode-sideBar-background",
  },

  /**
   * Foreground colors - text and icons
   */
  fg: {
    default: "--vscode-editor-foreground",
    muted: "--vscode-descriptionForeground",
    subtle: "--vscode-disabledForeground",
    onEmphasis: "--vscode-button-foreground",
  },

  /**
   * Border colors
   */
  border: {
    default: "--vscode-panel-border",
    muted: "--vscode-editorWidget-border",
    subtle: "--vscode-input-border",
  },

  /**
   * Accent colors - primary brand color (buttons, links)
   */
  accent: {
    fg: "--vscode-button-background",
    emphasis: "--vscode-button-background",
    muted: "--vscode-button-secondaryBackground",
    subtle: "--vscode-button-secondaryBackground",
  },

  /**
   * Danger colors - errors, destructive actions
   */
  danger: {
    fg: "--vscode-errorForeground",
    emphasis: "--vscode-inputValidation-errorBackground",
    muted: "--vscode-inputValidation-errorBorder",
    subtle: "--vscode-errorForeground",
  },

  /**
   * Success colors - successful states
   */
  success: {
    fg: "--vscode-terminal-ansiGreen",
    emphasis: "--vscode-terminal-ansiGreen",
    muted: "--vscode-terminal-ansiGreen",
    subtle: "--vscode-terminal-ansiGreen",
  },

  /**
   * Attention colors - warnings
   */
  attention: {
    fg: "--vscode-editorWarning-foreground",
    emphasis: "--vscode-inputValidation-warningBackground",
    muted: "--vscode-inputValidation-warningBorder",
    subtle: "--vscode-editorWarning-foreground",
  },

  /**
   * Done colors - completed states
   */
  done: {
    fg: "--vscode-terminal-ansiBlue",
    emphasis: "--vscode-terminal-ansiBlue",
    muted: "--vscode-terminal-ansiBlue",
    subtle: "--vscode-terminal-ansiBlue",
  },

  /**
   * Interactive state colors - hover, active, selected
   */
  state: {
    hover: {
      primaryBg: "--vscode-list-hoverBackground",
      primaryBorder: "--vscode-list-hoverBackground",
      secondaryBg: "--vscode-button-hoverBackground",
    },
    selected: {
      primaryBg: "--vscode-list-activeSelectionBackground",
      primaryBorder: "--vscode-list-activeSelectionBackground",
    },
    focus: {
      border: "--vscode-focusBorder",
      shadow: "--vscode-focusBorder",
    },
  },
} as const;

/**
 * Default fallback colors for when VSCode variables are not available.
 * Organized by light/dark mode.
 */
export const FALLBACK_COLORS = {
  dark: {
    canvas: "#1e1e1e",
    fg: "#d4d4d4",
    border: "#3c3c3c",
    accent: "#0e639c",
    danger: "#f48771",
    success: "#4ec9b0",
    attention: "#cca700",
  },
  light: {
    canvas: "#ffffff",
    fg: "#1e1e1e",
    border: "#d4d4d4",
    accent: "#007acc",
    danger: "#e51400",
    success: "#008000",
    attention: "#bf8803",
  },
} as const;

export type PrimerColorCategory = keyof typeof PRIMER_VSCODE_COLOR_MAP;
