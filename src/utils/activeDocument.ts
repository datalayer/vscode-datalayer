/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility for detecting active Datalayer custom editors (notebook/lexical).
 * This logic is used across multiple operations to determine which document is active.
 *
 * @module utils/activeDocument
 */

import * as vscode from "vscode";

/**
 * Editor type for active document
 */
export type EditorType =
  | "datalayer-notebook"
  | "datalayer-lexical"
  | "native-notebook"
  | "other";

/**
 * Active document information including URI and editor type
 */
export interface ActiveDocumentInfo {
  uri: vscode.Uri;
  editorType: EditorType;
  viewType?: string;
}

/**
 * Gets the URI of the active custom editor (notebook or lexical).
 * Returns undefined if no Datalayer custom editor is active.
 *
 * @returns The URI of the active custom editor, or undefined
 */
export function getActiveCustomEditorUri(): vscode.Uri | undefined {
  const info = getActiveDocumentInfo();
  return info?.uri;
}

/**
 * Gets complete information about the active document including which editor is being used.
 * This is critical because .ipynb files can be opened with either:
 * - Datalayer custom notebook editor (viewType: "datalayer.jupyter-notebook")
 * - VS Code native notebook editor (viewType: "notebook" or similar)
 *
 * @returns Active document info with URI and editor type, or undefined
 */
export function getActiveDocumentInfo(): ActiveDocumentInfo | undefined {
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

  if (!activeTab?.input) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = activeTab.input as any;

  // Check for editor with URI
  if (!("uri" in input) || !(input.uri instanceof vscode.Uri)) {
    return undefined;
  }

  const uri = input.uri;

  // Get viewType to determine which editor is being used
  const viewType = input.viewType as string | undefined;

  // Determine editor type based on viewType
  let editorType: EditorType = "other";

  if (viewType === "datalayer.jupyter-notebook") {
    editorType = "datalayer-notebook";
  } else if (viewType === "datalayer.lexical-editor") {
    editorType = "datalayer-lexical";
  } else if (viewType === "jupyter-notebook" || viewType === "interactive") {
    // VS Code native notebook editor
    editorType = "native-notebook";
  }

  return {
    uri,
    editorType,
    viewType,
  };
}
