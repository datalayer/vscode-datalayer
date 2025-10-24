/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "../schema";

export const createRemoteNotebookTool: ToolDefinition = {
  name: "datalayer_createRemoteNotebook",
  displayName: "Create Remote Notebook",
  toolReferenceName: "createRemoteNotebook",
  description:
    "Creates a new Jupyter notebook in a Datalayer cloud space. Intelligently generates notebook name and description from user's request. Defaults to 'Personal' space if not specified.",

  parameters: {
    type: "object",
    properties: {
      notebook_name: {
        type: "string",
        description:
          "Name of the notebook (Copilot generates from request, e.g., 'data analysis' → 'data-analysis.ipynb'). Extension '.ipynb' is added automatically if missing.",
      },
      description: {
        type: "string",
        description:
          "Optional: Description of the notebook's purpose (Copilot generates from request context, e.g., 'for analyzing sales data')",
      },
      space_name: {
        type: "string",
        description:
          "Optional: Name of the Datalayer space (e.g., 'Personal', 'Team Project'). Defaults to 'Personal' if not specified.",
      },
    },
    required: ["notebook_name"],
  },

  operation: "createRemoteNotebook",

  platformConfig: {
    vscode: {
      confirmationMessage:
        "Create **cloud** notebook **{{notebook_name}}** in {{space_name}} space?\n\n(Stored in Datalayer cloud, not local disk)",
      invocationMessage: 'Creating remote notebook "{{notebook_name}}"',
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

  tags: ["notebook", "create", "remote", "cloud"],
};

export const createLocalNotebookTool: ToolDefinition = {
  name: "datalayer_createLocalNotebook",
  displayName: "Create Local Notebook",
  toolReferenceName: "createLocalNotebook",
  description:
    "Creates a new local Jupyter notebook file in the current workspace. The notebook will be saved to disk and opened in the editor.",

  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description:
          "Optional: Name of the notebook file (e.g., 'analysis.ipynb'). If not provided, an auto-generated name will be used.",
      },
    },
    required: [],
  },

  operation: "createLocalNotebook",

  platformConfig: {
    vscode: {
      confirmationMessage: 'Create local notebook "{{filename}}"?',
      invocationMessage: "Creating local notebook",
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

  tags: ["notebook", "create", "local"],
};
