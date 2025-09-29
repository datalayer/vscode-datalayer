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
import { LoggerManager } from "./services/loggerManager";
import { ServiceLoggers } from "./services/loggers";
import { PerformanceLogger } from "./services/performanceLogger";

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
    // Initialize logging infrastructure FIRST
    const loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);

    const logger = ServiceLoggers.main;
    logger.info("Datalayer extension activation started", {
      version: vscode.extensions.getExtension(
        "datalayer.datalayer-jupyter-vscode"
      )?.packageJSON.version,
      vscodeVersion: vscode.version,
      extensionId: context.extension.id,
      workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
    });

    const services = await PerformanceLogger.trackOperation(
      "initialize_services",
      () => initializeServices(context),
      { stage: "extension_activation" }
    );

    const ui = await PerformanceLogger.trackOperation(
      "initialize_ui",
      () => initializeUI(context, services.authProvider, services.sdk),
      { stage: "extension_activation" }
    );

    const updateAuthState = setupAuthStateManagement(
      services.authProvider,
      ui.spacesTreeProvider,
      ui.controllerManager
    );

    logger.debug("Setting up commands registration");
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

    // Set up notebook event handlers with logging
    context.subscriptions.push(
      vscode.workspace.onDidCloseNotebookDocument((notebook) => {
        logger.debug("Notebook closed", {
          uri: notebook.uri.toString(),
          cellCount: notebook.cellCount,
          isDirty: notebook.isDirty,
        });
        ui.controllerManager.onDidCloseNotebook(notebook);
      })
    );

    logger.info("Datalayer extension activation completed successfully", {
      totalCommands: context.subscriptions.length,
      activationTime: "tracked_by_performance_logger",
    });
  } catch (error) {
    // Use logger if available, fallback to VS Code notification
    let logger;
    try {
      logger = ServiceLoggers.main;
    } catch {
      // Logger not available, will use VS Code notification only
    }

    if (logger) {
      logger.error("Extension activation failed", error as Error, {
        stage: "extension_activation",
        vscodeVersion: vscode.version,
      });
    }

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
  try {
    // Try to log deactivation if logger is available
    if (ServiceLoggers.isInitialized()) {
      const logger = ServiceLoggers.main;
      logger.info("Datalayer extension deactivation started");

      // Clear any tracked operations
      if (
        typeof (global as any).datalayerClientOperationTracker !== "undefined"
      ) {
        logger.debug("Clearing tracked operations");
      }

      logger.info("Datalayer extension deactivated successfully");
    }
  } catch (error) {
    // Silent failure - extension is shutting down anyway
    console.error("Error during extension deactivation:", error);
  }
}
