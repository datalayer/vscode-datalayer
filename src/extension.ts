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

import { registerChatContextProvider } from "./chat/chatContextProvider";
import { registerAllCommands } from "./commands";
import { DatalayerFileSystemProvider } from "./providers/documentsFileSystemProvider";
import {
  DocumentBridge,
  notifyExtensionReady,
} from "./services/bridges/documentBridge";
import { setupAuthStateManagement } from "./services/core/authManager";
import type { DatalayerAuthProvider } from "./services/core/authProvider";
import { ServiceContainer } from "./services/core/serviceContainer";
import { ServiceLoggers } from "./services/logging/loggers";
import { PerformanceLogger } from "./services/logging/performanceLogger";
import type { ExtensionUI } from "./services/ui/uiSetup";
import { initializeUI } from "./services/ui/uiSetup";

// Global service container instance
let services: ServiceContainer | undefined;
let ui: ExtensionUI | undefined;
let lspBridge: import("./services/bridges/lspBridge").LSPBridge | undefined;

/**
 * Gets the global service container instance used for dependency injection.
 * @returns The initialized service container singleton.
 *
 * @throws Error if called before extension activation.
 *
 * @internal
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
 * Gets the outline tree provider instance for document structure navigation.
 * @returns The outline tree provider or undefined if not initialized.
 *
 */
export function getOutlineTreeProvider():
  | import("./providers/outlineTreeProvider").OutlineTreeProvider
  | undefined {
  return ui?.outlineTreeProvider;
}

/**
 * Gets the runtimes tree provider instance for cloud runtime management.
 * @returns The runtimes tree provider or undefined if not initialized.
 *
 */
export function getRuntimesTreeProvider():
  | import("./providers/runtimesTreeProvider").RuntimesTreeProvider
  | undefined {
  return ui?.runtimesTreeProvider;
}

/**
 * Gets the settings tree provider instance for datasource and secret management.
 * @returns The settings tree provider or undefined if not initialized.
 *
 */
export function getSettingsTreeProvider():
  | import("./providers/settingsTreeProvider").SettingsTreeProvider
  | undefined {
  return ui?.settingsTreeProvider;
}

/**
 * Gets the LSP bridge instance for notebook cell language server protocol integration.
 * @returns The LSP bridge or undefined if not initialized.
 *
 */
export function getLSPBridge():
  | import("./services/bridges/lspBridge").LSPBridge
  | undefined {
  return lspBridge;
}

/**
 * Runs an activation step with error logging. Rethrows on failure.
 * @param stepLabel - Label for console logging.
 * @param fn - Async function to execute.
 */
async function runActivationStep(
  stepLabel: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  try {
    console.log(`[ACTIVATION] ${stepLabel}...`);
    await fn();
    console.log(`[ACTIVATION] ${stepLabel} done`);
  } catch (error: unknown) {
    console.error(`[ACTIVATION] ${stepLabel} ERROR:`, error);
    if (error instanceof Error) {
      console.error(`[ACTIVATION] ${stepLabel} Stack:`, error.stack);
    }
    throw error;
  }
}

/**
 * Runs an activation step that is allowed to fail without blocking activation.
 * @param stepLabel - Label for console logging.
 * @param fn - Async function to execute.
 * @param onError - Optional error handler.
 */
async function runOptionalActivationStep(
  stepLabel: string,
  fn: () => Promise<void> | void,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    console.log(`[ACTIVATION] ${stepLabel}...`);
    await fn();
    console.log(`[ACTIVATION] ${stepLabel} done`);
  } catch (error: unknown) {
    console.error(`[ACTIVATION] ${stepLabel} ERROR:`, error);
    if (onError) {
      onError(error);
    }
  }
}

/**
 * Activates the Datalayer VS Code extension by initializing all services, UI, and commands.
 * This function is called when the extension is activated by VS Code.
 * It orchestrates the initialization of all components using the service container.
 *
 * @param context - The extension context provided by VS Code.
 *
 * @returns Promise that resolves when activation is complete.
 *
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Outer try-catch for the entire activation
  try {
    console.log("[ACTIVATION] Step 1: Extension activation started");

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

    await runActivationStep("Creating service container", () => {
      services = new ServiceContainer(context);
      activationTimer.checkpoint("service_container_created");
    });

    await runActivationStep("Initializing services", async () => {
      await services!.initialize();
      activationTimer.checkpoint("services_initialized");
    });

    const logger = services!.logger;
    logger.info("Datalayer extension activation started", {
      version: vscode.extensions.getExtension(
        "datalayer.datalayer-jupyter-vscode",
      )?.packageJSON.version,
      vscodeVersion: vscode.version,
      extensionId: context.extension.id,
      workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
    });

    await runActivationStep("Initializing UI", async () => {
      ui = await PerformanceLogger.trackOperation(
        "initialize_ui",
        () =>
          initializeUI(
            context,
            services!.authProvider as DatalayerAuthProvider,
            services!.datalayer,
          ),
        { stage: "extension_activation" },
      );
      activationTimer.checkpoint("ui_initialized");
    });

    await runActivationStep("Registering filesystem provider", () => {
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
      activationTimer.checkpoint("filesystem_provider_registered");
    });

    await runActivationStep("Registering LSP infrastructure", async () => {
      logger.debug("Registering LSP infrastructure for notebook cells");
      const { LSPBridge } = await import("./services/bridges/lspBridge");
      lspBridge = new LSPBridge();
      context.subscriptions.push({
        dispose: () => {
          lspBridge?.dispose();
        },
      });
      activationTimer.checkpoint("lsp_infrastructure_registered");
      logger.info(
        "LSP infrastructure registered for Python and Markdown cells (completions + hover)",
      );
    });

    await runActivationStep("Setting up auth state and commands", async () => {
      context.subscriptions.push(
        ui!.controllerManager.onRuntimeCreated(() => {
          ui?.runtimesTreeProvider.refresh();
        }),
      );
      const updateAuthState = setupAuthStateManagement(
        services!.authProvider as DatalayerAuthProvider,
        ui!.spacesTreeProvider,
        ui!.controllerManager,
        ui!.runtimesTreeProvider,
        ui!.settingsTreeProvider,
      );
      activationTimer.checkpoint("auth_state_setup");
      (
        globalThis as typeof globalThis & { __datalayerAuth?: unknown }
      ).__datalayerAuth = services!.authProvider;
      logger.debug("Setting up commands registration");
      registerAllCommands(
        context,
        {
          authProvider: services!.authProvider as DatalayerAuthProvider,
          documentBridge: services!.documentBridge as DocumentBridge,
          spacesTreeProvider: ui!.spacesTreeProvider,
          controllerManager: ui!.controllerManager,
          runtimesTreeProvider: ui!.runtimesTreeProvider,
          projectsTreeProvider: ui!.projectsTreeProvider,
          settingsTreeProvider: ui!.settingsTreeProvider,
          outlineTreeProvider: ui!.outlineTreeProvider,
        },
        updateAuthState,
      );
      activationTimer.checkpoint("commands_registered");
    });

    await runOptionalActivationStep(
      "Registering Jupyter Server Collection",
      async () => {
        logger.debug("Registering Datalayer Jupyter Server Collection");
        const { DatalayerJupyterServerProvider } =
          await import("./jupyter/serverProvider");
        const jupyterServerProvider = new DatalayerJupyterServerProvider(
          services!.datalayer,
          services!.authProvider as DatalayerAuthProvider,
          ui!.controllerManager,
        );
        context.subscriptions.push(jupyterServerProvider);
        activationTimer.checkpoint("jupyter_server_collection_registered");
        logger.info(
          "Datalayer Jupyter Server Collection registered successfully",
        );
      },
      (error) => {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.warn(
          `Failed to register Datalayer Jupyter Server Collection. The Jupyter extension may be missing or inactive: ${errorMessage}`,
        );
        logger.info(
          "Extension will continue with reduced functionality. Install ms-toolsai.jupyter for full Jupyter integration.",
        );
      },
    );

    await runActivationStep("Registering MCP tools", async () => {
      logger.debug("Registering unified MCP tools with new architecture");
      const { registerVSCodeTools } = await import("./tools/core/registration");
      await registerVSCodeTools(context);
      activationTimer.checkpoint("mcp_tools_registered");
      logger.info(
        "Registered all embedded MCP tools for Copilot using unified architecture",
      );
    });

    await runActivationStep("Activating Python extension", async () => {
      logger.debug(
        "Proactively activating Python extension for kernel discovery",
      );
      const { ensurePythonExtensionActive } =
        await import("./tools/utils/pythonExtensionActivation");
      ensurePythonExtensionActive()
        .then((isActive) => {
          if (isActive) {
            logger.info("Python extension activated successfully");
          } else {
            logger.warn("Python extension activation failed or not installed");
          }
        })
        .catch((err) => {
          logger.error("Error activating Python extension:", err);
        });
      activationTimer.checkpoint("python_extension_activation_started");
    });

    await runActivationStep("Initializing Pyodide preloader", async () => {
      logger.debug("Initializing Pyodide preloader for webview notebooks");
      const { PyodidePreloader } =
        await import("./services/pyodide/pyodidePreloader");
      const pyodidePreloader = new PyodidePreloader(context, logger);
      context.subscriptions.push(pyodidePreloader);
      pyodidePreloader.initialize().catch((err) => {
        logger.error("Failed to initialize Pyodide preloader:", err);
      });
      activationTimer.checkpoint("pyodide_preloader_initialized");
    });

    await runActivationStep("Preloading native notebook packages", async () => {
      logger.debug("Preloading packages for native notebooks");
      const { preloadPackagesForNativeNotebooks } =
        await import("./services/pyodide/nativeNotebookPreloader");
      preloadPackagesForNativeNotebooks(context, logger).catch(
        (err: unknown) => {
          logger.error(
            "Failed to preload packages for native notebooks:",
            err instanceof Error ? err : undefined,
          );
        },
      );
      activationTimer.checkpoint("native_notebook_preload_started");
    });

    await runOptionalActivationStep(
      "Registering chat context providers",
      () => {
        logger.debug("Registering chat context providers for Copilot");
        context.subscriptions.push(registerChatContextProvider(context));
        logger.info("Chat context providers registered successfully");
      },
      (err) => {
        logger.error("Failed to register chat context providers", err as Error);
      },
    );

    await runOptionalActivationStep(
      "Registering Datalayer chat participant",
      async () => {
        logger.debug("Registering Datalayer chat participant");
        const { DatalayerChatParticipant } =
          await import("./chat/datalayerChatParticipant");
        const chatParticipant = new DatalayerChatParticipant(context);
        context.subscriptions.push(chatParticipant.register());
        logger.info("Datalayer chat participant registered (@datalayer)");
      },
      (err) => {
        logger.error(
          "Failed to register Datalayer chat participant",
          err as Error,
        );
      },
    );

    await runActivationStep("Setting up notebook event handlers", () => {
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
      context.subscriptions.push({
        dispose: async () => {
          await services?.dispose();
        },
      });
    });

    await runActivationStep("Showing onboarding", async () => {
      const { showUnifiedWelcomePrompt, disableBuiltInNotebookTool } =
        await import("./onboarding/unifiedWelcome");
      void disableBuiltInNotebookTool(context, logger);
      await showUnifiedWelcomePrompt(context, logger);
    });

    await runActivationStep("Finalizing activation", () => {
      notifyExtensionReady();
      activationTimer.end("success");
      logger.info("Datalayer extension activation completed successfully", {
        totalCommands: context.subscriptions.length,
      });
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
 * Refreshes the runtimes tree view after runtime operations to update the displayed state.
 */
export function refreshRuntimesTree(): void {
  ui?.runtimesTreeProvider.refresh();
}

/**
 * Deactivates the extension and cleans up resources including tracked operations and LSP bridge.
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
