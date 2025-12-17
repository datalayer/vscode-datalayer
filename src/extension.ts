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
import {
  DocumentBridge,
  notifyExtensionReady,
} from "./services/bridges/documentBridge";
import { DatalayerFileSystemProvider } from "./providers/documentsFileSystemProvider";
import type { ExtensionUI } from "./services/ui/uiSetup";
import { registerChatContextProvider } from "./chat/chatContextProvider";

// Global service container instance
let services: ServiceContainer | undefined;
let ui: ExtensionUI | undefined;

/**
 * Get the global service container instance.
 * @internal
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
 * Get the runtimes tree provider instance.
 * @returns The runtimes tree provider or undefined if not initialized
 */
export function getRuntimesTreeProvider() {
  return ui?.runtimesTreeProvider;
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

    // Store auth provider globally for diagnostic commands
    (
      globalThis as typeof globalThis & { __datalayerAuth?: unknown }
    ).__datalayerAuth = services.authProvider;

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

    // Register Datalayer Jupyter Server Collection
    // This adds "Datalayer" to the kernel picker with runtime servers + commands
    logger.debug("Registering Datalayer Jupyter Server Collection");
    const { DatalayerJupyterServerProvider } = await import(
      "./jupyter/serverProvider"
    );
    const jupyterServerProvider = new DatalayerJupyterServerProvider(
      services!.sdk,
      services!.authProvider as SDKAuthProvider,
      ui!.controllerManager,
    );
    context.subscriptions.push(jupyterServerProvider);
    activationTimer.checkpoint("jupyter_server_collection_registered");

    // Register embedded MCP tools for Copilot integration using unified architecture
    logger.debug("Registering unified MCP tools with new architecture");
    const { registerVSCodeTools } = await import("./tools/core/registration");

    registerVSCodeTools(context);
    activationTimer.checkpoint("mcp_tools_registered");
    logger.info(
      "Registered all embedded MCP tools for Copilot using unified architecture",
    );

    // Proactively activate Python extension for kernel discovery
    logger.debug(
      "Proactively activating Python extension for kernel discovery",
    );
    const { ensurePythonExtensionActive } = await import(
      "./tools/utils/pythonExtensionActivation"
    );
    // Fire-and-forget activation (don't block extension startup)
    ensurePythonExtensionActive()
      .then((isActive) => {
        if (isActive) {
          logger.info("Python extension activated successfully");
        } else {
          logger.warn("Python extension activation failed or not installed");
        }
      })
      .catch((error) => {
        logger.error("Error activating Python extension:", error);
      });
    activationTimer.checkpoint("python_extension_activation_started");

    // Initialize Pyodide preloader (handles package caching for webview notebooks)
    logger.debug("Initializing Pyodide preloader for webview notebooks");
    const { PyodidePreloader } = await import(
      "./services/pyodide/pyodidePreloader"
    );
    const pyodidePreloader = new PyodidePreloader(context, logger);
    context.subscriptions.push(pyodidePreloader);
    // Initialize preloader (prompts user if configured)
    pyodidePreloader.initialize().catch((error) => {
      logger.error("Failed to initialize Pyodide preloader:", error);
    });
    activationTimer.checkpoint("pyodide_preloader_initialized");

    // Preload packages for native notebooks (uses bundled npm Pyodide v0.29.0)
    logger.debug("Preloading packages for native notebooks");
    const { preloadPackagesForNativeNotebooks } = await import(
      "./services/pyodide/nativeNotebookPreloader"
    );
    // Fire-and-forget preload (don't block activation)
    preloadPackagesForNativeNotebooks(context, logger).catch(
      (error: unknown) => {
        logger.error(
          "Failed to preload packages for native notebooks:",
          error instanceof Error ? error : undefined,
        );
      },
    );
    activationTimer.checkpoint("native_notebook_preload_started");

    // Register chat context provider for notebooks and lexical documents
    logger.debug("Registering chat context providers for Copilot");
    try {
      context.subscriptions.push(registerChatContextProvider(context));
      logger.info("Chat context providers registered successfully");
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("Failed to register chat context providers", error);
    }

    // Register Datalayer chat participant (@datalayer)
    logger.debug("Registering Datalayer chat participant");
    try {
      const { DatalayerChatParticipant } = await import(
        "./chat/datalayerChatParticipant"
      );
      const chatParticipant = new DatalayerChatParticipant(context);
      context.subscriptions.push(chatParticipant.register());
      logger.info("Datalayer chat participant registered (@datalayer)");
    } catch (error: unknown) {
      logger.error(
        "Failed to register Datalayer chat participant",
        error as Error,
      );
    }

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

    // Register disposal
    context.subscriptions.push({
      dispose: async () => {
        await services?.dispose();
      },
    });

    // Show unified onboarding (combines default editor + Jupyter tools prompts)
    const { showUnifiedWelcomePrompt, disableBuiltInNotebookTool } =
      await import("./onboarding/unifiedWelcome");

    // Disable built-in VS Code newJupyterNotebook tool to avoid conflicts with Copilot
    disableBuiltInNotebookTool(context, logger);

    await showUnifiedWelcomePrompt(context, logger);

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
