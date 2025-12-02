/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

/**
 * List Kernels Tool Definition
 *
 * Lists all available kernels including local Jupyter kernels and cloud Datalayer runtimes.
 */
export const listKernelsTool: ToolDefinition = {
  name: "datalayer_listKernels",
  displayName: "List Kernels",
  toolReferenceName: "listKernels",
  description:
    "Lists all available kernels for executing notebook code. Returns both local Jupyter kernels (Python) and cloud Datalayer runtimes. Use this to discover available compute environments before selecting one.",

  parameters: {
    type: "object",
    properties: {
      includeLocal: {
        type: "boolean",
        description:
          "Include local Jupyter kernels in the results (default: true)",
      },
      includeCloud: {
        type: "boolean",
        description:
          "Include cloud Datalayer runtimes in the results (default: true)",
      },
      filter: {
        type: "string",
        description:
          "Optional filter to narrow results by kernel name or language (e.g., 'python', 'julia')",
      },
    },
    required: [],
  },

  operation: "listKernels",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["kernel", "runtime", "list", "discover"],
};
