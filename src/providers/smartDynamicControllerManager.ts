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
import { KernelBridge } from "../services/bridges/kernelBridge";
import { promptAndLogin } from "../ui/dialogs/authDialog";

/**
 * Manages notebook controllers with a main selector and runtime-specific controllers.
 */
export class SmartDynamicControllerManager implements vscode.Disposable {
  private readonly _context: vscode.ExtensionContext;
  private readonly _sdk: DatalayerClient;
  private readonly _authProvider: SDKAuthProvider;
  private readonly _kernelBridge: KernelBridge;
  private readonly _controllers = new Map<string, vscode.NotebookController>();
  private readonly _runtimes = new Map<string, RuntimeDTO>();
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();
  private readonly _notebookRuntimes = new Map<string, RuntimeDTO>();
  private _executionOrder = 0;
  private _disposed = false;
  private _selectingRuntime = false; // Guard flag to prevent re-entry

  // Event emitter for runtime changes - allows tree view to refresh
  private readonly _onRuntimeCreated = new vscode.EventEmitter<RuntimeDTO>();
  public readonly onRuntimeCreated = this._onRuntimeCreated.event;

  constructor(
    context: vscode.ExtensionContext,
    sdk: DatalayerClient,
    authProvider: SDKAuthProvider,
  ) {
    this._context = context;
    this._sdk = sdk;
    this._authProvider = authProvider;
    this._kernelBridge = new KernelBridge(sdk, authProvider);

    // Create the main "Datalayer Platform" controller
    this.createMainController();

    // Refresh on auth changes
    authProvider.onAuthStateChanged(() => {
      this.refreshControllers();
    });
  }

  /**
   * Creates the main "Datalayer Platform" controller.
   * This controller acts as an entry point for runtime selection.
   * When selected, it immediately shows the runtime picker.
   */
  private createMainController(): void {
    const controller = vscode.notebooks.createNotebookController(
      "datalayer-platform",
      "jupyter-notebook",
      "Datalayer Platform",
    );

    controller.description = "Select or change Datalayer runtime";
    controller.detail = "Cloud execution with Datalayer";
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = false;

    // When this controller is selected, immediately show runtime selector
    // The runtime selector will create/select a runtime-specific controller
    controller.onDidChangeSelectedNotebooks(async (e) => {
      if (e.selected) {
        await this.showRuntimeSelector(e.notebook);
      }
    });

    // CRITICAL: DO NOT add executeHandler to Platform controller
    // If we add executeHandler, VS Code will use Platform controller to execute cells
    // even after we set a runtime controller as Preferred.
    // By NOT having executeHandler, VS Code will show "Select Kernel" if user tries
    // to execute without selecting a runtime first.

    this._controllers.set("datalayer-platform", controller);
    this._context.subscriptions.push(controller);
  }

  /**
   * Creates or gets a runtime-specific controller.
   */
  private async ensureRuntimeController(
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
   * Shows runtime selector and returns selected runtime.
   */
  private async selectRuntime(): Promise<RuntimeDTO | undefined> {
    if (!this._authProvider.isAuthenticated()) {
      await promptAndLogin("Datalayer Platform");
      return undefined;
    }

    const runtime = await selectDatalayerRuntime(this._sdk, this._authProvider);
    if (runtime) {
    }
    return runtime;
  }

  /**
   * Shows runtime selector and switches to selected runtime.
   * This is the main method for switching runtimes.
   */
  private async showRuntimeSelector(
    notebook: vscode.NotebookDocument,
  ): Promise<void> {
    // Guard against re-entry - if we're already selecting a runtime, don't open again
    if (this._selectingRuntime) {
      return;
    }

    this._selectingRuntime = true;
    try {
      const runtime = await this.selectRuntime();
      if (!runtime) {
        return;
      }

      // Create or get runtime controller
      const runtimeController = await this.ensureRuntimeController(runtime);
      if (!runtimeController) {
        return;
      }

      // Fire event that runtime was created/selected - this refreshes the runtimes tree
      this._onRuntimeCreated.fire(runtime);

      // CRITICAL: Dispose old kernel client if switching runtimes
      const notebookUri = notebook.uri.toString();
      const oldKernelClient = this._activeKernels.get(notebookUri);
      if (oldKernelClient) {
        oldKernelClient.dispose();
        this._activeKernels.delete(notebookUri);
      }

      // Store the selected runtime
      this._notebookRuntimes.set(notebookUri, runtime);

      // CRITICAL FIX: The issue is that VS Code doesn't auto-select a controller when affinity changes
      // The solution: temporarily select the notebook with the runtime controller to force the selection

      // First, make sure the runtime controller "selects" this notebook
      // This is done by firing the onDidChangeSelectedNotebooks event internally
      // We do this by updating affinity AFTER triggering internal selection

      // Step 1: Make runtime controller preferred
      await runtimeController.updateNotebookAffinity(
        notebook,
        vscode.NotebookControllerAffinity.Preferred,
      );

      vscode.window.showInformationMessage(
        `Switched to runtime: ${runtimeController.label.replace(
          "Datalayer: ",
          "",
        )}`,
      );
    } finally {
      // Always reset the guard flag
      this._selectingRuntime = false;
    }
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
   * Gets the controller ID for a specific runtime.
   */
  private getRuntimeControllerId(runtime: RuntimeDTO): string {
    return `datalayer-runtime-${runtime.uid}`;
  }

  /**
   * Selects or switches a runtime for a specific notebook.
   * This can be called anytime, even if Platform controller is already selected.
   * @param notebook - The notebook to select runtime for
   */
  public async selectRuntimeForNotebook(
    notebook: vscode.NotebookDocument,
  ): Promise<void> {
    // Show runtime selector
    const runtime = await this.selectRuntime();
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

        // Make Platform controller low priority now that we have a real runtime selected
        const platformController = this._controllers.get("datalayer-platform");
        if (platformController) {
          // Keep at Default so it's still available in picker for switching
          await platformController.updateNotebookAffinity(
            notebook,
            vscode.NotebookControllerAffinity.Default,
          );
        }

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
    const kernelClient = this._activeKernels.get(notebookUri);
    if (kernelClient) {
      kernelClient.dispose();
      this._activeKernels.delete(notebookUri);
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
        if (id !== "datalayer-platform") {
          controller.dispose();
          this._controllers.delete(id);
          this._runtimes.delete(id);
        }
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
        if (controllerId === "datalayer-platform") {
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

    // Clean up kernels
    for (const kernelClient of this._activeKernels.values()) {
      kernelClient.dispose();
    }
    this._activeKernels.clear();

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
