/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Overwrite Cell Source

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Overwrites the source of an existing cell in the active Datalayer notebook.
 * Note: This does NOT execute the cell - use ExecuteCellTool for that.
 *
 * Example usage in Copilot:
 * "Change cell 2 to print hello world"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IOverwriteDatalayerCellParameters {
  cell_index: number;
  cell_source: string;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for overwriting cell source in Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class OverwriteDatalayerCellTool
  implements vscode.LanguageModelTool<IOverwriteDatalayerCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IOverwriteDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index, cell_source } = options.input;

    // Truncate long source for display
    const displaySource =
      cell_source.length > 100
        ? cell_source.substring(0, 100) + "..."
        : cell_source;

    return {
      invocationMessage: `Overwriting cell ${cell_index}`,
      confirmationMessages: {
        title: "Overwrite Cell Source",
        message: new vscode.MarkdownString(
          `Overwrite cell **${cell_index}** with:\n\n\`\`\`\n${displaySource}\n\`\`\``,
        ),
      },
    };
  }

  /**
   * Executes the tool - overwrites cell source (does not execute).
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IOverwriteDatalayerCellParameters>,
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

      // Use internal command to overwrite cell in webview
      await vscode.commands.executeCommand("datalayer.internal.overwriteCell", {
        uri: targetUri.toString(),
        cellIndex: cell_index,
        cellSource: cell_source,
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Cell ${cell_index} overwritten successfully.\n\n` +
            `**Note:** Cell source updated but NOT executed. Use execute_cell to run it.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to overwrite cell: ${errorMessage}`);
    }
  }
}
