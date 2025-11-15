/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Insert Markdown Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Inserts a markdown cell at a specific index in the active Datalayer notebook.
 * This tool enables Copilot to add documentation via natural language.
 *
 * Example usage in Copilot:
 * "Insert a markdown cell at position 3 explaining the data structure"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IInsertDatalayerMarkdownCellParameters {
  cell_index: number;
  cell_source: string;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for inserting markdown cells into Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class InsertDatalayerMarkdownCellTool
  implements vscode.LanguageModelTool<IInsertDatalayerMarkdownCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IInsertDatalayerMarkdownCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index, cell_source } = options.input;

    // Truncate long source for display
    const displaySource =
      cell_source.length > 100
        ? cell_source.substring(0, 100) + "..."
        : cell_source;

    return {
      invocationMessage: `Inserting markdown cell at index ${cell_index}`,
      confirmationMessages: {
        title: "Insert Markdown Cell",
        message: new vscode.MarkdownString(
          `Insert markdown cell at index **${cell_index}**?\n\n\`\`\`markdown\n${displaySource}\n\`\`\``,
        ),
      },
    };
  }

  /**
   * Executes the tool - inserts a markdown cell at specified index.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IInsertDatalayerMarkdownCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index, cell_source, notebook_uri } = options.input;

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

      // Use internal insertCell command with markdown type
      await vscode.commands.executeCommand("datalayer.internal.insertCell", {
        uri: targetUri.toString(),
        cellType: "markdown",
        cellSource: cell_source,
        cellIndex: cell_index,
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Markdown cell inserted at index ${cell_index}.\n\n` +
            `Cell content:\n\`\`\`markdown\n${cell_source}\n\`\`\``,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to insert markdown cell: ${errorMessage}`);
    }
  }
}
