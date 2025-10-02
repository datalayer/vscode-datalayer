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
import { ServiceContainer } from "./services/core/serviceContainer";
import { initializeUI } from "./services/ui/uiSetup";
import { registerAllCommands } from "./commands";
import { setupAuthStateManagement } from "./services/core/authManager";
import { ServiceLoggers } from "./services/logging/loggers";
import { PerformanceLogger } from "./services/logging/performanceLogger";
import type { SDKAuthProvider } from "./services/core/authProvider";

// Global service container instance
let services: ServiceContainer | undefined;

/**
 * Get the global service container instance.
 * @throws Error if called before extension activation
 */
export function getServiceContainer(): ServiceContainer {
  if (!services) {
    throw new Error(
      "Service container not initialized. Ensure extension is activated.",
    );
  }
  return services;
}

/**
 * Activates the Datalayer VS Code extension.
 * This function is called when the extension is activated by VS Code.
 * It orchestrates the initialization of all components using the service container.
 *
 * @param context - The extension context provided by VS Code
 * @returns Promise that resolves when activation is complete
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    // Create performance timer for full activation tracking
    const activationTimer = PerformanceLogger.createTimer(
      "extension_activation",
      {
        version: vscode.extensions.getExtension(
          "datalayer.datalayer-jupyter-vscode",
        )?.packageJSON.version,
        vscodeVersion: vscode.version,
      },
    );
    activationTimer.start();

    // Create and initialize service container
    services = new ServiceContainer(context);
    activationTimer.checkpoint("service_container_created");

    // Initialize services (this also initializes logging)
    await services.initialize();
    activationTimer.checkpoint("services_initialized");

    // Now logger is available
    const logger = services.logger;
    logger.info("Datalayer extension activation started", {
      version: vscode.extensions.getExtension(
        "datalayer.datalayer-jupyter-vscode",
      )?.packageJSON.version,
      vscodeVersion: vscode.version,
      extensionId: context.extension.id,
      workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
    });

    // Initialize UI with performance tracking (now that logger is available)
    const ui = await PerformanceLogger.trackOperation(
      "initialize_ui",
      () =>
        initializeUI(
          context,
          services!.authProvider as SDKAuthProvider,
          services!.sdk,
        ),
      { stage: "extension_activation" },
    );
    activationTimer.checkpoint("ui_initialized");

    const updateAuthState = setupAuthStateManagement(
      services.authProvider as SDKAuthProvider,
      ui.spacesTreeProvider,
      ui.controllerManager,
    );
    activationTimer.checkpoint("auth_state_setup");

    logger.debug("Setting up commands registration");
    registerAllCommands(
      context,
      {
        authProvider: services.authProvider as SDKAuthProvider,
        documentBridge: services.documentBridge as any, // Cast needed until DocumentBridge is fully migrated
        spacesTreeProvider: ui.spacesTreeProvider,
        controllerManager: ui.controllerManager,
      },
      updateAuthState,
    );
    activationTimer.checkpoint("commands_registered");

    // Set up notebook event handlers with logging
    context.subscriptions.push(
      vscode.workspace.onDidCloseNotebookDocument((notebook) => {
        logger.debug("Notebook closed", {
          uri: notebook.uri.toString(),
          cellCount: notebook.cellCount,
          isDirty: notebook.isDirty,
        });
        ui.controllerManager.onDidCloseNotebook(notebook);
      }),
    );

    // Register disposal
    context.subscriptions.push({
      dispose: async () => {
        await services?.dispose();
      },
    });

    // End activation timer
    activationTimer.end("success");

    logger.info("Datalayer extension activation completed successfully", {
      totalCommands: context.subscriptions.length,
    });
  } catch (error) {
    // Use logger if available, fallback to VS Code notification
    let logger;
    try {
      logger = services?.logger || ServiceLoggers.main;
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
      }`,
    );
  }
}

/**
 * Deactivates the extension and cleans up resources.
 * This function is called when the extension is deactivated or VS Code is closing.
 * All disposables are automatically cleaned up through the context.subscriptions array.
 */
export async function deactivate(): Promise<void> {
  try {
    // Try to log deactivation if logger is available
    if (services?.logger) {
      const logger = services.logger;
      logger.info("Datalayer extension deactivation started");

      // Clear any tracked operations
      if (
        typeof (global as any).datalayerClientOperationTracker !== "undefined"
      ) {
        logger.debug("Clearing tracked operations");
      }
    }

    // Dispose service container
    await services?.dispose();

    if (services?.logger) {
      services.logger.info("Datalayer extension deactivated successfully");
    }
  } catch (error) {
    // Silent failure - extension is shutting down anyway
    console.error("Error during extension deactivation:", error);
  }
}
