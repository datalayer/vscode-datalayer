/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Bridge executor - sends messages to extension host via webview API.
 * Used by webviews that need to communicate with extension host.
 *
 * @module tools/BridgeExecutor
 */

import type { ToolExecutor } from "@datalayer/jupyter-react";

// Declare window for webview context (this file is webview-only)
declare const window: Window;

/**
 * VS Code webview API interface
 */
interface VSCodeAPI {
  postMessage(message: unknown): void;
}

/**
 * Bridge executor - sends messages to extension host via webview API.
 * Used by webviews that need to communicate with extension host.
 *
 * @example
 * ```typescript
 * const vscode = acquireVsCodeApi();
 * const executor = new BridgeExecutor(notebookId, vscode);
 * await executor.execute("notebook.insertCell", { cellType: "code", source: "print('hi')" });
 * ```
 */
export class BridgeExecutor implements ToolExecutor {
  private pendingRequests: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();

  constructor(
    private notebookId: string,
    private vscode: VSCodeAPI,
  ) {
    // Listen for responses from extension host
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "tool-execution-response") {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.result);
          }
        }
      }
    });
  }

  /**
   * Execute a command by sending message to VS Code extension host
   *
   * @param command - Operation command (e.g., "notebook.insertCell")
   * @param args - Command arguments
   * @returns Result from extension host
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(command: string, args: any): Promise<any> {
    const requestId = `${Date.now()}-${Math.random()}`;

    console.log(
      `[BridgeExecutor] Sending command to extension: ${command}`,
      "requestId:",
      requestId,
      "args:",
      args,
    );

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send message to extension host
      this.vscode.postMessage({
        type: "tool-execution",
        requestId,
        command,
        args: {
          notebookId: this.notebookId,
          ...args,
        },
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Tool execution timeout for command: ${command}`));
        }
      }, 30000);
    });
  }
}
