/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code-specific tool: Get active document content
 * This tool directly accesses VS Code API and is not part of the core operations
 */

import * as vscode from "vscode";
import { formatResponse } from "@datalayer/jupyter-react";

export interface ActiveDocumentResult {
  success: boolean;
  type: "lexical" | "notebook" | "other" | "none";
  uri?: string;
  fileName?: string;
  content?: string;
  error?: string;
}

/**
 * Get the currently active document's content and metadata
 * Works with Lexical, Notebook, and other file types
 */
export async function getActiveDocument(): Promise<ActiveDocumentResult> {
  console.log("[Datalayer getActiveDocument] Tool invoked");

  try {
    // Always check tab groups first since Datalayer uses custom webview editors
    console.log(
      "[Datalayer getActiveDocument] Checking tab groups for custom editors",
    );
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    let uri: vscode.Uri | undefined;

    if (activeTab?.input) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = activeTab.input as any;

      // Check for custom editor (Lexical or Notebook)
      if ("uri" in input && input.uri instanceof vscode.Uri) {
        uri = input.uri;
        console.log(
          "[Datalayer getActiveDocument] Found custom editor:",
          uri!.toString(),
        );
      }
    }

    if (!uri) {
      console.log("[Datalayer getActiveDocument] No active editor found");
      return {
        success: true,
        type: "none",
        error: "No active editor",
      };
    }

    // Get document - handle notebooks and lexical documents via internal commands
    const fileName = uri.path.split("/").pop() || "";
    const uriString = uri.toString();
    let content: string;
    let type: "lexical" | "notebook" | "other" = "other";

    if (fileName.endsWith(".ipynb")) {
      // Datalayer notebook - use internal commands (always from webview, never from disk)
      type = "notebook";

      try {
        const cells = await vscode.commands.executeCommand<
          Array<{
            id: string;
            cell_type: string;
            source: string;
            outputs?: Record<string, unknown>[];
          }>
        >("datalayer.internal.notebook.getCells", {
          uri: uriString,
        });

        // Format as simplified notebook JSON (no nbformat metadata, just cells)
        content = JSON.stringify(
          {
            cells,
            metadata: {},
          },
          null,
          2,
        );
      } catch (error) {
        return {
          success: false,
          type: "notebook",
          error: `Failed to read Datalayer notebook: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } else if (fileName.endsWith(".lexical")) {
      // Datalayer lexical document - use internal commands (always from webview, never from disk)
      type = "lexical";

      try {
        const blocks = await vscode.commands.executeCommand<
          Array<{
            block_id: string;
            block_type: string;
            source: string;
            metadata?: Record<string, unknown>;
          }>
        >("datalayer.internal.lexical.getBlocks", {
          uri: uriString,
        });

        content = JSON.stringify(
          {
            blocks: blocks.map((block) => ({
              id: block.block_id,
              type: block.block_type,
              source: block.source,
              metadata: block.metadata,
            })),
          },
          null,
          2,
        );
      } catch (error) {
        return {
          success: false,
          type: "lexical",
          error: `Failed to read Datalayer lexical document: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } else {
      // Other file type - not supported for custom editors
      return {
        success: false,
        type: "other",
        error:
          "Unsupported document type - only .ipynb and .lexical are supported",
      };
    }

    const result = {
      success: true,
      type,
      uri: uriString,
      fileName,
      content,
    };

    console.log("[Datalayer getActiveDocument] Result:", {
      type,
      fileName,
      contentLength: content.length,
    });

    return result;
  } catch (error) {
    console.error("[Datalayer getActiveDocument] Error:", error);
    return {
      success: false,
      type: "none",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * VS Code Language Model Tool implementation for getActiveDocument
 */
export const getActiveDocumentTool: vscode.LanguageModelTool<
  Record<string, never>
> = {
  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    console.log(
      "[Datalayer getActiveDocument] LanguageModelTool.invoke() called by Copilot",
    );

    const result = await getActiveDocument();

    // Read response format from VS Code configuration
    const responseFormat = vscode.workspace
      .getConfiguration("datalayer.tools")
      .get<string>("responseFormat", "toon") as "json" | "toon";

    // If TOON format is requested, restructure to avoid stringified content
    let processedResult: unknown = result;
    if (responseFormat === "toon" && result.content) {
      try {
        // Parse the JSON string content and merge it into the result
        const contentObj = JSON.parse(result.content);
        // Replace the stringified content with the actual object
        // This makes TOON format expand it inline instead of as a string
        processedResult = {
          success: result.success,
          type: result.type,
          uri: result.uri,
          fileName: result.fileName,
          ...contentObj, // Merge cells/blocks/metadata directly
        };
      } catch (e) {
        // If parsing fails, keep original structure
        console.warn(
          "[Datalayer getActiveDocument] Failed to parse content as JSON:",
          e,
        );
        processedResult = result;
      }
    }

    // Format the response based on user preference
    const formattedResult = formatResponse(processedResult, responseFormat);
    const resultString =
      typeof formattedResult === "string"
        ? formattedResult
        : JSON.stringify(formattedResult, null, 2);

    console.log(
      "[Datalayer getActiveDocument] Returning to Copilot:",
      resultString,
    );

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(resultString),
    ]);
  },
};

/**
 * Test command to manually invoke the tool and show the output
 * Useful for debugging without needing Copilot
 */
export async function testGetActiveDocument(): Promise<void> {
  console.log("[Datalayer getActiveDocument] TEST COMMAND invoked");

  const result = await getActiveDocument();
  const resultJson = JSON.stringify(result, null, 2);

  // Show in output channel
  const outputChannel = vscode.window.createOutputChannel(
    "Datalayer Active Document Test",
  );
  outputChannel.clear();
  outputChannel.appendLine("=== Get Active Document Tool Test ===");
  outputChannel.appendLine("");
  outputChannel.appendLine(resultJson);
  outputChannel.appendLine("");
  outputChannel.appendLine("=== Content Preview (first 500 chars) ===");
  if (result.content) {
    outputChannel.appendLine(result.content.substring(0, 500));
    if (result.content.length > 500) {
      outputChannel.appendLine(
        `\n... (${result.content.length - 500} more characters)`,
      );
    }
  }
  outputChannel.show();

  // Also show as info message
  vscode.window
    .showInformationMessage(
      `Active Document: ${result.fileName || "None"} (${result.type})`,
      "Show Details",
    )
    .then((selection) => {
      if (selection === "Show Details") {
        outputChannel.show();
      }
    });
}
