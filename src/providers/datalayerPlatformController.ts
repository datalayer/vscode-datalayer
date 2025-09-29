/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Datalayer Platform kernel controller for VS Code.
 * Provides a single "Datalayer Platform" option in the kernel picker that
 * shows a runtime selection dialog when selected.
 *
 * @module providers/datalayerPlatformController
 */

import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import type { DatalayerSDK, Runtime } from "../../../core/lib/index.js";
import { SDKAuthProvider } from "../services/authProvider";
import { selectDatalayerRuntime } from "../utils/runtimeSelector";
import { WebSocketKernelClient } from "../kernel/websocketKernelClient";
import { promptAndLogin } from "../utils/authDialog";
import { KernelBridge } from "../services/kernelBridge";

/**
 * Datalayer Platform controller that appears in VS Code's kernel picker.
 * When selected, shows a dialog to choose or create a Datalayer runtime.
 */
export class DatalayerPlatformController implements vscode.Disposable {
  private readonly _controller: vscode.NotebookController;
  private readonly _sdk: DatalayerSDK;
  private readonly _authProvider: SDKAuthProvider;
  private readonly _kernelBridge: KernelBridge;
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();
  private _selectedRuntime: Runtime | undefined;
  private _executionOrder = 0;
  private _disposed = false;

  /**
   * Controller ID used for registration with VS Code.
   */
  public static readonly CONTROLLER_ID = "datalayer-platform";

  /**
   * Display name shown in the kernel picker.
   */
  public static readonly DISPLAY_NAME = "Datalayer Platform";

  /**
   * Creates and registers the Datalayer Platform controller.
   *
   * @param context - Extension context
   * @param sdk - Datalayer SDK instance
   * @param authProvider - Authentication provider
   * @returns The created controller instance
   */
  public static create(
    context: vscode.ExtensionContext,
    sdk: DatalayerSDK,
    authProvider: SDKAuthProvider
  ): DatalayerPlatformController {
    const controller = new DatalayerPlatformController(
      context,
      sdk,
      authProvider
    );
    context.subscriptions.push(controller);
    return controller;
  }

  /**
   * Creates a new DatalayerPlatformController instance.
   *
   * @param context - Extension context
   * @param sdk - Datalayer SDK instance
   * @param authProvider - Authentication provider
   */
  private constructor(
    private readonly _context: vscode.ExtensionContext,
    sdk: DatalayerSDK,
    authProvider: SDKAuthProvider
  ) {
    this._sdk = sdk;
    this._authProvider = authProvider;

    // Create the VS Code notebook controller
    this._controller = vscode.notebooks.createNotebookController(
      DatalayerPlatformController.CONTROLLER_ID,
      "jupyter-notebook", // Notebook type for Jupyter notebooks
      DatalayerPlatformController.DISPLAY_NAME
    );

    // Set controller properties
    this._controller.description = "Connect to Datalayer Platform runtimes";
    this._controller.detail =
      "Select or create a Datalayer runtime. Re-select to switch runtimes.";
    this._controller.supportedLanguages = ["python", "markdown", "raw"];
    this._controller.supportsExecutionOrder = true;

    // Set up execution handler
    this._controller.executeHandler = this.executeCell.bind(this);

    // Set up interrupt handler - we can repurpose this for runtime switching
    // Users can trigger this with the interrupt button
    this._controller.interruptHandler = async () => {
      console.log(
        "[DatalayerPlatformController] Interrupt handler called - can be used to change runtime"
      );
      // Show runtime selector to allow switching
      await this.selectRuntime();
    };

    // Create kernel bridge for routing
    this._kernelBridge = new KernelBridge(sdk, authProvider);

    // Handle notebook document changes
    this._context.subscriptions.push(
      vscode.workspace.onDidOpenNotebookDocument(this.onDidOpenNotebook, this),
      vscode.workspace.onDidCloseNotebookDocument(this.onDidCloseNotebook, this)
    );

    // Listen for when this controller is selected for a notebook
    this._controller.onDidChangeSelectedNotebooks(async (e) => {
      console.log(
        "[DatalayerPlatformController] ⭐ onDidChangeSelectedNotebooks fired",
        {
          notebook: e.notebook.uri.toString(),
          selected: e.selected,
          hasSelectedRuntime: !!this._selectedRuntime,
        }
      );

      if (e.selected) {
        console.log(
          "[DatalayerPlatformController] Controller selected - showing runtime selector"
        );

        // ALWAYS show runtime selector when controller is selected
        // This allows users to switch runtimes at any time
        await this.selectRuntime();
      }
    });

    // Try to hook into notebook open events to offer our controller
    vscode.workspace.onDidOpenNotebookDocument(async (notebook) => {
      console.log(
        "[DatalayerPlatformController] Notebook opened:",
        notebook.uri.toString()
      );
      // Check if it's a Jupyter notebook
      if (notebook.notebookType === "jupyter-notebook") {
        console.log("[DatalayerPlatformController] Jupyter notebook detected");
      }
    });

    console.log(
      "[DatalayerPlatformController] Controller created and registered"
    );
  }

  /**
   * Public method to select runtime for a specific notebook.
   * This can be called from commands or other parts of the extension.
   */
  public async selectRuntimeForNotebook(
    notebook: vscode.NotebookDocument
  ): Promise<void> {
    console.log(
      "[DatalayerPlatformController] selectRuntimeForNotebook called for",
      notebook.uri.toString()
    );

    // First, update the affinity to select this controller for the notebook
    await this._controller.updateNotebookAffinity(
      notebook,
      vscode.NotebookControllerAffinity.Preferred
    );

    // Then prompt for runtime selection
    await this.selectRuntime();
  }

  /**
   * Prompts the user to select a runtime.
   * Updates the controller label to show the selected runtime.
   */
  private async selectRuntime(): Promise<void> {
    console.log("[DatalayerPlatformController] Showing runtime selector");

    // Check authentication first
    if (!this._authProvider.isAuthenticated()) {
      await promptAndLogin("Datalayer Platform");
      return;
    }

    const runtime = await selectDatalayerRuntime(this._sdk, this._authProvider);
    if (!runtime) {
      console.log("[DatalayerPlatformController] Runtime selection cancelled");
      return;
    }

    // Store the runtime directly - it should have all the data we need
    this._selectedRuntime = runtime;

    // Log what we received
    console.log(
      "[DatalayerPlatformController] Runtime received from selector:",
      {
        uid: runtime.uid,
        given_name: runtime.givenName,
        hasIngress: !!runtime.ingress,
        hasJupyterUrl: !!runtime.jupyterUrl,
        hasToken: !!runtime.token,
        hasJupyterToken: !!runtime.jupyterToken,
      }
    );

    // Keep the controller label as "Datalayer Platform" so it remains selectable
    // Show runtime info in the description instead
    let environmentTitle = "";
    let environmentName = "";
    let givenName = "";

    // Extract runtime information from SDK model
    if (runtime && typeof runtime === "object") {
      if ("environmentName" in runtime) {
        // SDK Runtime model with camelCase properties
        environmentName = (runtime as any).environmentName;
        givenName = (runtime as any).givenName;
        environmentTitle = (runtime as any).environmentTitle;
      } else if (typeof (runtime as any).toJSON === "function") {
        // Has toJSON method - now returns camelCase
        const data = (runtime as any).toJSON();
        environmentName = data.environmentName;
        givenName = data.givenName;
        environmentTitle = data.environmentTitle;
      } else {
        // Should not happen if using SDK properly
        throw new Error("Runtime object not in expected format from SDK");
      }
    }

    // If we don't have environment title, try to derive it from given_name
    // Given names often follow pattern: "Python CPU Runtime" or "AI Runtime"
    if (!environmentTitle && givenName) {
      if (givenName.includes("Python CPU")) {
        environmentTitle = "Python CPU Environment";
      } else if (givenName.includes("AI")) {
        environmentTitle = "AI Environment";
      } else if (givenName.endsWith(" Runtime")) {
        // Convert "XXX Runtime" to "XXX Environment"
        environmentTitle = givenName.replace(" Runtime", " Environment");
      } else {
        environmentTitle = givenName;
      }
    }

    // Keep the main label as "Datalayer Platform" to maintain selectability
    // Show runtime info in the description to indicate which runtime is active
    this._controller.label = DatalayerPlatformController.DISPLAY_NAME;

    if (environmentTitle && environmentName) {
      this._controller.description = `Connected to ${environmentTitle} (${environmentName})`;
    } else if (givenName) {
      this._controller.description = `Connected to ${givenName}`;
    } else {
      // SDK should always provide pod_name
      const displayName = runtime.podName;
      if (!displayName) {
        throw new Error("Runtime missing pod_name from SDK");
      }
      this._controller.description = `Connected to ${displayName}`;
    }

    console.log(
      "[DatalayerPlatformController] Runtime selected:",
      this._controller.description
    );
  }

  /**
   * Handles cell execution requests.
   * Shows runtime selector on first execution, then uses selected runtime.
   *
   * @param cells - Cells to execute
   * @param notebook - Target notebook
   * @param controller - The notebook controller
   */
  private async executeCell(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController
  ): Promise<void> {
    console.log(
      "[DatalayerPlatformController] Execute requested for",
      cells.length,
      "cells"
    );

    // If no cells to execute, just return
    if (cells.length === 0) {
      console.log(
        "[DatalayerPlatformController] No cells to execute - ignoring"
      );
      return;
    }

    // If no runtime selected, show selection dialog
    if (!this._selectedRuntime) {
      await this.selectRuntime();
      // Check if runtime was selected
      if (!this._selectedRuntime) {
        console.log(
          "[DatalayerPlatformController] No runtime selected, aborting execution"
        );
        return;
      }
    }

    // Determine notebook type and route appropriately
    const notebookUri = notebook.uri.toString();
    const isWebviewNotebook = notebook.uri.scheme === "datalayer";

    if (isWebviewNotebook) {
      // For webview notebooks, send runtime info via message
      console.log("[DatalayerPlatformController] Routing to webview notebook");
      await this._kernelBridge.connectWebviewNotebook(
        notebook.uri,
        this._selectedRuntime
      );

      // Webview handles execution, just mark cells as successful
      for (const cell of cells) {
        const execution = this._controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());
        execution.end(true, Date.now());
      }
    } else {
      // For native notebooks, use WebSocket connection
      console.log("[DatalayerPlatformController] Routing to native notebook");

      // Ensure we have full runtime details before connecting
      const fullRuntime = await this.ensureRuntimeDetails(
        this._selectedRuntime
      );
      this._selectedRuntime = fullRuntime;

      // Get or create kernel client for this notebook
      let kernelClient = this._activeKernels.get(notebookUri);
      if (!kernelClient) {
        kernelClient = new WebSocketKernelClient(fullRuntime, this._sdk);
        await kernelClient.connect();
        this._activeKernels.set(notebookUri, kernelClient);
      }

      // Execute cells
      for (const cell of cells) {
        await this.executeCellViaWebSocket(cell, kernelClient);
      }
    }
  }

  /**
   * Gets the full runtime details from SDK if needed.
   *
   * @param runtime - Runtime that might need more details
   * @returns Runtime with full details
   */
  private async ensureRuntimeDetails(runtime: Runtime): Promise<Runtime> {
    // Convert runtime to JSON if it's a model
    const runtimeData =
      typeof (runtime as any).toJSON === "function"
        ? (runtime as any).toJSON()
        : runtime;

    // Log what we already have
    console.log("[DatalayerPlatformController] Runtime from selection:", {
      uid: runtimeData.uid,
      givenName: runtimeData.givenName,
      ingress: runtimeData.ingress,
      jupyterUrl: runtimeData.jupyterUrl,
      token: runtimeData.token,
      jupyterToken: runtimeData.jupyterToken,
    });

    // The runtime from listRuntimes should already have all the info we need
    // Just return it as is - no need to fetch again
    return runtime;
  }

  /**
   * Executes a cell via WebSocket connection.
   *
   * @param cell - Cell to execute
   * @param kernelClient - WebSocket kernel client
   */
  private async executeCellViaWebSocket(
    cell: vscode.NotebookCell,
    kernelClient: WebSocketKernelClient
  ): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    try {
      // Clear previous outputs
      await execution.clearOutput();

      // Execute via kernel client
      const result = await kernelClient.execute(cell.document.getText());

      // Handle outputs
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
      console.error("[DatalayerPlatformController] Execution error:", error);

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
   * Handles notebook open events.
   * Sets controller affinity for Datalayer notebooks.
   *
   * @param notebook - The opened notebook
   */
  private onDidOpenNotebook(notebook: vscode.NotebookDocument): void {
    // Set preferred affinity for Datalayer notebooks
    if (notebook.uri.scheme === "datalayer") {
      this._controller.updateNotebookAffinity(
        notebook,
        vscode.NotebookControllerAffinity.Preferred
      );
      console.log(
        "[DatalayerPlatformController] Set preferred affinity for Datalayer notebook"
      );
    }
  }

  /**
   * Handles notebook close events.
   * Cleans up kernel connections.
   *
   * @param notebook - The closed notebook
   */
  private onDidCloseNotebook(notebook: vscode.NotebookDocument): void {
    const notebookUri = notebook.uri.toString();
    const kernelClient = this._activeKernels.get(notebookUri);

    if (kernelClient) {
      kernelClient.dispose();
      this._activeKernels.delete(notebookUri);
      console.log(
        "[DatalayerPlatformController] Cleaned up kernel for closed notebook"
      );
    }
  }

  /**
   * Resets the selected runtime, forcing re-selection on next execution.
   */
  public resetRuntime(): void {
    this._selectedRuntime = undefined;
    this._controller.label = DatalayerPlatformController.DISPLAY_NAME;
    this._controller.description = "Connect to Datalayer Platform runtimes";

    // Clean up all active kernels
    for (const kernelClient of this._activeKernels.values()) {
      kernelClient.dispose();
    }
    this._activeKernels.clear();

    console.log("[DatalayerPlatformController] Runtime reset");
  }

  /**
   * Gets the currently selected runtime.
   *
   * @returns The selected runtime or undefined
   */
  public getSelectedRuntime(): Runtime | undefined {
    return this._selectedRuntime;
  }

  /**
   * Refreshes the controller state, typically called on auth state changes.
   */
  public async refreshControllers(): Promise<void> {
    if (!this._authProvider.isAuthenticated()) {
      this.resetRuntime();
      console.log(
        "[DatalayerPlatformController] Reset runtime due to auth state change"
      );
    }
  }

  /**
   * Disposes of the controller and cleans up resources.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    // Clean up kernel connections
    for (const kernelClient of this._activeKernels.values()) {
      kernelClient.dispose();
    }
    this._activeKernels.clear();

    // Dispose kernel bridge
    this._kernelBridge.dispose();

    // Dispose controller
    this._controller.dispose();

    console.log("[DatalayerPlatformController] Controller disposed");
  }
}
