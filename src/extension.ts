/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Main extension module for the Datalayer VS Code extension.
 * Orchestrates the initialization of all services, UI components, and commands.
 *
 * @module extension
 */

import * as vscode from "vscode";
import { initializeServices } from "./services/serviceFactory";
import { initializeUI } from "./services/uiSetup";
import { registerAllCommands } from "./commands";
import { setupAuthStateManagement } from "./services/authManager";

/**
 * Activates the Datalayer VS Code extension.
 * This function is called when the extension is activated by VS Code.
 * It orchestrates the initialization of all components using modular services.
 *
 * @param context - The extension context provided by VS Code
 * @returns Promise that resolves when activation is complete
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  console.log("[Extension] ===== DATALAYER EXTENSION ACTIVATING =====");

  // Create output channel for logging
  const outputChannel = vscode.window.createOutputChannel("Datalayer");
  outputChannel.appendLine("Datalayer Extension Starting...");
  outputChannel.show();

  try {
    outputChannel.appendLine("Initializing services...");
    const services = await initializeServices(context);

    outputChannel.appendLine("Initializing UI...");
    const ui = await initializeUI(context, services.authProvider, services.sdk);
    outputChannel.appendLine("UI initialized");

    outputChannel.appendLine("Setting up auth state management...");
    const updateAuthState = setupAuthStateManagement(
      services.authProvider,
      ui.spacesTreeProvider,
      ui.controllerManager
    );

    outputChannel.appendLine("Registering commands...");
    registerAllCommands(
      context,
      {
        authProvider: services.authProvider,
        documentBridge: services.documentBridge,
        spacesTreeProvider: ui.spacesTreeProvider,
        controllerManager: ui.controllerManager,
      },
      updateAuthState
    );

    // Set up notebook close event handler
    outputChannel.appendLine("Setting up notebook event handlers...");
    context.subscriptions.push(
      vscode.workspace.onDidCloseNotebookDocument((notebook) => {
        ui.controllerManager.onDidCloseNotebook(notebook);
      })
    );

    console.log(
      "[Extension] Datalayer VS Code extension activated successfully"
    );
    outputChannel.appendLine("✅ Extension activated successfully!");
  } catch (error) {
    console.error("[Extension] Failed to activate extension:", error);
    vscode.window.showErrorMessage(
      `Failed to activate Datalayer extension: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Deactivates the extension and cleans up resources.
 * This function is called when the extension is deactivated or VS Code is closing.
 * All disposables are automatically cleaned up through the context.subscriptions array.
 *
 * @returns void
 */
export function deactivate(): void {
  console.log("[Extension] Datalayer VS Code extension deactivated");
}
