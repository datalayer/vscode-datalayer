/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Simple dynamic controller manager that creates one controller per runtime.
 * Each runtime gets its own selectable controller in the kernel picker.
 *
 * @module providers/simpleDynamicControllerManager
 */

import * as vscode from "vscode";
import type { DatalayerSDK, Runtime } from "../../../core/lib/index.js";
import { SDKAuthProvider } from "../services/authProvider";
import { selectDatalayerRuntime } from "../utils/runtimeSelector";
import { WebSocketKernelClient } from "../kernel/websocketKernelClient";
import { KernelBridge } from "../services/kernelBridge";
import { promptAndLogin } from "../utils/authDialog";

/**
 * Manages notebook controllers for Datalayer runtimes.
 * Creates one controller per runtime for easy switching.
 */
export class SimpleDynamicControllerManager implements vscode.Disposable {
  private readonly _context: vscode.ExtensionContext;
  private readonly _sdk: DatalayerSDK;
  private readonly _authProvider: SDKAuthProvider;
  private readonly _kernelBridge: KernelBridge;
  private readonly _controllers = new Map<string, vscode.NotebookController>();
  private readonly _runtimes = new Map<string, Runtime>();
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();
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

    // Create the main "Add Runtime" controller
    this.createMainController();

    // Load existing runtimes if authenticated
    if (authProvider.isAuthenticated()) {
      this.loadAvailableRuntimes();
    }

    // Refresh on auth changes
    authProvider.onAuthStateChanged(() => {
      this.refreshControllers();
    });

    console.log("[SimpleDynamicControllerManager] Manager created");
  }

  /**
   * Creates the main controller for adding new runtimes.
   */
  private createMainController(): void {
    const controller = vscode.notebooks.createNotebookController(
      "datalayer-add-runtime",
      "jupyter-notebook",
      "Datalayer: Add Runtime..."
    );

    controller.description = "Select or create a Datalayer runtime";
    controller.detail = "Choose from available runtimes or create a new one";
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // When selected, show runtime selector
    controller.onDidChangeSelectedNotebooks(async (e) => {
      if (e.selected) {
        console.log(
          "[SimpleDynamicControllerManager] Add Runtime controller selected"
        );

        // Show runtime selector
        const runtime = await this.selectRuntime();
        if (runtime) {
          // Create a controller for this runtime if it doesn't exist
          await this.ensureRuntimeController(runtime);

          // Switch to the runtime controller
          const controllerId = `datalayer-runtime-${runtime.uid}`;
          const runtimeController = this._controllers.get(controllerId);
          if (runtimeController) {
            // Set this controller as preferred for the notebook
            await runtimeController.updateNotebookAffinity(
              e.notebook,
              vscode.NotebookControllerAffinity.Preferred
            );
          }
        }
      }
    });

    // Empty execute handler - this controller is just for selection
    controller.executeHandler = async () => {
      console.log(
        "[SimpleDynamicControllerManager] Add Runtime controller execute - showing selector"
      );
      // Don't execute, just show selector
      await this.selectRuntime();
    };

    this._controllers.set("datalayer-add-runtime", controller);
    this._context.subscriptions.push(controller);
  }

  /**
   * Loads available runtimes and creates controllers for them.
   */
  private async loadAvailableRuntimes(): Promise<void> {
    try {
      console.log(
        "[SimpleDynamicControllerManager] Loading available runtimes..."
      );
      const runtimes = await (this._sdk as any).listRuntimes();

      if (Array.isArray(runtimes)) {
        for (const runtime of runtimes) {
          if (runtime.status === "running" || runtime.status === "ready") {
            await this.ensureRuntimeController(runtime);
          }
        }
        console.log(
          `[SimpleDynamicControllerManager] Loaded ${runtimes.length} runtimes`
        );
      }
    } catch (error) {
      console.error(
        "[SimpleDynamicControllerManager] Failed to load runtimes:",
        error
      );
    }
  }

  /**
   * Ensures a controller exists for the given runtime.
   */
  private async ensureRuntimeController(runtime: Runtime): Promise<void> {
    const controllerId = `datalayer-runtime-${runtime.uid}`;

    // Check if controller already exists
    if (this._controllers.has(controllerId)) {
      console.log(
        "[SimpleDynamicControllerManager] Controller already exists for runtime:",
        runtime.uid
      );
      return;
    }

    // Get runtime details
    const runtimeData =
      typeof (runtime as any).toJSON === "function"
        ? (runtime as any).toJSON()
        : runtime;

    const displayName =
      runtimeData.givenName ||
      runtimeData.podName ||
      `Runtime ${runtime.uid.substring(0, 8)}`;
    const environmentName =
      runtimeData.environmentName || "Unknown Environment";

    // Create the controller
    const controller = vscode.notebooks.createNotebookController(
      controllerId,
      "jupyter-notebook",
      `Datalayer: ${displayName}`
    );

    controller.description = environmentName;
    controller.detail = `Runtime: ${runtimeData.podName || runtime.uid}`;
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // Execute handler for this specific runtime
    controller.executeHandler = async (cells, notebook) => {
      await this.executeCells(cells, notebook, runtime);
    };

    // Store the runtime
    this._runtimes.set(controllerId, runtime);
    this._controllers.set(controllerId, controller);
    this._context.subscriptions.push(controller);

    console.log(
      `[SimpleDynamicControllerManager] Created controller for runtime: ${displayName}`
    );
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
      console.log(
        "[SimpleDynamicControllerManager] Runtime selected:",
        runtime.uid
      );
    }
    return runtime;
  }

  /**
   * Executes cells with the specified runtime.
   */
  private async executeCells(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    runtime: Runtime
  ): Promise<void> {
    console.log(
      `[SimpleDynamicControllerManager] Executing ${cells.length} cells with runtime ${runtime.uid}`
    );

    const notebookUri = notebook.uri.toString();
    const isWebviewNotebook = notebook.uri.scheme === "datalayer";

    if (isWebviewNotebook) {
      // Route to webview
      await this._kernelBridge.connectWebviewNotebook(notebook.uri, runtime);

      // Mark cells as executed
      const controllerId = `datalayer-runtime-${runtime.uid}`;
      const controller = this._controllers.get(controllerId);
      if (controller) {
        for (const cell of cells) {
          const execution = controller.createNotebookCellExecution(cell);
          execution.executionOrder = ++this._executionOrder;
          execution.start(Date.now());
          execution.end(true, Date.now());
        }
      }
    } else {
      // Native notebook - use WebSocket
      let kernelClient = this._activeKernels.get(notebookUri);
      if (!kernelClient) {
        kernelClient = new WebSocketKernelClient(runtime, this._sdk);
        await kernelClient.connect();
        this._activeKernels.set(notebookUri, kernelClient);
      }

      const controllerId = `datalayer-runtime-${runtime.uid}`;
      const controller = this._controllers.get(controllerId);
      if (controller) {
        for (const cell of cells) {
          await this.executeCell(cell, kernelClient, controller);
        }
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
   * Refreshes controllers based on authentication state.
   */
  public async refreshControllers(): Promise<void> {
    if (!this._authProvider.isAuthenticated()) {
      // Remove all runtime controllers when not authenticated
      for (const [id, controller] of this._controllers) {
        if (id !== "datalayer-add-runtime") {
          controller.dispose();
          this._controllers.delete(id);
          this._runtimes.delete(id);
        }
      }
    } else {
      // Reload available runtimes
      await this.loadAvailableRuntimes();
    }
  }

  /**
   * Selects a runtime for a specific notebook.
   */
  public async selectRuntimeForNotebook(
    notebook: vscode.NotebookDocument
  ): Promise<void> {
    const runtime = await this.selectRuntime();
    if (runtime) {
      await this.ensureRuntimeController(runtime);

      const controllerId = `datalayer-runtime-${runtime.uid}`;
      const controller = this._controllers.get(controllerId);
      if (controller) {
        await controller.updateNotebookAffinity(
          notebook,
          vscode.NotebookControllerAffinity.Preferred
        );
      }
    }
  }

  /**
   * Cleans up on close.
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

    console.log("[SimpleDynamicControllerManager] Disposed");
  }
}
