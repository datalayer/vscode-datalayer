/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Create REMOTE/CLOUD Lexical Document
 *
 * Creates a new Lexical document in the CLOUD (Datalayer space) and opens it
 * with the Datalayer Lexical Editor. The document is stored in Datalayer cloud
 * and can be accessed from any device.
 *
 * Use this when the user specifically requests a REMOTE or CLOUD lexical document.
 *
 * Example usage in Copilot:
 * "Create a remote lexical document"
 * "Create a cloud lexical doc called notes"
 * "Make me a remote datalayer lexical document named meeting-notes"
 * "Create a lexical document in the cloud"
 * "Create a lexical document in my Datalayer space"
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../extension";

interface ICreateRemoteLexicalParameters {
  lexical_name: string;
  description?: string;
  space_name?: string;
}

/**
 * Tool for creating Lexical documents in the CLOUD (Datalayer spaces).
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * IMPORTANT: Use this tool ONLY when user explicitly says "remote" or "cloud" or "Datalayer space".
 * Do NOT use this for general lexical document creation - use CreateLocalLexicalTool for local documents.
 *
 * Key behavior:
 * - Creates lexical document in CLOUD (Datalayer platform, not local disk)
 * - Requires authentication
 * - Opens with Datalayer Lexical Editor
 * - Uses default (Personal) space if not specified
 * - Syncs across devices
 *
 * Copilot will intelligently:
 * - Extract lexical_name from user's request (e.g., "meeting notes" → "meeting-notes.lexical")
 * - Generate description from context (e.g., "for team collaboration")
 * - Default to "Personal" space if space_name not specified
 */
export class CreateRemoteLexicalTool
  implements vscode.LanguageModelTool<ICreateRemoteLexicalParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateRemoteLexicalParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { lexical_name, description, space_name } = options.input;

    return {
      invocationMessage: `Creating remote cloud lexical document "${lexical_name}"`,
      confirmationMessages: {
        title: "Create Remote Cloud Lexical Document",
        message: new vscode.MarkdownString(
          `Create **cloud** lexical document **${lexical_name}**${description ? ` (${description})` : ""} in ${space_name || "Personal"} space?\n\n(Stored in Datalayer cloud, not local disk)`,
        ),
      },
    };
  }

  /**
   * Executes the tool - creates a remote lexical document in the specified Datalayer space.
   * Returns the document URI for opening in the editor.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ICreateRemoteLexicalParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { lexical_name, description, space_name } = options.input;

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

      // Ensure lexical name has .lexical extension
      const finalLexicalName = lexical_name.endsWith(".lexical")
        ? lexical_name
        : `${lexical_name}.lexical`;

      // Call SDK to create lexical document
      const lexical = await sdk.createLexical(
        targetSpace.uid,
        finalLexicalName,
        description || "", // Use provided description or empty string
      );

      if (!lexical) {
        throw new Error("Failed to create lexical document");
      }

      // Construct Datalayer URI
      const lexicalUri = vscode.Uri.parse(
        `datalayer:/${targetSpace.uid}/${finalLexicalName}`,
      );

      // Open the lexical document in editor with Datalayer custom editor
      await vscode.commands.executeCommand(
        "vscode.openWith",
        lexicalUri,
        "datalayer.lexical-editor",
      );

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Remote lexical document "${finalLexicalName}" created successfully in "${targetSpace.name}" space.\n\n` +
            `Document ID: ${lexical.uid}\n` +
            (description ? `Description: ${description}\n` : "") +
            `Opened in editor.`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create remote lexical document: ${errorMessage}`,
      );
    }
  }
}
