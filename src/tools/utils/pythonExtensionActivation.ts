/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility to ensure Python extension is activated
 *
 * @module tools/utils/pythonExtensionActivation
 */

import * as vscode from "vscode";

/**
 * Ensures the Python extension is activated.
 *
 * The Python extension uses lazy activation and only activates when:
 * - A Python file is opened
 * - A Python command is executed
 * - A Python interpreter is selected
 *
 * This function programmatically triggers activation by executing a
 * lightweight command, allowing kernel discovery to work even when
 * no Python files are open.
 *
 * @returns Promise that resolves when extension is active (or after timeout)
 */
export async function ensurePythonExtensionActive(): Promise<boolean> {
  const pythonExt = vscode.extensions.getExtension("ms-python.python");

  if (!pythonExt) {
    return false;
  }

  if (pythonExt.isActive) {
    return true;
  }

  // Method 1: Try executing a lightweight Python command
  try {
    // This command is read-only and triggers activation
    await vscode.commands.executeCommand("python.clearWorkspaceInterpreter");
  } catch {
    // Command may fail, but it should trigger activation
  }

  // Wait for activation with timeout
  const maxWaitMs = 2000; // 2 seconds max
  const checkIntervalMs = 100;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (pythonExt.isActive) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  // If still not active, try alternative method: create in-memory document
  if (!pythonExt.isActive) {
    try {
      // Create in-memory Python document (triggers onLanguage:python)
      const doc = await vscode.workspace.openTextDocument({
        language: "python",
        content: "# Temporary document to activate Python extension\n",
      });

      // Wait a bit for activation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Close the document silently (no save prompt)
      await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: true,
      });
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor",
      );

      if (pythonExt.isActive) {
        return true;
      }
    } catch (error) {
      console.error(
        "[pythonExtensionActivation] Document method failed:",
        error,
      );
    }
  }

  return false;
}
