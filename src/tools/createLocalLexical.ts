/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Create LOCAL Lexical Document
 *
 * Creates a new LOCAL Lexical document file in the workspace folder and opens it
 * with the Datalayer Lexical Editor. The document is saved as a .lexical file on disk.
 *
 * Use this when the user wants a LOCAL lexical document (not cloud/remote).
 *
 * Example usage in Copilot:
 * "Create a local lexical document"
 * "Create a local lexical doc called notes"
 * "Make me a new local lexical file named meeting-notes"
 * "Create a lexical document file in my workspace"
 */

import * as vscode from "vscode";

interface ICreateLocalLexicalParameters {
  filename?: string;
}

/**
 * Tool for creating LOCAL file-based Lexical documents in the current workspace.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * IMPORTANT: Use this tool when user says "local" or "file" or wants a lexical doc in workspace.
 * Do NOT use this for cloud/remote documents - use CreateRemoteLexicalTool instead.
 *
 * Key characteristics:
 * - Creates .lexical file on local disk
 * - Stored in workspace folder
 * - Not uploaded to cloud
 * - Opens with Datalayer lexical editor
 */
export class CreateLocalLexicalTool
  implements vscode.LanguageModelTool<ICreateLocalLexicalParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateLocalLexicalParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { filename } = options.input;

    return {
      invocationMessage: `Creating local lexical document${filename ? ` "${filename}"` : ""}`,
      confirmationMessages: {
        title: "Create Local Lexical Document",
        message: new vscode.MarkdownString(
          filename
            ? `Create local lexical document **${filename}** in workspace?\n\n(Saved on disk, not in cloud)`
            : "Create a new local Lexical document in workspace?\n\n(Saved on disk, not in cloud)",
        ),
      },
    };
  }

  /**
   * Executes the tool - creates a local lexical file and opens it with Datalayer editor.
   * Creates a real file on disk (not untitled) to ensure proper loading.
   *
   * Supports optional filename parameter from Copilot natural language input.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ICreateLocalLexicalParameters>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Check if workspace is open
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw new Error(
          "Creating local lexical documents requires an open workspace. Please open a folder first.",
        );
      }

      // Determine filename from parameter or generate unique name
      let filename: string;
      if (options.input.filename) {
        // Use provided filename, ensure .lexical extension
        filename = options.input.filename.endsWith(".lexical")
          ? options.input.filename
          : `${options.input.filename}.lexical`;
      } else {
        // Generate unique timestamp-based filename
        const timestamp = Date.now();
        filename = `document-${timestamp}.lexical`;
      }

      const lexicalUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filename);

      // Create empty lexical document content (simple JSON structure)
      const emptyLexical = {
        root: {
          children: [
            {
              children: [],
              direction: null,
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      };

      // Write lexical file to disk
      const content = Buffer.from(
        JSON.stringify(emptyLexical, null, 2),
        "utf8",
      );
      await vscode.workspace.fs.writeFile(lexicalUri, content);

      // Open with Datalayer lexical editor
      await vscode.commands.executeCommand(
        "vscode.openWith",
        lexicalUri,
        "datalayer.lexical-editor",
      );

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Local lexical document created successfully!\n\n` +
            `File: ${filename}\n` +
            `Location: ${workspaceFolders[0].name}\n` +
            `URI: ${lexicalUri.toString()}\n` +
            `Opened with Datalayer lexical editor.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create local lexical document: ${errorMessage}`,
      );
    }
  }
}
