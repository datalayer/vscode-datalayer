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
  /** Global font size for the notebook, uses VS Code editor font size setting */
  fontSize: "var(--vscode-editor-font-size, 13px)",
  /** Global font family for the notebook, uses VS Code editor font family setting with fallbacks */
  fontFamily:
    'var(--vscode-editor-font-family, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace)',
  /** JupyterLab notebook container - flex layout to fill available space */
  "& .jp-Notebook": {
    /** Flex: grows/shrinks to fill container, basis is auto */
    flex: "1 1 auto !important",
    /** Full height to match container */
    height: "100%",
    /** Consistent font size with global setting */
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  /** JupyterLab notebook panel wrapper */
  "& .jp-NotebookPanel": {
    /** Full height to fill container */
    height: "100% !important",
    /** Full width to fill container */
    width: "100% !important",
  },
  /** Individual notebook cell styling */
  "& .jp-Cell": {
    /** Consistent font size with global setting */
    fontSize: "var(--vscode-editor-font-size, 13px)",
    /** Full width to accommodate sidebar */
    width: "100%",
  },
  /** Input area editor (code cells) styling */
  "& .jp-InputArea-editor": {
    /** Consistent font size for code input */
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  /** Output area styling */
  "& .jp-OutputArea": {
    /** Consistent font size for output display */
    fontSize: "var(--vscode-editor-font-size, 13px)",
  },
  /** CodeMirror 5 legacy editor styling */
  "& .CodeMirror": {
    /** CodeMirror requires !important for font size override */
    fontSize: "var(--vscode-editor-font-size, 13px) !important",
  },
  /** CodeMirror 6 editor styling */
  "& .cm-editor": {
    /** CodeMirror 6 requires !important for font size override */
    fontSize: "var(--vscode-editor-font-size, 13px) !important",
  },
  /** Hide JupyterLab toolbar (VS Code has its own) */
  "& .jp-Toolbar": {
    /** Hidden to use VS Code-style toolbar instead */
    display: "none",
  },
  /** Hide Datalayer notebook panel header (redundant with VS Code UI) */
  "& .datalayer-NotebookPanel-header": {
    /** Hidden for cleaner UI */
    display: "none",
  },
  /** Notebook footer styling */
  "& .jp-Notebook-footer": {
    /** Full width to accommodate sidebar */
    width: "100%",
  },
  /** Notebook cell sidebar container */
  "& .jp-Notebook-cellSidebar": {
    /** Flex layout for proper alignment */
    display: "flex !important",
    /** Minimum width for sidebar buttons */
    minWidth: "40px !important",
    /** Background color matching VS Code editor */
    backgroundColor: "var(--vscode-editor-background) !important",
  },
  /** Individual cell sidebar (left column with buttons) */
  "& .jp-Cell-Sidebar": {
    /** Flex layout for vertical stacking */
    display: "flex !important",
    /** Background matching VS Code editor */
    backgroundColor: "var(--vscode-editor-background) !important",
    /** Text color matching VS Code editor foreground */
    color: "var(--vscode-editor-foreground) !important",
  },
  /** Cell sidebar button styling */
  "& .jp-Cell-Sidebar button": {
    /** Transparent background for button appearance */
    backgroundColor: "transparent !important",
    /** Text color matching VS Code editor */
    color: "var(--vscode-editor-foreground) !important",
    /** Remove default border */
    border: "none !important",
    /** Pointer cursor on hover */
    cursor: "pointer !important",
  },
  /** Cell sidebar button hover state */
  "& .jp-Cell-Sidebar button:hover": {
    /** Hover background from VS Code theme */
    backgroundColor: "var(--vscode-list-hoverBackground) !important",
  },
  /** All lm-Widgets within cells - enforces background color consistency */
  "& .jp-Cell .lm-Widget": {
    /** Background color matching VS Code editor */
    backgroundColor: "var(--vscode-editor-background) !important",
  },
  /** Datalayer cell sidebar container */
  "& .dla-CellSidebar-Container": {
    /** Background matching VS Code editor */
    backgroundColor: "var(--vscode-editor-background) !important",
  },
  /** All child elements of Datalayer sidebar container inherit background */
  "& .dla-CellSidebar-Container *": {
    /** Inherit background from parent */
    backgroundColor: "inherit !important",
  },
  /** Datalayer notebook box styling */
  ".dla-Box-Notebook": {
    /** Relative positioning for layout */
    position: "relative",
  },
  /** Datalayer Jupyter notebook container */
  ".dla-Jupyter-Notebook .dla-Notebook-Container": {
    /** Full width to fill available space */
    width: "100%",
  },
  /** CodeMirror editor cursor styling */
  "& .jp-CodeMirrorEditor": {
    /** Text cursor for typing interaction */
    cursor: "text !important",
  },
  /** Dialog box container - styled to match VS Code theme */
  "& .jp-Dialog": {
    /** Dialog background from VS Code widget theme */
    backgroundColor: "var(--vscode-editorWidget-background) !important",
    /** Dialog border from VS Code widget theme */
    border: "1px solid var(--vscode-editorWidget-border) !important",
  },
  /** Dialog content area */
  "& .jp-Dialog-content": {
    /** Dialog background matching widget theme */
    backgroundColor: "var(--vscode-editorWidget-background) !important",
    /** Dialog text color from widget theme */
    color: "var(--vscode-editorWidget-foreground) !important",
  },
  /** Dialog header section */
  "& .jp-Dialog-header": {
    /** Header background from widget theme */
    backgroundColor: "var(--vscode-editorWidget-background) !important",
    /** Header text color from widget theme */
    color: "var(--vscode-editorWidget-foreground) !important",
  },
  /** Dialog body section */
  "& .jp-Dialog-body": {
    /** Body background from widget theme */
    backgroundColor: "var(--vscode-editorWidget-background) !important",
    /** Body text color from editor theme */
    color: "var(--vscode-editor-foreground) !important",
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
