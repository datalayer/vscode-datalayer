/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility for analyzing open documents (notebooks and lexicals) in VS Code.
 * Correctly categorizes documents by checking BOTH URI scheme AND editor viewType.
 *
 * @module utils/documentAnalysis
 */

import * as vscode from "vscode";

import { ServiceLoggers } from "../services/logging/loggers";

/**
 * Result of analyzing all open documents categorized by editor type and location.
 */
export interface DocumentAnalysisResult {
  /** Native VS Code notebooks (opened with default notebook editor). */
  nativeNotebooks: string[];
  /** Local Datalayer documents - notebooks and lexicals (file:// or untitled://). */
  localDatalayerDocuments: string[];
  /** Cloud Datalayer documents - notebooks and lexicals (datalayer:// scheme). */
  cloudDatalayerDocuments: string[];
  /** Total count of all documents. */
  total: number;
  /** Majority type based on counts. */
  majorityType: "native" | "local" | "cloud" | "none";
  /** Active document URI (if any). */
  activeDocumentUri?: string;
}

/** View types that indicate a local Datalayer document. */
const DATALAYER_VIEW_TYPES = new Set([
  "datalayer.jupyter-notebook",
  "datalayer.lexical",
  "datalayer.lexical-editor",
]);

/**
 * Classifies a single tab and appends its URI to the appropriate category list.
 * @param tab - VS Code tab to classify.
 * @param nativeNotebooks - Accumulator for native notebook URIs.
 * @param localDatalayerDocuments - Accumulator for local Datalayer document URIs.
 * @param cloudDatalayerDocuments - Accumulator for cloud Datalayer document URIs.
 */
function classifyTab(
  tab: vscode.Tab,
  nativeNotebooks: string[],
  localDatalayerDocuments: string[],
  cloudDatalayerDocuments: string[],
): void {
  ServiceLoggers.main.debug(
    `[DocumentAnalysis] Tab: label="${tab.label}", input type=${tab.input?.constructor.name}`,
  );

  if (!tab.input || typeof tab.input !== "object") {
    return;
  }

  const tabInput = tab.input as { uri?: vscode.Uri; viewType?: string };
  const uri = tabInput.uri;
  const viewType = tabInput.viewType;

  if (!uri) {
    return;
  }

  const uriString = uri.toString();
  const scheme = uri.scheme;

  ServiceLoggers.main.debug(
    `[DocumentAnalysis] Tab URI: ${uriString}, viewType=${viewType}, scheme=${scheme}`,
  );

  if (scheme === "datalayer") {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Categorized as CLOUD (datalayer:// scheme)`,
    );
    cloudDatalayerDocuments.push(uriString);
    return;
  }

  if (scheme !== "file" && scheme !== "untitled") {
    return;
  }

  if (viewType && DATALAYER_VIEW_TYPES.has(viewType)) {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Categorized as LOCAL DATALAYER (viewType match: ${viewType})`,
    );
    localDatalayerDocuments.push(uriString);
  } else if (viewType === "jupyter-notebook") {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Categorized as NATIVE (jupyter-notebook viewType)`,
    );
    nativeNotebooks.push(uriString);
  } else if (uriString.endsWith(".ipynb")) {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Categorized as LOCAL DATALAYER (fallback - .ipynb file)`,
    );
    localDatalayerDocuments.push(uriString);
  } else if (uriString.endsWith(".dlex") || uriString.endsWith(".lexical")) {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Categorized as LOCAL DATALAYER (lexical file)`,
    );
    localDatalayerDocuments.push(uriString);
  }
}

/**
 * Analyzes ALL open documents (notebooks AND lexicals) in VS Code workspace.
 *
 * Smart detection approach:
 * - Checks vscode.window.tabGroups to get all open documents including custom editors.
 * - Distinguishes native VS Code notebooks from Datalayer local documents.
 * - Detects cloud Datalayer documents (notebooks + lexicals) via datalayer:// URI scheme.
 * - Includes lexical documents in the analysis for complete context.
 *
 * @returns Complete analysis of all open documents with categorization.
 */
export function analyzeOpenDocuments(): DocumentAnalysisResult {
  const nativeNotebooks: string[] = [];
  const localDatalayerDocuments: string[] = [];
  const cloudDatalayerDocuments: string[] = [];

  ServiceLoggers.main.debug("[DocumentAnalysis] Starting analysis...", {
    notebookDocuments: vscode.workspace.notebookDocuments.length,
    tabGroups: vscode.window.tabGroups.all.length,
    activeTextEditor:
      vscode.window.activeTextEditor?.document.uri.toString() ?? "none",
    activeNotebookEditor:
      vscode.window.activeNotebookEditor?.notebook.uri.toString() ?? "none",
    visibleTextEditors: vscode.window.visibleTextEditors.length,
  });

  // For Datalayer custom editor documents, we MUST use tab groups
  // because they are CustomDocument, not NotebookDocument!
  for (const group of vscode.window.tabGroups.all) {
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Checking tab group ${group.activeTab?.label}`,
    );
    for (const tab of group.tabs) {
      classifyTab(
        tab,
        nativeNotebooks,
        localDatalayerDocuments,
        cloudDatalayerDocuments,
      );
    }
  }

  const total =
    nativeNotebooks.length +
    localDatalayerDocuments.length +
    cloudDatalayerDocuments.length;

  ServiceLoggers.main.debug("[DocumentAnalysis] Results.", {
    native: nativeNotebooks.length,
    localDatalayer: localDatalayerDocuments.length,
    cloudDatalayer: cloudDatalayerDocuments.length,
    total,
  });

  // Determine majority type
  let majorityType: "native" | "local" | "cloud" | "none" = "none";

  if (total > 0) {
    const counts = {
      native: nativeNotebooks.length,
      local: localDatalayerDocuments.length,
      cloud: cloudDatalayerDocuments.length,
    };

    // Find the maximum count
    const maxCount = Math.max(counts.native, counts.local, counts.cloud);

    if (counts.cloud === maxCount) {
      majorityType = "cloud";
    } else if (counts.local === maxCount) {
      majorityType = "local";
    } else if (counts.native === maxCount) {
      // If native notebooks are the majority, we still default to local
      // (tools will create local Datalayer notebooks, not native ones)
      majorityType = "local";
    }
  }

  ServiceLoggers.main.debug(
    `[DocumentAnalysis] Majority type: ${majorityType}`,
  );

  // Get active document URI
  let activeDocumentUri: string | undefined;
  const activeEditor = vscode.window.activeNotebookEditor;
  if (activeEditor) {
    activeDocumentUri = activeEditor.notebook.uri.toString();
    ServiceLoggers.main.debug(
      `[DocumentAnalysis] Active document: ${activeDocumentUri}`,
    );
  } else {
    ServiceLoggers.main.debug(`[DocumentAnalysis] No active document editor`);
  }

  return {
    nativeNotebooks,
    localDatalayerDocuments,
    cloudDatalayerDocuments,
    total,
    majorityType,
    activeDocumentUri,
  };
}

/**
 * Gets all open notebook URIs (regardless of type).
 *
 * @returns Array of all notebook URIs currently open in workspace.
 */
export function getAllOpenNotebookUris(): string[] {
  return vscode.workspace.notebookDocuments.map((nb) => nb.uri.toString());
}

/**
 * Gets the active notebook URI (if any).
 *
 * @returns URI of the active notebook, or undefined if no notebook is active.
 */
export function getActiveNotebookUri(): string | undefined {
  const activeEditor = vscode.window.activeNotebookEditor;
  return activeEditor?.notebook.uri.toString();
}

/**
 * Checks if a URI is a Datalayer document (notebook or lexical, local or cloud).
 *
 * @param uri - The URI to check.
 *
 * @returns True if it's a Datalayer document (not native).
 */
export function isDatalayerNotebook(uri: vscode.Uri): boolean {
  // Cloud Datalayer documents (notebooks or lexicals)
  if (uri.scheme === "datalayer") {
    return true;
  }

  // Local files - need to check if opened with Datalayer editor
  if (uri.scheme === "file" || uri.scheme === "untitled") {
    const fsPath = uri.fsPath;
    const isNotebook = fsPath.endsWith(".ipynb");
    const isLexical = fsPath.endsWith(".dlex") || fsPath.endsWith(".lexical");

    if (!isNotebook && !isLexical) {
      return false;
    }

    // Check through tab groups to find the viewType
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && typeof tab.input === "object" && "uri" in tab.input) {
          const tabUri = (tab.input as { uri?: vscode.Uri }).uri;
          const viewType = (tab.input as { viewType?: string }).viewType;

          if (tabUri?.toString() === uri.toString()) {
            return (
              viewType === "datalayer.jupyter-notebook" ||
              viewType === "datalayer.lexical" ||
              viewType === "datalayer.lexical-editor"
            );
          }
        }
      }
    }

    // If not found in tabs, assume it's a Datalayer document if it's .ipynb or .dlex/.lexical
    // (Better to assume Datalayer than native for tool operations)
    return true;
  }

  return false;
}

/**
 * Checks if a URI is a cloud Datalayer document (notebook or lexical).
 *
 * @param uri - The URI to check.
 *
 * @returns True if it's a cloud document.
 */
export function isCloudNotebook(uri: vscode.Uri): boolean {
  return uri.scheme === "datalayer";
}

/**
 * Checks if a URI is a local document (notebook or lexical, native or Datalayer).
 *
 * @param uri - The URI to check.
 *
 * @returns True if it's a local file.
 */
export function isLocalNotebook(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === "file" || uri.scheme === "untitled") &&
    (uri.fsPath.endsWith(".ipynb") ||
      uri.fsPath.endsWith(".dlex") ||
      uri.fsPath.endsWith(".lexical"))
  );
}
