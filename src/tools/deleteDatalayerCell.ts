/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Delete Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Deletes a cell from the active Datalayer notebook.
 * This tool enables Copilot to modify notebooks via natural language.
 *
 * Example usage in Copilot:
 * "Delete cell 3 from the notebook"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IDeleteDatalayerCellParameters {
  cell_index: number;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for deleting cells from Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class DeleteDatalayerCellTool
  implements vscode.LanguageModelTool<IDeleteDatalayerCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index } = options.input;

    return {
      invocationMessage: `Deleting cell ${cell_index}`,
      confirmationMessages: {
        title: "Delete Notebook Cell",
        message: new vscode.MarkdownString(
          `Delete cell at index **${cell_index}**?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - deletes a cell from the notebook.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IDeleteDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index, notebook_uri } = options.input;

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

      // Use internal command to delete cell in webview
      await vscode.commands.executeCommand("datalayer.internal.deleteCell", {
        uri: targetUri.toString(),
        cellIndex: cell_index,
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Cell ${cell_index} deleted successfully.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete cell: ${errorMessage}`);
    }
  }
}
