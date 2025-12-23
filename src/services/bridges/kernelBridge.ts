/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Kernel bridge service that routes kernel connections to appropriate handlers.
 * Detects notebook type and connects kernels accordingly.
 *
 * @module services/kernelBridge
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { RuntimeJSON } from "@datalayer/core/lib/models/RuntimeDTO";
import { SDKAuthProvider } from "../core/authProvider";
import { LocalKernelClient } from "../kernel/localKernelClient";
import type { NativeKernelInfo } from "../kernel/nativeKernelIntegration";

/**
 * Extended runtime interface for webview communication.
 * Includes additional time fields needed for progress calculations.
 */
interface ExtendedRuntimeJSON
  extends Omit<RuntimeJSON, "startedAt" | "expiredAt"> {
  // Time fields for progress calculations (Unix timestamps or ISO strings)
  startedAt: number | string;
  expiredAt: number | string;
}

/**
 * Message sent to webview for kernel selection.
 * Matches messageHandler's expected structure with body field.
 */
interface KernelSelectionMessage {
  type: "kernel-selected";
  body: {
    runtime: ExtendedRuntimeJSON;
  };
}

/**
 * Bridges kernel connections between VS Code and notebooks.
 * Routes to WebSocket for native notebooks or webview messages for Datalayer notebooks.
 */
export class KernelBridge implements vscode.Disposable {
  private readonly _webviews = new Map<string, vscode.WebviewPanel>();
  private readonly _localKernels = new Map<string, LocalKernelClient>();
  private readonly _documentKernels = new Map<string, string>(); // documentUri -> kernelId
  private readonly _pendingPyodideRuntimes = new Map<
    string,
    ExtendedRuntimeJSON
  >(); // documentUri -> runtime (waiting for kernel-ready)
  private _disposed = false;

  /**
   * Creates a new KernelBridge instance.
   */
  constructor(
    /** @internal - Used for runtime operations */
    // @ts-ignore - TS6138
    private readonly _sdk: DatalayerClient,
    /** @internal - Used for authentication in runtime operations */
    // @ts-ignore - TS6138
    private readonly _authProvider: SDKAuthProvider,
  ) {}

  /**
   * Registers a webview panel for kernel communication.
   *
   * @param uri - Notebook URI
   * @param webview - Webview panel
   */
  public registerWebview(uri: vscode.Uri, webview: vscode.WebviewPanel): void {
    const key = uri.toString();
    this._webviews.set(key, webview);
  }

  /**
   * Unregisters a webview panel.
   *
   * @param _uri - Notebook URI
   */
  public unregisterWebview(_uri: vscode.Uri): void {
    const key = _uri.toString();
    this._webviews.delete(key);
  }

  /**
   * Sends "kernel-starting" message to webview immediately.
   * Used to trigger spinner before any async operations.
   *
   * @param uri - Document URI
   * @param runtime - Selected runtime
   */
  public async sendKernelStartingMessage(
    uri: vscode.Uri,
    runtime: RuntimeDTO,
  ): Promise<void> {
    const key = uri.toString();
    const webview = this._webviews.get(key);

    if (!webview) {
      // Try to find webview by searching active panels
      const allWebviews = this.findWebviewsForUri(uri);
      if (allWebviews.length === 0) {
        throw new Error("No webview found for document");
      }
      // Use first matching webview
      const webviewPanel = allWebviews[0];
      this._webviews.set(key, webviewPanel);
    }

    const targetWebview = this._webviews.get(key);
    if (!targetWebview) {
      throw new Error("Failed to get webview panel for document");
    }

    // Use runtime.toJSON() to get the stable interface, or use runtime directly if it's already a plain object
    let runtimeData: RuntimeJSON;
    if (runtime && typeof runtime.toJSON === "function") {
      runtimeData = runtime.toJSON();
    } else if (runtime) {
      // Runtime is already a plain DTO object (e.g., temporary runtime from selector)
      runtimeData = runtime as unknown as RuntimeJSON;
    } else {
      throw new Error("Runtime object is undefined");
    }

    // Send "kernel-starting" message IMMEDIATELY to trigger spinner
    await targetWebview.webview.postMessage({
      type: "kernel-starting",
      body: {
        runtime: runtimeData,
      },
    });
  }

  /**
   * Connects a webview document (notebook or lexical) to a runtime.
   * Sends runtime information to the webview for ServiceManager creation.
   *
   * NOTE: Caller should call sendKernelStartingMessage() BEFORE this method
   * to minimize lag between selection and spinner appearance.
   *
   * @param uri - Document URI
   * @param runtime - Selected runtime
   */
  public async connectWebviewDocument(
    uri: vscode.Uri,
    runtime: RuntimeDTO,
  ): Promise<void> {
    const key = uri.toString();
    const webview = this._webviews.get(key);

    if (!webview) {
      // Try to find webview by searching active panels
      const allWebviews = this.findWebviewsForUri(uri);
      if (allWebviews.length === 0) {
        throw new Error("No webview found for document");
      }
      // Use first matching webview
      const webviewPanel = allWebviews[0];
      this._webviews.set(key, webviewPanel);
    }

    const targetWebview = this._webviews.get(key);
    if (!targetWebview) {
      throw new Error("Failed to get webview panel for document");
    }

    // Use runtime.toJSON() to get the stable interface, or use runtime directly if it's already a plain object
    let runtimeData: RuntimeJSON;
    if (runtime && typeof runtime.toJSON === "function") {
      runtimeData = runtime.toJSON();
    } else if (runtime) {
      // Runtime is already a plain DTO object (e.g., temporary runtime from selector)
      runtimeData = runtime as unknown as RuntimeJSON;
    } else {
      throw new Error("Runtime object is undefined");
    }

    // Use the primary field names from the runtime API
    const ingressUrl = runtimeData.ingress;
    const authToken = runtimeData.token;

    if (!ingressUrl || !authToken) {
      throw new Error("Runtime is missing ingress URL or token");
    }

    // Fire event so providers can track the runtime
    // This allows them to show "Terminate Runtime" option later
    await vscode.commands.executeCommand(
      "datalayer.internal.runtime.connected",
      uri,
      runtime,
    );

    // Send "kernel-selected" message to start kernel creation
    // The webview will monitor kernel readiness and clear the spinner locally
    const message = {
      type: "kernel-selected",
      body: {
        runtime: runtimeData,
      },
    };

    await targetWebview.webview.postMessage(message);
  }

  /**
   * Connects a webview document (notebook or lexical) to Pyodide kernel.
   * Sends Pyodide runtime information to the webview for in-browser Python execution.
   *
   * @param uri - Document URI
   */
  public async connectWebviewDocumentToPyodide(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const webview = this._webviews.get(key);

    if (!webview) {
      // Try to find webview by searching active panels
      const allWebviews = this.findWebviewsForUri(uri);
      if (allWebviews.length === 0) {
        throw new Error("No webview found for document");
      }
      // Use first matching webview
      const webviewPanel = allWebviews[0];
      this._webviews.set(key, webviewPanel);
    }

    const targetWebview = this._webviews.get(key);
    if (!targetWebview) {
      throw new Error("Failed to get webview panel for document");
    }

    // Create a Pyodide runtime object that matches the RuntimeJSON interface
    // The special ingress URL "http://pyodide-local" signals to the webview
    // to use the in-browser Pyodide kernel instead of making HTTP requests
    const pyodideRuntime: ExtendedRuntimeJSON = {
      uid: "pyodide-local",
      podName: "pyodide-local",
      givenName: "Pyodide",
      environmentName: "python",
      environmentTitle: "Pyodide",
      type: "notebook",
      burningRate: 0,
      ingress: "http://pyodide-local", // Special marker URL
      token: "", // No token needed for browser-based execution
      startedAt: new Date().toISOString(),
      expiredAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Never expires (1 year)
    };

    // Fire event so providers can track the Pyodide kernel
    await vscode.commands.executeCommand(
      "datalayer.internal.runtime.connected",
      uri,
      pyodideRuntime,
    );

    // Send "kernel-starting" message FIRST to trigger spinner immediately
    await targetWebview.webview.postMessage({
      type: "kernel-starting",
      body: {
        runtime: pyodideRuntime,
      },
    });

    // Send "kernel-selected" message immediately to start kernel creation
    // The webview will monitor kernel readiness and clear the spinner locally
    const message = {
      type: "kernel-selected",
      body: {
        runtime: pyodideRuntime,
      },
    };

    await targetWebview.webview.postMessage(message);
  }

  /**
   * Connects a webview document to a local kernel (Python environment, Jupyter kernel, or Jupyter server).
   * Starts the kernel and sends kernel information to the webview.
   *
   * @param uri - Document URI
   * @param kernelInfo - Native kernel information
   */
  public async connectWebviewDocumentToLocalKernel(
    uri: vscode.Uri,
    kernelInfo: NativeKernelInfo,
  ): Promise<void> {
    const key = uri.toString();
    const webview = this._webviews.get(key);

    if (!webview) {
      // Try to find webview by searching active panels
      const allWebviews = this.findWebviewsForUri(uri);
      if (allWebviews.length === 0) {
        throw new Error("No webview found for document");
      }
      // Use first matching webview
      const webviewPanel = allWebviews[0];
      this._webviews.set(key, webviewPanel);
    }

    const targetWebview = this._webviews.get(key);
    if (!targetWebview) {
      throw new Error("Failed to get webview panel for document");
    }

    // Check if a kernel client already exists for this kernel ID
    const existingClient = this._localKernels.get(kernelInfo.id);
    if (existingClient) {
      console.log(
        `[KernelBridge] Disposing existing kernel client for ${kernelInfo.id}`,
      );
      existingClient.dispose();
      this._localKernels.delete(kernelInfo.id);
      // Wait a bit for ports to be released
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Create a mock runtime object that matches the RuntimeJSON interface
    // IMPORTANT: Create this BEFORE starting the kernel so we can send it to the webview immediately!
    // For Jupyter servers, use the server URL from kernelInfo
    // For local kernels, use a special URL that signals to networkProxy
    // to route messages through the extension instead of making real HTTP/WebSocket requests
    // We use http:// (not local://) so @jupyterlab/services accepts it as a valid base URL
    const isJupyterServer =
      kernelInfo.type === "jupyter-server" && kernelInfo.serverUrl;
    const mockRuntime: ExtendedRuntimeJSON = {
      uid: kernelInfo.id,
      podName: `local-kernel-${kernelInfo.id}`,
      givenName: kernelInfo.displayName,
      environmentName: kernelInfo.type,
      environmentTitle: kernelInfo.displayName,
      type: "notebook",
      burningRate: 0,
      // Use special marker in URL for local kernels, real URL for Jupyter servers
      // Format: http://local-kernel-{kernelId}.localhost
      ingress: isJupyterServer
        ? kernelInfo.serverUrl!
        : `http://local-kernel-${kernelInfo.id}.localhost`,
      token: kernelInfo.token || "", // Use token from kernel info if available
      startedAt: new Date().toISOString(),
      expiredAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
    };

    // Fire event so providers can track the local kernel
    await vscode.commands.executeCommand(
      "datalayer.internal.runtime.connected",
      uri,
      mockRuntime,
    );

    // Send NEW "kernel-starting" message IMMEDIATELY to trigger spinner in webview
    // This message is sent BEFORE the kernel starts, so the user sees immediate feedback
    await targetWebview.webview.postMessage({
      type: "kernel-starting",
      body: {
        runtime: mockRuntime,
      },
    });

    // NOW start the local kernel client (this takes 3 seconds)
    const kernelClient = new LocalKernelClient(kernelInfo);
    await kernelClient.start();

    // Store the kernel client for later use
    this._localKernels.set(kernelInfo.id, kernelClient);
    this._documentKernels.set(key, kernelInfo.id);

    // Send standard kernel-selected message AFTER kernel is started and registered
    // This ensures the kernel is ready when the webview tries to connect
    const message = {
      type: "kernel-selected",
      body: {
        runtime: mockRuntime,
      },
    };

    await targetWebview.webview.postMessage(message);
  }

  /**
   * Detects the type of notebook (native vs webview).
   *
   * @param uri - Notebook URI
   * @returns "webview" for Datalayer notebooks, "native" for others
   */
  public detectNotebookType(uri: vscode.Uri): "webview" | "native" {
    // Datalayer notebooks use custom URI scheme
    if (uri.scheme === "datalayer") {
      return "webview";
    }

    // Check if notebook is opened in custom editor
    const customEditors = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => {
        if (tab.input && typeof tab.input === "object" && "uri" in tab.input) {
          return (
            (tab.input as { uri?: vscode.Uri }).uri?.toString() ===
            uri.toString()
          );
        }
        return false;
      });

    if (
      customEditors.some(
        (tab) =>
          (tab.input as { viewType?: string }).viewType ===
          "datalayer.jupyter-notebook",
      )
    ) {
      return "webview";
    }

    // Default to native for .ipynb files
    return "native";
  }

  /**
   * Finds webview panels for a given URI.
   * Searches through active tab groups.
   *
   * @param _uri - Notebook URI
   * @returns Array of matching webview panels
   */
  private findWebviewsForUri(_uri: vscode.Uri): vscode.WebviewPanel[] {
    const panels: vscode.WebviewPanel[] = [];

    // This is a limitation - we can't directly access WebviewPanels
    // We need to track them when they're created
    // For now, return empty array and rely on registration

    // The webview should have been registered when created
    // If not found, it means the webview wasn't properly registered

    return panels;
  }

  /**
   * Sends a kernel status update to a notebook.
   *
   * @param uri - Notebook URI
   * @param status - Kernel status
   */
  public async sendKernelStatus(
    uri: vscode.Uri,
    status: "idle" | "busy" | "starting" | "restarting" | "dead",
  ): Promise<void> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      const key = uri.toString();
      const webview = this._webviews.get(key);

      if (webview) {
        await webview.webview.postMessage({
          type: "kernel-status",
          status,
        });
      }
    }
    // Native notebooks handle status through NotebookController
  }

  /**
   * Handles kernel lifecycle commands.
   *
   * @param uri - Notebook URI
   * @param command - Command to execute
   */
  public async handleKernelCommand(
    uri: vscode.Uri,
    command: "interrupt" | "restart" | "shutdown",
  ): Promise<void> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      const key = uri.toString();
      const webview = this._webviews.get(key);

      if (webview) {
        await webview.webview.postMessage({
          type: "kernel-command",
          command,
        });
      }
    } else {
      // For native notebooks, the controller handles this
    }
  }

  /**
   * Gets the current kernel info for a notebook.
   *
   * @param uri - Notebook URI
   * @returns Kernel information or undefined
   */
  public async getKernelInfo(uri: vscode.Uri): Promise<unknown> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      // For webview notebooks, we'd need to request info from webview
      // This would require a request-response pattern
      return undefined;
    } else {
      // For native notebooks, get from active controller
      const notebook = vscode.workspace.notebookDocuments.find(
        (doc) => doc.uri.toString() === uri.toString(),
      );

      if (notebook) {
        // Return notebook metadata if available
        return notebook.metadata;
      }
    }

    return undefined;
  }

  /**
   * Broadcasts kernel selection to all registered webviews.
   * Used when a runtime is selected that should apply to multiple documents.
   *
   * @param runtime - Selected runtime to broadcast
   */
  public async broadcastKernelSelected(runtime: RuntimeDTO): Promise<void> {
    const runtimeData = runtime.toJSON();
    const message: KernelSelectionMessage = {
      type: "kernel-selected",
      body: {
        runtime: runtimeData,
      },
    };

    // Send to all registered webviews
    const promises: Thenable<boolean>[] = [];
    for (const webview of this._webviews.values()) {
      promises.push(webview.webview.postMessage(message));
    }

    await Promise.all(promises);
  }

  /**
   * Broadcasts kernel termination to all registered webviews.
   * Used when a runtime is terminated that affects multiple documents.
   */
  public async broadcastKernelTerminated(): Promise<void> {
    const message = {
      type: "kernel-terminated",
    };

    // Send to all registered webviews
    const promises: Thenable<boolean>[] = [];
    for (const webview of this._webviews.values()) {
      promises.push(webview.webview.postMessage(message));
    }

    await Promise.all(promises);
  }

  /**
   * Handles kernel-ready message from webview.
   * Sends the pending kernel-selected message to complete kernel initialization.
   *
   * @param uri - Document URI
   */
  public async handleKernelReady(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const pendingRuntime = this._pendingPyodideRuntimes.get(key);

    if (!pendingRuntime) {
      console.warn(
        `[KernelBridge] No pending runtime found for ${key}, kernel-ready already handled or timeout occurred`,
      );
      return;
    }

    // Remove from pending map
    this._pendingPyodideRuntimes.delete(key);

    // Get webview
    const webview = this._webviews.get(key);
    if (!webview) {
      console.error(
        `[KernelBridge] No webview found for ${key}, cannot send kernel-selected`,
      );
      return;
    }

    console.log(
      `[KernelBridge] Kernel ready for ${key}, sending kernel-selected message`,
    );

    // Send kernel-selected message to stop spinner
    const message = {
      type: "kernel-selected",
      body: {
        runtime: pendingRuntime,
      },
    };

    await webview.webview.postMessage(message);
  }

  /**
   * Gets a local kernel client by ID.
   * Used by network proxy to route messages to local ZMQ kernels.
   *
   * @param kernelId - Kernel identifier
   * @returns Local kernel client or undefined
   */
  public getLocalKernel(kernelId: string): LocalKernelClient | undefined {
    return this._localKernels.get(kernelId);
  }

  /**
   * Disposes of the bridge and cleans up resources.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;
    this._webviews.clear();

    // Dispose all local kernels
    for (const kernel of this._localKernels.values()) {
      try {
        kernel.dispose();
      } catch (err) {
        console.error("Error disposing local kernel:", err);
      }
    }
    this._localKernels.clear();
    this._documentKernels.clear();
  }
}
