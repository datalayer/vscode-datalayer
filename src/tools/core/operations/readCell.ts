/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Read Cell Operation - Platform Agnostic
 *
 * @module tools/core/operations/readCell
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";
import type { CellData } from "../types";

/**
 * Parameters for read cell operation
 */
export interface ReadCellParams {
  /** Index of the cell to read (0-based) */
  cellIndex: number;
}

/**
 * Result of read cell operation
 */
export interface ReadCellResult {
  /** Success status */
  success: boolean;

  /** Cell data */
  cell: CellData;

  /** Cell index */
  index: number;

  /** Message describing the result */
  message: string;
}

/**
 * Read Cell Operation
 *
 * Reads a specific cell from a notebook by index, including its source
 * code, outputs, and metadata.
 *
 * @example
 * ```typescript
 * const result = await readCellOperation.execute(
 *   { cellIndex: 0 },
 *   { document: documentHandle }
 * );
 * console.log(result.cell.source); // "print('Hello')"
 * ```
 */
export const readCellOperation: ToolOperation<
  ReadCellParams,
  ReadCellResult
> = {
  name: "readCell",
  description: "Reads a specific cell from a notebook by index",

  async execute(params, context): Promise<ReadCellResult> {
    const { cellIndex } = params;
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for readCell operation. " +
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

      // Read the cell via platform-agnostic document handle
      const cell = await document.getCell(cellIndex);

      // Return success result
      return {
        success: true,
        cell,
        index: cellIndex,
        message: `✅ Read ${cell.type} cell at index ${cellIndex}`,
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read cell: ${errorMessage}`);
    }
  },
};
