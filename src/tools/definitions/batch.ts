/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool definition: Batch execution of multiple Datalayer operations.
 *
 * Implements the Code Mode pattern (inspired by Cloudflare) where the LLM
 * plans a complete multi-step workflow upfront and sends it in one MCP call,
 * eliminating LLM round-trips between mechanical steps.
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

/** Tool definition for executing a batch of Datalayer operations. */
export const batchTool: ToolDefinition = {
  name: "datalayer_batch",
  displayName: "Batch Execute Operations",
  toolReferenceName: "batch",
  description:
    "Execute a sequence of Datalayer operations in one call without LLM round-trips between steps. Use this when you have already planned several mechanical steps (e.g. readAllCells → insertCell → runCell → readCell). Each operation runs in order; results are returned as an array. Pass `notebook_uri` or `documentUri` at the top level to target a specific document — these are forwarded to every sub-operation that supports them. Set `stopOnError` to false to continue executing remaining steps after a failure.",

  parameters: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        description:
          "Ordered list of operations to execute. Each item specifies the tool name (e.g. 'datalayer_readAllCells') and its params object.",
        items: {
          type: "object",
          properties: {
            tool: {
              type: "string",
              description:
                "Full tool name, e.g. 'datalayer_insertCell', 'datalayer_runCell', 'datalayer_readAllCells'.",
            },
            params: {
              type: "object",
              description:
                "Parameters for this tool, identical to calling it directly. notebook_uri and documentUri are inherited from the top-level batch params unless overridden here.",
            },
          },
          required: ["tool"],
        },
      },
      notebook_uri: {
        type: "string",
        description:
          "Optional URI of the target notebook. Forwarded to every cell sub-operation. Obtain from datalayer_listOpenDocuments or datalayer_getActiveDocument.",
      },
      documentUri: {
        type: "string",
        description:
          "Optional URI of the target Lexical document. Forwarded to every block sub-operation. Obtain from datalayer_listOpenDocuments or datalayer_getActiveDocument.",
      },
      stopOnError: {
        type: "boolean",
        description:
          "If true (default), stop executing remaining steps when one fails. If false, continue and report all errors in results.",
      },
    },
    required: ["operations"],
  },

  operation: "batch",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["batch", "notebook", "lexical"],
};
