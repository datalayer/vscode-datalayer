/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code Tool Adapter - Bridges LanguageModelTool to core operations
 *
 * @module tools/adapters/vscode/VSCodeToolAdapter
 */

import * as vscode from "vscode";
import type { ToolDefinition } from "../../definitions/schema";
import type {
  ToolOperation,
  ToolExecutionContext,
} from "../../core/interfaces";
import { VSCodeDocumentHandle } from "./VSCodeDocumentHandle";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../../../utils/notebookValidation";
import { getServiceContainer } from "../../../extension";

/**
 * VS Code Tool Adapter
 *
 * This adapter bridges VS Code's LanguageModelTool interface to our
 * platform-agnostic core operations. It handles:
 * - Document resolution from parameters or active editor
 * - Context building (document handle, SDK, auth)
 * - Confirmation dialog generation
 * - Result formatting for VS Code
 */
export class VSCodeToolAdapter<TParams>
  implements vscode.LanguageModelTool<TParams>
{
  constructor(
    private readonly definition: ToolDefinition,
    private readonly operation: ToolOperation<TParams, unknown>,
  ) {}

  /**
   * Prepares the tool invocation with user-facing messages
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<TParams>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeConfig = this.definition.platformConfig?.vscode;

    // Generate invocation message with parameter interpolation
    const invocationMessage = this.interpolate(
      vscodeConfig?.invocationMessage ||
        `Executing ${this.definition.displayName}`,
      options.input,
    );

    // Generate confirmation message
    const confirmationMessage = this.interpolate(
      vscodeConfig?.confirmationMessage || this.definition.description,
      options.input,
    );

    return {
      invocationMessage,
      confirmationMessages: {
        title: this.definition.displayName,
        message: new vscode.MarkdownString(confirmationMessage),
      },
    };
  }

  /**
   * Executes the tool by delegating to the core operation
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<TParams>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Build execution context
      const context = await this.buildExecutionContext(options.input);

      // Execute the core operation (platform-agnostic)
      const result = await this.operation.execute(options.input, context);

      // Format result for VS Code
      return this.formatResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `${this.definition.displayName} failed: ${errorMessage}`,
      );
    }
  }

  /**
   * Builds the execution context for the operation
   */
  private async buildExecutionContext(
    params: TParams,
  ): Promise<ToolExecutionContext> {
    const services = getServiceContainer();
    const context: ToolExecutionContext = {
      sdk: services.sdk,
      auth: services.authProvider,
    };

    // Check if this tool needs a document handle
    const needsDocument = this.definition.tags?.includes("cell");

    if (needsDocument) {
      context.document = await this.resolveDocumentHandle(params);
    }

    // Add VS Code-specific extras
    context.extras = {
      // Callback for local file creation
      createLocalFile: async (filename: string, content: unknown) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          throw new Error("No workspace folder open");
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filename);
        const contentStr = JSON.stringify(content, null, 2);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(contentStr, "utf-8"),
        );

        return uri.toString();
      },

      // Runtime connection callback
      connectRuntimeCallback: async (
        runtimeName?: string,
        notebookUri?: string,
      ) => {
        // Use VS Code command for runtime connection
        await vscode.commands.executeCommand(
          "datalayer.connectRuntime",
          runtimeName,
          notebookUri,
        );

        // Return runtime info from services
        // This would need to be enhanced to return actual runtime data
        return { podName: runtimeName || "default-runtime" };
      },

      // Default runtime duration from settings
      defaultRuntimeDuration: vscode.workspace
        .getConfiguration("datalayer.runtime")
        .get<number>("defaultMinutes", 10),
    };

    return context;
  }

  /**
   * Resolves document handle from parameters or active editor
   */
  private async resolveDocumentHandle(
    params: TParams,
  ): Promise<VSCodeDocumentHandle> {
    // Try to get URI from parameters (with retry logic for async notebook initialization)
    const uriString = (params as any).notebook_uri;
    let targetUri: vscode.Uri | undefined;

    if (uriString) {
      targetUri = vscode.Uri.parse(uriString);
      validateDatalayerNotebook(targetUri);
    } else {
      // Try to find active Datalayer notebook with retry
      const maxRetries = 10;
      let retryCount = 0;

      while (!targetUri && retryCount < maxRetries) {
        targetUri = getActiveDatalayerNotebook();
        if (targetUri) break;

        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (!targetUri) {
      throw new Error(
        "No active Datalayer notebook found. Please ensure a Datalayer notebook is open and try again.",
      );
    }

    return new VSCodeDocumentHandle(targetUri);
  }

  /**
   * Formats operation result for VS Code
   */
  private formatResult(result: unknown): vscode.LanguageModelToolResult {
    // Convert result to user-friendly string
    let message: string;

    if (typeof result === "object" && result !== null) {
      const resultObj = result as any;

      // Check for success message
      if (resultObj.message) {
        message = resultObj.message;
      } else if (resultObj.success === false && resultObj.error) {
        message = `❌ Error: ${resultObj.error}`;
      } else {
        // Format as JSON for complex results
        message = JSON.stringify(result, null, 2);
      }
    } else {
      message = String(result);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message),
    ]);
  }

  /**
   * Interpolates {{variable}} placeholders in template strings
   */
  private interpolate(template: string, params: TParams): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = (params as any)[key];
      if (value === undefined) return `{{${key}}}`; // Keep placeholder if not found
      return String(value);
    });
  }
}
