/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Create LOCAL Notebook
 *
 * Creates a new LOCAL Jupyter notebook file in the workspace folder and opens it
 * with the Datalayer Notebook Editor. The notebook is saved as a .ipynb file on disk.
 *
 * Use this when the user wants a LOCAL notebook file (not cloud/remote).
 *
 * Example usage in Copilot:
 * "Create a local notebook"
 * "Create a local notebook called analysis"
 * "Make me a new local notebook file named data-exploration"
 * "Create a notebook file in my workspace"
 */

import * as vscode from "vscode";

interface ICreateDatalayerLocalNotebookParameters {
  filename?: string;
}

/**
 * Tool for creating LOCAL file-based Datalayer Jupyter notebooks in the current workspace.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * IMPORTANT: Use this tool when user says "local" or "file" or wants a Datalayer notebook in workspace.
 * Do NOT use this for cloud/remote notebooks - use CreateDatalayerRemoteNotebookTool instead.
 *
 * Key characteristics:
 * - Creates .ipynb file on local disk
 * - Stored in workspace folder
 * - Not uploaded to cloud
 * - Opens with Datalayer custom editor
 */
export class CreateDatalayerLocalNotebookTool
  implements vscode.LanguageModelTool<ICreateDatalayerLocalNotebookParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateDatalayerLocalNotebookParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { filename } = options.input;

    return {
      invocationMessage: `Creating local notebook file${filename ? ` "${filename}"` : ""}`,
      confirmationMessages: {
        title: "Create Local Notebook File",
        message: new vscode.MarkdownString(
          filename
            ? `Create local notebook file **${filename}** in workspace?\n\n(Saved on disk, not in cloud)`
            : "Create a new local Jupyter notebook file in workspace?\n\n(Saved on disk, not in cloud)",
        ),
      },
    };
  }

  /**
   * Executes the tool - creates a local notebook file and opens it with Datalayer editor.
   * Creates a real file on disk (not untitled) to ensure proper loading.
   *
   * Supports optional filename parameter from Copilot natural language input.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ICreateDatalayerLocalNotebookParameters>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Check if workspace is open
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw new Error(
          "Creating local notebooks requires an open workspace. Please open a folder first.",
        );
      }

      // Determine filename from parameter or generate unique name
      let filename: string;
      if (options.input.filename) {
        // Use provided filename, ensure .ipynb extension
        filename = options.input.filename.endsWith(".ipynb")
          ? options.input.filename
          : `${options.input.filename}.ipynb`;
      } else {
        // Generate unique timestamp-based filename
        const timestamp = Date.now();
        filename = `notebook-${timestamp}.ipynb`;
      }

      const notebookUri = vscode.Uri.joinPath(
        workspaceFolders[0].uri,
        filename,
      );

      // Create empty notebook content
      const emptyNotebook = {
        cells: [],
        metadata: {
          kernelspec: {
            name: "python3",
            display_name: "Python 3",
          },
          language_info: {
            name: "python",
          },
        },
        nbformat: 4,
        nbformat_minor: 5,
      };

      // Write notebook file to disk
      const content = Buffer.from(
        JSON.stringify(emptyNotebook, null, 2),
        "utf8",
      );
      await vscode.workspace.fs.writeFile(notebookUri, content);

      // Open with Datalayer custom editor
      await vscode.commands.executeCommand(
        "vscode.openWith",
        notebookUri,
        "datalayer.jupyter-notebook",
      );

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Local notebook created successfully!\n\n` +
            `File: ${filename}\n` +
            `Location: ${workspaceFolders[0].name}\n` +
            `URI: ${notebookUri.toString()}\n` +
            `Opened with Datalayer editor.\n\n` +
            `Use notebook_uri: "${notebookUri.toString()}" for subsequent operations.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create local notebook: ${errorMessage}`);
    }
  }
}
