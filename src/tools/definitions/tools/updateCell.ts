/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Update Cell Tool Definition
 *
 * @module tools/definitions/tools/updateCell
 */

import type { ToolDefinition } from "../schema";

export const updateCellTool: ToolDefinition = {
  name: "datalayer_updateCell",
  displayName: "Update Notebook Cell",
  toolReferenceName: "updateCell",
  description:
    "Updates (overwrites) a cell's source code at the specified index. Does NOT execute the cell.",

  parameters: {
    type: "object",
    properties: {
      cell_index: {
        type: "number",
        description: "Index of the cell to update (0-based)",
      },
      cell_source: {
        type: "string",
        description: "New source code for the cell",
      },
      notebook_uri: {
        type: "string",
        description:
          "Optional: Document identifier. If not provided, uses the active notebook.",
        platformSpecific: true,
      },
    },
    required: ["cell_index", "cell_source"],
  },

  operation: "updateCell",

  platformConfig: {
    vscode: {
      confirmationMessage:
        "Update cell at index **{{cell_index}}**?\n\n```\n{{cell_source}}\n```",
      invocationMessage: "Updating cell {{cell_index}}",
      canBeReferencedInPrompt: true,
    },
    saas: {
      enablePreview: true,
      requiresConfirmation: false,
    },
    agui: {
      requiresConfirmation: false,
      priority: "medium",
    },
  },

  tags: ["cell", "notebook", "manipulation", "update"],
};
