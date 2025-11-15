/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Delete Cell Tool Definition
 *
 * @module tools/definitions/tools/deleteCell
 */

import type { ToolDefinition } from "../schema";

export const deleteCellTool: ToolDefinition = {
  name: "datalayer_deleteCell",
  displayName: "Delete Notebook Cell",
  toolReferenceName: "deleteCell",
  description: "Deletes a cell from a Jupyter notebook at the specified index",

  parameters: {
    type: "object",
    properties: {
      cell_index: {
        type: "number",
        description: "Index of the cell to delete (0-based)",
      },
      notebook_uri: {
        type: "string",
        description:
          "Optional: Document identifier. If not provided, uses the active notebook.",
        platformSpecific: true,
      },
    },
    required: ["cell_index"],
  },

  operation: "deleteCell",

  platformConfig: {
    vscode: {
      confirmationMessage: "Delete cell at index **{{cell_index}}**?",
      invocationMessage: "Deleting cell {{cell_index}}",
      canBeReferencedInPrompt: true,
    },
    saas: {
      requiresConfirmation: true,
      confirmationMessage: "Are you sure you want to delete this cell?",
    },
    agui: {
      requiresConfirmation: true,
      priority: "medium",
    },
  },

  tags: ["cell", "notebook", "manipulation", "delete"],
};
