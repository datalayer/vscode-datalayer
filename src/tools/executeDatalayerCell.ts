/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Execute Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Executes a cell in the active Datalayer notebook and returns the output.
 * This tool enables Copilot to run code and see results via natural language.
 *
 * Example usage in Copilot:
 * "Execute cell 0 in the active Datalayer notebook"
 */

import * as vscode from "vscode";

interface IExecuteDatalayerCellParameters {
  cell_index: number;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for executing cells in Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class ExecuteDatalayerCellTool
  implements vscode.LanguageModelTool<IExecuteDatalayerCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IExecuteDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Executing cell ${options.input.cell_index}`,
      confirmationMessages: {
        title: "Execute Notebook Cell",
        message: new vscode.MarkdownString(
          `Execute cell at index **${options.input.cell_index}**?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - runs a cell and returns its output.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IExecuteDatalayerCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_index: cellIndex, notebook_uri } = options.input;

    try {
      let document: vscode.NotebookDocument;
      let notebookEditor: vscode.NotebookEditor | undefined;

      if (notebook_uri) {
        // Use specified notebook
        const uri = vscode.Uri.parse(notebook_uri);
        document = await vscode.workspace.openNotebookDocument(uri);

        // Try to find or open editor for this notebook
        notebookEditor = vscode.window.visibleNotebookEditors.find(
          (editor) => editor.notebook.uri.toString() === uri.toString(),
        );

        if (!notebookEditor) {
          // Open the notebook in editor
          notebookEditor = await vscode.window.showNotebookDocument(document);
        }
      } else {
        // Use active Datalayer notebook editor
        notebookEditor = vscode.window.activeNotebookEditor;
        if (!notebookEditor) {
          throw new Error(
            "No active Datalayer notebook editor found. Please specify notebook_uri or open a notebook first.",
          );
        }
        document = notebookEditor.notebook;
      }

      // Validate cell index
      if (cellIndex < 0 || cellIndex >= document.cellCount) {
        throw new Error(
          `Cell index ${cellIndex} out of range. Notebook has ${document.cellCount} cells.`,
        );
      }

      // Get the cell
      const cell = document.cellAt(cellIndex);

      // Check if it's a code cell
      if (cell.kind !== vscode.NotebookCellKind.Code) {
        throw new Error(
          `Cell ${cellIndex} is not a code cell (it's a ${cell.kind === vscode.NotebookCellKind.Markup ? "markdown" : "unknown"} cell)`,
        );
      }

      // Execute the cell using VS Code's command
      await vscode.commands.executeCommand("notebook.cell.execute", {
        ranges: [{ start: cellIndex, end: cellIndex + 1 }],
        document: document.uri,
      });

      // Wait for execution to complete (check cell execution state)
      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const currentCell = document.cellAt(cellIndex);

        // Check if execution is complete
        if (
          currentCell.executionSummary?.executionOrder !== undefined &&
          currentCell.executionSummary?.success !== undefined
        ) {
          break;
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Get updated cell after execution
      const executedCell = document.cellAt(cellIndex);

      // Extract outputs
      const outputs: string[] = [];
      for (const output of executedCell.outputs) {
        for (const item of output.items) {
          if (
            item.mime === "text/plain" ||
            item.mime === "application/vnd.code.notebook.stdout"
          ) {
            const text = new TextDecoder().decode(item.data);
            outputs.push(text);
          } else if (item.mime === "application/vnd.code.notebook.stderr") {
            const text = new TextDecoder().decode(item.data);
            outputs.push(`[stderr] ${text}`);
          } else if (item.mime === "application/vnd.code.notebook.error") {
            const errorData = JSON.parse(new TextDecoder().decode(item.data));
            outputs.push(`[error] ${errorData.name}: ${errorData.message}`);
          } else {
            outputs.push(`[${item.mime}]: ${item.data.byteLength} bytes`);
          }
        }
      }

      const success = executedCell.executionSummary?.success !== false;
      const executionOrder = executedCell.executionSummary?.executionOrder;

      const resultMessage = success
        ? `✅ Cell ${cellIndex} executed successfully.`
        : `❌ Cell ${cellIndex} execution failed.`;

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `${resultMessage}\n` +
            `Execution order: ${executionOrder || "N/A"}\n\n` +
            `**Outputs:**\n\`\`\`\n${outputs.length > 0 ? outputs.join("\n") : "(no output)"}\n\`\`\``,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute cell: ${errorMessage}`);
    }
  }
}
