/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Internal Helper Functions for Notebook Creation
 *
 * These functions are NOT exposed to Copilot as separate tools.
 * They are used internally by the smart CreateNotebookTool.
 *
 * @internal
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../../extension";

/**
 * Internal function to create a LOCAL notebook file.
 * NOT exposed to Copilot - called by CreateNotebookTool.
 *
 * @param filename - Optional filename (will generate if not provided)
 * @returns Notebook URI
 * @internal
 */
export async function _createLocalNotebook(
  filename?: string,
): Promise<vscode.Uri> {
  // Check if workspace is open
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error(
      "Creating local notebooks requires an open workspace. Please open a folder first.",
    );
  }

  // Determine filename
  let finalFilename: string;
  if (filename) {
    finalFilename = filename.endsWith(".ipynb")
      ? filename
      : `${filename}.ipynb`;
  } else {
    const timestamp = Date.now();
    finalFilename = `notebook-${timestamp}.ipynb`;
  }

  const notebookUri = vscode.Uri.joinPath(
    workspaceFolders[0].uri,
    finalFilename,
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
  const content = Buffer.from(JSON.stringify(emptyNotebook, null, 2), "utf8");
  await vscode.workspace.fs.writeFile(notebookUri, content);

  // Open with Datalayer custom editor
  await vscode.commands.executeCommand(
    "vscode.openWith",
    notebookUri,
    "datalayer.jupyter-notebook",
  );

  return notebookUri;
}

/**
 * Internal function to create a REMOTE/CLOUD notebook.
 * NOT exposed to Copilot - called by CreateNotebookTool.
 *
 * @param notebookName - Name of the notebook
 * @param description - Optional description
 * @param spaceName - Optional space name (defaults to "Personal")
 * @returns Notebook URI
 * @internal
 */
export async function _createRemoteNotebook(
  notebookName: string,
  description?: string,
  spaceName?: string,
): Promise<vscode.Uri> {
  // Get service container for SDK access
  const services = getServiceContainer();
  const sdk = services.sdk;
  const authProvider = services.authProvider;

  // Check authentication
  if (!authProvider.isAuthenticated()) {
    throw new Error("Not authenticated. Please login to Datalayer first.");
  }

  // Find the target space
  const spaces = await sdk.getMySpaces();
  if (!spaces || spaces.length === 0) {
    throw new Error("No spaces available. Please create a space first.");
  }

  // Find space by name or use Library space as default
  const targetSpaceName = spaceName || "Library space";
  const targetSpace = spaces.find(
    (s) =>
      s.name?.toLowerCase() === targetSpaceName.toLowerCase() ||
      s.name?.toLowerCase().includes(targetSpaceName.toLowerCase()),
  );

  if (!targetSpace) {
    const availableSpaces = spaces.map((s) => s.name).join(", ");
    throw new Error(
      `Space "${targetSpaceName}" not found. Available spaces: ${availableSpaces}`,
    );
  }

  // Ensure notebook name has .ipynb extension
  const finalNotebookName = notebookName.endsWith(".ipynb")
    ? notebookName
    : `${notebookName}.ipynb`;

  // Call SDK to create notebook
  const notebook = await sdk.createNotebook(
    targetSpace.uid,
    finalNotebookName,
    description || "",
  );

  if (!notebook) {
    throw new Error("Failed to create notebook");
  }

  // Construct Datalayer URI
  const notebookUri = vscode.Uri.parse(
    `datalayer:/${targetSpace.uid}/${finalNotebookName}`,
  );

  // Open the notebook in editor with Datalayer custom editor
  await vscode.commands.executeCommand(
    "vscode.openWith",
    notebookUri,
    "datalayer.jupyter-notebook",
  );

  return notebookUri;
}
