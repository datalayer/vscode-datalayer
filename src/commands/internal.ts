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
