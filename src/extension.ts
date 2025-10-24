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
import { DocumentBridge } from "./services/bridges/documentBridge";
import { DatalayerFileSystemProvider } from "./providers/documentsFileSystemProvider";
import { RuntimesTreeProvider } from "./providers/runtimesTreeProvider";

// Global service container instance
let services: ServiceContainer | undefined;

// Global runtimes tree provider for refreshing
let runtimesTreeProvider: RuntimesTreeProvider | undefined;

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

    // Register file system provider for virtual datalayer:// URIs
    const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
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

    // Create runtimes tree provider
    runtimesTreeProvider = new RuntimesTreeProvider(
      services.authProvider as SDKAuthProvider,
    );
    context.subscriptions.push(
      vscode.window.createTreeView("datalayerRuntimes", {
        treeDataProvider: runtimesTreeProvider,
      }),
    );
    activationTimer.checkpoint("runtimes_tree_created");

    // Subscribe to runtime creation events from controller manager to refresh tree
    context.subscriptions.push(
      ui.controllerManager.onRuntimeCreated(() => {
        runtimesTreeProvider?.refresh();
      }),
    );

    const updateAuthState = setupAuthStateManagement(
      services.authProvider as SDKAuthProvider,
      ui.spacesTreeProvider,
      ui.controllerManager,
      runtimesTreeProvider,
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
        runtimesTreeProvider: runtimesTreeProvider,
      },
      updateAuthState,
    );
    activationTimer.checkpoint("commands_registered");

    // Register embedded MCP tools for Copilot integration
    logger.debug("Registering embedded MCP tools");
    const {
      // Notebook creation tools
      CreateDatalayerRemoteNotebookTool,
      CreateDatalayerLocalNotebookTool,
      // Lexical creation tools
      CreateRemoteLexicalTool,
      CreateLocalLexicalTool,
      // Runtime management tools
      StartRuntimeTool,
      ConnectRuntimeTool,
      // Datalayer cell manipulation tools (only work with Datalayer notebooks)
      InsertDatalayerCellTool,
      ExecuteDatalayerCellTool,
      // Datalayer cell read tools (jupyter-mcp-server parity)
      ReadAllDatalayerCellsTool,
      ReadDatalayerCellTool,
      GetDatalayerNotebookInfoTool,
      // Datalayer cell modification tools (jupyter-mcp-server parity)
      DeleteDatalayerCellTool,
      OverwriteDatalayerCellTool,
      // Datalayer cell append tools (jupyter-mcp-server parity)
      AppendDatalayerMarkdownCellTool,
      AppendExecuteDatalayerCodeCellTool,
      // Datalayer cell insert tools (jupyter-mcp-server parity)
      InsertDatalayerMarkdownCellTool,
    } = await import("./tools");

    context.subscriptions.push(
      // Notebook creation
      vscode.lm.registerTool(
        "datalayer_createDatalayerRemoteNotebook",
        new CreateDatalayerRemoteNotebookTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_createDatalayerLocalNotebook",
        new CreateDatalayerLocalNotebookTool(),
      ),
      // Lexical creation
      vscode.lm.registerTool(
        "datalayer_createRemoteLexical",
        new CreateRemoteLexicalTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_createLocalLexical",
        new CreateLocalLexicalTool(),
      ),
      // Runtime management
      vscode.lm.registerTool("datalayer_startRuntime", new StartRuntimeTool()),
      vscode.lm.registerTool(
        "datalayer_connectRuntime",
        new ConnectRuntimeTool(),
      ),
      // Datalayer cell manipulation (ONLY Datalayer notebooks)
      vscode.lm.registerTool(
        "datalayer_insertDatalayerCell",
        new InsertDatalayerCellTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_executeDatalayerCell",
        new ExecuteDatalayerCellTool(),
      ),
      // Datalayer cell read tools
      vscode.lm.registerTool(
        "datalayer_readAllDatalayerCells",
        new ReadAllDatalayerCellsTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_readDatalayerCell",
        new ReadDatalayerCellTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_getDatalayerNotebookInfo",
        new GetDatalayerNotebookInfoTool(),
      ),
      // Datalayer cell modification tools
      vscode.lm.registerTool(
        "datalayer_deleteDatalayerCell",
        new DeleteDatalayerCellTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_overwriteDatalayerCell",
        new OverwriteDatalayerCellTool(),
      ),
      // Datalayer cell append tools
      vscode.lm.registerTool(
        "datalayer_appendDatalayerMarkdownCell",
        new AppendDatalayerMarkdownCellTool(),
      ),
      vscode.lm.registerTool(
        "datalayer_appendExecuteDatalayerCodeCell",
        new AppendExecuteDatalayerCodeCellTool(),
      ),
      // Datalayer cell insert tools
      vscode.lm.registerTool(
        "datalayer_insertDatalayerMarkdownCell",
        new InsertDatalayerMarkdownCellTool(),
      ),
    );
    activationTimer.checkpoint("mcp_tools_registered");
    logger.info(
      "Registered 16 embedded MCP tools for Copilot (full jupyter-mcp-server parity + lexical creation)",
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
  runtimesTreeProvider?.refresh();
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
    runtimesTreeProvider?.dispose();

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
