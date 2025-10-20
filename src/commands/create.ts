/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Simple document creation commands for local notebooks and lexical documents.
 * These commands just create local untitled files in the workspace.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands/create
 *
 * @remarks
 * For creating documents in Datalayer Spaces, use the existing commands:
 * - datalayer.createNotebookInSpace (already exists in documents.ts)
 * - datalayer.createLexicalInSpace (already exists in documents.ts)
 */

import * as vscode from "vscode";

/**
 * Registers simple create commands for local document creation.
 *
 * @param context - Extension context for command subscriptions
 */
export function registerCreateCommands(context: vscode.ExtensionContext): void {
  /**
   * Command: datalayer.newLocalDatalayerNotebook
   * Creates a new local notebook file.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.newLocalDatalayerNotebook",
      async (): Promise<void> => {
        try {
          await vscode.commands.executeCommand(
            "datalayer.jupyter-notebook-new",
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create notebook: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.newLocalLexicalDocument
   * Creates a new local lexical document file.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.newLocalLexicalDocument",
      async (): Promise<void> => {
        try {
          await vscode.commands.executeCommand("datalayer.lexical-editor-new");
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create lexical document: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );
}
