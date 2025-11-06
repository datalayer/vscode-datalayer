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
