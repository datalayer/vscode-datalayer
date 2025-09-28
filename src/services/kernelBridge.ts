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
import type { DatalayerSDK, Runtime } from "../../../core/lib/index.js";
import { SDKAuthProvider } from "./authProvider";
import { WebviewCollection } from "../utils/webviewCollection";

/**
 * Message sent to webview for kernel selection.
 */
interface KernelSelectionMessage {
  type: "kernel-selected";
  runtime: {
    uid: string;
    name: string;
    url: string;  // Changed from 'ingress' to 'url' for LocalNotebook compatibility
    token: string;
    status: string;
    environment_name?: string;
  };
}

/**
 * Bridges kernel connections between VS Code and notebooks.
 * Routes to WebSocket for native notebooks or webview messages for Datalayer notebooks.
 */
export class KernelBridge implements vscode.Disposable {
  private readonly _webviews = new Map<string, vscode.WebviewPanel>();
  private _disposed = false;

  /**
   * Creates a new KernelBridge instance.
   * 
   * @param sdk - Datalayer SDK instance
   * @param authProvider - Authentication provider
   */
  constructor(
    private readonly _sdk: DatalayerSDK,
    private readonly _authProvider: SDKAuthProvider
  ) {
    console.log("[KernelBridge] Bridge created");
  }

  /**
   * Registers a webview panel for kernel communication.
   * 
   * @param uri - Notebook URI
   * @param webview - Webview panel
   */
  public registerWebview(uri: vscode.Uri, webview: vscode.WebviewPanel): void {
    const key = uri.toString();
    this._webviews.set(key, webview);
    console.log("[KernelBridge] Registered webview for:", key);
  }

  /**
   * Unregisters a webview panel.
   * 
   * @param uri - Notebook URI
   */
  public unregisterWebview(uri: vscode.Uri): void {
    const key = uri.toString();
    this._webviews.delete(key);
    console.log("[KernelBridge] Unregistered webview for:", key);
  }

  /**
   * Connects a webview notebook to a runtime.
   * Sends runtime information to the webview for ServiceManager creation.
   *
   * @param uri - Notebook URI
   * @param runtime - Selected runtime
   */
  public async connectWebviewNotebook(
    uri: vscode.Uri,
    runtime: Runtime
  ): Promise<void> {
    const key = uri.toString();
    const webview = this._webviews.get(key);

    if (!webview) {
      // Try to find webview by searching active panels
      const allWebviews = this.findWebviewsForUri(uri);
      if (allWebviews.length === 0) {
        console.error("[KernelBridge] No webview found for:", key);
        throw new Error("No webview found for notebook");
      }
      // Use first matching webview
      const webviewPanel = allWebviews[0];
      this._webviews.set(key, webviewPanel);
    }

    const targetWebview = this._webviews.get(key);
    if (!targetWebview) {
      throw new Error("Failed to get webview panel");
    }

    // Don't log the full runtime object as it might not serialize well
    // Just log that we received it
    console.log("[KernelBridge] Received runtime object of type:", typeof runtime, runtime?.constructor?.name);

    // First, serialize the runtime if it's a model object
    let runtimeData: any;

    // Log what type of runtime object we have
    console.log("[KernelBridge] Runtime object type check:", {
      hasToJSON: typeof (runtime as any).toJSON === 'function',
      isObject: typeof runtime === 'object',
      constructor: runtime?.constructor?.name,
      hasUID: 'uid' in runtime,
      hasGivenName: 'givenName' in (runtime as any),
      hasIngress: 'ingress' in (runtime as any),
      hasJupyterUrl: 'jupyterUrl' in (runtime as any),
      hasToken: 'token' in (runtime as any),
      hasJupyterToken: 'jupyterToken' in (runtime as any)
    });

    // Check if runtime is a model with toJSON method
    if (runtime && typeof (runtime as any).toJSON === 'function') {
      console.log("[KernelBridge] Runtime is a model, calling toJSON()");
      const jsonResult = (runtime as any).toJSON();
      console.log("[KernelBridge] toJSON() result:", jsonResult);

      // If toJSON returns empty object, extract fields directly from the model
      if (!jsonResult || Object.keys(jsonResult).length === 0) {
        console.log("[KernelBridge] toJSON() returned empty, extracting fields directly from model");
        // Fall through to direct extraction
      } else {
        runtimeData = jsonResult;
      }
    }

    // If we don't have runtimeData yet, extract fields directly
    if (!runtimeData || Object.keys(runtimeData).length === 0) {
      console.log("[KernelBridge] Extracting fields directly from runtime object");

      // Check if runtime has _data property (SDK model pattern)
      const dataField = (runtime as any)._data;
      if (dataField) {
        console.log("[KernelBridge] Found _data field on runtime model:", Object.keys(dataField));

        // Try to use _data directly if other methods failed
        if (dataField.ingress && dataField.token) {
          runtimeData = {
            uid: dataField.uid,
            given_name: dataField.given_name,
            pod_name: dataField.pod_name,
            ingress: dataField.ingress,
            token: dataField.token,
            status: dataField.status || dataField.state || 'ready',
            environment_name: dataField.environment_name
          };
          console.log("[KernelBridge] Extracted runtime data from _data field");
        }
      }

      // If still no data, try getters
      if (!runtimeData) {
        console.log("[KernelBridge] Runtime enumerable properties:", Object.keys(runtime));

        // Try various field access patterns - check for model getters and direct properties
        const uid = runtime.uid || (runtime as any)['uid'];
        const givenName = (runtime as any).givenName || (runtime as any).given_name || (runtime as any)['given_name'];
        const podName = (runtime as any).podName || (runtime as any).pod_name || (runtime as any)['pod_name'];

        // For URL, try multiple property names
        const ingressUrl = (runtime as any).jupyterUrl ||
                          (runtime as any).jupyter_url ||
                          (runtime as any).ingress ||
                          (runtime as any)['jupyterUrl'] ||
                          (runtime as any)['jupyter_url'] ||
                          (runtime as any)['ingress'];

        // For token, try multiple property names
        const authToken = (runtime as any).jupyterToken ||
                         (runtime as any).jupyter_token ||
                         (runtime as any).token ||
                         (runtime as any)['jupyterToken'] ||
                         (runtime as any)['jupyter_token'] ||
                         (runtime as any)['token'];

        const status = (runtime as any).state || (runtime as any).status || (runtime as any)['status'] || (runtime as any)['state'] || 'ready';
        const environmentName = (runtime as any).environmentName || (runtime as any).environment_name || (runtime as any)['environment_name'] || (runtime as any)['environmentName'];

        runtimeData = {
          uid: uid,
          given_name: givenName,
          pod_name: podName,
          ingress: ingressUrl,
          token: authToken,
          status: status,
          environment_name: environmentName
        };

        console.log("[KernelBridge] Extracted runtime data from getters:", {
          uid: uid,
          given_name: givenName,
          pod_name: podName,
          ingress: ingressUrl ? "***hidden***" : undefined,
          token: authToken ? "***hidden***" : undefined,
          status: status,
          environment_name: environmentName
        });
      }
    }

    // Ensure we have required fields before sending
    const ingressUrl = runtimeData.ingress || runtimeData.jupyter_url || runtimeData.jupyter_base_url;
    const authToken = runtimeData.token || runtimeData.jupyter_token;

    if (!ingressUrl || !authToken) {
      console.error("[KernelBridge] Runtime missing required fields:", {
        hasIngress: !!ingressUrl,
        hasToken: !!authToken,
        runtimeData: runtimeData
      });
      throw new Error("Runtime is missing ingress URL or token");
    }

    // Send runtime information to webview
    // Map field names for compatibility with LocalNotebook component
    const message: KernelSelectionMessage = {
      type: "kernel-selected",
      runtime: {
        uid: runtimeData.uid || "unknown",
        name: runtimeData.given_name || runtimeData.pod_name || runtimeData.uid || "Jupyter Runtime",
        url: ingressUrl,  // LocalNotebook expects 'url', not 'ingress'
        token: authToken,
        status: runtimeData.status || runtimeData.state || "ready",
        environment_name: runtimeData.environment_name
      }
    };

    console.log("[KernelBridge v2] Sending runtime to webview:", {
      uid: message.runtime.uid,
      name: message.runtime.name,
      url: message.runtime.url,
      hasToken: !!message.runtime.token,
      status: message.runtime.status
    });

    // Post message to webview
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
      .flatMap(group => group.tabs)
      .filter(tab => {
        if (tab.input && typeof tab.input === 'object' && "uri" in tab.input) {
          return (tab.input as any).uri?.toString() === uri.toString();
        }
        return false;
      });

    if (customEditors.some(tab => (tab.input as any).viewType === "datalayer.jupyter-notebook")) {
      return "webview";
    }

    // Default to native for .ipynb files
    return "native";
  }

  /**
   * Finds webview panels for a given URI.
   * Searches through active tab groups.
   * 
   * @param uri - Notebook URI
   * @returns Array of matching webview panels
   */
  private findWebviewsForUri(uri: vscode.Uri): vscode.WebviewPanel[] {
    const panels: vscode.WebviewPanel[] = [];

    // This is a limitation - we can't directly access WebviewPanels
    // We need to track them when they're created
    // For now, return empty array and rely on registration
    
    console.log("[KernelBridge] Searching for webviews for URI:", uri.toString());
    
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
    status: "idle" | "busy" | "starting" | "restarting" | "dead"
  ): Promise<void> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      const key = uri.toString();
      const webview = this._webviews.get(key);

      if (webview) {
        await webview.webview.postMessage({
          type: "kernel-status",
          status
        });
        console.log("[KernelBridge] Sent kernel status to webview:", status);
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
    command: "interrupt" | "restart" | "shutdown"
  ): Promise<void> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      const key = uri.toString();
      const webview = this._webviews.get(key);

      if (webview) {
        await webview.webview.postMessage({
          type: "kernel-command",
          command
        });
        console.log("[KernelBridge] Sent kernel command to webview:", command);
      }
    } else {
      // For native notebooks, the controller handles this
      console.log("[KernelBridge] Native notebook kernel command:", command);
    }
  }

  /**
   * Gets the current kernel info for a notebook.
   * 
   * @param uri - Notebook URI
   * @returns Kernel information or undefined
   */
  public async getKernelInfo(uri: vscode.Uri): Promise<any> {
    const notebookType = this.detectNotebookType(uri);

    if (notebookType === "webview") {
      // For webview notebooks, we'd need to request info from webview
      // This would require a request-response pattern
      console.log("[KernelBridge] Kernel info requested for webview notebook");
      return undefined;
    } else {
      // For native notebooks, get from active controller
      const notebook = vscode.workspace.notebookDocuments.find(
        doc => doc.uri.toString() === uri.toString()
      );
      
      if (notebook) {
        // Return notebook metadata if available
        return notebook.metadata;
      }
    }

    return undefined;
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
    
    console.log("[KernelBridge] Bridge disposed");
  }
}