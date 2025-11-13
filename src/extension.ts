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
import type { ILogger } from "./services/interfaces/ILogger";
import {
  DocumentBridge,
  notifyExtensionReady,
} from "./services/bridges/documentBridge";
import { DatalayerFileSystemProvider } from "./providers/documentsFileSystemProvider";
import type { ExtensionUI } from "./services/ui/uiSetup";
import { PyodidePreloader } from "./services/pyodide/pyodidePreloader";

// Global service container instance
let services: ServiceContainer | undefined;
let ui: ExtensionUI | undefined;

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
 * Get the outline tree provider instance.
 * @returns The outline tree provider or undefined if not initialized
 */
export function getOutlineTreeProvider() {
  return ui?.outlineTreeProvider;
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
    // This creates all tree providers in order: outline, spaces, runtimes, snapshots
    ui = await PerformanceLogger.trackOperation(
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

    // Register file system provider for virtual datalayer:// URIs
    const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
    fileSystemProvider.initialize(context); // Restore persisted mappings
    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider(
        "datalayer",
        fileSystemProvider,
        {
          isCaseSensitive: true,
          isReadonly: false,
        },
      ),
    );
    activationTimer.checkpoint("filesystem_provider_registered");

    // Open Datalayer sidebar on first run
    await openSidebarOnFirstRun(context, logger);

    // Subscribe to runtime creation events from controller manager to refresh tree
    context.subscriptions.push(
      ui.controllerManager.onRuntimeCreated(() => {
        ui?.runtimesTreeProvider.refresh();
      }),
    );

    const updateAuthState = setupAuthStateManagement(
      services.authProvider as SDKAuthProvider,
      ui.spacesTreeProvider,
      ui.controllerManager,
      ui.runtimesTreeProvider,
    );
    activationTimer.checkpoint("auth_state_setup");

    logger.debug("Setting up commands registration");
    registerAllCommands(
      context,
      {
        authProvider: services.authProvider as SDKAuthProvider,
        documentBridge: services.documentBridge as DocumentBridge,
        spacesTreeProvider: ui.spacesTreeProvider,
        controllerManager: ui.controllerManager,
        runtimesTreeProvider: ui.runtimesTreeProvider,
        snapshotsTreeProvider: ui.snapshotsTreeProvider,
        outlineTreeProvider: ui.outlineTreeProvider,
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
        ui?.controllerManager.onDidCloseNotebook(notebook);
      }),
    );

    // Initialize Pyodide preloader (runs in background, doesn't block activation)
    const pyodidePreloader = new PyodidePreloader(
      context,
      services.loggerManager.createLogger("PyodidePreloader"),
    );
    context.subscriptions.push(pyodidePreloader);

    // Start preload asynchronously - don't await to avoid blocking activation
    pyodidePreloader.initialize().catch((error: Error) => {
      logger.warn("Pyodide preloader initialization failed", {
        error: error.message,
      });
    });
    activationTimer.checkpoint("pyodide_preloader_started");

    // Watch for Pyodide version changes and notify user
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("datalayer.pyodide.version")) {
          const config = vscode.workspace.getConfiguration("datalayer.pyodide");
          const newVersion = config.get<string>("version", "0.29.0");

          logger.info("Pyodide version changed", { newVersion });

          // Check if there are any active notebooks
          const activeNotebooks = vscode.workspace.notebookDocuments;

          if (activeNotebooks.length > 0) {
            vscode.window
              .showInformationMessage(
                `Pyodide version changed to ${newVersion}. Close and reopen notebooks to use the new version and packages.`,
                "Close All Notebooks",
                "OK",
              )
              .then((selection) => {
                if (selection === "Close All Notebooks") {
                  // Close all notebook editors
                  vscode.window.tabGroups.all.forEach((group) => {
                    group.tabs.forEach((tab) => {
                      if (tab.input instanceof vscode.TabInputNotebook) {
                        vscode.window.tabGroups.close(tab);
                      }
                    });
                  });
                }
              });
          } else {
            vscode.window.showInformationMessage(
              `Pyodide version changed to ${newVersion}. The new version will be used when you open a notebook.`,
            );
          }
        }
      }),
    );

    // Register disposal
    context.subscriptions.push({
      dispose: async () => {
        await services?.dispose();
      },
    });

    // Prompt user to set Datalayer as default notebook editor (only once)
    await promptSetDefaultNotebookEditor(context, logger);

    // Notify that extension is ready (unblocks document loading during startup)
    notifyExtensionReady();

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
 * Refreshes the runtimes tree view.
 * Called after runtime operations to update the tree.
 */
export function refreshRuntimesTree(): void {
  ui?.runtimesTreeProvider.refresh();
}

/**
 * Opens the Datalayer sidebar on first run and moves it to visible Activity Bar.
 * Only runs once per installation.
 *
 * @param context - Extension context for storing state
 * @param logger - Logger instance for tracking
 */
async function openSidebarOnFirstRun(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  const SIDEBAR_OPENED_KEY = "datalayer.sidebarOpenedOnFirstRun";

  // Check if we've already opened the sidebar on first run
  const hasOpenedSidebar = context.globalState.get<boolean>(
    SIDEBAR_OPENED_KEY,
    false,
  );

  if (!hasOpenedSidebar) {
    try {
      // Move the Datalayer icon from overflow menu to visible Activity Bar
      const config = vscode.workspace.getConfiguration();
      const currentPinnedViews = config.get<string[]>(
        "workbench.activityBar.pinnedViewlets",
        [],
      );

      // Add Datalayer view container to pinned views if not already there
      const datalayerViewId = "workbench.view.extension.datalayer";
      if (!currentPinnedViews.includes(datalayerViewId)) {
        const updatedPinnedViews = [...currentPinnedViews, datalayerViewId];
        await config.update(
          "workbench.activityBar.pinnedViewlets",
          updatedPinnedViews,
          vscode.ConfigurationTarget.Global,
        );
        logger.info("Pinned Datalayer icon to Activity Bar");
      }

      // Focus on the Datalayer view container (opens the sidebar)
      await vscode.commands.executeCommand(datalayerViewId);
      logger.info("Opened Datalayer sidebar on first run");

      // Mark that we've opened the sidebar
      await context.globalState.update(SIDEBAR_OPENED_KEY, true);
    } catch (error) {
      logger.warn("Failed to open Datalayer sidebar on first run", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Prompts the user to set Datalayer as the default notebook editor.
 * Only shows the prompt once per installation.
 *
 * @param context - Extension context for storing state
 * @param logger - Logger instance for tracking user response
 */
async function promptSetDefaultNotebookEditor(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  const PROMPT_KEY = "datalayer.defaultEditorPromptShown";

  // Check if we've already shown this prompt
  const hasShownPrompt = context.globalState.get<boolean>(PROMPT_KEY, false);
  if (hasShownPrompt) {
    return;
  }

  // Check current default editor setting
  const config = vscode.workspace.getConfiguration();
  const currentDefault = config.get<string>(
    "workbench.editorAssociations.*.ipynb",
  );

  // If already set to Datalayer, no need to prompt
  if (currentDefault === "datalayer.jupyter-notebook") {
    await context.globalState.update(PROMPT_KEY, true);
    return;
  }

  // Show prompt to user
  const choice = await vscode.window.showInformationMessage(
    "Would you like to set Datalayer as the default editor for Jupyter Notebook (.ipynb) files?",
    "Yes",
    "No",
    "Don't Ask Again",
  );

  logger.info("Default editor prompt shown", { userChoice: choice });

  if (choice === "Yes") {
    // Set Datalayer as default for .ipynb files
    await config.update(
      "workbench.editorAssociations",
      {
        "*.ipynb": "datalayer.jupyter-notebook",
      },
      vscode.ConfigurationTarget.Global,
    );

    logger.info("Datalayer set as default notebook editor");

    vscode.window.showInformationMessage(
      "Datalayer is now the default editor for .ipynb files",
    );

    await context.globalState.update(PROMPT_KEY, true);
  } else if (choice === "Don't Ask Again") {
    logger.info("User chose not to be asked again about default editor");
    await context.globalState.update(PROMPT_KEY, true);
  }
  // If "No" or dismissed, we'll ask again next time (don't set PROMPT_KEY)
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
        typeof (
          global as typeof globalThis & {
            datalayerClientOperationTracker?: unknown;
          }
        ).datalayerClientOperationTracker !== "undefined"
      ) {
        logger.debug("Clearing tracked operations");
      }
    }

    // Dispose runtimes tree provider
    ui?.runtimesTreeProvider.dispose();

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
