/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Read All Cells Operation - Platform Agnostic
 *
 * @module tools/core/operations/readAllCells
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";
import type { CellData } from "../types";

/**
 * Parameters for read all cells operation (none required)
 */
export interface ReadAllCellsParams {
  // No parameters needed - reads from active/specified document
}

/**
 * Result of read all cells operation
 */
export interface ReadAllCellsResult {
  /** Success status */
  success: boolean;

  /** Array of all cells in the notebook */
  cells: CellData[];

  /** Total number of cells */
  cellCount: number;

  /** Message describing the result */
  message: string;
}

/**
 * Read All Cells Operation
 *
 * Reads all cells from a notebook, including source code, outputs,
 * and metadata for each cell.
 *
 * @example
 * ```typescript
 * const result = await readAllCellsOperation.execute(
 *   {},
 *   { document: documentHandle }
 * );
 * console.log(`Read ${result.cellCount} cells`);
 * result.cells.forEach((cell, i) => {
 *   console.log(`Cell ${i}: ${cell.type}`);
 * });
 * ```
 */
export const readAllCellsOperation: ToolOperation<
  ReadAllCellsParams,
  ReadAllCellsResult
> = {
  name: "readAllCells",
  description: "Reads all cells from a notebook",

  async execute(params, context): Promise<ReadAllCellsResult> {
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for readAllCells operation. " +
          "Ensure the tool execution context includes a valid DocumentHandle.",
      );
    }

    try {
      // Read all cells via platform-agnostic document handle
      const cells = await document.getAllCells();
      const cellCount = cells.length;

      // Return success result
      return {
        success: true,
        cells,
        cellCount,
        message: `✅ Read ${cellCount} cell${cellCount !== 1 ? "s" : ""} from notebook`,
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read all cells: ${errorMessage}`);
    }
  },
};
