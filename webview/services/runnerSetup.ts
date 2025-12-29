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
    private documentId: string | null = null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private executor: any = null,
  ) {}

  /**
   * Executes a tool operation by name.
   * Follows the OperationRunner pattern: execute operation + apply formatting.
   *
   * @param operationName - Name of the operation to execute
   * @param args - Arguments for the operation
   * @param format - Response format ("json" or "toon"), defaults to "toon"
   * @returns Promise resolving to the formatted operation result
   * @throws Error if operation is not found
   */
  async execute(
    operationName: string,
    args: unknown,
    format: "json" | "toon" = "toon",
  ): Promise<unknown> {
    const operation = this.operations[operationName];

    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }

    // Execute the operation directly in webview context
    // DefaultExecutor pattern: executor performs direct state manipulation
    // Include documentId in context for both lexical and notebook operations
    const context = {
      executor: this.executor,
      format, // Use format from VS Code configuration (passed from extension)
      extras: {},
      documentId: this.documentId, // Universal document ID for both lexical and notebook operations
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Step 1: Execute operation (returns pure typed data)
    const result = await operation.execute(args, context);

    // Step 2: Apply formatting based on context.format
    // This matches the OperationRunner pattern from core library
    const formattedResult = formatResponse(result, context.format);

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
 * @param notebookId - Unique identifier for the notebook document
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
 * const runner = createNotebookRunner(notebookToolOperations, notebookId, executor);
 * const result = await runner.execute("insertCell", {
 *   cellType: "code",
 *   source: "print('hello')"
 * });
 * ```
 */
export function createNotebookRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notebookToolOperations: any,
  notebookId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
): WebviewRunner {
  return new WebviewRunner(notebookToolOperations, notebookId, executor);
}

/**
 * Creates a Runner instance for lexical webview with all lexical operations.
 *
 * @param lexicalToolOperations - Lexical tool operations from @datalayer/jupyter-lexical
 * @param lexicalId - Unique identifier for the lexical document
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
 * const runner = createLexicalRunner(lexicalToolOperations, lexicalId, executor);
 * const result = await runner.execute("insertBlock", {
 *   blockType: "code",
 *   source: "print('hello')"
 * });
 * ```
 */
export function createLexicalRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lexicalToolOperations: any,
  lexicalId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
): WebviewRunner {
  return new WebviewRunner(lexicalToolOperations, lexicalId, executor);
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
  mutableServiceManager?: { updateToPyodide: (url?: string) => Promise<void> },
): () => void {
  const messageListener = (event: MessageEvent) => {
    const message = event.data;

    // Handle switch-to-pyodide message
    if (message.type === "switch-to-pyodide") {
      if (mutableServiceManager) {
        // Start async operation without awaiting (fire-and-forget)
        mutableServiceManager.updateToPyodide().catch((error: unknown) => {
          console.error(`[runnerSetup] Failed to switch to Pyodide:`, error);
        });
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
