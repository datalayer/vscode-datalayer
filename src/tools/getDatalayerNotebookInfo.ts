/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Get Notebook Info

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Gets metadata about the active Datalayer notebook (path, cell counts, etc.).
 * This tool enables Copilot to understand notebook structure via natural language.
 *
 * Example usage in Copilot:
 * "Tell me about the active Datalayer notebook"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IGetDatalayerNotebookInfoParameters {
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for getting notebook metadata.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class GetDatalayerNotebookInfoTool
  implements vscode.LanguageModelTool<IGetDatalayerNotebookInfoParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IGetDatalayerNotebookInfoParameters>,
    _token: vscode.CancellationToken,
  ) {
    const notebookUri =
      options.input.notebook_uri || "active Datalayer notebook";

    return {
      invocationMessage: `Getting info for ${notebookUri}`,
      confirmationMessages: {
        title: "Get Notebook Information",
        message: new vscode.MarkdownString(
          `Get information about **${notebookUri}**?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - retrieves notebook metadata.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IGetDatalayerNotebookInfoParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { notebook_uri } = options.input;

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

      // Use internal command to read all cells and compute metadata
      const cells = await vscode.commands.executeCommand<
        Array<{
          index: number;
          type: string;
          source: string;
          outputs?: string[];
        }>
      >("datalayer.internal.readAllCells", {
        uri: targetUri.toString(),
      });

      // Compute cell type counts
      const cellTypeCounts: Record<string, number> = {};
      for (const cell of cells) {
        cellTypeCounts[cell.type] = (cellTypeCounts[cell.type] || 0) + 1;
      }

      // Format the response
      let result = `**Notebook Information:**\n\n`;
      result += `- **Path:** ${targetUri.fsPath}\n`;
      result += `- **Total cells:** ${cells.length}\n`;

      if (Object.keys(cellTypeCounts).length > 0) {
        result += `- **Cell types:**\n`;
        for (const [type, count] of Object.entries(cellTypeCounts)) {
          result += `  - ${type}: ${count}\n`;
        }
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(result),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get notebook info: ${errorMessage}`);
    }
  }
}
