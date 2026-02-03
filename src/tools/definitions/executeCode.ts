/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";

/**
 * Unified executeCode tool that works with both notebooks and lexical documents.
 *
 * This tool automatically detects the active document type and routes code execution
 * to the appropriate kernel. It eliminates the need for separate executeCode tools
 * for different document types, following the same document-agnostic pattern as
 * getActiveDocument.
 *
 * @module tools/definitions/executeCode
 */
export const executeCodeTool: ToolDefinition = {
  name: "datalayer_executeCode",
  displayName: "Execute Code",
  toolReferenceName: "executeCode",
  description:
    "Execute Python code. If a notebook or lexical document is open, uses that document's kernel. If no document is open but a Datalayer runtime is active, executes on that runtime. Returns execution result including output, errors, and display data.",

  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Python code to execute",
      },
    },
    required: ["code"],
  },

  operation: "executeCode", // VS Code-specific operation that delegates

  config: {
    requiresConfirmation: false, // Code execution requires user approval via VS Code UI
    canBeReferencedInPrompt: true,
  },

  tags: [
    "execute",
    "code",
    "python",
    "kernel",
    "runtime",
    "notebook",
    "lexical",
  ],
};
