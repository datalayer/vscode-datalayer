/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

export const createLexicalTool: ToolDefinition = {
  name: "datalayer_createLexical",
  displayName: "Create Lexical Document",
  toolReferenceName: "createLexical",
  description:
    "Creates a new Lexical document with smart location detection. Automatically determines whether to create locally or in cloud based on context (keywords, open documents, space mentions, auth state). Use keywords like 'cloud', 'remote', 'space' for cloud documents, or 'local', 'workspace' for local documents.",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Name of the lexical document (e.g., 'meeting-notes' or 'notes.lexical'). Extension '.lexical' is added automatically if missing.",
      },
      description: {
        type: "string",
        description:
          "Optional: Description of the document's purpose (e.g., 'for team meeting notes')",
      },
      space: {
        type: "string",
        description:
          "Optional: Name of the Datalayer cloud space (e.g., 'Personal', 'Team Project'). If specified, document will be created in cloud. Defaults to 'Personal' if not specified.",
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

  operation: "createLexical",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["lexical", "create", "smart", "unified"],
};
