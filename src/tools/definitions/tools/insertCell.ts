/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Insert Cell Tool Definition
 *
 * @module tools/definitions/tools/insertCell
 */

import type { ToolDefinition } from "../schema";

/**
 * Insert Cell Tool Definition
 *
 * Unified definition for the insertCell tool that works across
 * VS Code, SaaS, and ag-ui platforms.
 */
export const insertCellTool: ToolDefinition = {
  name: "datalayer_insertCell",
  displayName: "Insert Notebook Cell",
  toolReferenceName: "insertCell",
  description:
    "Inserts a code or markdown cell into a Jupyter notebook at a specified position or at the end",

  parameters: {
    type: "object",
    properties: {
      cell_type: {
        type: "string",
        enum: ["code", "markdown"],
        description:
          "Type of cell to insert: 'code' for executable Python code or 'markdown' for formatted text",
      },
      cell_source: {
        type: "string",
        description: "Content of the cell (Python code or Markdown text)",
      },
      cell_index: {
        type: "number",
        description:
          "Optional: Position where the cell should be inserted (0-based index). If not provided, inserts at the end.",
      },
      notebook_uri: {
        type: "string",
        description:
          "Optional: Document identifier (VS Code: URI, SaaS: DOM ref). If not provided, uses the active notebook editor.",
        platformSpecific: true,
      },
    },
    required: ["cell_type", "cell_source"],
  },

  operation: "insertCell",

  platformConfig: {
    vscode: {
      confirmationMessage:
        "Insert **{{cell_type}}** cell into notebook?\n\n```\n{{cell_source}}\n```",
      invocationMessage: "Inserting {{cell_type}} cell into notebook",
      canBeReferencedInPrompt: true,
    },
    saas: {
      enablePreview: true,
      requiresConfirmation: false,
    },
    agui: {
      requiresConfirmation: true,
      priority: "high",
    },
  },

  tags: ["cell", "notebook", "manipulation", "create"],
};
