/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Document management commands for the Datalayer VS Code extension.
 * Handles opening, creating, renaming, deleting, downloading, and copying notebooks and lexical documents.
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
 * - `datalayer.downloadDocument` - Downloads documents to local filesystem
 * - `datalayer.copyLocalFileToSpace` - Copies local files to default Datalayer space
 * - `datalayer.refreshSpaces` - Refreshes spaces tree view to reflect latest state
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { getServiceContainer } from "../extension";
import { DocumentBridge } from "../services/bridges/documentBridge";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { Document } from "../models/spaceItem";
import {
  detectDocumentType,
  getDocumentDisplayName,
} from "../utils/documentUtils";
import {
  showTwoStepConfirmation,
  CommonConfirmations,
} from "../ui/dialogs/confirmationDialog";
import type { SpaceDTO } from "@datalayer/core/lib/models/SpaceDTO";

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
  spacesTreeProvider: SpacesTreeProvider,
): void {
  const sdk = getServiceContainer().sdk;
  /**
   * Command: datalayer.openDocument
   * Opens Datalayer documents with type detection and appropriate editor.
   * Handles notebooks, lexical documents, and cells with progress tracking.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.openDocument",
      async (documentOrItem: unknown, spaceName?: string) => {
        try {
          if (!documentOrItem) {
            vscode.window.showErrorMessage("No document selected");
            return;
          }

          let document: Document;

          // Type guard for tree item with data property
          const itemWithData = documentOrItem as {
            data?: { document?: Document; spaceName?: string };
          };

          if (itemWithData.data && itemWithData.data.document) {
            document = itemWithData.data.document;
            spaceName =
              itemWithData.data.spaceName ?? spaceName ?? "Unknown Space";
          } else {
            document = documentOrItem as Document;
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
                  spaceName,
                );

                progress.report({
                  increment: 75,
                  message: "Opening notebook editor...",
                });

                await vscode.commands.executeCommand(
                  "vscode.openWith",
                  uri,
                  "datalayer.jupyter-notebook",
                );

                progress.report({ increment: 100, message: "Done!" });
              },
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
                  spaceName,
                );

                progress.report({
                  increment: 50,
                  message: "Opening document in read-only mode...",
                });

                await vscode.commands.executeCommand(
                  "vscode.openWith",
                  uri,
                  "datalayer.lexical-editor",
                );

                progress.report({ increment: 100, message: "Done!" });
              },
            );
          } else if (isCell) {
            vscode.window.showInformationMessage(
              `Cell viewer coming soon: ${docName}`,
            );
          } else {
            vscode.window.showInformationMessage(
              `Document type not supported: ${typeInfo.type} (${docName})`,
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open document: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.newRemoteDatalayerNotebookPrompt
   * Creates a new Jupyter notebook in a Datalayer space.
   * Smart command that handles both context menu (with spaceItem) and command palette (prompts for space).
   * Automatically extracts space from parent when called on a document item.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.newRemoteDatalayerNotebookPrompt",
      async (spaceItem?: unknown) => {
        try {
          let space: SpaceDTO;

          // Check if called from context menu with spaceItem
          const itemWithData = spaceItem as {
            data?: { space?: SpaceDTO };
            parent?: { data?: { space?: SpaceDTO } };
          };

          if (itemWithData?.data?.space) {
            // Called from context menu on a space item - use provided space
            space = itemWithData.data.space;
          } else if (itemWithData?.parent?.data?.space) {
            // Called from context menu on a document item - use parent space
            space = itemWithData.parent.data.space;
          } else {
            // Called from command palette, title bar, or root - prompt for space
            const spaces = await sdk.getMySpaces();
            if (!spaces || spaces.length === 0) {
              vscode.window.showErrorMessage("No spaces available");
              return;
            }

            const spaceItems = spaces.map((s) => ({
              label: s.variant === "default" ? `${s.name} (Default)` : s.name,
              space: s,
            }));

            const selectedSpace = await vscode.window.showQuickPick(
              spaceItems,
              {
                placeHolder: "Select a space to create the notebook in",
              },
            );

            if (!selectedSpace) {
              return;
            }

            space = selectedSpace.space;
          }

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
              title: `Creating notebook "${name}" in space "${space.name}"...`,
              cancellable: false,
            },
            async () => {
              const notebook = await sdk.createNotebook(
                space.uid,
                name,
                description || "",
              );

              if (notebook) {
                vscode.window.showInformationMessage(
                  `Successfully created notebook "${name}"`,
                );
                spacesTreeProvider.refreshSpace(space.uid);
              } else {
                throw new Error("Failed to create notebook");
              }
            },
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
   * Command: datalayer.newRemoteLexicalDocumentPrompt
   * Creates a new lexical document in a Datalayer space.
   * Smart command that handles both context menu (with spaceItem) and command palette (prompts for space).
   * Automatically extracts space from parent when called on a document item.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.newRemoteLexicalDocumentPrompt",
      async (spaceItem?: unknown) => {
        try {
          let space: SpaceDTO;

          // Check if called from context menu with spaceItem
          const itemWithData = spaceItem as {
            data?: { space?: SpaceDTO };
            parent?: { data?: { space?: SpaceDTO } };
          };

          if (itemWithData?.data?.space) {
            // Called from context menu on a space item - use provided space
            space = itemWithData.data.space;
          } else if (itemWithData?.parent?.data?.space) {
            // Called from context menu on a document item - use parent space
            space = itemWithData.parent.data.space;
          } else {
            // Called from command palette, title bar, or root - prompt for space
            const spaces = await sdk.getMySpaces();
            if (!spaces || spaces.length === 0) {
              vscode.window.showErrorMessage("No spaces available");
              return;
            }

            const spaceItems = spaces.map((s) => ({
              label: s.variant === "default" ? `${s.name} (Default)` : s.name,
              space: s,
            }));

            const selectedSpace = await vscode.window.showQuickPick(
              spaceItems,
              {
                placeHolder: "Select a space to create the document in",
              },
            );

            if (!selectedSpace) {
              return;
            }

            space = selectedSpace.space;
          }

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
              title: `Creating lexical document "${name}" in space "${space.name}"...`,
              cancellable: false,
            },
            async () => {
              const document = await sdk.createLexical(
                space.uid,
                name,
                description || "",
              );

              if (document) {
                vscode.window.showInformationMessage(
                  `Successfully created lexical document "${name}"`,
                );
                spacesTreeProvider.refreshSpace(space.uid);
              } else {
                throw new Error("Failed to create lexical document");
              }
            },
          );
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

  /**
   * Command: datalayer.renameItem
   * Renames a document with input validation and confirmation.
   * Preserves existing description while updating the name.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.renameItem",
      async (item: unknown) => {
        try {
          const itemWithData = item as {
            data?: { document?: Document };
          };

          if (!itemWithData.data?.document) {
            vscode.window.showErrorMessage(
              "Please select a document to rename",
            );
            return;
          }

          const document = itemWithData.data.document;
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
                  `Successfully renamed to "${newName}"`,
                );
                spacesTreeProvider.refresh();
              } catch (updateError) {
                throw new Error(
                  `Failed to rename item: ${
                    updateError instanceof Error
                      ? updateError.message
                      : "Unknown error"
                  }`,
                );
              }
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to rename item: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.deleteItem
   * Deletes a document with mandatory confirmation dialog.
   * Includes safety checks and progress tracking.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.deleteItem",
      async (item: unknown) => {
        try {
          const itemWithData = item as {
            data?: { document?: Document };
          };

          if (!itemWithData.data?.document) {
            vscode.window.showErrorMessage(
              "Please select a document to delete",
            );
            return;
          }

          const document = itemWithData.data.document;
          // SDK models have a 'name' property
          const itemName = document.name;

          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.deleteDocument(itemName),
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
                  `Successfully deleted "${itemName}"`,
                );
                spacesTreeProvider.refresh();
              } catch (deleteError) {
                throw new Error(
                  `Failed to delete item: ${
                    deleteError instanceof Error
                      ? deleteError.message
                      : "Unknown error"
                  }`,
                );
              }
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete item: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.downloadDocument
   * Downloads a document from Datalayer to the local filesystem.
   * Prompts user for save location and handles both notebooks and lexical documents.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.downloadDocument",
      async (item: unknown) => {
        try {
          const itemWithData = item as {
            data?: { document?: Document; spaceName?: string };
          };

          if (!itemWithData.data?.document) {
            vscode.window.showErrorMessage(
              "Please select a document to download",
            );
            return;
          }

          const document = itemWithData.data.document;
          const docName = document.name;
          const spaceName = itemWithData.data.spaceName || "Unknown Space";
          const typeInfo = detectDocumentType(document);
          const { isNotebook, isLexical } = typeInfo;

          // Determine file extension
          let extension = "";
          let defaultFilename = docName;
          if (isNotebook) {
            extension = ".ipynb";
            if (!defaultFilename.endsWith(extension)) {
              defaultFilename = `${defaultFilename}${extension}`;
            }
          } else if (isLexical) {
            extension = ".dlex";
            // Strip existing .lexical or .dlex extensions
            defaultFilename = defaultFilename.replace(/\.(lexical|dlex)$/, "");
            defaultFilename = `${defaultFilename}${extension}`;
          } else {
            vscode.window.showErrorMessage(
              `Cannot download document of type: ${typeInfo.type}`,
            );
            return;
          }

          // Prompt user for save location
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultFilename),
            filters: isNotebook
              ? {
                  "Jupyter Notebooks": ["ipynb"],
                  "All Files": ["*"],
                }
              : {
                  "Lexical Documents": ["dlex"],
                  "All Files": ["*"],
                },
            title: `Download ${isNotebook ? "Notebook" : "Document"} from ${spaceName}`,
          });

          if (!uri) {
            return; // User cancelled
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Downloading "${docName}"...`,
              cancellable: false,
            },
            async (progress) => {
              progress.report({
                increment: 0,
                message: "Fetching content from Datalayer...",
              });

              // Fetch content from the document
              let content: string | object | undefined;
              let retries = 3;
              let lastError: Error | unknown;

              while (retries > 0) {
                try {
                  content = await document.getContent();
                  if (content !== undefined && content !== null) {
                    break; // Success
                  }
                } catch (error) {
                  lastError = error;
                }

                retries--;
                if (retries > 0) {
                  progress.report({
                    message: `Retrying... (${3 - retries}/3)`,
                  });
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              }

              if (content === undefined || content === null) {
                throw (
                  lastError ||
                  new Error("Failed to fetch document content from Datalayer")
                );
              }

              progress.report({
                increment: 50,
                message: "Saving to disk...",
              });

              // Write content to the selected location
              if (typeof content === "string") {
                fs.writeFileSync(uri.fsPath, content, "utf8");
              } else {
                fs.writeFileSync(
                  uri.fsPath,
                  JSON.stringify(content, null, 2),
                  "utf8",
                );
              }

              progress.report({
                increment: 100,
                message: "Done!",
              });

              vscode.window.showInformationMessage(
                `Successfully downloaded "${docName}" to ${uri.fsPath}`,
              );
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to download document: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.copyLocalFileToSpace
   * Copies local .ipynb or .dlex/.lexical files to the user's default Datalayer space.
   * Supports single file or multiple file selection.
   * Uses single-step upload via multipart/form-data for efficient file transfer.
   * If user is not authenticated, prompts for login first.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.copyLocalFileToSpace",
      async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
        try {
          // Check authentication status
          const authProvider = getServiceContainer().authProvider;
          if (!authProvider.isAuthenticated()) {
            // Show the authentication dialog (same as clicking status bar icon)
            await vscode.commands.executeCommand("datalayer.login");

            // Check if login was successful
            if (!authProvider.isAuthenticated()) {
              // Login failed or was cancelled - show a message
              vscode.window.showInformationMessage(
                "Authentication required to copy files to Datalayer space.",
              );
              return;
            }
          }

          // Handle multiple file selection: use uris array if provided, otherwise single uri
          const filesToCopy = uris && uris.length > 0 ? uris : [uri];

          if (!filesToCopy || filesToCopy.length === 0) {
            vscode.window.showErrorMessage("Please select files to copy");
            return;
          }

          // Filter to only supported file types
          const supportedFiles = filesToCopy.filter((fileUri) => {
            const fileName = fileUri.fsPath.split(/[\\/]/).pop() || "";
            return (
              fileName.endsWith(".ipynb") ||
              fileName.endsWith(".dlex") ||
              fileName.endsWith(".lexical")
            );
          });

          if (supportedFiles.length === 0) {
            vscode.window.showErrorMessage(
              "No supported files selected. Only .ipynb, .dlex, and .lexical files are supported.",
            );
            return;
          }

          // Inform user about unsupported files if any were filtered out
          const filteredCount = filesToCopy.length - supportedFiles.length;
          if (filteredCount > 0) {
            vscode.window.showWarningMessage(
              `${filteredCount} file(s) skipped (unsupported type). Only .ipynb, .dlex, and .lexical files are supported.`,
            );
          }

          const totalFiles = supportedFiles.length;
          const isMultiple = totalFiles > 1;

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: isMultiple
                ? `Copying ${totalFiles} files to Datalayer...`
                : `Copying file to Datalayer...`,
              cancellable: false,
            },
            async (progress) => {
              // Get default space once for all files
              progress.report({
                increment: 0,
                message: "Finding default space...",
              });

              const spaces = await sdk.getMySpaces();
              if (!spaces || spaces.length === 0) {
                throw new Error(
                  "No spaces available. Please create a space first.",
                );
              }

              const defaultSpace = spaces.find((s) => s.variant === "default");
              if (!defaultSpace) {
                throw new Error(
                  "No default space found. Please create a default space first.",
                );
              }

              let successCount = 0;
              let failureCount = 0;
              const errors: string[] = [];

              // Process each file
              for (let i = 0; i < supportedFiles.length; i++) {
                const fileUri = supportedFiles[i];
                const filePath = fileUri.fsPath;
                const fileName = filePath.split(/[\\/]/).pop() || "document";

                const progressPercent = (i / totalFiles) * 100;
                progress.report({
                  increment: progressPercent,
                  message: isMultiple
                    ? `[${i + 1}/${totalFiles}] ${fileName}...`
                    : `Uploading ${fileName}...`,
                });

                try {
                  // Read file content
                  const content = fs.readFileSync(filePath, "utf8");

                  // Validate JSON
                  try {
                    JSON.parse(content);
                  } catch (error) {
                    throw new Error(`Invalid JSON in ${fileName}`);
                  }

                  // Determine file type
                  const isNotebook = fileName.endsWith(".ipynb");
                  const isLexical =
                    fileName.endsWith(".dlex") || fileName.endsWith(".lexical");

                  // Create document name (strip extension)
                  const docName = fileName.replace(
                    /\.(ipynb|dlex|lexical)$/,
                    "",
                  );

                  // Create Blob from content
                  const blob = new Blob([content], {
                    type: "application/json",
                  });

                  // Upload to Datalayer
                  let newDocument;
                  if (isNotebook) {
                    newDocument = await sdk.createNotebook(
                      defaultSpace.uid,
                      docName,
                      "",
                      blob,
                    );
                  } else if (isLexical) {
                    newDocument = await sdk.createLexical(
                      defaultSpace.uid,
                      docName,
                      "",
                      blob,
                    );
                  }

                  if (newDocument) {
                    successCount++;
                  } else {
                    failureCount++;
                    errors.push(`${fileName}: Failed to create document`);
                  }
                } catch (error) {
                  failureCount++;
                  const errorMsg =
                    error instanceof Error ? error.message : "Unknown error";
                  errors.push(`${fileName}: ${errorMsg}`);
                }
              }

              progress.report({
                increment: 100,
                message: "Done!",
              });

              // Refresh the spaces tree to show new documents
              spacesTreeProvider.refreshSpace(defaultSpace.uid);

              // Show summary
              if (failureCount === 0) {
                vscode.window.showInformationMessage(
                  isMultiple
                    ? `Successfully copied ${successCount} file(s) to space "${defaultSpace.name}"`
                    : `Successfully copied "${supportedFiles[0].fsPath.split(/[\\/]/).pop()}" to space "${defaultSpace.name}"`,
                );
              } else if (successCount === 0) {
                vscode.window.showErrorMessage(
                  `Failed to copy ${failureCount} file(s):\n${errors.join("\n")}`,
                );
              } else {
                vscode.window.showWarningMessage(
                  `Copied ${successCount} file(s), but ${failureCount} failed:\n${errors.join("\n")}`,
                );
              }
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy files to Datalayer: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.refreshSpaces
   * Refreshes the spaces tree view to reflect latest platform state.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.refreshSpaces", () => {
      spacesTreeProvider.refresh();
    }),
  );
}
