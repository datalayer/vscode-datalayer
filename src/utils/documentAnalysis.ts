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

export interface DocumentAnalysisResult {
  /** Native VS Code notebooks (opened with default notebook editor) */
  nativeNotebooks: string[];
  /** Local Datalayer documents - notebooks and lexicals (file:// or untitled://) */
  localDatalayerDocuments: string[];
  /** Cloud Datalayer documents - notebooks and lexicals (datalayer:// scheme) */
  cloudDatalayerDocuments: string[];
  /** Total count of all documents */
  total: number;
  /** Majority type based on counts */
  majorityType: "native" | "local" | "cloud" | "none";
  /** Active document URI (if any) */
  activeDocumentUri?: string;
}

/**
 * Analyzes ALL open documents (notebooks AND lexicals) in VS Code workspace.
 *
 * ULTRA SMART DETECTION:
 * - Checks vscode.window.tabGroups to get ALL open documents including custom editors
 * - Distinguishes native VS Code notebooks from Datalayer local documents
 * - Detects cloud Datalayer documents (notebooks + lexicals) via datalayer:// URI scheme
 * - Includes lexical documents in the analysis for complete context
 *
 * @returns Complete analysis of all open documents with categorization
 */
export function analyzeOpenDocuments(): DocumentAnalysisResult {
  const nativeNotebooks: string[] = [];
  const localDatalayerDocuments: string[] = [];
  const cloudDatalayerDocuments: string[] = [];

  console.log("[DocumentAnalysis] Starting analysis...");
  console.log(
    "[DocumentAnalysis] Total notebook documents:",
    vscode.workspace.notebookDocuments.length,
  );
  console.log(
    "[DocumentAnalysis] Total tab groups:",
    vscode.window.tabGroups.all.length,
  );
  console.log(
    "[DocumentAnalysis] Active text editor:",
    vscode.window.activeTextEditor?.document.uri.toString(),
  );
  console.log(
    "[DocumentAnalysis] Active notebook editor:",
    vscode.window.activeNotebookEditor?.notebook.uri.toString(),
  );
  console.log(
    "[DocumentAnalysis] Visible text editors:",
    vscode.window.visibleTextEditors.length,
  );

  // For Datalayer custom editor documents, we MUST use tab groups
  // because they are CustomDocument, not NotebookDocument!
  for (const group of vscode.window.tabGroups.all) {
    console.log(
      `[DocumentAnalysis] Checking tab group ${group.activeTab?.label}`,
    );
    for (const tab of group.tabs) {
      console.log(
        `[DocumentAnalysis] Tab: label="${tab.label}", input type=${tab.input?.constructor.name}`,
      );

      if (!tab.input || typeof tab.input !== "object") {
        continue;
      }

      // Check for CustomEditorTabInput (Datalayer notebooks/lexicals) or NotebookEditorTabInput (native)
      const tabInput = tab.input as { uri?: vscode.Uri; viewType?: string };
      const uri = tabInput.uri;
      const viewType = tabInput.viewType;

      if (!uri) {
        continue;
      }

      const uriString = uri.toString();
      const scheme = uri.scheme;

      console.log(
        `[DocumentAnalysis] Tab URI: ${uriString}, viewType=${viewType}, scheme=${scheme}`,
      );

      // Cloud Datalayer documents (datalayer:// scheme) - includes notebooks AND lexicals
      if (scheme === "datalayer") {
        console.log(
          `[DocumentAnalysis] ✓ Categorized as CLOUD (datalayer:// scheme)`,
        );
        cloudDatalayerDocuments.push(uriString);
        continue;
      }

      // Local files - check viewType for both notebooks and lexicals
      if (scheme === "file" || scheme === "untitled") {
        if (
          viewType === "datalayer.jupyter-notebook" ||
          viewType === "datalayer.lexical" ||
          viewType === "datalayer.lexical-editor"
        ) {
          console.log(
            `[DocumentAnalysis] ✓ Categorized as LOCAL DATALAYER (viewType match: ${viewType})`,
          );
          localDatalayerDocuments.push(uriString);
        } else if (viewType === "jupyter-notebook") {
          console.log(
            `[DocumentAnalysis] ✓ Categorized as NATIVE (jupyter-notebook viewType)`,
          );
          nativeNotebooks.push(uriString);
        } else if (uriString.endsWith(".ipynb")) {
          // Fallback: if it's .ipynb but no viewType, assume Datalayer
          console.log(
            `[DocumentAnalysis] ✓ Categorized as LOCAL DATALAYER (fallback - .ipynb file)`,
          );
          localDatalayerDocuments.push(uriString);
        } else if (
          uriString.endsWith(".dlex") ||
          uriString.endsWith(".lexical")
        ) {
          // Lexical documents (.dlex or legacy .lexical)
          console.log(
            `[DocumentAnalysis] ✓ Categorized as LOCAL DATALAYER (lexical file)`,
          );
          localDatalayerDocuments.push(uriString);
        }
      }
    }
  }

  const total =
    nativeNotebooks.length +
    localDatalayerDocuments.length +
    cloudDatalayerDocuments.length;

  console.log("[DocumentAnalysis] Results:");
  console.log(`  - Native: ${nativeNotebooks.length}`, nativeNotebooks);
  console.log(
    `  - Local Datalayer: ${localDatalayerDocuments.length}`,
    localDatalayerDocuments,
  );
  console.log(
    `  - Cloud Datalayer: ${cloudDatalayerDocuments.length}`,
    cloudDatalayerDocuments,
  );
  console.log(`  - Total: ${total}`);

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

  console.log(`[DocumentAnalysis] Majority type: ${majorityType}`);

  // Get active document URI
  let activeDocumentUri: string | undefined;
  const activeEditor = vscode.window.activeNotebookEditor;
  if (activeEditor) {
    activeDocumentUri = activeEditor.notebook.uri.toString();
    console.log(`[DocumentAnalysis] Active document: ${activeDocumentUri}`);
  } else {
    console.log(`[DocumentAnalysis] No active document editor`);
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
 * @returns Array of all notebook URIs currently open in workspace
 */
export function getAllOpenNotebookUris(): string[] {
  return vscode.workspace.notebookDocuments.map((nb) => nb.uri.toString());
}

/**
 * Gets the active notebook URI (if any).
 *
 * @returns URI of the active notebook, or undefined if no notebook is active
 */
export function getActiveNotebookUri(): string | undefined {
  const activeEditor = vscode.window.activeNotebookEditor;
  return activeEditor?.notebook.uri.toString();
}

/**
 * Checks if a URI is a Datalayer document (notebook or lexical, local or cloud).
 *
 * @param uri - The URI to check
 * @returns True if it's a Datalayer document (not native)
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
 * @param uri - The URI to check
 * @returns True if it's a cloud document
 */
export function isCloudNotebook(uri: vscode.Uri): boolean {
  return uri.scheme === "datalayer";
}

/**
 * Checks if a URI is a local document (notebook or lexical, native or Datalayer).
 *
 * @param uri - The URI to check
 * @returns True if it's a local file
 */
export function isLocalNotebook(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === "file" || uri.scheme === "untitled") &&
    (uri.fsPath.endsWith(".ipynb") ||
      uri.fsPath.endsWith(".dlex") ||
      uri.fsPath.endsWith(".lexical"))
  );
}
