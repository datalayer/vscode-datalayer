/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Delete Cell Operation - Platform Agnostic
 *
 * @module tools/core/operations/deleteCell
 */

import type { ToolOperation } from "../interfaces";

/**
 * Parameters for delete cell operation
 */
export interface DeleteCellParams {
  /** Index of the cell to delete (0-based) */
  cellIndex: number;
}

/**
 * Result of delete cell operation
 */
export interface DeleteCellResult {
  /** Success status */
  success: boolean;

  /** Index of the deleted cell */
  index: number;

  /** Message describing the result */
  message: string;
}

/**
 * Delete Cell Operation
 *
 * Deletes a cell from a notebook at the specified index.
 * This operation is platform-agnostic and works identically across all platforms.
 *
 * @example
 * ```typescript
 * const result = await deleteCellOperation.execute(
 *   { cellIndex: 2 },
 *   { document: documentHandle }
 * );
 * console.log(result.message); // "✅ Cell at index 2 deleted successfully"
 * ```
 */
export const deleteCellOperation: ToolOperation<
  DeleteCellParams,
  DeleteCellResult
> = {
  name: "deleteCell",
  description: "Deletes a cell from a notebook at the specified index",

  async execute(params, context): Promise<DeleteCellResult> {
    const { cellIndex } = params;
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for deleteCell operation. " +
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

      // Delete the cell via platform-agnostic document handle
      await document.deleteCell(cellIndex);

      // Return success result
      return {
        success: true,
        index: cellIndex,
        message: `✅ Cell at index ${cellIndex} deleted successfully`,
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete cell: ${errorMessage}`);
    }
  },
};
