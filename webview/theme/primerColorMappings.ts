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
    /** Default canvas background - editor background */
    default: "--vscode-editor-background",
    /** Canvas overlay - widget background */
    overlay: "--vscode-editorWidget-background",
    /** Canvas inset - input background */
    inset: "--vscode-input-background",
    /** Subtle canvas - sidebar background */
    subtle: "--vscode-sideBar-background",
  },

  /**
   * Foreground colors - text and icons
   */
  fg: {
    /** Default foreground - editor text color */
    default: "--vscode-editor-foreground",
    /** Muted foreground - description text color */
    muted: "--vscode-descriptionForeground",
    /** Subtle foreground - disabled text color */
    subtle: "--vscode-disabledForeground",
    /** Foreground on emphasis - button text color */
    onEmphasis: "--vscode-button-foreground",
  },

  /**
   * Border colors
   */
  border: {
    /** Default border - panel border color */
    default: "--vscode-panel-border",
    /** Muted border - widget border color */
    muted: "--vscode-editorWidget-border",
    /** Subtle border - input border color */
    subtle: "--vscode-input-border",
  },

  /**
   * Accent colors - primary brand color (buttons, links)
   */
  accent: {
    /** Accent foreground - button background color */
    fg: "--vscode-button-background",
    /** Accent emphasis - primary button color */
    emphasis: "--vscode-button-background",
    /** Muted accent - secondary button background */
    muted: "--vscode-button-secondaryBackground",
    /** Subtle accent - secondary button background */
    subtle: "--vscode-button-secondaryBackground",
  },

  /**
   * Danger colors - errors, destructive actions
   */
  danger: {
    /** Danger foreground - error text color */
    fg: "--vscode-errorForeground",
    /** Danger emphasis - error background color */
    emphasis: "--vscode-inputValidation-errorBackground",
    /** Danger muted - error border color */
    muted: "--vscode-inputValidation-errorBorder",
    /** Danger subtle - error foreground color */
    subtle: "--vscode-errorForeground",
  },

  /**
   * Success colors - successful states
   */
  success: {
    /** Success foreground - green terminal color */
    fg: "--vscode-terminal-ansiGreen",
    /** Success emphasis - green terminal color */
    emphasis: "--vscode-terminal-ansiGreen",
    /** Success muted - green terminal color */
    muted: "--vscode-terminal-ansiGreen",
    /** Success subtle - green terminal color */
    subtle: "--vscode-terminal-ansiGreen",
  },

  /**
   * Attention colors - warnings
   */
  attention: {
    /** Attention foreground - warning text color */
    fg: "--vscode-editorWarning-foreground",
    /** Attention emphasis - warning background color */
    emphasis: "--vscode-inputValidation-warningBackground",
    /** Attention muted - warning border color */
    muted: "--vscode-inputValidation-warningBorder",
    /** Attention subtle - warning foreground color */
    subtle: "--vscode-editorWarning-foreground",
  },

  /**
   * Done colors - completed states
   */
  done: {
    /** Done foreground - blue terminal color */
    fg: "--vscode-terminal-ansiBlue",
    /** Done emphasis - blue terminal color */
    emphasis: "--vscode-terminal-ansiBlue",
    /** Done muted - blue terminal color */
    muted: "--vscode-terminal-ansiBlue",
    /** Done subtle - blue terminal color */
    subtle: "--vscode-terminal-ansiBlue",
  },

  /**
   * Interactive state colors - hover, active, selected
   */
  state: {
    hover: {
      /** Hover primary background - list hover background */
      primaryBg: "--vscode-list-hoverBackground",
      /** Hover primary border - list hover background */
      primaryBorder: "--vscode-list-hoverBackground",
      /** Hover secondary background - button hover background */
      secondaryBg: "--vscode-button-hoverBackground",
    },
    selected: {
      /** Selected primary background - active selection background */
      primaryBg: "--vscode-list-activeSelectionBackground",
      /** Selected primary border - active selection background */
      primaryBorder: "--vscode-list-activeSelectionBackground",
    },
    focus: {
      /** Focus border - focus border color */
      border: "--vscode-focusBorder",
      /** Focus shadow - focus border color */
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
    /** Dark mode canvas background color */
    canvas: "#1e1e1e",
    /** Dark mode foreground text color */
    fg: "#d4d4d4",
    /** Dark mode border color */
    border: "#3c3c3c",
    /** Dark mode accent color */
    accent: "#0e639c",
    /** Dark mode danger color */
    danger: "#f48771",
    /** Dark mode success color */
    success: "#4ec9b0",
    /** Dark mode attention/warning color */
    attention: "#cca700",
  },
  light: {
    /** Light mode canvas background color */
    canvas: "#ffffff",
    /** Light mode foreground text color */
    fg: "#1e1e1e",
    /** Light mode border color */
    border: "#d4d4d4",
    /** Light mode accent color */
    accent: "#007acc",
    /** Light mode danger color */
    danger: "#e51400",
    /** Light mode success color */
    success: "#008000",
    /** Light mode attention/warning color */
    attention: "#bf8803",
  },
} as const;

export type PrimerColorCategory = keyof typeof PRIMER_VSCODE_COLOR_MAP;
