/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Update Cell Operation - Platform Agnostic
 *
 * @module tools/core/operations/updateCell
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";

/**
 * Parameters for update cell operation
 */
export interface UpdateCellParams {
  /** Index of the cell to update (0-based) */
  cellIndex: number;

  /** New source code for the cell */
  cellSource: string;
}

/**
 * Result of update cell operation
 */
export interface UpdateCellResult {
  /** Success status */
  success: boolean;

  /** Index of the updated cell */
  index: number;

  /** Message describing the result */
  message: string;
}

/**
 * Update Cell Operation
 *
 * Updates (overwrites) a cell's source code at the specified index.
 * This operation does NOT execute the cell - use executeCell for that.
 *
 * @example
 * ```typescript
 * const result = await updateCellOperation.execute(
 *   { cellIndex: 1, cellSource: 'print("Updated")' },
 *   { document: documentHandle }
 * );
 * console.log(result.message); // "✅ Cell at index 1 updated successfully"
 * ```
 */
export const updateCellOperation: ToolOperation<
  UpdateCellParams,
  UpdateCellResult
> = {
  name: "updateCell",
  description:
    "Updates (overwrites) a cell's source code without executing it",

  async execute(params, context): Promise<UpdateCellResult> {
    const { cellIndex, cellSource } = params;
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for updateCell operation. " +
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

      // Update the cell via platform-agnostic document handle
      await document.updateCell(cellIndex, cellSource);

      // Return success result
      return {
        success: true,
        index: cellIndex,
        message: `✅ Cell at index ${cellIndex} updated successfully`,
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update cell: ${errorMessage}`);
    }
  },
};
