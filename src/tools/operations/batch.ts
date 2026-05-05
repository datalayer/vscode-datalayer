/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Batch operation stub for the VS Code / Copilot tool path.
 *
 * The full batch execution logic lives in `src/mcp/mcpServer.ts` because it
 * needs direct access to the combined operations registry, tool definitions,
 * and `ServiceContainer` (for per-sub-op document resolution via
 * `buildMcpExecutionContext`). Those are available as closure variables in
 * `buildMcpServer()` but cannot be threaded cleanly through
 * `ToolExecutionContext.extras` without coupling every operation to the MCP
 * layer.
 *
 * This stub satisfies the `CombinedOperations` registry and the
 * `validateToolDefinitions` check so the `datalayer_batch` tool definition
 * maps to a valid operation name on both the Copilot and MCP paths.
 *
 * On the Copilot / VS Code LM API path the stub returns a clear error asking
 * the caller to use the MCP path instead (Cascade/Windsurf), since batch
 * execution requires the MCP server's per-request context machinery.
 */

import type {
  ToolExecutionContext,
  ToolOperation,
} from "@datalayer/jupyter-react";

/** Input type for the batch operation. */
export interface BatchParams {
  operations: Array<{ tool: string; params?: Record<string, unknown> }>;
  notebook_uri?: string;
  documentUri?: string;
  stopOnError?: boolean;
}

/**
 * Batch operation stub.
 *
 * Real execution is handled by the MCP server's `datalayer_batch` handler.
 * This stub exists so that `validateToolDefinitions` passes and the tool is
 * visible in the VS Code tool registry.
 */
export const batchOperation: ToolOperation<BatchParams, unknown> = {
  name: "batch",

  async execute(
    _params: BatchParams,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    return {
      error:
        "datalayer_batch is only available via the Datalayer MCP server (Windsurf/Cascade). " +
        "Use individual tools (datalayer_readAllCells, datalayer_insertCell, etc.) when calling " +
        "through the VS Code Copilot tool path.",
    };
  },
};
