/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";
import { zodToToolParameters } from "@datalayer/jupyter-react/lib/tools/core/zodUtils";
import { selectKernelParamsSchema } from "../schemas/selectKernel";

/**
 * Select Kernel Tool Definition
 *
 * Selects and connects a kernel to the active document (notebook or lexical) for code execution.
 * Always connects to the currently active document.
 */
export const selectKernelTool: ToolDefinition = {
  name: "datalayer_selectKernel",
  displayName: "Select Kernel",
  toolReferenceName: "selectKernel",
  description:
    "Selects and connects a kernel to the active document (notebook or lexical), enabling code execution. " +
    "Always connects to the currently active document. " +
    "EXAMPLES OF NATURAL LANGUAGE TO PARAMETER MAPPING: " +
    "User says 'connect to new runtime' → use kernelId: 'new'. " +
    "User says 'connect to active runtime' → use kernelId: 'active'. " +
    "User says 'connect to local ipykernel' → use kernelId: 'local'. " +
    "User says 'connect to gpu runtime for 10 minutes' → use kernelId: 'new', environmentType: 'GPU', durationMinutes: 10. " +
    "The kernelId parameter is REQUIRED and must be specified for every invocation.",

  parameters: zodToToolParameters(selectKernelParamsSchema),

  operation: "selectKernel",

  config: {
    requiresConfirmation: false,
    canBeReferencedInPrompt: true,
    priority: "high",
  },

  tags: [
    "kernel",
    "runtime",
    "select",
    "connect",
    "switch",
    "attach",
    "ipykernel",
    "python",
  ],
};
