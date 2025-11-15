/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Insert Cell Operation - Platform Agnostic
 *
 * @module tools/core/operations/insertCell
 */

import type { ToolOperation } from "../interfaces";
import type { CellType } from "../types";

/**
 * Parameters for insert cell operation
 */
export interface InsertCellParams {
  /** Cell type to insert */
  cellType: CellType;

  /** Cell source code or markdown content */
  cellSource: string;

  /** Optional: Position to insert (0-based index). Defaults to end of notebook. */
  cellIndex?: number;
}

/**
 * Result of insert cell operation
 */
export interface InsertCellResult {
  /** Success status */
  success: boolean;

  /** Index where cell was inserted */
  index: number;

  /** Message describing the result */
  message: string;
}

/**
 * Insert Cell Operation
 *
 * Inserts a code or markdown cell into a notebook at the specified position.
 * This operation is platform-agnostic and works identically across:
 * - VS Code (via webview messages)
 * - SaaS (via direct Jupyter widget APIs)
 * - ag-ui (via CopilotKit integration)
 *
 * @example
 * ```typescript
 * const result = await insertCellOperation.execute(
 *   { cellType: 'code', cellSource: 'print("Hello")' },
 *   { document: documentHandle }
 * );
 * console.log(result.message); // "✅ Code cell inserted at index 0"
 * ```
 */
export const insertCellOperation: ToolOperation<
  InsertCellParams,
  InsertCellResult
> = {
  name: "insertCell",
  description: "Inserts a code or markdown cell into a notebook",

  async execute(params, context): Promise<InsertCellResult> {
    const { cellType, cellSource, cellIndex } = params;
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for insertCell operation. " +
          "Ensure the tool execution context includes a valid DocumentHandle.",
      );
    }

    try {
      // Determine target index (end of notebook if not specified)
      const targetIndex =
        cellIndex !== undefined ? cellIndex : await document.getCellCount();

      // Validate index bounds
      const cellCount = await document.getCellCount();
      if (targetIndex < 0 || targetIndex > cellCount) {
        throw new Error(
          `Cell index ${targetIndex} is out of bounds. ` +
            `Notebook has ${cellCount} cells (valid range: 0-${cellCount})`,
        );
      }

      // Insert the cell via platform-agnostic document handle
      await document.insertCell(targetIndex, {
        type: cellType,
        source: cellSource,
        outputs: [],
        metadata: {},
      });

      // Return success result
      const cellTypeCapitalized =
        cellType.charAt(0).toUpperCase() + cellType.slice(1);

      return {
        success: true,
        index: targetIndex,
        message: `✅ ${cellTypeCapitalized} cell inserted at index ${targetIndex}`,
      };
    } catch (error) {
      // Convert error to result with failure status
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to insert cell: ${errorMessage}`);
    }
  },
};
