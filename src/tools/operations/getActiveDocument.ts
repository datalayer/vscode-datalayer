/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code-specific tool: Get active document URI and filename
 * This tool directly accesses VS Code API and is not part of the core operations
 */

import { getActiveCustomEditorUri } from "../../utils/activeDocument";

/**
 * Result of detecting the active document in VS Code, including its type and URI.
 */
export interface ActiveDocumentResult {
  success: boolean;
  type: "lexical" | "notebook" | "other" | "none";
  uri?: string;
  fileName?: string;
  error?: string;
}

/**
 * Gets the currently active document's URI and filename.
 * Works with Lexical, Notebook, and other file types.
 * @returns Active document info with type, URI, and filename.
 */
export async function getActiveDocument(): Promise<ActiveDocumentResult> {
  // eslint-disable-next-line no-console
  console.log("[Datalayer getActiveDocument] Tool invoked");

  try {
    // Check for active custom editor (lexical/notebook)
    // eslint-disable-next-line no-console
    console.log("[Datalayer getActiveDocument] Checking for custom editors");
    const uri = getActiveCustomEditorUri();

    if (!uri) {
      // eslint-disable-next-line no-console
      console.log("[Datalayer getActiveDocument] No active editor found");
      return {
        success: true,
        type: "none",
        error: "No active editor",
      };
    }

    // eslint-disable-next-line no-console
    console.log(
      "[Datalayer getActiveDocument] Found custom editor:",
      uri.toString(),
    );

    // Determine document type from filename
    const fileName = uri.path.split("/").pop() || "";
    const uriString = uri.toString();
    let type: "lexical" | "notebook" | "other" = "other";

    if (fileName.endsWith(".ipynb")) {
      type = "notebook";
    } else if (fileName.endsWith(".dlex") || fileName.endsWith(".lexical")) {
      type = "lexical";
    } else {
      // Other file type - not supported for custom editors
      return {
        success: false,
        type: "other",
        error:
          "Unsupported document type - only .ipynb and .dlex are supported",
      };
    }

    const result = {
      success: true,
      type,
      uri: uriString,
      fileName,
    };

    // eslint-disable-next-line no-console
    console.log("[Datalayer getActiveDocument] Result:", {
      type,
      fileName,
      uri: uriString,
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
 * Get Active Document Operation
 *
 * Standard ToolOperation that wraps the getActiveDocument helper function.
 * Uses the unified ToolOperation pattern for consistency with other tools.
 */
export const getActiveDocumentOperation: import("@datalayer/jupyter-react").ToolOperation<
  Record<string, never>,
  ActiveDocumentResult
> = {
  name: "getActiveDocument",

  async execute(
    _params: Record<string, never>,
    _context: import("@datalayer/jupyter-react").ToolExecutionContext,
  ): Promise<ActiveDocumentResult> {
    // eslint-disable-next-line no-console
    console.log("[Datalayer getActiveDocument] Operation execute() called");

    const result = await getActiveDocument();

    // eslint-disable-next-line no-console
    console.log("[Datalayer getActiveDocument] Returning result:", result);

    return result;
  },
};
