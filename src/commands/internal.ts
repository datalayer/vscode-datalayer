/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Internal commands for cross-component communication.
 * These commands are not exposed to users but used for internal coordination.
 *
 * @module commands/internal
 */

import * as vscode from "vscode";

/**
 * Map of document URIs to their connected runtimes.
 * Shared across both notebook and lexical providers.
 */
const connectedRuntimes = new Map<string, unknown>();

/**
 * Callback type for runtime termination notifications.
 * Used by providers to register handlers for runtime termination events.
 */
export type RuntimeTerminatedCallback = (
  uri: vscode.Uri,
) => Promise<void> | void;

/**
 * Registry of callbacks to notify when a runtime is terminated.
 * Providers register their notification handlers here.
 */
const runtimeTerminatedCallbacks: RuntimeTerminatedCallback[] = [];

/**
 * Registers a callback to be called when a runtime is terminated.
 *
 * @param callback - Function to call when runtime is terminated
 */
export function onRuntimeTerminated(callback: RuntimeTerminatedCallback): void {
  runtimeTerminatedCallbacks.push(callback);
}

/**
 * Registers internal commands used for cross-component communication.
 *
 * @param context - Extension context for command subscriptions
 */
export function registerInternalCommands(
  context: vscode.ExtensionContext,
): void {
  /**
   * Internal command to track runtime connections per document.
   * Called by KernelBridge when a runtime is connected to a document.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.runtimeConnected",
      (uri: vscode.Uri, runtime: unknown) => {
        connectedRuntimes.set(uri.toString(), runtime);
      },
    ),
  );

  /**
   * Internal command to notify UI when runtime is terminated.
   * Called by runtimes.ts after successfully terminating a runtime.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.notifyRuntimeTerminated",
      async (uri: vscode.Uri) => {
        // Notify all registered callbacks
        await Promise.all(
          runtimeTerminatedCallbacks.map((callback) => callback(uri)),
        );
      },
    ),
  );

  /**
   * Internal command to insert a cell into a Datalayer notebook webview.
   * Called by InsertCellTool to send message to webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.insertCell",
      async (params: {
        uri: string;
        cellType: "code" | "markdown";
        cellSource: string;
        cellIndex?: number;
      }) => {
        const { uri, cellType, cellSource, cellIndex } = params;

        // Send message via insertCellCallback
        await vscode.commands.executeCommand(
          "datalayer.internal.sendToWebview",
          uri,
          {
            type: "insert-cell",
            body: {
              cellType,
              cellSource,
              cellIndex,
            },
          },
        );
      },
    ),
  );

  /**
   * Internal command to delete a cell from a Datalayer notebook webview.
   * Called by DeleteCellTool to send message to webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.deleteCell",
      async (params: { uri: string; cellIndex: number }) => {
        const { uri, cellIndex } = params;

        await vscode.commands.executeCommand(
          "datalayer.internal.sendToWebview",
          uri,
          {
            type: "delete-cell",
            body: {
              cellIndex,
            },
          },
        );
      },
    ),
  );

  /**
   * Internal command to overwrite a cell's source in a Datalayer notebook webview.
   * Called by OverwriteCellTool to send message to webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.overwriteCell",
      async (params: {
        uri: string;
        cellIndex: number;
        cellSource: string;
      }) => {
        const { uri, cellIndex, cellSource } = params;

        await vscode.commands.executeCommand(
          "datalayer.internal.sendToWebview",
          uri,
          {
            type: "overwrite-cell",
            body: {
              cellIndex,
              cellSource,
            },
          },
        );
      },
    ),
  );

  /**
   * Internal command to read a specific cell from a Datalayer notebook webview.
   * Called by ReadCellTool to request cell data from webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.readCell",
      async (params: {
        uri: string;
        cellIndex: number;
      }): Promise<{
        index: number;
        type: string;
        source: string;
        outputs?: string[];
      }> => {
        const { uri, cellIndex } = params;
        const requestId = `read-cell-${Date.now()}-${Math.random()}`;

        // Send request and await response
        const response = await vscode.commands.executeCommand<{
          index: number;
          type: string;
          source: string;
          outputs?: string[];
        }>(
          "datalayer.internal.sendToWebviewWithResponse",
          uri,
          {
            type: "read-cell-request",
            requestId,
            body: {
              cellIndex,
            },
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to read all cells from a Datalayer notebook webview.
   * Called by ReadAllCellsTool to request all cell data from webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.readAllCells",
      async (params: {
        uri: string;
      }): Promise<
        Array<{
          index: number;
          type: string;
          source: string;
          outputs?: string[];
        }>
      > => {
        const { uri } = params;
        const requestId = `read-all-cells-${Date.now()}-${Math.random()}`;

        // Send request and await response
        const response = await vscode.commands.executeCommand<
          Array<{
            index: number;
            type: string;
            source: string;
            outputs?: string[];
          }>
        >(
          "datalayer.internal.sendToWebviewWithResponse",
          uri,
          {
            type: "read-all-cells-request",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );
}

/**
 * Gets the connected runtime for a document URI.
 *
 * @param uri - Document URI
 * @returns Runtime object if connected, undefined otherwise
 */
export function getConnectedRuntime(uri: vscode.Uri): unknown {
  return connectedRuntimes.get(uri.toString());
}

/**
 * Clears the runtime connection for a document URI.
 *
 * @param uri - Document URI
 */
export function clearConnectedRuntime(uri: vscode.Uri): void {
  connectedRuntimes.delete(uri.toString());
}
