/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

/**
 * Start Runtime Tool Definition
 *
 * Starts a new Datalayer compute runtime for executing notebook code.
 */
export const startRuntimeTool: ToolDefinition = {
  name: "datalayer_startRuntime",
  displayName: "Start Runtime",
  toolReferenceName: "startRuntime",
  description:
    "Starts a new Datalayer compute runtime (kernel environment) for executing code in notebooks. Creates a cloud-based Python/R/Julia environment with specified duration. Requires Datalayer authentication.",

  parameters: {
    type: "object",
    properties: {
      environment: {
        type: "string",
        description:
          "Optional: Environment name (e.g., 'python-3.11', 'r-4.3', 'julia-1.9'). If not specified, uses the first available environment.",
      },
      durationMinutes: {
        type: "number",
        description:
          "Optional: Runtime duration in minutes (default: 10). Runtime will auto-terminate after this period.",
      },
    },
    required: [],
  },

  operation: "startRuntime",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["runtime", "kernel", "compute", "start"],
};

/**
 * Connect Runtime Tool Definition
 *
 * Connects an existing runtime to a notebook for code execution.
 */
export const connectRuntimeTool: ToolDefinition = {
  name: "datalayer_connectRuntime",
  displayName: "Connect Runtime",
  toolReferenceName: "connectRuntime",
  description:
    "Connects an existing Datalayer runtime to a notebook, enabling code execution. Use this after starting a runtime or to reconnect to an existing runtime.",

  parameters: {
    type: "object",
    properties: {
      runtimeName: {
        type: "string",
        description:
          "Name of the runtime to connect (e.g., 'my-runtime-abc123'). Get runtime names from the runtimes tree view or startRuntime response.",
      },
      notebookUri: {
        type: "string",
        description:
          "Optional: URI of the notebook to connect (e.g., 'datalayer://notebook/123'). If not specified, connects to the active notebook.",
      },
    },
    required: ["runtimeName"],
  },

  operation: "connectRuntime",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: ["runtime", "kernel", "compute", "connect"],
};
