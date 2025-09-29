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
import type { DatalayerSDK } from "../../../core/lib/sdk/client";
import type { Runtime } from "../../../core/lib/sdk/client/models/Runtime";
import { SDKAuthProvider } from "../services/authProvider";
import { selectDatalayerRuntime } from "../utils/runtimeSelector";
import { WebSocketKernelClient } from "../kernel/websocketKernelClient";
import { KernelBridge } from "../services/kernelBridge";
import { promptAndLogin } from "../utils/authDialog";

/**
 * Manages notebook controllers with a main selector and runtime-specific controllers.
 */
export class SmartDynamicControllerManager implements vscode.Disposable {
  private readonly _context: vscode.ExtensionContext;
  private readonly _sdk: DatalayerSDK;
  private readonly _authProvider: SDKAuthProvider;
  private readonly _kernelBridge: KernelBridge;
  private readonly _controllers = new Map<string, vscode.NotebookController>();
  private readonly _runtimes = new Map<string, Runtime>();
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();
  private readonly _notebookRuntimes = new Map<string, Runtime>();
  private _executionOrder = 0;
  private _disposed = false;

  constructor(
    context: vscode.ExtensionContext,
    sdk: DatalayerSDK,
    authProvider: SDKAuthProvider
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
   * This controller is a selector/switcher for runtimes.
   */
  private createMainController(): void {
    const controller = vscode.notebooks.createNotebookController(
      "datalayer-platform",
      "jupyter-notebook",
      "Datalayer Platform"
    );

    controller.description = "Click to select or change runtime";
    controller.detail = "Manages Datalayer runtime connections";
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // When Platform controller is selected, show runtime selector
    controller.onDidChangeSelectedNotebooks(async (e) => {
      if (e.selected) {
        // Show runtime selector when Platform controller is selected
        await this.showRuntimeSelector(e.notebook);
      }
    });

    // Platform controller should NEVER execute cells
    // It only serves as a selector for choosing runtimes
    // Removed executeHandler to prevent execution conflicts

    // Interrupt handler can also be used to switch runtimes
    controller.interruptHandler = async (notebook) => {
      await this.showRuntimeSelector(notebook);
    };

    this._controllers.set("datalayer-platform", controller);
    this._context.subscriptions.push(controller);
  }

  /**
   * Creates or gets a runtime-specific controller.
   */
  private async ensureRuntimeController(
    runtime: Runtime
  ): Promise<vscode.NotebookController | undefined> {
    const controllerId = `datalayer-runtime-${runtime.uid}`;

    // Check if controller already exists
    let controller = this._controllers.get(controllerId);
    if (controller) {
      return controller;
    }

    // Get runtime details
    const runtimeData =
      typeof (runtime as any).toJSON === "function"
        ? (runtime as any).toJSON()
        : runtime;

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
      `Datalayer: ${displayName}`
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
        // Store that this runtime is active for this notebook
        this._notebookRuntimes.set(e.notebook.uri.toString(), runtime);

        // IMPORTANT: Do NOT change Platform controller affinity
        // We want it to always remain selectable for runtime switching
      } else {
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
  private async selectRuntime(): Promise<Runtime | undefined> {
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
    notebook: vscode.NotebookDocument
  ): Promise<void> {
    const runtime = await this.selectRuntime();
    if (!runtime) {
      return;
    }

    // Create or get runtime controller
    const runtimeController = await this.ensureRuntimeController(runtime);
    if (!runtimeController) {
      return;
    }

    // Store the selected runtime
    this._notebookRuntimes.set(notebook.uri.toString(), runtime);

    // Make runtime controller preferred
    await runtimeController.updateNotebookAffinity(
      notebook,
      vscode.NotebookControllerAffinity.Preferred
    );

    // Make Platform controller hidden now that we have a runtime selected
    const platformController = this._controllers.get("datalayer-platform");
    if (platformController) {
      await platformController.updateNotebookAffinity(
        notebook,
        vscode.NotebookControllerAffinity.Default
      );
    }

    vscode.window.showInformationMessage(
      `Switched to runtime: ${runtimeController.label.replace(
        "Datalayer: ",
        ""
      )}`
    );
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
    runtime: Runtime,
    executingController?: vscode.NotebookController
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
        "No controller available. Please select a kernel from the dropdown."
      );
      return;
    }

    if (isWebviewNotebook) {
      // Route to webview
      await this._kernelBridge.connectWebviewNotebook(notebook.uri, runtime);

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
    controller: vscode.NotebookController
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
            ])
          );
        } else if (output.type === "execute_result") {
          const items: vscode.NotebookCellOutputItem[] = [];
          if (output.data["text/html"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(
                output.data["text/html"],
                "text/html"
              )
            );
          }
          if (output.data["text/plain"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(
                output.data["text/plain"],
                "text/plain"
              )
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
            ])
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
        ])
      );
      execution.end(false, Date.now());
    }
  }

  /**
   * Gets the controller ID for a specific runtime.
   */
  private getRuntimeControllerId(runtime: Runtime): string {
    return `datalayer-runtime-${runtime.uid}`;
  }

  /**
   * Creates a new runtime controller.
   */
  private async createRuntimeController(
    runtime: Runtime
  ): Promise<vscode.NotebookController | null> {
    const controllerId = this.getRuntimeControllerId(runtime);
    if (this._controllers.has(controllerId)) {
      return this._controllers.get(controllerId)!;
    }

    try {
      const controller = vscode.notebooks.createNotebookController(
        controllerId,
        "jupyter-notebook",
        `Datalayer: ${(runtime as any).name || runtime.uid}`
      );

      controller.supportedLanguages = ["python"];
      controller.supportsExecutionOrder = true;
      controller.description = `Datalayer Runtime (${runtime.uid})`;

      controller.executeHandler = this._executeHandler.bind(this);
      controller.interruptHandler = this._interruptHandler.bind(this);

      this._controllers.set(controllerId, controller);
      this._runtimes.set(controllerId, runtime);
      this._context.subscriptions.push(controller);

      return controller;
    } catch (error) {
      return null;
    }
  }

  /**
   * Selects or switches a runtime for a specific notebook.
   * This can be called anytime, even if Platform controller is already selected.
   * @param notebook - The notebook to select runtime for
   */
  public async selectRuntimeForNotebook(
    notebook: vscode.NotebookDocument
  ): Promise<void> {
    // First, unhide the platform controller temporarily so user can select runtimes
    const platformController = this._controllers.get("datalayer-platform");
    if (platformController) {
      await platformController.updateNotebookAffinity(
        notebook,
        vscode.NotebookControllerAffinity.Default
      );
    }

    // Show runtime selector
    const runtime = await this.selectRuntime();
    if (runtime) {
      // Create or get the runtime-specific controller
      const controller = await this.ensureRuntimeController(runtime);
      if (controller) {
        // Store the selected runtime for this notebook
        this._notebookRuntimes.set(notebook.uri.toString(), runtime);

        // Set runtime controller as preferred
        await controller.updateNotebookAffinity(
          notebook,
          vscode.NotebookControllerAffinity.Preferred
        );

        // Keep platform controller at default affinity (not hidden, so it can be selected again)
        if (platformController) {
          await platformController.updateNotebookAffinity(
            notebook,
            vscode.NotebookControllerAffinity.Default
          );
        }

        // Show kernel picker so user can select the runtime
        setTimeout(async () => {
          try {
            await vscode.commands.executeCommand("notebook.selectKernel");
          } catch (error) {}
        }, 100);

        // Show message to user
        vscode.window.showInformationMessage(
          `Runtime "${controller.label}" is ready and should be selected.`
        );
      }
    } else {
      // If no runtime selected, keep platform controller at default
      if (platformController) {
        await platformController.updateNotebookAffinity(
          notebook,
          vscode.NotebookControllerAffinity.Default
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
   */
  public async refreshControllers(): Promise<void> {
    if (!this._authProvider.isAuthenticated()) {
      // Remove all runtime controllers when not authenticated
      for (const [id, controller] of this._controllers) {
        if (id !== "datalayer-platform") {
          controller.dispose();
          this._controllers.delete(id);
        }
      }
      return;
    }

    try {
      // Get available runtimes
      const runtimes = await (this._sdk as any).listRuntimes();

      // Create controllers for existing runtimes that don't have controllers yet
      for (const runtime of runtimes) {
        const controllerId = this.getRuntimeControllerId(runtime);
        if (!this._controllers.has(controllerId)) {
          await this.createRuntimeController(runtime);
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
  }

  /**
   * Handles execution of notebook cells.
   */
  private async _executeHandler(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController
  ): Promise<void> {
    for (const cell of cells) {
      const execution = controller.createNotebookCellExecution(cell);
      execution.executionOrder = ++this._executionOrder;
      execution.start(Date.now());

      try {
        // For now, just mark as successful
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text("Execution not yet implemented"),
          ]),
        ]);
        execution.end(true, Date.now());
      } catch (error) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(`Error: ${error}`),
          ]),
        ]);
        execution.end(false, Date.now());
      }
    }
  }

  /**
   * Handles interruption of notebook execution.
   */
  private async _interruptHandler(): Promise<void> {
    // Implementation for interrupting execution
  }
}
