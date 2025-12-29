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
 * Map of document URIs to their runtime expiration timers.
 * Used to send pre-termination warnings 5 seconds before expiration.
 */
const expirationTimers = new Map<string, NodeJS.Timeout>();

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
   * DEBUG COMMAND: Reset onboarding state to trigger welcome notification again.
   * Useful during development/testing.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.resetOnboarding",
      async () => {
        await context.globalState.update("datalayer.onboardingComplete", false);
        await context.globalState.update(
          "datalayer.defaultEditorPromptShown",
          false,
        );
        await context.globalState.update(
          "datalayer.jupyterToolsPromptShown",
          false,
        );
        await context.globalState.update(
          "datalayer.sidebarOpenedOnFirstRun",
          false,
        );
        await vscode.window.showInformationMessage(
          "Onboarding state reset! Reload window to see welcome notification.",
          "Reload Now",
        );
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      },
    ),
  );

  /**
   * Internal command to set the active cell in a notebook.
   * Called programmatically to select a specific cell.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.notebook.setActiveCell",
      async (params: { uri: string; index: number }) => {
        const { uri, index } = params;

        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          uri,
          {
            type: "set-active-cell",
            body: {
              index,
            },
          },
        );
      },
    ),
  );

  /**
   * Internal command to track runtime connections per document.
   * Called by KernelBridge when a runtime is connected to a document.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.runtime.connected",
      (uri: vscode.Uri, runtime: unknown) => {
        const uriString = uri.toString();
        connectedRuntimes.set(uriString, runtime);

        // Clear any existing expiration timer for this document
        const existingTimer = expirationTimers.get(uriString);
        if (existingTimer) {
          clearTimeout(existingTimer);
          expirationTimers.delete(uriString);
        }

        // Set up expiration monitoring if runtime has expiration time
        const runtimeObj = runtime as {
          expiredAt?: string;
          expiresAt?: string;
        };
        const expirationTime = runtimeObj?.expiredAt || runtimeObj?.expiresAt;

        if (expirationTime) {
          const expiresAt = new Date(expirationTime).getTime();
          const now = Date.now();
          const timeUntilExpiration = expiresAt - now;

          // Send pre-termination warning 5 seconds before expiration
          const PRE_TERMINATION_THRESHOLD_MS = 5000;
          const timeUntilPreTermination =
            timeUntilExpiration - PRE_TERMINATION_THRESHOLD_MS;

          if (timeUntilPreTermination > 0) {
            // Set timeout to send pre-termination message
            const timer = setTimeout(async () => {
              console.log(
                `[internal.ts] Runtime expiring in 5s for ${uriString} - sending pre-termination message`,
              );

              try {
                // Send runtime-pre-termination message to webview
                await vscode.commands.executeCommand(
                  "datalayer.internal.document.sendToWebview",
                  uriString,
                  {
                    type: "runtime-pre-termination",
                    body: {},
                  },
                );

                console.log(
                  `[internal.ts] Pre-termination message sent via executeCommand for ${uriString}`,
                );
              } catch (error) {
                console.error(
                  `[internal.ts] ERROR sending pre-termination message:`,
                  error,
                );
              }

              // Clean up the timer
              expirationTimers.delete(uriString);
            }, timeUntilPreTermination);

            // Store the timer so we can cancel it if runtime changes
            expirationTimers.set(uriString, timer);
            console.log(
              `[internal.ts] Set pre-termination timer for ${uriString} - will fire in ${timeUntilPreTermination}ms`,
            );
          } else if (timeUntilExpiration > 0) {
            // Runtime expires in less than 5 seconds - send pre-termination immediately
            console.log(
              `[internal.ts] Runtime expires in ${timeUntilExpiration}ms (<5s) - sending pre-termination immediately`,
            );
            vscode.commands.executeCommand(
              "datalayer.internal.document.sendToWebview",
              uriString,
              {
                type: "runtime-pre-termination",
                body: {},
              },
            );
          }
        }
      },
    ),
  );

  /**
   * Internal command to notify UI when runtime is terminated.
   * Called by runtimes.ts after successfully terminating a runtime.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.runtime.notifyTerminated",
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
      "datalayer.internal.notebook.insertCell",
      async (params: {
        uri: string;
        cellType: "code" | "markdown";
        source: string;
        index?: number;
      }) => {
        const { uri, cellType, source, index } = params;

        // GUARD: Validate source exists
        if (source === undefined || source === null) {
          throw new Error(
            `internal.insertCell: 'source' is ${source}! Received params: ${JSON.stringify(params)}. ` +
              `This indicates VSCodeDocumentHandle passed undefined/null source.`,
          );
        }

        // Send message via insertCellCallback
        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          uri,
          {
            type: "insert-cell",
            body: {
              cellType,
              source,
              index,
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
      "datalayer.internal.notebook.deleteCell",
      async (params: { uri: string; index: number }) => {
        const { uri, index } = params;

        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          uri,
          {
            type: "delete-cell",
            body: {
              index,
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
      "datalayer.internal.notebook.overwriteCell",
      async (params: { uri: string; index: number; source: string }) => {
        const { uri, index, source } = params;

        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          uri,
          {
            type: "overwrite-cell",
            body: {
              index,
              source,
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
      "datalayer.internal.notebook.readCell",
      async (params: {
        uri: string;
        index: number;
      }): Promise<{
        index: number;
        type: string;
        source: string;
        outputs?: string[];
      }> => {
        const { uri, index } = params;
        const requestId = `read-cell-${Date.now()}-${Math.random()}`;

        // Send request and await response
        const response = await vscode.commands.executeCommand<{
          index: number;
          type: string;
          source: string;
          outputs?: string[];
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "read-cell-request",
            requestId,
            body: {
              index,
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
      "datalayer.internal.notebook.getCells",
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
        const requestId = `get-cells-${Date.now()}-${Math.random()}`;

        // Send request and await response
        const response = await vscode.commands.executeCommand<
          Array<{
            index: number;
            type: string;
            source: string;
            outputs?: string[];
          }>
        >(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "get-cells-request",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to get notebook metadata/info from a Datalayer notebook webview.
   * Called by VSCodeDocumentHandle.getMetadata() to request notebook info.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.notebook.getInfo",
      async (params: {
        uri: string;
      }): Promise<{
        path: string;
        cellCount: number;
        cellTypes: { code: number; markdown: number; raw: number };
      }> => {
        const { uri } = params;
        const requestId = `notebook-info-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand<{
          path: string;
          cellCount: number;
          cellTypes: { code: number; markdown: number; raw: number };
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "get-notebook-info-request",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to get all blocks from a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.getBlocks",
      async (params: { uri: string }): Promise<unknown[]> => {
        const { uri } = params;
        const requestId = `lexical-get-blocks-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand<unknown[]>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-get-blocks",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to get metadata from a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.getMetadata",
      async (params: { uri: string }): Promise<unknown> => {
        const { uri } = params;
        const requestId = `lexical-metadata-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-get-metadata",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to insert a block into a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.insertBlock",
      async (params: {
        uri: string;
        block: unknown;
        afterBlockId: string;
      }): Promise<{ success: boolean; error?: string; blockId?: string }> => {
        const { uri, block, afterBlockId } = params;
        const requestId = `lexical-insert-block-${Date.now()}-${Math.random()}`;

        console.log(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          `[internal.ts] insertBlock called: uri=${uri}, afterBlockId=${afterBlockId}, block_type=${(block as any)?.block_type}, requestId=${requestId}`,
        );

        const response = await vscode.commands.executeCommand<{
          success: boolean;
          error?: string;
          blockId?: string;
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-insert-block",
            requestId,
            body: {
              block,
              afterBlockId,
            },
          },
          requestId,
        );

        console.log(`[internal.ts] insertBlock response:`, response);
        return response;
      },
    ),
  );

  /**
   * Internal command to insert multiple blocks into a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.insertBlocks",
      async (params: {
        uri: string;
        blocks: unknown[];
        afterBlockId: string;
      }): Promise<{ success: boolean; error?: string; blockId?: string }> => {
        const { uri, blocks, afterBlockId } = params;
        const requestId = `lexical-insert-blocks-${Date.now()}-${Math.random()}`;

        console.log(
          `[internal.ts] insertBlocks called: uri=${uri}, count=${blocks.length}, afterBlockId=${afterBlockId}, requestId=${requestId}`,
        );

        const response = await vscode.commands.executeCommand<{
          success: boolean;
          error?: string;
          blockId?: string;
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-insert-blocks",
            requestId,
            body: {
              blocks,
              afterBlockId,
            },
          },
          requestId,
        );

        console.log(`[internal.ts] insertBlocks response:`, response);
        return response;
      },
    ),
  );

  /**
   * Internal command to delete a block from a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.deleteBlock",
      async (params: {
        uri: string;
        blockId: string;
      }): Promise<{
        success: boolean;
        error?: string;
        deletedBlockId?: string;
      }> => {
        const { uri, blockId } = params;
        const requestId = `lexical-delete-block-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand<{
          success: boolean;
          error?: string;
          deletedBlockId?: string;
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-delete-block",
            requestId,
            body: { blockId },
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to update a block in a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.updateBlock",
      async (params: {
        uri: string;
        blockId: string;
        block: unknown;
      }): Promise<{
        success: boolean;
        error?: string;
        updatedBlockId?: string;
      }> => {
        const { uri, blockId, block } = params;
        const requestId = `lexical-update-block-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand<{
          success: boolean;
          error?: string;
          updatedBlockId?: string;
        }>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-update-block",
            requestId,
            body: {
              blockId,
              block,
            },
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to get registered node types from a Lexical document webview.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.lexical.getRegisteredNodes",
      async (params: { uri: string }): Promise<unknown[]> => {
        const { uri } = params;
        const requestId = `lexical-nodes-${Date.now()}-${Math.random()}`;

        const response = await vscode.commands.executeCommand<unknown[]>(
          "datalayer.internal.document.sendToWebviewWithResponse",
          uri,
          {
            type: "lexical-get-registered-nodes",
            requestId,
            body: {},
          },
          requestId,
        );

        return response;
      },
    ),
  );

  /**
   * Internal command to switch a document to Pyodide kernel.
   * Called from kernel selector UI.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.switchToPyodide",
      async (documentUri: vscode.Uri) => {
        // Create a mock runtime object for Pyodide (similar to local kernel)
        const pyodideRuntime = {
          uid: `pyodide-${Date.now()}`,
          podName: "pyodide-browser",
          givenName: "Pyodide",
          environmentName: "pyodide",
          environmentTitle: "Pyodide (Browser Python)",
          type: "notebook" as const,
          burningRate: 0,
          ingress: "http://pyodide-local",
          token: "",
          startedAt: new Date().toISOString(),
          expiredAt: new Date(Date.now() + 86400000).toISOString(),
        };

        // Fire internal command to update runtime state
        await vscode.commands.executeCommand(
          "datalayer.internal.runtime.connected",
          documentUri,
          pyodideRuntime,
        );

        // Send message to webview to switch service manager
        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          documentUri.toString(),
          {
            type: "switch-to-pyodide",
            body: {},
          },
        );

        // Send kernel-selected message to update UI
        await vscode.commands.executeCommand(
          "datalayer.internal.document.sendToWebview",
          documentUri.toString(),
          {
            type: "kernel-selected",
            body: {
              runtime: pyodideRuntime,
            },
          },
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
  const uriString = uri.toString();
  connectedRuntimes.delete(uriString);

  // Clear any expiration timer for this document
  const timer = expirationTimers.get(uriString);
  if (timer) {
    clearTimeout(timer);
    expirationTimers.delete(uriString);
  }
}
