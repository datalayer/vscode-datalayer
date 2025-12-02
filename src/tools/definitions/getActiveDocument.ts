/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool definition: Get active document URI and filename
 * Supports both Lexical and Notebook documents
 *
 * NOTE: This tool is VS Code-specific and doesn't follow the standard
 * core operation pattern since it directly accesses VS Code API.
 *
 * IMPORTANT: This tool should be called FIRST before any document operations
 * to identify which document the agent should act on.
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

export const getActiveDocumentTool: ToolDefinition = {
  name: "datalayer_getActiveDocument",
  displayName: "Get Active Document",
  toolReferenceName: "getActiveDocument",
  description:
    "**CRITICAL: Always call this tool FIRST before running ANY operation on Jupyter Notebooks (.ipynb) or Lexical documents (.lexical).** Returns the URI and filename of the currently active document in VS Code. This tool identifies which document is active so subsequent operations know which document to act on. Returns: document URI (required for all operations), filename, and type (notebook/lexical/other). Use this whenever the user asks to perform an action on 'this notebook', 'this file', 'current document', or before executing any document operations like readAllCells, readAllBlocks, executeCode, etc.",

  parameters: {
    type: "object",
    properties: {},
    required: [],
  },

  operation: "getActiveDocument", // NOTE: This maps to VS Code-specific implementation, not core operation

  config: {
    requiresConfirmation: false, // Read-only operation
    canBeReferencedInPrompt: true,
    priority: "high", // Must be called first
  },

  tags: ["document", "active", "uri", "prerequisite"],
};
