/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool definition: List all open Datalayer documents
 *
 * Returns every notebook and lexical document currently registered with the
 * Datalayer editor, sorted by most-recently-used first. Provides the URIs
 * needed to target a specific document via the `notebook_uri` / `documentUri`
 * parameter on cell and block tools.
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

/** Tool definition for listing all open Datalayer documents. */
export const listOpenDocumentsTool: ToolDefinition = {
  name: "datalayer_listOpenDocuments",
  displayName: "List Open Documents",
  toolReferenceName: "listOpenDocuments",
  description:
    "Returns all Jupyter notebooks and Datalayer lexical documents currently open in the Datalayer editor, sorted by most-recently-used first. " +
    "Use this to discover available document URIs when multiple notebooks are open. " +
    "Pass the returned `uri` as `notebook_uri` in notebook cell tools (readAllCells, updateCell, runCell, etc.) " +
    "or as `documentUri` in lexical block tools to target a specific document directly, " +
    "without requiring it to be the active VS Code tab.",

  parameters: {
    type: "object",
    properties: {},
    required: [],
  },

  operation: "listOpenDocuments",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["document", "list", "prerequisite", "notebook", "lexical"],
};
