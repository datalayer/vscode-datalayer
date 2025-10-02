/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module components/NotebookStyles
 * Shared styling configuration for notebook cells.
 * Eliminates duplicate style definitions.
 */

/**
 * Shared notebook container styles.
 * Used by both Datalayer and local notebooks.
 */
export const notebookCellStyles = {
  fontSize: "var(--vscode-editor-font-size, 13px)",
  fontFamily:
    'var(--vscode-editor-font-family, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace)',
  "& .jp-Notebook": {
    flex: "1 1 auto !important",
    height: "100%",
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  "& .jp-NotebookPanel": {
    height: "100% !important",
    width: "100% !important",
  },
  "& .jp-Cell": {
    fontSize: "var(--vscode-editor-font-size, 13px)",
    // Remove width constraint to allow sidebar
    width: "100%",
  },
  "& .jp-InputArea-editor": {
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  "& .jp-OutputArea": {
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  "& .CodeMirror": {
    fontSize: "var(--vscode-editor-font-size, 13px) !important",
  },
  "& .cm-editor": {
    fontSize: "var(--vscode-editor-font-size, 13px) !important",
  },
  "& .jp-Toolbar": {
    display: "none",
  },
  "& .datalayer-NotebookPanel-header": {
    display: "none",
  },
  "& .jp-Notebook-footer": {
    // Remove width constraint to allow sidebar
    width: "100%",
  },
  "& .jp-Notebook-cellSidebar": {
    display: "flex",
    minWidth: "40px",
  },
  "& .jp-Cell-Sidebar": {
    display: "flex",
  },
  ".dla-Box-Notebook": {
    position: "relative",
  },
  ".dla-Jupyter-Notebook .dla-Notebook-Container": {
    width: "100%",
  },
  "& .jp-CodeMirrorEditor": {
    cursor: "text !important",
  },
} as const;

/**
 * Height calculation for notebook container (subtracts toolbar height)
 */
export const notebookHeight = "calc(100vh - 31px)";

/**
 * Cell sidebar margin
 */
export const cellSidebarMargin = 120;
