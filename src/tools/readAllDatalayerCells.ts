/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Read All Cells

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Reads all cells from the active Datalayer notebook.
 * This tool enables Copilot to inspect notebook content via natural language.
 *
 * Example usage in Copilot:
 * "Show me all cells in the active Datalayer notebook"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IReadAllDatalayerCellsParameters {
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for reading all cells from Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class ReadAllDatalayerCellsTool
  implements vscode.LanguageModelTool<IReadAllDatalayerCellsParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IReadAllDatalayerCellsParameters>,
    _token: vscode.CancellationToken,
  ) {
    const notebookUri =
      options.input.notebook_uri || "active Datalayer notebook";

    return {
      invocationMessage: `Reading all cells from ${notebookUri}`,
      confirmationMessages: {
        title: "Read All Notebook Cells",
        message: new vscode.MarkdownString(
          `Read all cells from **${notebookUri}**?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - reads all cells from the notebook.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IReadAllDatalayerCellsParameters>,
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

      // Use internal command to read all cells from webview
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

      if (!cells || cells.length === 0) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `The notebook is empty (no cells found).`,
          ),
        ]);
      }

      // Format the response
      let result = `Read ${cells.length} cell${cells.length !== 1 ? "s" : ""} from notebook:\n\n`;

      for (const cell of cells) {
        result += `**Cell ${cell.index}** (${cell.type}):\n`;
        result += `\`\`\`${cell.type === "code" ? "python" : "markdown"}\n${cell.source}\n\`\`\`\n`;

        if (cell.outputs && cell.outputs.length > 0) {
          result += `**Outputs:**\n\`\`\`\n${cell.outputs.join("\n")}\n\`\`\`\n`;
        }

        result += "\n";
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(result),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read all cells: ${errorMessage}`);
    }
  }
}
