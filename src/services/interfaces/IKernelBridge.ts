/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Kernel bridge interface for routing kernel connections.
 * Detects notebook type and connects kernels accordingly.
 *
 * @module services/interfaces/IKernelBridge
 */

import * as vscode from "vscode";
import type { Runtime } from "@datalayer/core/lib/client/models/Runtime";

/**
 * Kernel bridge interface for managing kernel connections.
 * Implementations should route connections to appropriate handlers.
 */
export interface IKernelBridge {
  /**
   * Registers a webview panel for kernel communication.
   *
   * @param uri - Notebook URI
   * @param webview - Webview panel
   */
  registerWebview(uri: vscode.Uri, webview: vscode.WebviewPanel): void;

  /**
   * Unregisters a webview panel.
   *
   * @param uri - Notebook URI
   */
  unregisterWebview(uri: vscode.Uri): void;

  /**
   * Connects a webview document (notebook or lexical) to a runtime.
   * Sends runtime information to the webview for ServiceManager creation.
   *
   * @param uri - Document URI
   * @param runtime - Selected runtime
   */
  connectWebviewDocument(uri: vscode.Uri, runtime: Runtime): Promise<void>;

  /**
   * Detects the type of notebook (native vs webview).
   *
   * @param uri - Notebook URI
   * @returns "webview" for Datalayer notebooks, "native" for others
   */
  detectNotebookType(uri: vscode.Uri): "webview" | "native";

  /**
   * Broadcasts kernel selection to all registered webviews.
   * Used when a runtime is selected that should apply to multiple documents.
   *
   * @param runtime - Selected runtime to broadcast
   */
  broadcastKernelSelected(runtime: Runtime): Promise<void>;

  /**
   * Broadcasts kernel termination to all registered webviews.
   * Used when a runtime is terminated that affects multiple documents.
   */
  broadcastKernelTerminated(): Promise<void>;
}
