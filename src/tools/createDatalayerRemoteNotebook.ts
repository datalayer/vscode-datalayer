/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Create REMOTE/CLOUD Notebook
 *
 * Creates a new Jupyter notebook in the CLOUD (Datalayer space) and opens it
 * with the Datalayer Notebook Editor. The notebook is stored in Datalayer cloud
 * and can be accessed from any device.
 *
 * Use this when the user specifically requests a REMOTE or CLOUD notebook.
 *
 * Example usage in Copilot:
 * "Create a remote notebook"
 * "Create a cloud notebook called analysis"
 * "Make me a remote datalayer notebook named ml-model"
 * "Create a notebook in the cloud"
 * "Create a notebook in my Datalayer space"
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../extension";

interface ICreateDatalayerRemoteNotebookParameters {
  notebook_name: string;
  description?: string;
  space_name?: string;
}

/**
 * Tool for creating Jupyter notebooks in the CLOUD (Datalayer spaces).
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * IMPORTANT: Use this tool ONLY when user explicitly says "remote" or "cloud" or "Datalayer space".
 * Do NOT use this for general notebook creation - use CreateDatalayerLocalNotebookTool for local notebooks.
 *
 * Key behavior:
 * - Creates notebook in CLOUD (Datalayer platform, not local disk)
 * - Requires authentication
 * - Opens with Datalayer custom editor
 * - Uses default (Personal) space if not specified
 * - Syncs across devices
 *
 * Copilot will intelligently:
 * - Extract notebook_name from user's request (e.g., "data analysis" → "data-analysis.ipynb")
 * - Generate description from context (e.g., "for analyzing sales data")
 * - Default to "Personal" space if space_name not specified
 */
export class CreateDatalayerRemoteNotebookTool
  implements vscode.LanguageModelTool<ICreateDatalayerRemoteNotebookParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateDatalayerRemoteNotebookParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { notebook_name, description, space_name } = options.input;

    return {
      invocationMessage: `Creating remote cloud notebook "${notebook_name}"`,
      confirmationMessages: {
        title: "Create Remote Cloud Notebook",
        message: new vscode.MarkdownString(
          `Create **cloud** notebook **${notebook_name}**${description ? ` (${description})` : ""} in ${space_name || "Personal"} space?\n\n(Stored in Datalayer cloud, not local disk)`,
        ),
      },
    };
  }

  /**
   * Executes the tool - creates a remote notebook in the specified Datalayer space.
   * Returns the notebook URI for opening in the editor.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ICreateDatalayerRemoteNotebookParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { notebook_name, description, space_name } = options.input;

    try {
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

      // Find space by name or use Personal space as default
      const targetSpaceName = space_name || "Personal";
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
      const finalNotebookName = notebook_name.endsWith(".ipynb")
        ? notebook_name
        : `${notebook_name}.ipynb`;

      // Call SDK to create notebook
      const notebook = await sdk.createNotebook(
        targetSpace.uid,
        finalNotebookName,
        description || "", // Use provided description or empty string
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

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Remote notebook "${finalNotebookName}" created successfully in "${targetSpace.name}" space.\n\n` +
            `Notebook ID: ${notebook.uid}\n` +
            (description ? `Description: ${description}\n` : "") +
            `Opened in editor.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create remote notebook: ${errorMessage}`);
    }
  }
}
