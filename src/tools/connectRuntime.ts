/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Connect Runtime to Notebook
 *
 * Connects an existing runtime to a notebook.
 * This tool enables Copilot to assign runtimes to notebooks for code execution.
 *
 * Example usage in Copilot:
 * "Connect the runtime to this notebook"
 * "Assign a runtime to the notebook"
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../extension";

interface IConnectRuntimeParameters {
  notebook_uri?: string;
  runtime_name?: string;
}

/**
 * Tool for connecting runtimes to notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * Connects runtime to notebook for code execution:
 * - Uses active notebook if URI not specified
 * - Uses most recent runtime if name not specified
 * - Silently connects without user prompts
 */
export class ConnectRuntimeTool
  implements vscode.LanguageModelTool<IConnectRuntimeParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IConnectRuntimeParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { notebook_uri, runtime_name } = options.input;

    return {
      invocationMessage: `Connecting runtime${runtime_name ? ` ${runtime_name}` : ""} to notebook`,
      confirmationMessages: {
        title: "Connect Runtime to Notebook",
        message: new vscode.MarkdownString(
          `Connect${runtime_name ? ` runtime **${runtime_name}**` : " a runtime"} to ${notebook_uri ? "the specified notebook" : "the active notebook"}?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - connects runtime to notebook.
   * Returns connection status.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IConnectRuntimeParameters>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Get service container for SDK and kernel bridge
      const services = getServiceContainer();
      const sdk = services.sdk;
      const kernelBridge = services.kernelBridge;
      const authProvider = services.authProvider;

      // Check authentication
      if (!authProvider.isAuthenticated()) {
        throw new Error("Not authenticated. Please login to Datalayer first.");
      }

      // Get notebook document
      let notebookUri: vscode.Uri;
      if (options.input.notebook_uri) {
        notebookUri = vscode.Uri.parse(options.input.notebook_uri);
      } else {
        const activeEditor = vscode.window.activeNotebookEditor;
        if (!activeEditor) {
          throw new Error(
            "No active notebook found. Please open a notebook or specify notebook_uri.",
          );
        }
        notebookUri = activeEditor.notebook.uri;
      }

      // Get runtime
      let runtime;
      if (options.input.runtime_name) {
        // Find specific runtime by name
        const runtimes = await sdk.listRuntimes();
        runtime = runtimes.find(
          (r) => r.podName === options.input.runtime_name,
        );
        if (!runtime) {
          throw new Error(`Runtime "${options.input.runtime_name}" not found`);
        }
      } else {
        // Get most recent runtime
        const runtimes = await sdk.listRuntimes();
        if (!runtimes || runtimes.length === 0) {
          throw new Error(
            "No runtimes available. Please start a runtime first.",
          );
        }
        // Use the first runtime (most recent)
        runtime = runtimes[0];
      }

      // Connect runtime to notebook
      await kernelBridge.connectWebviewDocument(notebookUri, runtime);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Runtime connected successfully!\n\n` +
            `Runtime: ${runtime.podName}\n` +
            `Notebook: ${notebookUri.path}\n` +
            `You can now execute cells in the notebook.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect runtime: ${errorMessage}`);
    }
  }
}
