/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code theme integration for Jupyter React.
 * Uses VS Code's native CSS variables directly without complex mappings.
 *
 * @module theme/VSCodeTheme
 */

import React, { useEffect, type ReactNode } from "react";
import { JupyterReactTheme } from "@datalayer/jupyter-react";
import { PrimerVSCodeTheme } from "./PrimerVSCodeTheme";

export interface VSCodeThemeProps {
  colorMode: "light" | "dark";
  loadJupyterLabCss?: boolean;
  children: ReactNode;
}

/**
 * Inject CSS that maps VS Code variables to Jupyter theme variables.
 * This is much simpler than the old approach - we just map the essential variables.
 */
function VSCodeCSSInjector({ colorMode }: { colorMode: "light" | "dark" }) {
  useEffect(() => {
    // Create or update style element
    let styleEl = document.getElementById(
      "vscode-jupyter-theme",
    ) as HTMLStyleElement;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "vscode-jupyter-theme";
      document.head.appendChild(styleEl);
    }

    // Simple CSS that uses VS Code variables directly
    styleEl.textContent = `
      :root {
        /* JupyterLab uses these variable names, map them to VS Code */
        --jp-layout-color0: var(--vscode-editor-background);
        --jp-layout-color1: var(--vscode-sideBar-background);
        --jp-layout-color2: var(--vscode-editorWidget-background);
        --jp-layout-color3: var(--vscode-input-background);
        --jp-layout-color4: var(--vscode-dropdown-background);

        --jp-ui-font-color0: var(--vscode-editor-foreground);
        --jp-ui-font-color1: var(--vscode-foreground);
        --jp-ui-font-color2: var(--vscode-descriptionForeground);
        --jp-ui-font-color3: var(--vscode-disabledForeground);

        --jp-border-color0: var(--vscode-panel-border);
        --jp-border-color1: var(--vscode-editorWidget-border);
        --jp-border-color2: var(--vscode-input-border);

        --jp-brand-color1: var(--vscode-button-background);
        --jp-accent-color1: var(--vscode-focusBorder);

        --jp-error-color1: var(--vscode-errorForeground);
        --jp-warn-color1: var(--vscode-editorWarning-foreground);
        --jp-success-color1: var(--vscode-terminal-ansiGreen);
        --jp-info-color1: var(--vscode-editorInfo-foreground);

        /* Editor specific */
        --jp-editor-background: var(--vscode-editor-background);
        --jp-editor-foreground: var(--vscode-editor-foreground);
        --jp-editor-border-color: var(--vscode-editorWidget-border);
        --jp-editor-selected-background: var(--vscode-editor-selectionBackground);

        /* Cell specific */
        --jp-cell-editor-background: var(--vscode-notebook-cellEditorBackground, var(--vscode-editor-background));
        --jp-cell-editor-border-color: var(--vscode-notebook-cellBorderColor, var(--vscode-editorWidget-border));

        /* Input/Output */
        --jp-input-background: var(--vscode-input-background);
        --jp-input-foreground: var(--vscode-input-foreground);
        --jp-input-border: var(--vscode-input-border);

        /* Lists */
        --jp-list-hover-background: var(--vscode-list-hoverBackground);
        --jp-list-selected-background: var(--vscode-list-activeSelectionBackground);
      }

      /* Fix black background gaps */
      body,
      #root,
      #notebook-editor,
      .dla-Jupyter-Notebook,
      .jp-Notebook {
        background-color: var(--vscode-editor-background) !important;
      }

      /* CodeMirror editor background */
      .cm-editor,
      .cm-content {
        background-color: var(--vscode-notebook-cellEditorBackground, var(--vscode-editor-background)) !important;
      }

      /* Ensure notebook cells use correct background */
      .jp-Cell {
        background-color: var(--vscode-editor-background) !important;
      }

      .jp-InputArea-editor {
        background-color: var(--vscode-notebook-cellEditorBackground, var(--vscode-editor-background)) !important;
      }

      /* Toolbar and UI elements */
      .jp-Toolbar {
        background-color: var(--vscode-editorWidget-background) !important;
        border-bottom: 1px solid var(--vscode-panel-border) !important;
      }

      /* Sidebar */
      .jp-SideBar {
        background-color: var(--vscode-sideBar-background) !important;
        border-color: var(--vscode-panel-border) !important;
      }

      /* Cell Sidebar - NUCLEAR OPTION - target ALL lm-Widgets inside cells */
      .jp-Cell .lm-Widget {
        background-color: var(--vscode-editor-background) !important;
      }

      /* The actual sidebar container inside the ReactWidget */
      .dla-CellSidebar-Container {
        background-color: var(--vscode-editor-background) !important;
        color: var(--vscode-editor-foreground) !important;
      }

      /* All children should inherit */
      .dla-CellSidebar-Container * {
        background-color: inherit !important;
      }

      /* Cell sidebar buttons */
      .dla-CellSidebar-Container button {
        background-color: transparent !important;
        color: var(--vscode-editor-foreground) !important;
        border: none !important;
      }

      .dla-CellSidebar-Container button:hover {
        background-color: var(--vscode-list-hoverBackground) !important;
      }

      /* CodeMirror 6 text selection fix - ULTRA NUCLEAR OPTION */
      /* Override EVERYTHING - selection layer AND ::selection on all syntax tokens */

      /* Selection background layer elements */
      .cm-selectionBackground {
        background: var(--vscode-editor-selectionBackground) !important;
      }

      .cm-editor .cm-selectionBackground {
        background: var(--vscode-editor-selectionBackground) !important;
      }

      .cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {
        background: var(--vscode-editor-selectionBackground) !important;
      }

      .cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {
        background: var(--vscode-editor-selectionBackground) !important;
      }

      /* CRITICAL: Override ::selection on ALL syntax highlighting tokens */
      /* Each syntax token class needs explicit ::selection override */
      .cm-editor .cm-line ::selection,
      .cm-editor .cm-line > *::selection,
      .cm-editor .cm-line span::selection,
      .cm-editor .cm-content ::selection,
      .cm-editor .cm-activeLine ::selection,
      .cm-editor .cm-keyword::selection,
      .cm-editor .cm-operator::selection,
      .cm-editor .cm-variable::selection,
      .cm-editor .cm-variableName::selection,
      .cm-editor .cm-string::selection,
      .cm-editor .cm-number::selection,
      .cm-editor .cm-comment::selection,
      .cm-editor .cm-meta::selection,
      .cm-editor .cm-tag::selection,
      .cm-editor .cm-attribute::selection,
      .cm-editor .cm-property::selection,
      .cm-editor .cm-qualifier::selection,
      .cm-editor .cm-type::selection,
      .cm-editor .cm-builtin::selection,
      .cm-editor .cm-bracket::selection,
      .cm-editor .cm-atom::selection,
      .cm-editor .cm-def::selection,
      .cm-editor .cm-punctuation::selection {
        background: var(--vscode-editor-selectionBackground) !important;
        background-color: var(--vscode-editor-selectionBackground) !important;
      }

      /* Catch-all for ANY element inside editor */
      .cm-editor *::selection {
        background: var(--vscode-editor-selectionBackground) !important;
        background-color: var(--vscode-editor-selectionBackground) !important;
      }

      /* ========================================
         Excalidraw Theme Integration
         ======================================== */
      /* Comprehensive mapping of Excalidraw CSS variables to VS Code theme colors */
      /* This keeps jupyter-lexical package VS Code-agnostic while providing deep integration */

      /* Dark theme Excalidraw overrides */
      .ExcalidrawModal__row .excalidraw.theme--dark {
        /* Core Colors */
        --color-primary: var(--vscode-button-background, #0e639c);
        --color-primary-darker: var(--vscode-button-hoverBackground, #1177bb);
        --color-primary-darkest: var(--vscode-button-hoverBackground, #0a5285);
        --color-primary-hover: var(--vscode-button-hoverBackground, #1177bb);
        --color-primary-light: var(--vscode-list-activeSelectionBackground, #094771);
        --color-surface-primary: var(--vscode-editor-background, #1e1e1e);
        --default-bg-color: var(--vscode-editor-background, #1e1e1e);
        --color-on-surface: var(--vscode-editor-foreground, #d4d4d4);
        --text-primary-color: var(--vscode-editor-foreground, #d4d4d4);
        --popup-text-color: var(--vscode-editor-foreground, #d4d4d4);

        /* Primary Container Colors (for selected/active states) */
        --color-surface-primary-container: var(--vscode-list-activeSelectionBackground, #094771);
        --color-on-primary-container: var(--vscode-list-activeSelectionForeground, #ffffff);

        /* Brand/Interactive Colors */
        --color-brand-hover: var(--vscode-button-hoverBackground, #1177bb);
        --color-brand-active: var(--vscode-focusBorder, #007fd4);

        /* Icon Colors */
        --color-icon-white: #ffffff;

        /* Surface Variations */
        --island-bg-color: var(--vscode-editorWidget-background, #252526);
        --sidebar-bg-color: var(--vscode-sideBar-background, #252526);
        --popup-bg-color: var(--vscode-editorWidget-background, #252526);
        --popup-secondary-bg-color: var(--vscode-dropdown-background, #3c3c3c);
        --color-surface-high: var(--vscode-editorWidget-background, #2e2d39);
        --color-surface-mid: var(--vscode-sideBar-background, #252526);
        --color-surface-low: var(--vscode-editor-background, #1e1e1e);
        --color-surface-lowest: var(--vscode-editor-background, #1e1e1e);

        /* Buttons */
        --button-gray-1: var(--vscode-button-secondaryBackground, #3a3d41);
        --button-gray-2: var(--vscode-button-secondaryHoverBackground, #45494e);
        --button-gray-3: var(--vscode-button-secondaryHoverBackground, #45494e);
        --button-hover-bg: var(--vscode-list-hoverBackground, #2a2d2e);
        --button-active-bg: var(--vscode-list-activeSelectionBackground, #094771);
        --button-color: var(--vscode-button-foreground, #ffffff);
        --button-hover-color: var(--vscode-button-foreground, #ffffff);
        --button-bg: var(--vscode-button-background, #0e639c);

        /* Input Fields */
        --input-bg-color: var(--vscode-input-background, #3c3c3c);
        --input-border-color: var(--vscode-input-border, #3c3c3c);
        --input-hover-bg-color: var(--vscode-list-hoverBackground, #2a2d2e);

        /* Borders */
        --default-border-color: var(--vscode-panel-border, #3c3c3c);
        --color-border-outline: var(--vscode-editorWidget-border, #454545);
        --color-border-outline-variant: var(--vscode-panel-border, #3c3c3c);
        --sidebar-border-color: var(--vscode-panel-border, #3c3c3c);
        --dialog-border-color: var(--vscode-editorWidget-border, #454545);

        /* Focus and Selection */
        --focus-highlight-color: var(--vscode-focusBorder, #007fd4);
        --select-highlight-color: var(--vscode-editor-selectionBackground, #264f78);
        --color-selection: var(--vscode-editor-selectionBackground, #264f78);
        --button-active-border: var(--vscode-focusBorder, #007fd4);

        /* Links, Scrollbar, Icons */
        --link-color: var(--vscode-textLink-foreground, #3794ff);
        --scrollbar-thumb: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
        --scrollbar-thumb-hover: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
        --icon-fill-color: var(--vscode-icon-foreground, #c5c5c5);
      }

      /* Light theme Excalidraw overrides */
      .ExcalidrawModal__row .excalidraw.theme--light {
        /* Core Colors */
        --color-primary: var(--vscode-button-background, #007acc);
        --color-primary-darker: var(--vscode-button-hoverBackground, #005a9e);
        --color-primary-darkest: var(--vscode-button-hoverBackground, #004578);
        --color-primary-hover: var(--vscode-button-hoverBackground, #005a9e);
        --color-primary-light: var(--vscode-list-activeSelectionBackground, #0060c0);
        --color-surface-primary: var(--vscode-editor-background, #ffffff);
        --default-bg-color: var(--vscode-editor-background, #ffffff);
        --color-on-surface: var(--vscode-editor-foreground, #000000);
        --text-primary-color: var(--vscode-editor-foreground, #000000);
        --popup-text-color: var(--vscode-editor-foreground, #000000);

        /* Primary Container Colors (for selected/active states) */
        --color-surface-primary-container: var(--vscode-list-activeSelectionBackground, #0060c0);
        --color-on-primary-container: var(--vscode-list-activeSelectionForeground, #ffffff);

        /* Brand/Interactive Colors */
        --color-brand-hover: var(--vscode-button-hoverBackground, #005a9e);
        --color-brand-active: var(--vscode-focusBorder, #0090f1);

        /* Icon Colors */
        --color-icon-white: #ffffff;

        /* Surface Variations */
        --island-bg-color: var(--vscode-editorWidget-background, #f3f3f3);
        --sidebar-bg-color: var(--vscode-sideBar-background, #f3f3f3);
        --popup-bg-color: var(--vscode-editorWidget-background, #f3f3f3);
        --popup-secondary-bg-color: var(--vscode-dropdown-background, #ffffff);
        --color-surface-high: var(--vscode-editorWidget-background, #f1f0ff);
        --color-surface-mid: var(--vscode-sideBar-background, #f3f3f3);
        --color-surface-low: var(--vscode-editor-background, #ffffff);
        --color-surface-lowest: var(--vscode-editor-background, #ffffff);

        /* Buttons */
        --button-gray-1: var(--vscode-button-secondaryBackground, #e1e1e1);
        --button-gray-2: var(--vscode-button-secondaryHoverBackground, #d0d0d0);
        --button-gray-3: var(--vscode-button-secondaryHoverBackground, #d0d0d0);
        --button-hover-bg: var(--vscode-list-hoverBackground, #f0f0f0);
        --button-active-bg: var(--vscode-list-activeSelectionBackground, #0060c0);
        --button-color: var(--vscode-button-foreground, #ffffff);
        --button-hover-color: var(--vscode-button-foreground, #ffffff);
        --button-bg: var(--vscode-button-background, #007acc);

        /* Input Fields */
        --input-bg-color: var(--vscode-input-background, #ffffff);
        --input-border-color: var(--vscode-input-border, #cecece);
        --input-hover-bg-color: var(--vscode-list-hoverBackground, #f0f0f0);

        /* Borders */
        --default-border-color: var(--vscode-panel-border, #e0e0e0);
        --color-border-outline: var(--vscode-editorWidget-border, #c8c8c8);
        --color-border-outline-variant: var(--vscode-panel-border, #e0e0e0);
        --sidebar-border-color: var(--vscode-panel-border, #e0e0e0);
        --dialog-border-color: var(--vscode-editorWidget-border, #c8c8c8);

        /* Focus and Selection */
        --focus-highlight-color: var(--vscode-focusBorder, #0090f1);
        --select-highlight-color: var(--vscode-editor-selectionBackground, #add6ff);
        --color-selection: var(--vscode-editor-selectionBackground, #add6ff);
        --button-active-border: var(--vscode-focusBorder, #0090f1);

        /* Links, Scrollbar, Icons */
        --link-color: var(--vscode-textLink-foreground, #006ab1);
        --scrollbar-thumb: var(--vscode-scrollbarSlider-background, rgba(100, 100, 100, 0.4));
        --scrollbar-thumb-hover: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
        --icon-fill-color: var(--vscode-icon-foreground, #424242);
      }
    `;

    return () => {
      // Cleanup on unmount
      styleEl?.remove();
    };
  }, [colorMode]);

  return null;
}

/**
 * VS Code theme provider for Jupyter React.
 *
 * Instead of maintaining 1267 lines of complex theme mapping logic,
 * this component simply uses VS Code's CSS variables directly.
 *
 * @example
 * ```tsx
 * <VSCodeTheme colorMode={theme}>
 *   <Notebook2 {...props} />
 * </VSCodeTheme>
 * ```
 */
export function VSCodeTheme({
  colorMode,
  loadJupyterLabCss = true,
  children,
}: VSCodeThemeProps) {
  return (
    <>
      {/* Inject VS Code CSS mappings */}
      <VSCodeCSSInjector colorMode={colorMode} />

      {/* Wrap with Primer theme provider for Primer React components */}
      <PrimerVSCodeTheme colorMode={colorMode}>
        {/* Wrap with JupyterReactTheme for Jupyter components */}
        <JupyterReactTheme
          colormode={colorMode}
          loadJupyterLabCss={loadJupyterLabCss}
        >
          {children}
        </JupyterReactTheme>
      </PrimerVSCodeTheme>
    </>
  );
}
