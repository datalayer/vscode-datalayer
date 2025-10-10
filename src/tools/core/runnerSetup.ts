/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runner Setup for VS Code Extension
 *
 * Creates Runner instances with BridgeExecutor for routing tool executions
 * from extension context to webview context.
 *
 * @module tools/core/runnerSetup
 */

import * as vscode from "vscode";
import type { ToolOperation } from "@datalayer/jupyter-react";
import { combinedOperations } from "./registration";

/**
 * Simple Runner implementation for tool execution.
 * Maps operation names to their implementations and executes them.
 */
export class Runner {
  /**
   * Creates a new Runner instance.
   *
   * @param operations - Map of operation names to their implementations
   * @param executor - Executor instance for performing operations, or null for direct execution
   */
  constructor(
    private operations: Record<string, ToolOperation<unknown, unknown>>,
    private executor: unknown | null,
  ) {}

  /**
   * Executes a tool operation by name.
   *
   * @param operationName - Name of the operation to execute
   * @param args - Arguments for the operation
   * @returns Promise resolving to the operation result
   * @throws Error if operation is not found
   */
  async execute(operationName: string, args: unknown): Promise<unknown> {
    const operation = this.operations[operationName];

    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }

    // Execute the operation with the provided arguments
    // Note: Operations handle their own execution context
    return operation.execute(args, {
      executor: this.executor as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      format: "json",
      extras: {},
    });
  }
}

/**
 * Bridge Executor for Extension-to-Webview Communication
 *
 * Implements the Executor interface to send tool execution requests
 * to the webview via postMessage and wait for responses.
 */
interface BridgeExecutor {
  /**
   * Executes a tool operation in the appropriate context.
   * Routes VS Code operations locally, bridges others to webview.
   *
   * @param operationName - Name of the operation to execute
   * @param args - Arguments for the operation
   * @returns Promise resolving to the operation result
   */
  execute(operationName: string, args: unknown): Promise<unknown>;
}

/**
 * VS Code-specific operations that must execute in extension context
 * (These need access to VS Code APIs, auth provider, SDK client, etc.)
 */
const VS_CODE_OPERATIONS = new Set([
  "createNotebook",
  "createLexical",
  "listKernels",
  "selectKernel",
  "getActiveDocument",
]);

/**
 * Creates a Runner instance for extension-side tool execution
 *
 * The Runner uses a smart executor that:
 * - Executes VS Code-specific operations locally (they need VS Code APIs)
 * - Bridges notebook/lexical operations to webview (they need document state)
 *
 * @param webviewPanel - VS Code webview panel for message communication
 * @returns Runner instance configured with smart executor
 *
 * @example
 * ```typescript
 * const runner = createExtensionRunner(webviewPanel);
 * const result = await runner.execute("insertCell", {
 *   cellType: "code",
 *   source: "print('hello')"
 * });
 * ```
 */
export function createExtensionRunner(
  webviewPanel: vscode.WebviewPanel,
): Runner {
  // Create a smart executor that routes operations appropriately
  const smartExecutor: BridgeExecutor = {
    async execute(operationName: string, args: unknown): Promise<unknown> {
      // Check if this is a VS Code-specific operation
      if (VS_CODE_OPERATIONS.has(operationName)) {
        // Execute locally in extension context
        const operation = (
          combinedOperations as Record<string, ToolOperation<unknown, unknown>>
        )[operationName];
        if (!operation) {
          throw new Error(`VS Code operation not found: ${operationName}`);
        }

        console.log(
          `[SmartExecutor] Executing locally (extension): ${operationName}`,
        );

        // Execute operation directly (no executor needed for VS Code ops)
        return operation.execute(args, {
          executor: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          format: "json",
          extras: {},
        });
      }

      // For notebook/lexical operations, bridge to webview
      const requestId = `${Date.now()}-${Math.random()}`;

      return new Promise((resolve, reject) => {
        // Set up timeout first (30 seconds)
        const timeoutId = setTimeout(() => {
          listener.dispose();
          reject(new Error(`Tool execution timeout (30s): ${operationName}`));
        }, 30000);

        // Listen for response from webview
        const listener = webviewPanel.webview.onDidReceiveMessage((message) => {
          if (
            message.type === "tool-execution-response" &&
            message.requestId === requestId
          ) {
            // Clean up
            clearTimeout(timeoutId);
            listener.dispose();

            // Handle response
            if (message.error) {
              reject(new Error(message.error));
            } else {
              resolve(message.result);
            }
          }
        });

        // Send execution request to webview
        console.log(`[SmartExecutor] Bridging to webview: ${operationName}`);

        webviewPanel.webview
          .postMessage({
            type: "tool-execution",
            requestId,
            operationName,
            args,
          })
          .then(
            () => {
              // Message sent successfully
              console.log(
                `[BridgeExecutor] Sent tool-execution: ${operationName}`,
              );
            },
            (error) => {
              // Failed to send message
              clearTimeout(timeoutId);
              listener.dispose();
              reject(
                new Error(
                  `Failed to send tool-execution message: ${error.message}`,
                ),
              );
            },
          );
      });
    },
  };

  return new Runner(combinedOperations, smartExecutor);
}
