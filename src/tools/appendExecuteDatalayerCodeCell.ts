/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Append and Execute Code Cell

 * ⚠️ IMPORTANT: This tool ONLY works with Datalayer custom editor notebooks.
 * It does NOT work with native VS Code notebooks.
 *
 *
 * Appends a code cell at the end of the notebook and executes it.
 * This tool enables Copilot to run code and see results via natural language.
 *
 * Example usage in Copilot:
 * "Add and run a cell that imports pandas"
 */

import * as vscode from "vscode";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";

interface IAppendExecuteDatalayerCodeCellParameters {
  cell_source: string;
  notebook_uri?: string; // Optional - URI of notebook (defaults to active editor)
}

/**
 * Tool for appending and executing code cells in Datalayer notebooks.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 */
export class AppendExecuteDatalayerCodeCellTool
  implements vscode.LanguageModelTool<IAppendExecuteDatalayerCodeCellParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IAppendExecuteDatalayerCodeCellParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { cell_source } = options.input;

    // Truncate long source for display
    const displaySource =
      cell_source.length > 100
        ? cell_source.substring(0, 100) + "..."
        : cell_source;

    return {
      invocationMessage: `Appending and executing code cell`,
      confirmationMessages: {
        title: "Append and Execute Code Cell",
        message: new vscode.MarkdownString(
          `Append code cell at end and execute?\n\n\`\`\`python\n${displaySource}\n\`\`\``,
        ),
      },
    };
  }

  /**
   * Executes the tool - appends a code cell at the end and runs it.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IAppendExecuteDatalayerCodeCellParameters>,
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

      // Step 1: Get current cell count to know the index of the new cell
      const cellsBefore = await vscode.commands.executeCommand<
        Array<{ index: number }>
      >("datalayer.internal.readAllCells", {
        uri: targetUri.toString(),
      });

      const newCellIndex = cellsBefore.length;

      // Step 2: Insert code cell at end
      await vscode.commands.executeCommand("datalayer.internal.insertCell", {
        uri: targetUri.toString(),
        cellType: "code",
        cellSource: cell_source,
        cellIndex: undefined, // Append to end
      });

      // Step 3: Wait a bit for cell to be inserted
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 4: Execute the newly inserted cell
      // Note: We need to use the native VS Code notebook API for execution
      const notebookDocument =
        await vscode.workspace.openNotebookDocument(targetUri);

      if (newCellIndex >= 0 && newCellIndex < notebookDocument.cellCount) {
        const cell = notebookDocument.cellAt(newCellIndex);

        if (cell.kind === vscode.NotebookCellKind.Code) {
          // Execute the cell
          await vscode.commands.executeCommand("notebook.cell.execute", {
            ranges: [{ start: newCellIndex, end: newCellIndex + 1 }],
            document: notebookDocument.uri,
          });

          // Wait for execution to complete
          const maxWaitTime = 30000; // 30 seconds
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitTime) {
            const currentCell = notebookDocument.cellAt(newCellIndex);

            if (
              currentCell.executionSummary?.executionOrder !== undefined &&
              currentCell.executionSummary?.success !== undefined
            ) {
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Get execution results
          const executedCell = notebookDocument.cellAt(newCellIndex);
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
                const errorData = JSON.parse(
                  new TextDecoder().decode(item.data),
                );
                outputs.push(`[error] ${errorData.name}: ${errorData.message}`);
              }
            }
          }

          const success = executedCell.executionSummary?.success !== false;
          const resultMessage = success
            ? `Code cell appended and executed successfully.`
            : `Code cell appended but execution failed.`;

          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              `${resultMessage}\n\n` +
                `**Cell content:**\n\`\`\`python\n${cell_source}\n\`\`\`\n\n` +
                `**Outputs:**\n\`\`\`\n${outputs.length > 0 ? outputs.join("\n") : "(no output)"}\n\`\`\``,
            ),
          ]);
        } else {
          throw new Error("Inserted cell is not a code cell");
        }
      } else {
        throw new Error(
          `Cell index ${newCellIndex} out of range after insertion`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to append and execute code cell: ${errorMessage}`,
      );
    }
  }
}
