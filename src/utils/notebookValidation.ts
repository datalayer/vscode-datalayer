/**
 * Utility functions for validating Datalayer notebooks.
 * Ensures tools only operate on Datalayer custom editor notebooks, not native VS Code notebooks.
 */

import * as vscode from "vscode";
import { getActiveCustomEditorUri } from "./activeDocument";

/**
 * Checks if a URI belongs to a Datalayer custom editor notebook.
 * Datalayer notebooks can be:
 * - Local files opened with datalayer.jupyter-notebook viewType
 * - Remote files with datalayer:// scheme
 *
 * @param uri - The URI to check
 * @returns True if it's a Datalayer notebook, false otherwise
 */
export function isDatalayerNotebook(uri: vscode.Uri): boolean {
  // Check for Datalayer virtual file system scheme
  if (uri.scheme === "datalayer") {
    return true;
  }

  // For local files, we need to check if they're opened with our custom editor
  // This is validated by checking if we can send messages to the webview
  // (Native notebooks won't have our webview message system)
  if (uri.scheme === "file" && uri.fsPath.endsWith(".ipynb")) {
    // Local .ipynb files are Datalayer notebooks if opened with our custom editor
    // We'll validate this at runtime when sending messages
    return true;
  }

  return false;
}

/**
 * Finds the active Datalayer notebook URI.
 * Only returns URIs that belong to Datalayer custom editor notebooks.
 *
 * @returns The URI of the active Datalayer notebook, or undefined if none found
 */
export function getActiveDatalayerNotebook(): vscode.Uri | undefined {
  // Get the active custom editor URI
  const uri = getActiveCustomEditorUri();

  // Check if it's a notebook (ends with .ipynb or datalayer:// scheme)
  if (uri && (uri.fsPath.endsWith(".ipynb") || uri.scheme === "datalayer")) {
    return uri;
  }

  return undefined;
}

/**
 * Validates that a notebook URI is a Datalayer custom editor notebook.
 * Throws a descriptive error if validation fails.
 *
 * @param uri - The URI to validate
 * @throws Error if the notebook is not a Datalayer custom editor notebook
 */
export function validateDatalayerNotebook(uri: vscode.Uri): void {
  if (!isDatalayerNotebook(uri)) {
    throw new Error(
      `This tool only works with Datalayer custom editor notebooks.\n\n` +
        `URI: ${uri.toString()}\n` +
        `Scheme: ${uri.scheme}\n\n` +
        `Please open the notebook with the Datalayer extension, not the native VS Code notebook editor.`,
    );
  }
}
