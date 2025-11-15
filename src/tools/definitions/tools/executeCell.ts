/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "../schema";

export const executeCellTool: ToolDefinition = {
  name: "datalayer_executeCell",
  displayName: "Execute Notebook Cell",
  toolReferenceName: "executeCell",
  description:
    "Executes a code cell in a Jupyter notebook and returns its outputs",

  parameters: {
    type: "object",
    properties: {
      cell_index: {
        type: "number",
        description:
          "Index of the cell to execute (0-based, must be a code cell)",
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

  operation: "executeCell",

  platformConfig: {
    vscode: {
      confirmationMessage: "Execute cell at index **{{cell_index}}**?",
      invocationMessage: "Executing cell {{cell_index}}",
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

  tags: ["cell", "notebook", "execute", "run"],
};

export const getNotebookInfoTool: ToolDefinition = {
  name: "datalayer_getNotebookInfo",
  displayName: "Get Notebook Info",
  toolReferenceName: "getNotebookInfo",
  description:
    "Gets metadata about a Jupyter notebook including path, cell counts, and kernel information",

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

  operation: "getNotebookInfo",

  platformConfig: {
    vscode: {
      confirmationMessage: "Get notebook information?",
      invocationMessage: "Getting notebook info",
      canBeReferencedInPrompt: true,
    },
    saas: {
      requiresConfirmation: false,
    },
    agui: {
      requiresConfirmation: false,
      priority: "medium",
    },
  },

  tags: ["notebook", "metadata", "info", "inspect"],
};
