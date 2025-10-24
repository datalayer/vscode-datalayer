/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Execute Cell Operation - Platform Agnostic
 *
 * @module tools/core/operations/executeCell
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";
import type { ExecutionResult } from "../types";

/**
 * Parameters for execute cell operation
 */
export interface ExecuteCellParams {
  /** Index of the cell to execute (0-based) */
  cellIndex: number;
}

/**
 * Result of execute cell operation
 */
export interface ExecuteCellResult {
  /** Success status */
  success: boolean;

  /** Cell index that was executed */
  index: number;

  /** Execution result (outputs, execution order, etc.) */
  execution: ExecutionResult;

  /** Message describing the result */
  message: string;
}

/**
 * Execute Cell Operation
 *
 * Executes a code cell at the specified index and returns the execution
 * result including outputs, success status, and execution order.
 *
 * Note: This only works for code cells. Attempting to execute a markdown
 * or raw cell will result in an error.
 *
 * @example
 * ```typescript
 * const result = await executeCellOperation.execute(
 *   { cellIndex: 0 },
 *   { document: documentHandle }
 * );
 * if (result.success) {
 *   console.log(`Execution order: ${result.execution.executionOrder}`);
 *   console.log(`Outputs:`, result.execution.outputs);
 * }
 * ```
 */
export const executeCellOperation: ToolOperation<
  ExecuteCellParams,
  ExecuteCellResult
> = {
  name: "executeCell",
  description: "Executes a code cell and returns its outputs",

  async execute(params, context): Promise<ExecuteCellResult> {
    const { cellIndex } = params;
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for executeCell operation. " +
          "Ensure the tool execution context includes a valid DocumentHandle.",
      );
    }

    try {
      // Validate index bounds
      const cellCount = await document.getCellCount();
      if (cellIndex < 0 || cellIndex >= cellCount) {
        throw new Error(
          `Cell index ${cellIndex} is out of bounds. ` +
            `Notebook has ${cellCount} cells (valid range: 0-${cellCount - 1})`,
        );
      }

      // Verify it's a code cell
      const cell = await document.getCell(cellIndex);
      if (cell.type !== "code") {
        throw new Error(
          `Cell at index ${cellIndex} is a ${cell.type} cell, not a code cell. ` +
            `Only code cells can be executed.`,
        );
      }

      // Execute the cell via platform-agnostic document handle
      const execution = await document.executeCell(cellIndex);

      // Return success result
      const statusEmoji = execution.success ? "✅" : "❌";
      const statusText = execution.success ? "succeeded" : "failed";

      return {
        success: execution.success,
        index: cellIndex,
        execution,
        message:
          `${statusEmoji} Cell ${cellIndex} execution ${statusText}` +
          (execution.executionOrder
            ? ` (execution order: ${execution.executionOrder})`
            : ""),
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute cell: ${errorMessage}`);
    }
  },
};
