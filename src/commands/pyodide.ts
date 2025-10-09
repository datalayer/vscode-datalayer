/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Command handlers for Pyodide-related operations
 */

import * as vscode from "vscode";

/**
 * Keys for storing preload state (must match pyodidePreloader.ts)
 */
const PRELOAD_PROMPTED_KEY = "datalayer.pyodide.preloadPrompted";
const PRELOADED_PACKAGES_KEY = "datalayer.pyodide.preloadedPackages";

/**
 * Clear the Pyodide package cache stored in IndexedDB.
 * This removes all downloaded Python packages, forcing them to be re-downloaded on next use.
 */
export async function clearPyodideCache(
  context: vscode.ExtensionContext,
): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    "This will clear all cached Pyodide packages. They will need to be re-downloaded when you next use the Pyodide kernel. Continue?",
    { modal: true },
    "Clear Cache",
    "Cancel",
  );

  if (confirmation !== "Clear Cache") {
    return;
  }

  // Clear the extension's tracking state so preloader knows to re-download
  // Reset both the package cache state AND the prompted flag to trigger user prompt
  await context.globalState.update(PRELOADED_PACKAGES_KEY, "");
  await context.globalState.update(PRELOAD_PROMPTED_KEY, false);

  // Execute JavaScript in all notebook webviews to clear IndexedDB
  // The cache is stored in the webview's IndexedDB, not in the extension
  await vscode.commands.executeCommand(
    "workbench.action.webview.reloadWebviewAction",
  );

  vscode.window.showInformationMessage(
    "Pyodide package cache cleared. Reload the extension window to be prompted for re-download.",
  );
}

/**
 * Register Pyodide-related commands
 */
export function registerPyodideCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.pyodide.clearCache", () =>
      clearPyodideCache(context),
    ),
  );
}
