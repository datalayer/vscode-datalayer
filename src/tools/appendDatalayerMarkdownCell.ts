/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Append Markdown Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Appends a markdown cell at the end of the active Datalayer notebook.
 * This tool enables Copilot to add documentation via natural language.
 *
 * Example usage in Copilot:
 * "Add a markdown cell explaining the next steps"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IAppendDatalayerMarkdownCellParameters {
  cell_source: string;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for appending markdown cells to Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class AppendDatalayerMarkdownCellTool
  implements vscode.LanguageModelTool<IAppendDatalayerMarkdownCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IAppendDatalayerMarkdownCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_source } = options.input;

    // Truncate long source for display
    const displaySource =
      cell_source.length > 100
        ? cell_source.substring(0, 100) + "..."
        : cell_source;

    return {
      invocationMessage: `Appending markdown cell`,
      confirmationMessages: {
        title: "Append Markdown Cell",
        message: new vscode.MarkdownString(
          `Append markdown cell at end?\n\n\`\`\`markdown\n${displaySource}\n\`\`\``,
        ),
      },
    };
  }

  /**
   * Executes the tool - appends a markdown cell at the end.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IAppendDatalayerMarkdownCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_source, notebook_uri } = options.input;

    try {
      // Find the target notebook document
      let targetUri: vscode.Uri | undefined;

      if (notebook_uri) {
        targetUri = vscode.Uri.parse(notebook_uri);
        // Validate it's a Datalayer notebook
        validateDatalayerNotebook(targetUri);
      } else {
        // Try to find active Datalayer notebook using validation utility
        targetUri = getActiveDatalayerNotebook();
      }

      if (!targetUri) {
        throw new Error(
          "No active Datalayer notebook found. Please ensure a Datalayer notebook is open (not a native VS Code notebook) and try again.",
        );
      }

      // Use internal insertCell command with cellIndex=undefined (appends to end)
      await vscode.commands.executeCommand("datalayer.internal.insertCell", {
        uri: targetUri.toString(),
        cellType: "markdown",
        cellSource: cell_source,
        cellIndex: undefined, // Append to end
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Markdown cell appended at end.\n\n` +
            `Cell content:\n\`\`\`markdown\n${cell_source}\n\`\`\``,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to append markdown cell: ${errorMessage}`);
    }
  }
}
