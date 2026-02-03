/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Main extension module for the Datalayer VS Code extension.
 * Orchestrates the initialization of all services, UI components, and commands.
 *
 * NOTE: The os module is preloaded by preload.ts (the webpack entry point)
 * to ensure it's available before cmake-ts tries to call os.platform()
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
let lspBridge: import("./services/bridges/lspBridge").LSPBridge | undefined;

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
 * Get the settings tree provider instance.
 * @returns The settings tree provider or undefined if not initialized
 */
export function getSettingsTreeProvider() {
  return ui?.settingsTreeProvider;
}

/**
 * Get the LSP bridge instance for notebook cell LSP integration.
 * @returns The LSP bridge or undefined if not initialized
 */
export function getLSPBridge() {
  return lspBridge;
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
  // Outer try-catch for the entire activation
  try {
    console.log("[ACTIVATION] Step 1: Extension activation started");

    let activationTimer;
    let logger;

    // STEP 2: Create performance timer
    try {
      console.log("[ACTIVATION] Step 2: Creating performance timer...");
      activationTimer = PerformanceLogger.createTimer("extension_activation", {
        version: vscode.extensions.getExtension(
          "datalayer.datalayer-jupyter-vscode",
        )?.packageJSON.version,
        vscodeVersion: vscode.version,
      });
      activationTimer.start();
      console.log("[ACTIVATION] Step 2: Performance timer created ✓");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 2 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 2 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 3-4: Create service container
    try {
      console.log("[ACTIVATION] Step 3: Creating service container...");
      services = new ServiceContainer(context);
      console.log("[ACTIVATION] Step 4: Service container created ✓");
      activationTimer.checkpoint("service_container_created");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 3-4 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 3-4 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 5-6: Initialize services
    try {
      console.log("[ACTIVATION] Step 5: Initializing services...");
      await services.initialize();
      console.log("[ACTIVATION] Step 6: Services initialized ✓");
      activationTimer.checkpoint("services_initialized");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 5-6 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 5-6 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 7: Get logger
    try {
      console.log("[ACTIVATION] Step 7: Getting logger...");
      logger = services.logger;
      logger.info("Datalayer extension activation started", {
        version: vscode.extensions.getExtension(
          "datalayer.datalayer-jupyter-vscode",
        )?.packageJSON.version,
        vscodeVersion: vscode.version,
        extensionId: context.extension.id,
        workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
      });
      console.log("[ACTIVATION] Step 7: Logger available ✓");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 7 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 7 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 8-9: Initialize UI
    try {
      console.log("[ACTIVATION] Step 8: Initializing UI...");
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
      console.log("[ACTIVATION] Step 9: UI initialized ✓");
      activationTimer.checkpoint("ui_initialized");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 8-9 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 8-9 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 10-11: Register filesystem provider
    try {
      console.log("[ACTIVATION] Step 10: Registering filesystem provider...");
      const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
      fileSystemProvider.initialize(context);
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
      console.log("[ACTIVATION] Step 11: Filesystem provider registered ✓");
      activationTimer.checkpoint("filesystem_provider_registered");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 10-11 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 10-11 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 12-13: Register LSP infrastructure
    try {
      console.log("[ACTIVATION] Step 12: Registering LSP infrastructure...");
      logger.debug("Registering LSP infrastructure for notebook cells");
      const { LSPBridge } = await import("./services/bridges/lspBridge");

      lspBridge = new LSPBridge();

      context.subscriptions.push({
        dispose: () => {
          lspBridge?.dispose();
        },
      });

      console.log("[ACTIVATION] Step 13: LSP infrastructure registered ✓");
      activationTimer.checkpoint("lsp_infrastructure_registered");
      logger.info(
        "LSP infrastructure registered for Python and Markdown cells (completions + hover)",
      );
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 12-13 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 12-13 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 14-17: Setup auth state management and register commands
    try {
      console.log("[ACTIVATION] Step 14: Setting up auth state management...");
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
        ui.settingsTreeProvider,
      );
      console.log("[ACTIVATION] Step 15: Auth state management setup ✓");
      activationTimer.checkpoint("auth_state_setup");

      // Store auth provider globally for diagnostic commands
      (
        globalThis as typeof globalThis & { __datalayerAuth?: unknown }
      ).__datalayerAuth = services.authProvider;

      console.log("[ACTIVATION] Step 16: Registering commands...");
      logger.debug("Setting up commands registration");
      registerAllCommands(
        context,
        {
          authProvider: services.authProvider as SDKAuthProvider,
          documentBridge: services.documentBridge as DocumentBridge,
          spacesTreeProvider: ui.spacesTreeProvider,
          controllerManager: ui.controllerManager,
          runtimesTreeProvider: ui.runtimesTreeProvider,
          settingsTreeProvider: ui.settingsTreeProvider,
          outlineTreeProvider: ui.outlineTreeProvider,
        },
        updateAuthState,
      );
      console.log("[ACTIVATION] Step 17: Commands registered ✓");
      activationTimer.checkpoint("commands_registered");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 14-17 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 14-17 Stack:", error.stack);
      }
      throw error;
    }

    // Register Datalayer Jupyter Server Collection
    // This adds "Datalayer" to the kernel picker with runtime servers + commands
    console.log(
      "[ACTIVATION] Step 18: Registering Jupyter Server Collection...",
    );
    logger.debug("Registering Datalayer Jupyter Server Collection");
    try {
      console.log("[ACTIVATION] Step 18a: Importing serverProvider...");
      const { DatalayerJupyterServerProvider } =
        await import("./jupyter/serverProvider");
      console.log(
        "[ACTIVATION] Step 18b: Import successful, creating instance...",
      );
      const jupyterServerProvider = new DatalayerJupyterServerProvider(
        services!.sdk,
        services!.authProvider as SDKAuthProvider,
        ui!.controllerManager,
      );
      console.log(
        "[ACTIVATION] Step 18c: Instance created, adding to subscriptions...",
      );
      context.subscriptions.push(jupyterServerProvider);
      console.log("[ACTIVATION] Step 19: Jupyter Server Collection registered");
      activationTimer.checkpoint("jupyter_server_collection_registered");
      logger.info(
        "Datalayer Jupyter Server Collection registered successfully",
      );
    } catch (error: unknown) {
      console.log(
        "[ACTIVATION] Step 18-ERROR: Jupyter Server Collection registration failed",
      );
      console.error("[ACTIVATION] Full error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.log("[ACTIVATION] Error message:", errorMessage);
      if (error instanceof Error && error.stack) {
        console.log("[ACTIVATION] Stack trace:", error.stack);
      }
      logger.warn(
        `Failed to register Datalayer Jupyter Server Collection. The Jupyter extension may be missing or inactive: ${errorMessage}`,
      );
      logger.info(
        "Extension will continue with reduced functionality. Install ms-toolsai.jupyter for full Jupyter integration.",
      );
    }

    // STEP 20-21: Register embedded MCP tools
    try {
      console.log("[ACTIVATION] Step 20: Registering MCP tools...");
      logger.debug("Registering unified MCP tools with new architecture");
      const { registerVSCodeTools } = await import("./tools/core/registration");

      await registerVSCodeTools(context);
      console.log("[ACTIVATION] Step 21: MCP tools registered ✓");
      activationTimer.checkpoint("mcp_tools_registered");
      logger.info(
        "Registered all embedded MCP tools for Copilot using unified architecture",
      );
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 20-21 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 20-21 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 22-23: Proactively activate Python extension
    try {
      console.log("[ACTIVATION] Step 22: Activating Python extension...");
      logger.debug(
        "Proactively activating Python extension for kernel discovery",
      );
      const { ensurePythonExtensionActive } =
        await import("./tools/utils/pythonExtensionActivation");
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
      console.log(
        "[ACTIVATION] Step 23: Python extension activation started ✓",
      );
      activationTimer.checkpoint("python_extension_activation_started");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 22-23 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 22-23 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 24-25: Initialize Pyodide preloader
    try {
      console.log("[ACTIVATION] Step 24: Initializing Pyodide preloader...");
      logger.debug("Initializing Pyodide preloader for webview notebooks");
      const { PyodidePreloader } =
        await import("./services/pyodide/pyodidePreloader");
      const pyodidePreloader = new PyodidePreloader(context, logger);
      context.subscriptions.push(pyodidePreloader);
      // Initialize preloader (prompts user if configured)
      pyodidePreloader.initialize().catch((error) => {
        logger.error("Failed to initialize Pyodide preloader:", error);
      });
      console.log("[ACTIVATION] Step 25: Pyodide preloader initialized ✓");
      activationTimer.checkpoint("pyodide_preloader_initialized");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 24-25 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 24-25 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 26-27: Preload packages for native notebooks
    try {
      console.log(
        "[ACTIVATION] Step 26: Preloading native notebook packages...",
      );
      logger.debug("Preloading packages for native notebooks");
      const { preloadPackagesForNativeNotebooks } =
        await import("./services/pyodide/nativeNotebookPreloader");
      // Fire-and-forget preload (don't block activation)
      preloadPackagesForNativeNotebooks(context, logger).catch(
        (error: unknown) => {
          logger.error(
            "Failed to preload packages for native notebooks:",
            error instanceof Error ? error : undefined,
          );
        },
      );
      console.log("[ACTIVATION] Step 27: Native notebook preload started ✓");
      activationTimer.checkpoint("native_notebook_preload_started");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 26-27 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 26-27 Stack:", error.stack);
      }
      throw error;
    }

    // Register chat context provider for notebooks and lexical documents
    console.log("[ACTIVATION] Step 28: Registering chat context providers...");
    logger.debug("Registering chat context providers for Copilot");
    try {
      context.subscriptions.push(registerChatContextProvider(context));
      console.log("[ACTIVATION] Step 29: Chat context providers registered");
      logger.info("Chat context providers registered successfully");
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("Failed to register chat context providers", error);
    }

    // Register Datalayer chat participant (@datalayer)
    console.log(
      "[ACTIVATION] Step 30: Registering Datalayer chat participant...",
    );
    logger.debug("Registering Datalayer chat participant");
    try {
      const { DatalayerChatParticipant } =
        await import("./chat/datalayerChatParticipant");
      const chatParticipant = new DatalayerChatParticipant(context);
      context.subscriptions.push(chatParticipant.register());
      console.log(
        "[ACTIVATION] Step 31: Datalayer chat participant registered",
      );
      logger.info("Datalayer chat participant registered (@datalayer)");
    } catch (error: unknown) {
      console.log(
        "[ACTIVATION] ERROR: Failed to register Datalayer chat participant",
        error,
      );
      logger.error(
        "Failed to register Datalayer chat participant",
        error as Error,
      );
    }

    // STEP 32-33: Set up notebook event handlers and disposal
    try {
      console.log(
        "[ACTIVATION] Step 32: Setting up notebook event handlers...",
      );
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
      console.log("[ACTIVATION] Step 33: Disposal registered ✓");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 32-33 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 32-33 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 34-36: Show unified onboarding
    try {
      console.log("[ACTIVATION] Step 34: Loading onboarding...");
      const { showUnifiedWelcomePrompt, disableBuiltInNotebookTool } =
        await import("./onboarding/unifiedWelcome");

      // Disable built-in VS Code newJupyterNotebook tool to avoid conflicts with Copilot
      console.log("[ACTIVATION] Step 35: Disabling built-in notebook tool...");
      disableBuiltInNotebookTool(context, logger);

      console.log("[ACTIVATION] Step 36: Showing welcome prompt...");
      await showUnifiedWelcomePrompt(context, logger);
      console.log("[ACTIVATION] Step 36: Welcome prompt completed ✓");
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 34-36 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 34-36 Stack:", error.stack);
      }
      throw error;
    }

    // STEP 37-38: Notify extension ready and complete activation
    try {
      console.log("[ACTIVATION] Step 37: Notifying extension ready...");
      notifyExtensionReady();

      // End activation timer
      activationTimer.end("success");

      console.log("[ACTIVATION] Step 38: Activation completed successfully ✓");
      logger.info("Datalayer extension activation completed successfully", {
        totalCommands: context.subscriptions.length,
      });
    } catch (error: unknown) {
      console.error("[ACTIVATION] Step 37-38 ERROR:", error);
      if (error instanceof Error) {
        console.error("[ACTIVATION] Step 37-38 Stack:", error.stack);
      }
      throw error;
    }
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
