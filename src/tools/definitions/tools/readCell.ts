/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "../schema";

export const readCellTool: ToolDefinition = {
  name: "datalayer_readCell",
  displayName: "Read Notebook Cell",
  toolReferenceName: "readCell",
  description:
    "Reads a specific cell from a Jupyter notebook by index, including source code and outputs",

  parameters: {
    type: "object",
    properties: {
      cell_index: {
        type: "number",
        description: "Index of the cell to read (0-based)",
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

  operation: "readCell",

  platformConfig: {
    vscode: {
      confirmationMessage: "Read cell at index **{{cell_index}}**?",
      invocationMessage: "Reading cell {{cell_index}}",
      canBeReferencedInPrompt: true,
    },
    saas: {
      requiresConfirmation: false,
    },
    agui: {
      requiresConfirmation: false,
      priority: "high",
    },
  },

  tags: ["cell", "notebook", "read", "inspect"],
};

export const readAllCellsTool: ToolDefinition = {
  name: "datalayer_readAllCells",
  displayName: "Read All Notebook Cells",
  toolReferenceName: "readAllCells",
  description:
    "Reads all cells from a Jupyter notebook, including source code and outputs for each cell",

  parameters: {
    type: "object",
    properties: {
      notebook_uri: {
        type: "string",
        description:
          "Optional: Document identifier. If not provided, uses the active notebook.",
        platformSpecific: true,
      },
    },
    required: [],
  },

  operation: "readAllCells",

  platformConfig: {
    vscode: {
      confirmationMessage: "Read all cells from notebook?",
      invocationMessage: "Reading all cells",
      canBeReferencedInPrompt: true,
    },
    saas: {
      requiresConfirmation: false,
    },
    agui: {
      requiresConfirmation: false,
      priority: "high",
    },
  },

  tags: ["cell", "notebook", "read", "inspect", "all"],
};
