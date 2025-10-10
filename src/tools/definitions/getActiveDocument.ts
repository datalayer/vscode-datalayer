/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool definition: Get active document content
 * Supports both Lexical and Notebook documents
 *
 * NOTE: This tool is VS Code-specific and doesn't follow the standard
 * core operation pattern since it directly accesses VS Code API.
 */

import type { ToolDefinition } from "../../datalayer-core/tools/definitions/schema";

export const getActiveDocumentTool: ToolDefinition = {
  name: "datalayer_getActiveDocument",
  displayName: "Get Active Document",
  toolReferenceName: "getActiveDocument",
  description:
    "**IMPORTANT: Call this tool FIRST when the user is viewing a .ipynb or .lexical file in VS Code.** Returns the complete content of custom editor documents (Jupyter Notebooks and Lexical documents) that are NOT visible through normal VS Code text editor APIs. Standard file reading will NOT work for these custom editors - you MUST use this tool. Returns: full document content (JSON structure with cells/nodes), file name, URI, type (notebook/lexical/other), scheme, and line count. Use this whenever the user asks about 'this notebook', 'this file', 'current document', or any question that requires seeing the content of an open .ipynb or .lexical file.",

  parameters: {
    type: "object",
    properties: {},
    required: [],
  },

  operation: "getActiveDocument", // NOTE: This maps to VS Code-specific implementation, not core operation

  platformConfig: {
    vscode: {
      // No confirmation needed - read-only operation
      confirmationMessage: undefined,
    },
    saas: {
      enablePreview: false, // Not applicable - VS Code only
    },
    agui: {
      requiresConfirmation: false,
    },
  },
};
