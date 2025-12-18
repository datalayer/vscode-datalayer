/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Smart dynamic controller manager that maintains a "Datalayer Platform" controller
 * and creates runtime-specific controllers as needed.
 *
 * @module providers/smartDynamicControllerManager
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import { SDKAuthProvider } from "../services/core/authProvider";
import { selectDatalayerRuntime } from "../ui/dialogs/runtimeSelector";
import { WebSocketKernelClient } from "../kernel/clients/websocketKernelClient";
import { PyodideKernelClient } from "../kernel/clients/pyodideKernelClient";
import { KernelBridge } from "../services/bridges/kernelBridge";
import { promptAndLogin } from "../ui/dialogs/authDialog";

/**
 * Manages notebook controllers with a main selector and runtime-specific controllers.
 */
export class SmartDynamicControllerManager implements vscode.Disposable {
  /** VS Code extension context for accessing API and managing subscriptions */
  private readonly _context: vscode.ExtensionContext;

  /** Datalayer SDK client for API communication */
  private readonly _sdk: DatalayerClient;

  /** Authentication provider for managing auth state */
  private readonly _authProvider: SDKAuthProvider;

  /** Bridge for managing kernel connections and webview communication */
  private readonly _kernelBridge: KernelBridge;

  /** Map of notebook controller IDs to VS Code NotebookController instances */
  private readonly _controllers = new Map<string, vscode.NotebookController>();

  /** Map of controller IDs to runtime DTOs for reverse lookup */
  private readonly _runtimes = new Map<string, RuntimeDTO>();

  /** Map of notebook URIs to active WebSocket kernel clients */
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();

  /** Map of notebook URIs to active Pyodide kernel clients */
  private readonly _pyodideKernels = new Map<string, PyodideKernelClient>();

  /** Map of notebook URIs to their selected runtimes */
  private readonly _notebookRuntimes = new Map<string, RuntimeDTO>();

  /** Counter for execution order tracking across cells */
  private _executionOrder = 0;

  /** Flag to track if this manager has been disposed */
  private _disposed = false;

  /** Event emitter fired when a runtime is created or selected */
  private readonly _onRuntimeCreated = new vscode.EventEmitter<RuntimeDTO>();

  /** Event that fires when a runtime is created or selected, allows tree view refresh */
  public readonly onRuntimeCreated = this._onRuntimeCreated.event;

  /**
   * Creates a new SmartDynamicControllerManager instance.
   * @param context VS Code extension context for managing subscriptions
   * @param sdk Datalayer SDK client for API communication
   * @param authProvider Authentication provider for managing user login state
   */
  constructor(
    context: vscode.ExtensionContext,
    sdk: DatalayerClient,
    authProvider: SDKAuthProvider,
  ) {
    this._context = context;
    this._sdk = sdk;
    this._authProvider = authProvider;
    this._kernelBridge = new KernelBridge(sdk, authProvider);

    // Create Pyodide controller for offline Python execution
    this.createPyodideController();

    // Refresh on auth changes
    authProvider.onAuthStateChanged(() => {
      this.refreshControllers();
    });
  }

  /**
   * Creates the Pyodide controller for offline Python execution.
   * This controller works with native .ipynb files without requiring server connectivity.
   */
  private createPyodideController(): void {
    const controller = vscode.notebooks.createNotebookController(
      "datalayer-pyodide",
      "jupyter-notebook",
      "Pyodide (by Datalayer)",
    );

    controller.description = "Offline Python execution (WebAssembly)";
    controller.detail = "Browser-based Python kernel powered by Pyodide";
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // Execute handler for Pyodide kernel
    controller.executeHandler = async (cells, notebook, ctrl) => {
      await this.executePyodideCells(cells, notebook, ctrl);
    };

    // Store controller
    this._controllers.set("datalayer-pyodide", controller);
    this._context.subscriptions.push(controller);
  }

  /**
   * Get a controller by ID.
   * Used by DatalayerRuntimeSelector to access controllers for QuickPick display.
   *
   * @param controllerId - Controller ID to retrieve
   * @returns The controller or undefined if not found
   */
  public getController(
    controllerId: string,
  ): vscode.NotebookController | undefined {
    return this._controllers.get(controllerId);
  }

  /**
   * Creates or gets a runtime-specific controller.
   */
  public async ensureRuntimeController(
    runtime: RuntimeDTO,
  ): Promise<vscode.NotebookController | undefined> {
    const controllerId = `datalayer-runtime-${runtime.uid}`;

    // Check if controller already exists
    let controller = this._controllers.get(controllerId);
    if (controller) {
      return controller;
    }

    // Get runtime details
    const runtimeData =
      typeof runtime.toJSON === "function" ? runtime.toJSON() : runtime;

    // Use givenName if available, otherwise use podName
    const displayName =
      runtimeData.givenName ||
      runtimeData.podName ||
      `Runtime ${runtime.uid.substring(0, 8)}`;

    // Create the runtime-specific controller
    // IMPORTANT: Use a unique ID that VS Code can recognize
    controller = vscode.notebooks.createNotebookController(
      controllerId,
      "jupyter-notebook",
      `Datalayer: ${displayName}`,
    );

    const environmentName = runtimeData.environmentName || "Runtime";
    controller.description = `Connected to ${environmentName}`;
    controller.detail = `Pod: ${runtimeData.podName || runtime.uid}`;
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // Execute handler for this specific runtime
    controller.executeHandler = async (cells, notebook) => {
      await this.executeCells(cells, notebook, runtime);
    };

    // Track when this runtime controller is selected
    controller.onDidChangeSelectedNotebooks(async (e) => {
      if (e.selected) {
        const notebookUri = e.notebook.uri.toString();

        // CRITICAL: Dispose old kernel client if switching from a different runtime
        const oldKernelClient = this._activeKernels.get(notebookUri);
        if (oldKernelClient) {
          oldKernelClient.dispose();
          this._activeKernels.delete(notebookUri);
        }

        // Store that this runtime is active for this notebook
        this._notebookRuntimes.set(notebookUri, runtime);

        // CRITICAL: When user manually selects this controller from the kernel picker,
        // we need to set it as Preferred so it sticks as the active kernel
        await controller.updateNotebookAffinity(
          e.notebook,
          vscode.NotebookControllerAffinity.Preferred,
        );

        // Fire event that runtime was selected - this refreshes the runtimes tree
        this._onRuntimeCreated.fire(runtime);
      }
    });

    // Store the runtime and controller
    this._runtimes.set(controllerId, runtime);
    this._controllers.set(controllerId, controller);
    this._context.subscriptions.push(controller);

    return controller;
  }

  /**
   * Executes cells with the specified runtime.
   * @param cells - Cells to execute
   * @param notebook - The notebook document
   * @param runtime - The runtime to use
   * @param executingController - The controller that is actually executing (might be Platform or Runtime controller)
   */
  private async executeCells(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    runtime: RuntimeDTO,
    executingController?: vscode.NotebookController,
  ): Promise<void> {
    const notebookUri = notebook.uri.toString();
    const isWebviewNotebook = notebook.uri.scheme === "datalayer";

    // Determine which controller to use for execution
    // If executingController is provided, use it (this happens when Platform controller executes)
    // Otherwise, use the runtime controller (this happens when runtime controller executes directly)
    const controllerId = `datalayer-runtime-${runtime.uid}`;
    const runtimeController = this._controllers.get(controllerId);
    const controllerToUse = executingController || runtimeController;

    if (!controllerToUse) {
      vscode.window.showErrorMessage(
        "No controller available. Please select a kernel from the dropdown.",
      );
      return;
    }

    if (isWebviewNotebook) {
      // Route to webview
      await this._kernelBridge.connectWebviewDocument(notebook.uri, runtime);

      // Mark cells as executed using the appropriate controller
      for (const cell of cells) {
        const execution = controllerToUse.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());
        execution.end(true, Date.now());
      }
    } else {
      // Native notebook - use WebSocket
      let kernelClient = this._activeKernels.get(notebookUri);
      if (!kernelClient) {
        kernelClient = new WebSocketKernelClient(runtime, this._sdk);
        await kernelClient.connect();
        this._activeKernels.set(notebookUri, kernelClient);
      }

      for (const cell of cells) {
        await this.executeCell(cell, kernelClient, controllerToUse);
      }
    }
  }

  /**
   * Executes a single cell via WebSocket.
   */
  private async executeCell(
    cell: vscode.NotebookCell,
    kernelClient: WebSocketKernelClient,
    controller: vscode.NotebookController,
  ): Promise<void> {
    const execution = controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    try {
      await execution.clearOutput();
      const result = await kernelClient.execute(cell.document.getText());

      for (const output of result.outputs) {
        if (output.type === "stream") {
          await execution.appendOutput(
            new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.text(output.text || ""),
            ]),
          );
        } else if (output.type === "execute_result") {
          const outputData = output.data as Record<string, string>;
          const items: vscode.NotebookCellOutputItem[] = [];
          if (outputData["text/html"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(
                outputData["text/html"],
                "text/html",
              ),
            );
          }
          if (outputData["text/plain"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(
                outputData["text/plain"],
                "text/plain",
              ),
            );
          }
          if (items.length > 0) {
            await execution.appendOutput(new vscode.NotebookCellOutput(items));
          }
        } else if (output.type === "error") {
          await execution.appendOutput(
            new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.error({
                name: output.ename || "",
                message: output.evalue || "",
                stack: output.traceback?.join("\n") || "",
              }),
            ]),
          );
        }
      }

      execution.end(true, Date.now());
    } catch (error) {
      await execution.appendOutput(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error({
            name: "ExecutionError",
            message: error instanceof Error ? error.message : String(error),
          }),
        ]),
      );
      execution.end(false, Date.now());
    }
  }

  /**
   * Executes cells using Pyodide kernel (browser-based Python).
   * Creates kernel on-demand and reuses it for the notebook lifetime.
   *
   * @param cells - Cells to execute
   * @param notebook - Notebook document
   * @param controller - Pyodide controller
   */
  private async executePyodideCells(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void> {
    const notebookUri = notebook.uri.toString();

    // Get or create Pyodide kernel client for this notebook
    let kernelClient = this._pyodideKernels.get(notebookUri);
    if (!kernelClient) {
      console.log(`[Pyodide] Creating new kernel for ${notebook.uri.fsPath}`);
      kernelClient = new PyodideKernelClient();

      try {
        await kernelClient.initialize();
        this._pyodideKernels.set(notebookUri, kernelClient);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to initialize Pyodide kernel: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }

    // Execute each cell sequentially
    // Abort on first error (matches Jupyter "Run All" behavior)
    for (const cell of cells) {
      if (cell.kind !== vscode.NotebookCellKind.Code) {
        continue; // Skip markdown cells
      }

      const execution = controller.createNotebookCellExecution(cell);
      execution.executionOrder = ++this._executionOrder;
      execution.start(Date.now());

      try {
        await execution.clearOutput();
        // Execute cell - this will throw if Python code has an error
        await kernelClient.execute(cell.document.getText(), execution);
        execution.end(true, Date.now());
      } catch (error) {
        // Error output already displayed by PyodideKernelClient._handleError()
        // Just mark execution as failed and abort remaining cells
        execution.end(false, Date.now());
        console.log(
          `[Pyodide] Cell execution failed, aborting remaining cells:`,
          error instanceof Error ? error.message : String(error),
        );
        break; // CRITICAL: Abort execution of remaining cells
      }
    }
  }

  /**
   * Gets the unique controller ID for a specific runtime.
   * @param runtime The runtime DTO to get the controller ID for
   * @returns The unique controller identifier string
   */
  private getRuntimeControllerId(runtime: RuntimeDTO): string {
    return `datalayer-runtime-${runtime.uid}`;
  }

  /**
   * Selects or switches a runtime for a specific notebook.
   * This can be called anytime to select or switch runtimes.
   * @param notebook - The notebook to select runtime for
   */
  public async selectRuntimeForNotebook(
    notebook: vscode.NotebookDocument,
  ): Promise<void> {
    // Check authentication
    if (!this._authProvider.isAuthenticated()) {
      await promptAndLogin("Runtime Selection");
      if (!this._authProvider.isAuthenticated()) {
        return;
      }
    }

    // Show runtime selector
    const runtime = await selectDatalayerRuntime(this._sdk, this._authProvider);

    if (runtime) {
      // Create or get the runtime-specific controller
      const controller = await this.ensureRuntimeController(runtime);
      if (controller) {
        // Fire event that runtime was created/selected - this refreshes the runtimes tree
        this._onRuntimeCreated.fire(runtime);

        // CRITICAL: Dispose old kernel client if switching runtimes
        const notebookUri = notebook.uri.toString();
        const oldKernelClient = this._activeKernels.get(notebookUri);
        if (oldKernelClient) {
          oldKernelClient.dispose();
          this._activeKernels.delete(notebookUri);
        }

        // Store the selected runtime for this notebook
        this._notebookRuntimes.set(notebookUri, runtime);

        // Set runtime controller as preferred
        await controller.updateNotebookAffinity(
          notebook,
          vscode.NotebookControllerAffinity.Preferred,
        );

        vscode.window.showInformationMessage(
          `Runtime "${controller.label.replace("Datalayer: ", "")}" is now selected.`,
        );
      }
    }
  }

  /**
   * Cleans up on notebook close.
   */
  public onDidCloseNotebook(notebook: vscode.NotebookDocument): void {
    const notebookUri = notebook.uri.toString();

    // Dispose WebSocket kernel if exists
    const kernelClient = this._activeKernels.get(notebookUri);
    if (kernelClient) {
      kernelClient.dispose();
      this._activeKernels.delete(notebookUri);
    }

    // Dispose Pyodide kernel if exists
    const pyodideClient = this._pyodideKernels.get(notebookUri);
    if (pyodideClient) {
      console.log(`[Pyodide] Disposing kernel for ${notebook.uri.fsPath}`);
      pyodideClient.dispose();
      this._pyodideKernels.delete(notebookUri);
    }
  }

  /**
   * Refreshes all controllers based on current authentication and available runtimes.
   * Creates controllers for existing runtimes that don't have controllers yet.
   * Removes controllers for runtimes that no longer exist.
   */
  public async refreshControllers(): Promise<void> {
    if (!this._authProvider.isAuthenticated()) {
      // Remove all runtime controllers when not authenticated
      for (const [id, controller] of this._controllers) {
        // Keep Pyodide and creation controllers
        if (
          id === "datalayer-pyodide" ||
          id === "datalayer-create-gpu" ||
          id === "datalayer-create-cpu"
        ) {
          continue;
        }
        controller.dispose();
        this._controllers.delete(id);
        this._runtimes.delete(id);
      }
      // Clear notebook runtime mappings
      this._notebookRuntimes.clear();
      return;
    }

    try {
      // Get available runtimes
      const runtimes = await this._sdk.listRuntimes();
      const activeRuntimeUids = new Set(runtimes.map((r) => r.uid));

      // Remove controllers for runtimes that no longer exist
      for (const [controllerId, controller] of this._controllers) {
        // Keep static controllers
        if (
          controllerId === "datalayer-pyodide" ||
          controllerId === "datalayer-create-gpu" ||
          controllerId === "datalayer-create-cpu"
        ) {
          continue;
        }

        const runtime = this._runtimes.get(controllerId);
        if (runtime && !activeRuntimeUids.has(runtime.uid)) {
          // Runtime no longer exists - find all notebooks using this controller
          const affectedNotebooks: vscode.NotebookDocument[] = [];
          for (const [notebookUri, mappedRuntime] of this._notebookRuntimes) {
            if (mappedRuntime.uid === runtime.uid) {
              // Find the actual notebook document
              const notebook = vscode.workspace.notebookDocuments.find(
                (nb) => nb.uri.toString() === notebookUri,
              );
              if (notebook) {
                affectedNotebooks.push(notebook);
              }
              this._notebookRuntimes.delete(notebookUri);
            }
          }

          // Dispose the controller - this removes it from VS Code's kernel picker
          controller.dispose();
          this._controllers.delete(controllerId);
          this._runtimes.delete(controllerId);

          // For each affected notebook, clear the selected kernel
          // This makes VS Code show "Select Kernel" instead of a dead controller
          for (const notebook of affectedNotebooks) {
            // Update affinity to force kernel selection dialog
            const platformController =
              this._controllers.get("datalayer-platform");
            if (platformController) {
              // Set Platform controller as default so user can select new runtime
              await platformController.updateNotebookAffinity(
                notebook,
                vscode.NotebookControllerAffinity.Default,
              );
            }
          }
        }
      }

      // Create controllers for existing runtimes that don't have controllers yet
      for (const runtime of runtimes) {
        const controllerId = this.getRuntimeControllerId(runtime);
        if (!this._controllers.has(controllerId)) {
          await this.ensureRuntimeController(runtime);
        }
      }
    } catch (error) {}
  }

  /**
   * Disposes of all resources.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    // Clean up WebSocket kernels
    for (const kernelClient of this._activeKernels.values()) {
      kernelClient.dispose();
    }
    this._activeKernels.clear();

    // Clean up Pyodide kernels
    for (const [uri, client] of this._pyodideKernels.entries()) {
      console.log(`[Pyodide] Disposing kernel for ${uri}`);
      client.dispose();
    }
    this._pyodideKernels.clear();

    // Clean up controllers
    for (const controller of this._controllers.values()) {
      controller.dispose();
    }
    this._controllers.clear();
    this._runtimes.clear();

    // Dispose kernel bridge
    this._kernelBridge.dispose();

    // Dispose event emitter
    this._onRuntimeCreated.dispose();
  }
}
