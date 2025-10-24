/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Read Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Reads a specific cell from the active Datalayer notebook.
 * This tool enables Copilot to inspect notebook content via natural language.
 *
 * Example usage in Copilot:
 * "Show me cell 2 from the active Datalayer notebook"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IReadDatalayerCellParameters {
  cell_index: number;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for reading a specific cell from Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class ReadDatalayerCellTool
  implements vscode.LanguageModelTool<IReadDatalayerCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IReadDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index } = options.input;
    const notebookUri =
      options.input.notebook_uri || "active Datalayer notebook";

    return {
      invocationMessage: `Reading cell ${cell_index} from ${notebookUri}`,
      confirmationMessages: {
        title: "Read Notebook Cell",
        message: new vscode.MarkdownString(
          `Read cell **${cell_index}** from **${notebookUri}**?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - reads a specific cell from the notebook.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IReadDatalayerCellParameters>,
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

      // Use internal command to read cell from webview
      const cell = await vscode.commands.executeCommand<{
        index: number;
        type: string;
        source: string;
        outputs?: string[];
      }>("datalayer.internal.readCell", {
        uri: targetUri.toString(),
        cellIndex: cell_index,
      });

      if (!cell) {
        throw new Error(`Cell ${cell_index} not found in notebook`);
      }

      // Format the response
      let result = `**Cell ${cell.index}** (${cell.type}):\n`;
      result += `\`\`\`${cell.type === "code" ? "python" : "markdown"}\n${cell.source}\n\`\`\`\n`;

      if (cell.outputs && cell.outputs.length > 0) {
        result += `\n**Outputs:**\n\`\`\`\n${cell.outputs.join("\n")}\n\`\`\``;
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(result),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read cell: ${errorMessage}`);
    }
  }
}
