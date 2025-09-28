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
              documentOrItem.data.spaceName || spaceName || "Unknown Space";
          } else {
            document = documentOrItem;
            spaceName = spaceName || "Unknown Space";
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

                console.log(
                  "[Datalayer] Opening notebook with collaboration - document ID:",
                  document.uid || document.id
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
          console.error("[Datalayer] Error opening document:", error);
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
          console.error("[Datalayer] Error creating notebook:", error);
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
          console.error("[Datalayer] Error creating lexical document:", error);
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
          const currentName =
            document.name_t ||
            document.notebook_name_s ||
            document.document_name_s ||
            "Untitled";

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
              const existingDescription = document.description_t || "";
              const docId = document.uid || document.id;
              let success = false;

              if (document.type === "notebook" || document.notebook_name_s) {
                const updated = await (sdk as any).updateNotebook(docId, {
                  name: newName,
                  description: existingDescription,
                });
                success = !!updated;
              } else if (
                document.type === "lexical" ||
                document.document_name_s
              ) {
                const updated = await (sdk as any).updateLexical(docId, {
                  name: newName,
                  description: existingDescription,
                });
                success = !!updated;
              }

              if (success) {
                vscode.window.showInformationMessage(
                  `Successfully renamed to "${newName}"`
                );
                spacesTreeProvider.refresh();
              } else {
                throw new Error("Failed to rename item");
              }
            }
          );
        } catch (error) {
          console.error("[Datalayer] Error renaming item:", error);
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
          const itemName =
            document.name_t ||
            document.notebook_name_s ||
            document.document_name_s ||
            "Untitled";

          const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${itemName}"?`,
            "Delete",
            "Cancel"
          );

          if (confirmation !== "Delete") {
            return;
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Deleting "${itemName}"...`,
              cancellable: false,
            },
            async () => {
              const docId = document.uid || document.id;
              let success = false;

              if (document.type === "notebook" || document.notebook_name_s) {
                await (sdk as any).deleteNotebook(docId);
                success = true;
              } else if (
                document.type === "lexical" ||
                document.document_name_s
              ) {
                await (sdk as any).deleteLexical(docId);
                success = true;
              }

              if (success) {
                vscode.window.showInformationMessage(
                  `Successfully deleted "${itemName}"`
                );
                spacesTreeProvider.refresh();
              } else {
                throw new Error("Failed to delete item");
              }
            }
          );
        } catch (error) {
          console.error("[Datalayer] Error deleting item:", error);
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
