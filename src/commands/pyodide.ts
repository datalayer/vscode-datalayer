/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Command handlers for Pyodide-related operations
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
// CRITICAL: Use require() for os to ensure it uses the cached version from preload.ts
// ES6 imports may execute before preload, causing "Cannot read properties of undefined (reading 'platform')"
const os = require("os");

/**
 * Keys for storing preload state (must match pyodidePreloader.ts and nativeNotebookPreloader.ts)
 */
const PRELOAD_PROMPTED_KEY = "datalayer.pyodide.preloadPrompted";
const PRELOADED_PACKAGES_KEY = "datalayer.pyodide.preloadedPackages";
const NATIVE_PRELOAD_KEY = "datalayer.pyodide.nativePreloaded";

/**
 * Clear the Pyodide package cache for BOTH native and webview notebooks.
 * - Native notebooks: Deletes ~/.cache/datalayer-pyodide/ (packages) AND globalStorage/pyodide/ (old core files)
 * - Webview notebooks: Reloads webviews to clear IndexedDB cache
 * This removes all downloaded Python packages and old Pyodide core files, forcing them to be re-downloaded on next use.
 */
export async function clearPyodideCache(
  context: vscode.ExtensionContext,
): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    "This will clear all cached Pyodide packages for both native and webview notebooks. They will need to be re-downloaded when you next use the Pyodide kernel. Continue?",
    { modal: true },
    "Clear Cache",
    "Cancel",
  );

  if (confirmation !== "Clear Cache") {
    return;
  }

  // Clear the extension's tracking state so preloader knows to re-download
  // Reset ALL preload flags: webview preloader AND native notebook preloader
  await context.globalState.update(PRELOADED_PACKAGES_KEY, "");
  await context.globalState.update(PRELOAD_PROMPTED_KEY, false);
  await context.globalState.update(NATIVE_PRELOAD_KEY, false); // CRITICAL: Reset native preloader flag

  // Clear NATIVE notebook cache (filesystem directory)
  try {
    const cacheDir = path.join(os.homedir(), ".cache", "datalayer-pyodide");

    await fs.rm(cacheDir, { recursive: true, force: true });
    console.log(`[Pyodide] Cleared native cache directory: ${cacheDir}`);
  } catch (error) {
    console.warn(
      `[Pyodide] Failed to clear native cache (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Clear OLD globalStorage Pyodide core files (from pyodideCacheManager)
  // This removes old version files that can cause version mismatch errors
  try {
    const globalStoragePyodideDir = path.join(
      context.globalStorageUri.fsPath,
      "pyodide",
    );

    await fs.rm(globalStoragePyodideDir, { recursive: true, force: true });
    console.log(
      `[Pyodide] Cleared globalStorage Pyodide directory: ${globalStoragePyodideDir}`,
    );
  } catch (error) {
    console.warn(
      `[Pyodide] Failed to clear globalStorage Pyodide directory (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Clear WEBVIEW notebook cache (IndexedDB)
  // Execute JavaScript in all notebook webviews to clear IndexedDB
  // The cache is stored in the webview's IndexedDB, not in the extension
  await vscode.commands.executeCommand(
    "workbench.action.webview.reloadWebviewAction",
  );

  vscode.window.showInformationMessage(
    "Pyodide cache cleared (packages + old core files + webview cache). Reload the extension window to be prompted for re-download.",
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
