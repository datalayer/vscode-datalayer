/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Document management commands for the Datalayer VS Code extension.
 * Handles opening, creating, renaming, and deleting notebooks and lexical documents.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands/documents
 *
 * @remarks
 * This module registers the following commands:
 * - `datalayer.openDocument` - Opens documents with type detection and appropriate editor
 * - `datalayer.createNotebookInSpace` - Creates new Jupyter notebook in selected space
 * - `datalayer.createLexicalInSpace` - Creates new lexical document in selected space
 * - `datalayer.renameItem` - Renames documents with validation and confirmation
 * - `datalayer.deleteItem` - Deletes documents with mandatory confirmation dialog
 * - `datalayer.refreshSpaces` - Refreshes spaces tree view to reflect latest state
 */

import * as vscode from "vscode";
import { getSDKInstance } from "../services/sdkAdapter";
import { DocumentBridge } from "../services/documentBridge";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { Document } from "../models/spaceItem";
import {
  detectDocumentType,
  getDocumentDisplayName,
} from "../utils/documentUtils";
import {
  showTwoStepConfirmation,
  CommonConfirmations,
} from "../utils/confirmationDialog";
import { ItemTypes } from "../../../core/lib/sdk/client/constants";

/**
 * Registers all document-related VS Code commands for the Datalayer extension.
 *
 * Registers commands for opening, creating, renaming, and deleting notebooks
 * and lexical documents with Datalayer platform integration.
 *
 * @param context - Extension context for command subscriptions
 * @param documentBridge - Bridge for document lifecycle management
 * @param spacesTreeProvider - Tree provider for UI refresh operations
 *
 */
export function registerDocumentCommands(
  context: vscode.ExtensionContext,
  documentBridge: DocumentBridge,
  spacesTreeProvider: SpacesTreeProvider
): void {
  const sdk = getSDKInstance();
  /**
   * Command: datalayer.openDocument
   * Opens Datalayer documents with type detection and appropriate editor.
   * Handles notebooks, lexical documents, and cells with progress tracking.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.openDocument",
      async (documentOrItem: any, spaceName?: string) => {
        try {
          if (!documentOrItem) {
            vscode.window.showErrorMessage("No document selected");
            return;
          }

          let document: Document;

          if (documentOrItem.data && documentOrItem.data.document) {
            document = documentOrItem.data.document;
            spaceName =
              documentOrItem.data.spaceName ?? spaceName ?? "Unknown Space";
          } else {
            document = documentOrItem;
            spaceName = spaceName ?? "Unknown Space";
          }

          const docName = getDocumentDisplayName(document);
          const typeInfo = detectDocumentType(document);
          const { isNotebook, isLexical, isCell } = typeInfo;

          if (isNotebook) {
            vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Opening notebook: ${docName}`,
                cancellable: false,
              },
              async (progress) => {
                progress.report({
                  increment: 0,
                  message: "Downloading notebook content...",
                });

                const uri = await documentBridge.openDocument(
                  document,
                  undefined,
                  spaceName
                );

                progress.report({
                  increment: 75,
                  message: "Opening notebook editor...",
                });

                await vscode.commands.executeCommand(
                  "vscode.openWith",
                  uri,
                  "datalayer.jupyter-notebook"
                );

                progress.report({ increment: 100, message: "Done!" });
              }
            );
          } else if (isLexical) {
            vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Opening lexical document: ${docName}`,
                cancellable: false,
              },
              async (progress) => {
                progress.report({
                  increment: 0,
                  message: "Downloading document content...",
                });

                const uri = await documentBridge.openDocument(
                  document,
                  undefined,
                  spaceName
                );

                progress.report({
                  increment: 50,
                  message: "Opening document in read-only mode...",
                });

                await vscode.commands.executeCommand(
                  "vscode.openWith",
                  uri,
                  "datalayer.lexical-editor"
                );

                progress.report({ increment: 100, message: "Done!" });
              }
            );
          } else if (isCell) {
            vscode.window.showInformationMessage(
              `Cell viewer coming soon: ${docName}`
            );
          } else {
            vscode.window.showInformationMessage(
              `Document type not supported: ${typeInfo.type} (${docName})`
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open document: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.createNotebookInSpace
   * Creates a new Jupyter notebook in the selected space.
   * Prompts for name and optional description with validation.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.createNotebookInSpace",
      async (spaceItem) => {
        try {
          if (!spaceItem?.data?.space) {
            vscode.window.showErrorMessage("Please select a space");
            return;
          }

          const space = spaceItem.data.space;

          const name = await vscode.window.showInputBox({
            prompt: "Enter notebook name",
            placeHolder: "My Notebook",
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "Notebook name is required";
              }
              return null;
            },
          });

          if (!name) {
            return;
          }

          const description = await vscode.window.showInputBox({
            prompt: "Enter notebook description (optional)",
            placeHolder: "A brief description of the notebook",
          });

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Creating notebook "${name}" in space "${space.name_t}"...`,
              cancellable: false,
            },
            async () => {
              const notebook = await (sdk as any).createNotebook({
                spaceId: space.uid,
                name,
                description,
              });

              if (notebook) {
                vscode.window.showInformationMessage(
                  `Successfully created notebook "${name}"`
                );
                spacesTreeProvider.refreshSpace(space.uid);
              } else {
                throw new Error("Failed to create notebook");
              }
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create notebook: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.createLexicalInSpace
   * Creates a new lexical document in the selected space.
   * Prompts for name and optional description with validation.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.createLexicalInSpace",
      async (spaceItem) => {
        try {
          if (!spaceItem?.data?.space) {
            vscode.window.showErrorMessage("Please select a space");
            return;
          }

          const space = spaceItem.data.space;

          const name = await vscode.window.showInputBox({
            prompt: "Enter document name",
            placeHolder: "My Document",
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "Document name is required";
              }
              return null;
            },
          });

          if (!name) {
            return;
          }

          const description = await vscode.window.showInputBox({
            prompt: "Enter document description (optional)",
            placeHolder: "A brief description of the document",
          });

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Creating lexical document "${name}" in space "${space.name_t}"...`,
              cancellable: false,
            },
            async () => {
              const document = await (sdk as any).createLexical({
                spaceId: space.uid,
                name,
                description,
              });

              if (document) {
                vscode.window.showInformationMessage(
                  `Successfully created lexical document "${name}"`
                );
                spacesTreeProvider.refreshSpace(space.uid);
              } else {
                throw new Error("Failed to create lexical document");
              }
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create lexical document: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.renameItem
   * Renames a document with input validation and confirmation.
   * Preserves existing description while updating the name.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.renameItem",
      async (item: any) => {
        try {
          if (!item?.data?.document) {
            vscode.window.showErrorMessage(
              "Please select a document to rename"
            );
            return;
          }

          const document = item.data.document;
          // SDK models have a 'name' property
          const currentName = document.name;

          const newName = await vscode.window.showInputBox({
            prompt: "Enter new name",
            value: currentName,
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "Name is required";
              }
              return null;
            },
          });

          if (!newName || newName === currentName) {
            return;
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Renaming "${currentName}" to "${newName}"...`,
              cancellable: false,
            },
            async () => {
              // The document is already an SDK model instance with an update method
              try {
                // Call the update method directly on the model instance
                // Both Notebook and Lexical models have an update method
                const existingDescription = document.description;
                await document.update(newName, existingDescription);

                vscode.window.showInformationMessage(
                  `Successfully renamed to "${newName}"`
                );
                spacesTreeProvider.refresh();
              } catch (updateError) {
                throw new Error(
                  `Failed to rename item: ${
                    updateError instanceof Error
                      ? updateError.message
                      : "Unknown error"
                  }`
                );
              }
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to rename item: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.deleteItem
   * Deletes a document with mandatory confirmation dialog.
   * Includes safety checks and progress tracking.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.deleteItem",
      async (item: any) => {
        try {
          if (!item?.data?.document) {
            vscode.window.showErrorMessage(
              "Please select a document to delete"
            );
            return;
          }

          const document = item.data.document;
          // SDK models have a 'name' property
          const itemName = document.name;

          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.deleteDocument(itemName)
          );

          if (!confirmed) {
            return;
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Deleting "${itemName}"...`,
              cancellable: false,
            },
            async () => {
              // The document is already an SDK model instance with a delete method
              try {
                // Call the delete method directly on the model instance
                await document.delete();

                vscode.window.showInformationMessage(
                  `Successfully deleted "${itemName}"`
                );
                spacesTreeProvider.refresh();
              } catch (deleteError) {
                throw new Error(
                  `Failed to delete item: ${
                    deleteError instanceof Error
                      ? deleteError.message
                      : "Unknown error"
                  }`
                );
              }
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete item: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.refreshSpaces
   * Refreshes the spaces tree view to reflect latest platform state.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.refreshSpaces", () => {
      spacesTreeProvider.refresh();
    })
  );
}
