/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runner Setup for Webview
 *
 * Creates Runner instances with DefaultExecutor for executing tool operations
 * directly in the webview context (notebook or lexical).
 *
 * @module webview/services/runnerSetup
 */

import { formatResponse } from "@datalayer/jupyter-react";

/**
 * Simple Runner implementation for tool execution in webview.
 * Maps operation names to their implementations and executes them directly.
 * Generic to support different operation types (notebook, lexical, etc.)
 */
export class WebviewRunner {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private operations: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private executor: any = null,
  ) {}

  /**
   * Executes a state method via the executor.
   *
   * This method is called when receiving messages from BridgeExecutor (VS Code context).
   * It does NOT call operations - operations only run in extension host where validation happens.
   * It calls the executor which directly invokes state methods.
   *
   * @param operationName - Name of the state method to execute
   * @param args - Arguments for the state method (already in state parameter format)
   * @param format - Response format ("json" or "toon"), defaults to "toon"
   * @returns Promise resolving to the formatted result
   * @throws Error if executor is not available
   */
  async execute(
    operationName: string,
    args: unknown,
    format: "json" | "toon" = "toon",
  ): Promise<unknown> {
    if (!this.executor) {
      throw new Error(`Executor not available for operation: ${operationName}`);
    }

    // Call executor directly (state method)
    // NO validation here - validation already happened in extension host operation
    // Args are already in state method parameter format (e.g., {id, blockIds} not {ids})
    const result = await this.executor.execute(operationName, args);

    // Apply formatting based on format parameter
    if (format === "json") {
      return result; // Return raw data
    }

    // Format for TOON display (human-readable for LLMs)
    const formattedResult = formatResponse(result, format);

    return formattedResult;
  }

  /**
   * Gets the list of available operation names.
   *
   * @returns Array of operation names
   */
  getAvailableOperations(): string[] {
    return Object.keys(this.operations);
  }

  /**
   * Checks if an operation is available.
   *
   * @param operationName - Name of the operation
   * @returns True if operation exists
   */
  hasOperation(operationName: string): boolean {
    return operationName in this.operations;
  }
}

/**
 * Creates a Runner instance for notebook webview with all notebook operations.
 *
 * @param notebookToolOperations - Notebook tool operations from @datalayer/jupyter-react
 * @param executor - DefaultExecutor instance for executing operations (NotebookDefaultExecutor)
 * @returns WebviewRunner configured with notebook operations
 *
 * @example
 * ```typescript
 * import { notebookToolOperations, DefaultExecutor } from "@datalayer/jupyter-react";
 * import { useNotebookStore2 } from "@datalayer/jupyter-react";
 *
 * const notebookStore = useNotebookStore2();
 * const executor = new DefaultExecutor(notebookId, notebookStore);
 * const runner = createNotebookRunner(notebookToolOperations, executor);
 * const result = await runner.execute("insertCell", {
 *   cellType: "code",
 *   source: "print('hello')"
 * });
 * ```
 */
export function createNotebookRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notebookToolOperations: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
): WebviewRunner {
  return new WebviewRunner(notebookToolOperations, executor);
}

/**
 * Creates a Runner instance for lexical webview with all lexical operations.
 *
 * @param lexicalToolOperations - Lexical tool operations from @datalayer/jupyter-lexical
 * @param executor - DefaultExecutor instance for executing operations (LexicalDefaultExecutor)
 * @returns WebviewRunner configured with lexical operations
 *
 * @example
 * ```typescript
 * import { lexicalToolOperations, DefaultExecutor } from "@datalayer/jupyter-lexical";
 * import { useLexicalStore } from "@datalayer/jupyter-lexical";
 *
 * const lexicalState = useLexicalStore();
 * const executor = new DefaultExecutor(lexicalId, lexicalState);
 * const runner = createLexicalRunner(lexicalToolOperations, executor);
 * const result = await runner.execute("insertBlock", {
 *   blockType: "code",
 *   source: "print('hello')"
 * });
 * ```
 */
export function createLexicalRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lexicalToolOperations: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
): WebviewRunner {
  return new WebviewRunner(lexicalToolOperations, executor);
}

/**
 * Sets up tool execution message listener for webview.
 * Listens for "tool-execution" messages from the extension and executes them via the runner.
 *
 * @param runner - WebviewRunner instance to use for execution
 * @param vscodeAPI - VS Code webview API for posting messages
 * @returns Cleanup function to remove the listener
 *
 * @example
 * ```typescript
 * const runner = createNotebookRunner(notebookToolOperations);
 * const cleanup = setupToolExecutionListener(runner, vsCodeAPI);
 *
 * // Later, when component unmounts:
 * cleanup();
 * ```
 */
export function setupToolExecutionListener(
  runner: WebviewRunner,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vscodeAPI: { postMessage: (message: any) => void },
  mutableServiceManager?: { updateToPyodide: (url?: string) => void },
): () => void {
  const messageListener = (event: MessageEvent) => {
    const message = event.data;

    // Handle switch-to-pyodide message
    if (message.type === "switch-to-pyodide") {
      if (mutableServiceManager) {
        mutableServiceManager.updateToPyodide();
      }
      return;
    }

    if (message.type === "tool-execution") {
      const { requestId, operationName, args, format } = message as {
        type: "tool-execution";
        requestId: string;
        operationName: string;
        args: unknown;
        format?: "json" | "toon"; // Format from VS Code configuration
      };

      // Check if operation is available
      if (!runner.hasOperation(operationName)) {
        const availableOps = runner.getAvailableOperations();
        console.error(
          `[ToolExecutionListener] Unknown operation: ${operationName}`,
          { availableOps },
        );

        vscodeAPI.postMessage({
          type: "tool-execution-response",
          requestId,
          error: `Unknown operation: ${operationName}. Available operations: ${availableOps.join(", ")}`,
        });
        return;
      }

      // Execute operation via runner with format from VS Code configuration
      runner
        .execute(operationName, args, format || "toon")
        .then((result) => {
          vscodeAPI.postMessage({
            type: "tool-execution-response",
            requestId,
            result,
          });
        })
        .catch((error: Error) => {
          console.error(
            `[ToolExecutionListener] Tool execution error: ${operationName}`,
            error,
          );

          vscodeAPI.postMessage({
            type: "tool-execution-response",
            requestId,
            error: error.message,
          });
        });
    }
  };

  window.addEventListener("message", messageListener);

  // Return cleanup function
  return () => {
    window.removeEventListener("message", messageListener);
  };
}
