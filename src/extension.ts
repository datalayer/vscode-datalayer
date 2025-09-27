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
  try {
    const services = await initializeServices(context);

    const ui = await initializeUI(
      context,
      services.authProvider,
      services.runtimeService
    );

    const updateAuthState = setupAuthStateManagement(
      services.authProvider,
      ui.spacesTreeProvider,
      ui.runtimeControllerManager
    );

    registerAllCommands(
      context,
      {
        authProvider: services.authProvider,
        spacerService: services.spacerService,
        documentBridge: services.documentBridge,
        spacesTreeProvider: ui.spacesTreeProvider,
        runtimeControllerManager: ui.runtimeControllerManager,
      },
      updateAuthState
    );

    console.log(
      "[Extension] Datalayer VS Code extension activated successfully"
    );
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
