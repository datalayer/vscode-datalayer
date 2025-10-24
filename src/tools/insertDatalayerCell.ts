/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Insert Datalayer Cell
 *
 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 * Inserts a code or markdown cell into a Datalayer notebook.
 * This tool enables Copilot to add content to Datalayer notebooks via natural language.
 *
 * Example usage in Copilot:
 * "Add a code cell that creates a simple matplotlib plot to my Datalayer notebook"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IInsertDatalayerCellParameters {
  cell_type: "code" | "markdown";
  cell_source: string;
  cell_index?: number; // Optional - defaults to end of notebook
  notebook_uri?: string; // Optional - URI of Datalayer notebook (defaults to active editor)
}

/**
 * Tool for inserting cells into Datalayer custom editor notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class InsertDatalayerCellTool
  implements vscode.LanguageModelTool<IInsertDatalayerCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IInsertDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_type, cell_source, cell_index } = options.input;
    const position =
      cell_index !== undefined ? `at index ${cell_index}` : "at end";

    // Truncate long source for display
    const displaySource =
      cell_source.length > 100
        ? cell_source.substring(0, 100) + "..."
        : cell_source;

    return {
      invocationMessage: `Inserting ${cell_type} cell ${position} into Datalayer notebook`,
      confirmationMessages: {
        title: "Insert Datalayer Notebook Cell",
        message: new vscode.MarkdownString(
          `Insert **${cell_type}** cell ${position} into Datalayer notebook?\n\n\`\`\`\n${displaySource}\n\`\`\``,
        ),
      },
    };
  }

  /**
   * Executes the tool - inserts a cell into the active Datalayer notebook.
   * ⚠️ ONLY works with Datalayer custom editor notebooks, NOT native VS Code notebooks.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IInsertDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_type, cell_source, cell_index, notebook_uri } = options.input;

    try {
      // Find the target Datalayer notebook document with retry logic
      // Copilot may call this immediately after notebook creation, so we need to wait
      let targetUri: vscode.Uri | undefined;
      const maxRetries = 10; // Try for up to 5 seconds (10 * 500ms)
      let retryCount = 0;

      while (!targetUri && retryCount < maxRetries) {
        if (notebook_uri) {
          targetUri = vscode.Uri.parse(notebook_uri);
          // Validate it's a Datalayer notebook
          validateDatalayerNotebook(targetUri);
          break; // If explicit URI provided, use it immediately
        }

        // Try to find active Datalayer notebook using validation utility
        targetUri = getActiveDatalayerNotebook();
        if (targetUri) {
          console.log(
            `[InsertDatalayerCell] Found Datalayer notebook: ${targetUri.toString()}`,
          );
          break;
        }

        // Not found yet, wait and retry
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(
            `[InsertDatalayerCell] No Datalayer notebook found yet, retry ${retryCount}/${maxRetries}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!targetUri) {
        throw new Error(
          "No active Datalayer notebook found after waiting.\n\n" +
            "Please ensure a Datalayer notebook is open (not a native VS Code notebook) and try again.\n\n" +
            "This tool only works with notebooks opened via the Datalayer extension.",
        );
      }

      // ALWAYS use message-based approach for .ipynb files
      // They should open with Datalayer custom editor (registered in package.json)
      // We need to wait a bit for the webview to be ready after notebook creation
      if (targetUri.fsPath.endsWith(".ipynb")) {
        console.log(
          "[InsertCell] Inserting cell into Datalayer notebook:",
          targetUri.toString(),
        );
        console.log("[InsertCell] Cell type:", cell_type, "Index:", cell_index);

        // Add small delay to ensure webview is ready if notebook was just created
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Use message-based approach for Datalayer webview
        await vscode.commands.executeCommand("datalayer.internal.insertCell", {
          uri: targetUri.toString(),
          cellType: cell_type,
          cellSource: cell_source,
          cellIndex: cell_index,
        });

        console.log("[InsertCell] Cell insertion message sent successfully");

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `✅ ${cell_type.charAt(0).toUpperCase() + cell_type.slice(1)} cell inserted.\n\n` +
              `Cell content:\n\`\`\`${cell_type === "code" ? "python" : "markdown"}\n${cell_source}\n\`\`\``,
          ),
        ]);
      }

      // This should never be reached - all .ipynb files are handled above
      throw new Error(`Unsupported notebook type: ${targetUri.toString()}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to insert cell: ${errorMessage}`);
    }
  }
}
