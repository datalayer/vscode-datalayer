/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

export const createNotebookTool: ToolDefinition = {
  name: "datalayer_createNotebook",
  displayName: "Create Notebook",
  toolReferenceName: "createNotebook",
  description:
    "Creates a new Jupyter notebook with smart location detection. Automatically determines whether to create locally or in cloud based on context (keywords, open notebooks, space mentions, auth state). Use keywords like 'cloud', 'remote', 'space' for cloud notebooks, or 'local', 'workspace' for local notebooks.",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Name of the notebook (e.g., 'data-analysis' or 'analysis.ipynb'). Extension '.ipynb' is added automatically if missing.",
      },
      description: {
        type: "string",
        description:
          "Optional: Description of the notebook's purpose (e.g., 'for analyzing sales data')",
      },
      space: {
        type: "string",
        description:
          "Optional: Name of the Datalayer cloud space (e.g., 'Personal', 'Team Project'). If specified, notebook will be created in cloud. Defaults to 'Personal' if not specified.",
      },
      location: {
        type: "string",
        enum: ["local", "cloud"],
        description:
          "Optional: Explicit location override. Use 'local' for workspace or 'cloud' for Datalayer space. If not specified, location is auto-detected from context.",
      },
    },
    required: ["name"],
  },

  operation: "createNotebook",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["notebook", "create", "smart", "unified"],
};
