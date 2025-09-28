/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Dynamic controller manager that creates separate VS Code notebook controllers
 * for each available runtime. This solves the "controller already selected" issue
 * by making each runtime a distinct selectable option.
 * 
 * @module providers/dynamicControllerManager
 */

import * as vscode from "vscode";
import type { DatalayerSDK, Runtime } from "../../../core/lib/index.js";
import { SDKAuthProvider } from "../services/authProvider";
import { selectDatalayerRuntime } from "../utils/runtimeSelector";
import { WebSocketKernelClient } from "../kernel/websocketKernelClient";
import { KernelBridge } from "../services/kernelBridge";

/**
 * Manages multiple dynamic notebook controllers for Datalayer runtimes.
 * Creates one controller per available runtime plus a generic "Select Runtime" controller.
 */
export class DynamicControllerManager implements vscode.Disposable {
  private readonly _context: vscode.ExtensionContext;
  private readonly _sdk: DatalayerSDK;
  private readonly _authProvider: SDKAuthProvider;
  private readonly _kernelBridge: KernelBridge;
  private readonly _controllers = new Map<string, vscode.NotebookController>();
  private readonly _activeKernels = new Map<string, WebSocketKernelClient>();
  private readonly _notebookRuntimes = new Map<string, Runtime>();
  private _executionOrder = 0;
  private _disposed = false;

  /**
   * Creates a new DynamicControllerManager.
   */
  constructor(
    context: vscode.ExtensionContext,
    sdk: DatalayerSDK,
    authProvider: SDKAuthProvider
  ) {
    this._context = context;
    this._sdk = sdk;
    this._authProvider = authProvider;
    this._kernelBridge = new KernelBridge(sdk, authProvider);

    // Create the initial "Select Runtime" controller
    this.createSelectRuntimeController();

    // Refresh controllers when auth state changes
    this._authProvider.onAuthStateChanged(() => {
      this.refreshControllers();
    });

    console.log("[DynamicControllerManager] Manager created");
  }

  /**
   * Creates the initial "Select Runtime" controller that shows runtime selection dialog.
   */
  private createSelectRuntimeController(): void {
    const controller = vscode.notebooks.createNotebookController(
      "datalayer-select-runtime",
      "jupyter-notebook",
      "Datalayer Platform"
    );

    controller.description = "Select or create a Datalayer runtime";
    controller.detail = "Choose from available runtimes or create a new one";
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // When this controller is selected, show runtime selector
    controller.executeHandler = async (cells, notebook, ctrl) => {
      console.log("[DynamicControllerManager] Select runtime controller executeHandler called");
      
      if (cells.length === 0) {
        // No cells to execute - user just selected this controller
        await this.showRuntimeSelector(notebook);
        return;
      }

      // Always show runtime selector when main controller tries to execute
      // This ensures user selects or confirms a runtime
      const runtime = await this.showRuntimeSelector(notebook);
      
      if (runtime) {
        // IMPORTANT: After selecting a runtime, the runtime controller should be selected
        // We should NOT execute with the main controller - let the runtime controller handle it
        const runtimeControllerId = this.getRuntimeControllerId(runtime);
        const runtimeController = this._controllers.get(runtimeControllerId);
        
        if (runtimeController) {
          console.log("[DynamicControllerManager] Runtime selected, execution should use runtime controller");
          // The runtime controller should now be selected due to Preferred affinity
          // If execution continues here, it means VS Code didn't switch controllers
          // In that case, we execute anyway but with the runtime
          await this.executeCellsWithRuntime(cells, notebook, runtime);
        }
      }
    };

    // Listen for when this controller is selected
    controller.onDidChangeSelectedNotebooks((e) => {
      console.log("[DynamicControllerManager] Main controller selection changed:", e);
      
      // Check if this controller was selected for any notebook
      if (e.selected) {
        // Controller was selected - immediately show runtime selector
        const activeNotebook = vscode.window.activeNotebookEditor?.notebook;
        if (activeNotebook) {
          console.log("[DynamicControllerManager] Main controller selected, showing runtime selector");
          // Show runtime selector after a brief delay to ensure VS Code finishes selection
          setTimeout(() => {
            this.showRuntimeSelector(activeNotebook);
          }, 100);
        }
      }
    });

    this._controllers.set("datalayer-select-runtime", controller);
    this._context.subscriptions.push(controller);

    console.log("[DynamicControllerManager] Select Runtime controller created");
  }

  /**
   * Shows the runtime selector and creates/updates controllers based on selection.
   */
  private async showRuntimeSelector(notebook: vscode.NotebookDocument): Promise<Runtime | undefined> {
    console.log("[DynamicControllerManager] showRuntimeSelector called for notebook:", notebook.uri.toString());
    
    if (!this._authProvider.isAuthenticated()) {
      console.log("[DynamicControllerManager] User not authenticated, showing login prompt");
      const action = await vscode.window.showErrorMessage(
        "Authentication required. Please login to Datalayer.",
        "Login"
      );
      if (action === "Login") {
        await vscode.commands.executeCommand("datalayer.login");
      }
      return undefined;
    }

    console.log("[DynamicControllerManager] User authenticated, calling selectDatalayerRuntime...");
    const runtime = await selectDatalayerRuntime(this._sdk, this._authProvider);
    console.log("[DynamicControllerManager] selectDatalayerRuntime returned:", runtime ? {
      uid: runtime.uid,
      givenName: runtime.givenName || runtime.given_name,
      podName: runtime.podName || runtime.pod_name
    } : "undefined");
    
    if (runtime) {
      // Create a controller for this specific runtime
      await this.createRuntimeController(runtime);
      
      // Update notebook affinity to prefer the new runtime controller
      const runtimeControllerId = this.getRuntimeControllerId(runtime);
      console.log("[DynamicControllerManager] Looking for controller with ID:", runtimeControllerId);
      const runtimeController = this._controllers.get(runtimeControllerId);
      if (runtimeController) {
        console.log("[DynamicControllerManager] Setting runtime controller as preferred for notebook");
        
        // Store this runtime as the active one for the notebook
        this._notebookRuntimes.set(notebook.uri.toString(), runtime);
        
        // CRITICAL: We must remove ALL other controllers' affinity to this notebook
        // This forces VS Code to re-evaluate which controller to use
        for (const [id, controller] of this._controllers) {
          if (id !== runtimeControllerId) {
            console.log(`[DynamicControllerManager] Removing affinity for controller: ${id}`);
            await controller.updateNotebookAffinity(
              notebook,
              vscode.NotebookControllerAffinity.Default
            );
          }
        }
        
        // Now set ONLY the runtime controller as preferred
        console.log("[DynamicControllerManager] Setting runtime controller as preferred");
        await runtimeController.updateNotebookAffinity(
          notebook,
          vscode.NotebookControllerAffinity.Preferred
        );
        
        // Force VS Code to recognize this controller as selected
        console.log("[DynamicControllerManager] Ensuring controller is properly associated");
        
        // Wait a moment for affinity changes to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update the picker entry label to show the selected runtime
        const displayInfo = this.getRuntimeDisplayInfo(runtime);
        this._pickerEntry.label = displayInfo.label;
        this._pickerEntry.detail = displayInfo.description;
        console.log("[DynamicControllerManager] Updated picker entry label to:", displayInfo.label);
        
        // Force notebook to recognize the controller by creating a temporary execution
        const notebookEditor = vscode.window.activeNotebookEditor;
        if (notebookEditor && notebookEditor.notebook === notebook) {
          console.log("[DynamicControllerManager] Found active notebook editor");
          
          try {
            // Create a dummy cell execution to force VS Code to recognize the controller
            const cells = notebook.getCells();
            if (cells.length > 0) {
              console.log("[DynamicControllerManager] Creating association via dummy execution");
              const firstCell = cells[0];
              const dummyExecution = runtimeController.createNotebookCellExecution(firstCell);
              dummyExecution.start(Date.now());
              await new Promise(resolve => setTimeout(resolve, 50));
              dummyExecution.end(true, Date.now());
              console.log("[DynamicControllerManager] Association completed");
            }
          } catch (error) {
            console.log("[DynamicControllerManager] Failed to create association:", error);
          }
        }
        
        // Show confirmation after a short delay to let VS Code process the changes
        setTimeout(() => {
          console.log("[DynamicControllerManager] Runtime controller should now be selected");
          vscode.window.showInformationMessage(
            `Runtime "${runtime.givenName || runtime.given_name}" is now active`,
            { modal: false }
          );
        }, 100);
      }

      // Don't refresh all controllers - it might reset the selection
      // await this.refreshControllers();
    }

    return runtime;
  }

  /**
   * Creates a controller for a specific runtime.
   */
  private async createRuntimeController(runtime: Runtime): Promise<void> {
    const controllerId = this.getRuntimeControllerId(runtime);
    
    // Don't create duplicate controllers
    if (this._controllers.has(controllerId)) {
      console.log("[DynamicControllerManager] Runtime controller already exists:", controllerId);
      return;
    }

    // Get runtime display info
    const displayInfo = this.getRuntimeDisplayInfo(runtime);
    
    const controller = vscode.notebooks.createNotebookController(
      controllerId,
      "jupyter-notebook",
      displayInfo.label
    );

    controller.description = displayInfo.description;
    controller.detail = `Execute cells on ${displayInfo.environment}`;
    controller.supportedLanguages = ["python", "markdown", "raw"];
    controller.supportsExecutionOrder = true;

    // When this runtime controller is selected, use it directly for execution
    controller.executeHandler = async (cells, notebook, ctrl) => {
      console.log(`[DynamicControllerManager] Runtime controller ${controllerId} executing cells`);
      await this.executeCellsWithRuntime(cells, notebook, runtime);
    };

    // Listen for when this runtime controller is selected
    controller.onDidChangeSelectedNotebooks((e) => {
      console.log(`[DynamicControllerManager] Runtime controller ${controllerId} selection changed:`, e);
      
      if (e.selected) {
        // Runtime controller was selected - store as active runtime for the notebook
        const activeNotebook = vscode.window.activeNotebookEditor?.notebook;
        if (activeNotebook) {
          console.log(`[DynamicControllerManager] Runtime controller ${displayInfo.label} selected for notebook`);
          // Store this runtime as the active one for the notebook
          this._notebookRuntimes.set(activeNotebook.uri.toString(), runtime);
        }
      }
    });

    // Handle interrupts
    controller.interruptHandler = async () => {
      console.log(`[DynamicControllerManager] Runtime controller ${controllerId} interrupted`);
      await this.showRuntimeSelector(vscode.window.activeNotebookEditor?.notebook!);
    };

    this._controllers.set(controllerId, controller);
    this._context.subscriptions.push(controller);

    console.log("[DynamicControllerManager] Runtime controller created:", displayInfo.label);
  }

  /**
   * Gets display information for a runtime.
   */
  private getRuntimeDisplayInfo(runtime: Runtime): { label: string; description: string; environment: string } {
    let environmentTitle = '';
    let environmentName = '';
    let givenName = '';
    
    // Extract runtime information
    if (runtime && typeof runtime === 'object') {
      if ('environmentName' in runtime || 'givenName' in runtime) {
        environmentName = runtime.environmentName || runtime.environment_name || '';
        givenName = runtime.givenName || runtime.given_name || '';
      } else if (typeof runtime.toJSON === 'function') {
        const data = runtime.toJSON();
        environmentName = data.environment_name || '';
        givenName = data.given_name || '';
        environmentTitle = data.environment_title || '';
      } else {
        environmentName = runtime.environment_name || '';
        givenName = runtime.given_name || '';
        environmentTitle = runtime.environment_title || '';
      }
    }
    
    // Derive environment title if not available
    if (!environmentTitle && givenName) {
      if (givenName.includes('Python CPU')) {
        environmentTitle = 'Python CPU Environment';
      } else if (givenName.includes('AI')) {
        environmentTitle = 'AI Environment';
      } else if (givenName.endsWith(' Runtime')) {
        environmentTitle = givenName.replace(' Runtime', ' Environment');
      } else {
        environmentTitle = givenName;
      }
    }

    const label = environmentTitle && environmentName
      ? `Datalayer: ${environmentTitle} (${environmentName})`
      : givenName
        ? `Datalayer: ${givenName}`
        : `Datalayer: ${runtime.pod_name || runtime.uid?.slice(0, 8) || 'Runtime'}`;

    const description = environmentTitle
      ? `Connected to ${environmentTitle}`
      : `Connected to ${givenName || runtime.pod_name || 'runtime'}`;

    const environment = environmentTitle || givenName || runtime.pod_name || 'Unknown';

    return { label, description, environment };
  }

  /**
   * Gets a consistent controller ID for a runtime.
   */
  private getRuntimeControllerId(runtime: Runtime): string {
    return `datalayer-runtime-${runtime.uid || runtime.pod_name}`;
  }

  /**
   * Executes cells using a specific runtime.
   */
  private async executeCellsWithRuntime(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    runtime: Runtime
  ): Promise<void> {
    console.log("[DynamicControllerManager] Executing", cells.length, "cells with runtime:", runtime.uid);

    const notebookUri = notebook.uri.toString();
    const isWebviewNotebook = notebook.uri.scheme === "datalayer";

    if (isWebviewNotebook) {
      // For webview notebooks, send runtime info via message
      console.log("[DynamicControllerManager] Routing to webview notebook (Datalayer)");
      console.log("[DynamicControllerManager] Runtime being passed:", runtime);
      console.log("[DynamicControllerManager] Runtime type:", typeof runtime, runtime?.constructor?.name);
      await this._kernelBridge.connectWebviewNotebook(notebook.uri, runtime);
      
      // Get any controller to create executions (they all work the same for webview)
      const anyController = Array.from(this._controllers.values())[0];
      
      // Webview handles execution, just mark cells as successful
      for (const cell of cells) {
        const execution = anyController.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());
        execution.end(true, Date.now());
      }
    } else {
      // For native notebooks (local files), use WebSocket connection
      console.log("[DynamicControllerManager] Routing to native notebook (local file):");
      
      // Get or create kernel client for this notebook
      let kernelClient = this._activeKernels.get(notebookUri);
      if (!kernelClient) {
        kernelClient = new WebSocketKernelClient(runtime, this._sdk);
        await kernelClient.connect();
        this._activeKernels.set(notebookUri, kernelClient);
      }

      // Get the runtime controller to create executions
      const runtimeControllerId = this.getRuntimeControllerId(runtime);
      const runtimeController = this._controllers.get(runtimeControllerId);
      
      if (!runtimeController) {
        throw new Error(`Runtime controller not found: ${runtimeControllerId}`);
      }

      // Execute cells
      for (const cell of cells) {
        await this.executeCellViaWebSocket(cell, kernelClient, runtimeController);
      }
    }
  }

  /**
   * Executes a cell via WebSocket connection.
   */
  private async executeCellViaWebSocket(
    cell: vscode.NotebookCell,
    kernelClient: WebSocketKernelClient,
    controller: vscode.NotebookController
  ): Promise<void> {
    // Ensure controller is associated with the notebook before creating execution
    const notebook = cell.notebook;
    
    // CRITICAL: Update the controller's affinity to Preferred to ensure association
    // This must be done BEFORE trying to create an execution
    console.log("[DynamicControllerManager] Ensuring controller is associated with notebook");
    await controller.updateNotebookAffinity(notebook, vscode.NotebookControllerAffinity.Preferred);
    
    // Give VS Code a moment to process the affinity change
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const execution = controller.createNotebookCellExecution(cell);
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
              vscode.NotebookCellOutputItem.text(output.text)
            ])
          );
        } else if (output.type === "execute_result") {
          const items: vscode.NotebookCellOutputItem[] = [];
          
          if (output.data["text/html"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(output.data["text/html"], "text/html")
            );
          }
          if (output.data["text/plain"]) {
            items.push(
              vscode.NotebookCellOutputItem.text(output.data["text/plain"], "text/plain")
            );
          }
          
          if (items.length > 0) {
            await execution.appendOutput(new vscode.NotebookCellOutput(items));
          }
        } else if (output.type === "error") {
          await execution.appendOutput(
            new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.error({
                name: output.ename,
                message: output.evalue,
                stack: output.traceback.join("\n")
              })
            ])
          );
        }
      }

      execution.end(true, Date.now());
    } catch (error) {
      console.error("[DynamicControllerManager] Execution error:", error);
      
      await execution.appendOutput(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error({
            name: "ExecutionError",
            message: error instanceof Error ? error.message : String(error)
          })
        ])
      );
      
      execution.end(false, Date.now());
    }
  }

  /**
   * Refreshes all controllers based on current authentication and available runtimes.
   */
  public async refreshControllers(): Promise<void> {
    if (!this._authProvider.isAuthenticated()) {
      // Remove all runtime controllers when not authenticated
      for (const [id, controller] of this._controllers) {
        if (id !== "datalayer-select-runtime") {
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

      console.log("[DynamicControllerManager] Controllers refreshed:", this._controllers.size);
    } catch (error) {
      console.error("[DynamicControllerManager] Error refreshing controllers:", error);
    }
  }

  /**
   * Handles notebook open events.
   */
  public async onDidOpenNotebook(notebook: vscode.NotebookDocument): Promise<void> {
    // For Jupyter notebooks, check if we have a stored runtime for this notebook
    if (notebook.notebookType === "jupyter-notebook") {
      const notebookUri = notebook.uri.toString();
      const storedRuntime = this._notebookRuntimes.get(notebookUri);
      
      if (storedRuntime) {
        console.log("[DynamicControllerManager] Restoring runtime for reopened notebook");
        const controllerId = this.getRuntimeControllerId(storedRuntime);
        const controller = this._controllers.get(controllerId);
        
        if (controller) {
          // Set this controller as preferred for the notebook
          await controller.updateNotebookAffinity(
            notebook,
            vscode.NotebookControllerAffinity.Preferred
          );
        }
      }
    }
  }

  /**
   * Handles notebook close events.
   */
  public onDidCloseNotebook(notebook: vscode.NotebookDocument): void {
    const notebookUri = notebook.uri.toString();
    const kernelClient = this._activeKernels.get(notebookUri);
    
    if (kernelClient) {
      kernelClient.dispose();
      this._activeKernels.delete(notebookUri);
      console.log("[DynamicControllerManager] Cleaned up kernel for closed notebook");
    }
  }

  /**
   * Public method to select runtime for a specific notebook.
   */
  public async selectRuntimeForNotebook(notebook: vscode.NotebookDocument): Promise<void> {
    console.log("[DynamicControllerManager] selectRuntimeForNotebook called");
    await this.showRuntimeSelector(notebook);
  }

  /**
   * Disposes of the manager and cleans up resources.
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

    // Dispose all controllers
    for (const controller of this._controllers.values()) {
      controller.dispose();
    }
    this._controllers.clear();

    console.log("[DynamicControllerManager] Manager disposed");
  }
}