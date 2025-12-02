/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility for getting ALL opened documents in VS Code.
 * This provides complete context about what documents are open and which is active.
 *
 * @module utils/getAllOpenedDocuments
 */

import * as vscode from "vscode";

/**
 * Document type classification
 */
export type DocumentType =
  | "notebook"
  | "lexical"
  | "text"
  | "other"
  | "unknown";

/**
 * Editor type for opened documents - CRITICAL to know which editor is being used!
 */
export type EditorType =
  | "datalayer-notebook"
  | "datalayer-lexical"
  | "native-notebook"
  | "text-editor"
  | "other"
  | "unknown";

/**
 * Information about a single opened document
 */
export interface OpenedDocumentInfo {
  /** Document URI string */
  uri: string;
  /** Document type classification */
  type: DocumentType;
  /** Editor type - which editor is being used to open this document */
  editorType: EditorType;
  /** View type from VS Code tab input (e.g., "datalayer.jupyter-notebook", "jupyter-notebook") */
  viewType?: string;
  /** File name (extracted from path) */
  fileName: string;
  /** Whether this is the currently active document */
  isActive: boolean;
  /** URI scheme (e.g., 'file', 'datalayer') */
  scheme: string;
}

/**
 * Complete document context with active document and all opened documents
 */
export interface AllOpenedDocumentsContext {
  /** The currently active document, or undefined if no document is active */
  activeDocument: OpenedDocumentInfo | undefined;
  /** Array of all opened documents */
  allDocuments: OpenedDocumentInfo[];
  /** Total count of opened documents */
  totalCount: number;
  /** Count by type */
  counts: {
    notebook: number;
    lexical: number;
    text: number;
    other: number;
    unknown: number;
  };
}

/**
 * Determines document type from URI and filename
 */
function classifyDocumentType(uri: vscode.Uri, fileName: string): DocumentType {
  // Check file extension
  if (fileName.endsWith(".ipynb")) {
    return "notebook";
  }
  if (fileName.endsWith(".lexical")) {
    return "lexical";
  }

  // Check for text files
  if (
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".json") ||
    fileName.endsWith(".yaml") ||
    fileName.endsWith(".yml") ||
    fileName.endsWith(".js") ||
    fileName.endsWith(".ts") ||
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".py") ||
    fileName.endsWith(".java") ||
    fileName.endsWith(".c") ||
    fileName.endsWith(".cpp") ||
    fileName.endsWith(".h") ||
    fileName.endsWith(".hpp") ||
    fileName.endsWith(".css") ||
    fileName.endsWith(".html") ||
    fileName.endsWith(".xml")
  ) {
    return "text";
  }

  // If it's a file:// scheme with unknown extension
  if (uri.scheme === "file") {
    return "other";
  }

  return "unknown";
}

/**
 * Determines editor type from viewType.
 * This is CRITICAL because .ipynb files can be opened with either:
 * - Datalayer custom editor (viewType: "datalayer.jupyter-notebook")
 * - VS Code native editor (viewType: "jupyter-notebook" or "interactive")
 */
function classifyEditorType(viewType: string | undefined): EditorType {
  if (!viewType) {
    return "unknown";
  }

  // Check for Datalayer custom editors
  if (viewType === "datalayer.jupyter-notebook") {
    return "datalayer-notebook";
  }
  if (viewType === "datalayer.lexical-editor") {
    return "datalayer-lexical";
  }

  // Check for VS Code native notebook editor
  if (viewType === "jupyter-notebook" || viewType === "interactive") {
    return "native-notebook";
  }

  // Check for text editor
  if (viewType === "default") {
    return "text-editor";
  }

  return "other";
}

/**
 * Gets ALL opened documents across all tab groups.
 * Returns complete document context including the active document and all opened documents.
 *
 * @returns Complete document context
 */
export function getAllOpenedDocuments(): AllOpenedDocumentsContext {
  const allDocuments: OpenedDocumentInfo[] = [];
  let activeDocumentUri: string | undefined;

  // Get the active tab to identify active document
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (activeTab?.input) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input = activeTab.input as any;
    if ("uri" in input && input.uri instanceof vscode.Uri) {
      activeDocumentUri = input.uri.toString();
    }
  }

  // Iterate through all tab groups and tabs
  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (!tab.input) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = tab.input as any;

      // Extract URI from tab input
      let uri: vscode.Uri | undefined;
      if ("uri" in input && input.uri instanceof vscode.Uri) {
        uri = input.uri;
      }

      if (!uri) {
        continue;
      }

      // Extract filename from path
      const fileName = uri.path.split("/").pop() || "";

      // Get viewType to determine which editor is being used
      const viewType = input.viewType as string | undefined;

      // Classify document type and editor type
      const type = classifyDocumentType(uri, fileName);
      const editorType = classifyEditorType(viewType);

      // Check if this is the active document
      const isActive = uri.toString() === activeDocumentUri;

      allDocuments.push({
        uri: uri.toString(),
        type,
        editorType,
        viewType,
        fileName,
        isActive,
        scheme: uri.scheme,
      });
    }
  }

  // Find active document in the list
  const activeDocument = allDocuments.find((doc) => doc.isActive);

  // Count documents by type
  const counts = {
    notebook: allDocuments.filter((doc) => doc.type === "notebook").length,
    lexical: allDocuments.filter((doc) => doc.type === "lexical").length,
    text: allDocuments.filter((doc) => doc.type === "text").length,
    other: allDocuments.filter((doc) => doc.type === "other").length,
    unknown: allDocuments.filter((doc) => doc.type === "unknown").length,
  };

  return {
    activeDocument,
    allDocuments,
    totalCount: allDocuments.length,
    counts,
  };
}
