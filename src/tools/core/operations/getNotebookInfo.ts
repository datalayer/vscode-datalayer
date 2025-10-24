/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Get Notebook Info Operation - Platform Agnostic
 *
 * @module tools/core/operations/getNotebookInfo
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";
import type { NotebookMetadata } from "../types";

/**
 * Parameters for get notebook info operation (none required)
 */
export interface GetNotebookInfoParams {
  // No parameters needed - gets info from active/specified document
}

/**
 * Result of get notebook info operation
 */
export interface GetNotebookInfoResult {
  /** Success status */
  success: boolean;

  /** Notebook metadata */
  metadata: NotebookMetadata;

  /** Message describing the result */
  message: string;
}

/**
 * Get Notebook Info Operation
 *
 * Retrieves metadata about a notebook including path, cell counts,
 * cell type breakdown, and kernel information.
 *
 * @example
 * ```typescript
 * const result = await getNotebookInfoOperation.execute(
 *   {},
 *   { document: documentHandle }
 * );
 * console.log(`Notebook has ${result.metadata.cellCount} cells`);
 * console.log(`Code cells: ${result.metadata.cellTypes.code}`);
 * console.log(`Markdown cells: ${result.metadata.cellTypes.markdown}`);
 * ```
 */
export const getNotebookInfoOperation: ToolOperation<
  GetNotebookInfoParams,
  GetNotebookInfoResult
> = {
  name: "getNotebookInfo",
  description: "Retrieves metadata about a notebook (path, cell counts, kernel info)",

  async execute(params, context): Promise<GetNotebookInfoResult> {
    const { document } = context;

    // Validate context
    if (!document) {
      throw new Error(
        "Document handle is required for getNotebookInfo operation. " +
          "Ensure the tool execution context includes a valid DocumentHandle.",
      );
    }

    try {
      // Get metadata via platform-agnostic document handle
      const metadata = await document.getMetadata();

      // Return success result
      return {
        success: true,
        metadata,
        message:
          `✅ Retrieved notebook info: ${metadata.cellCount} total cells ` +
          `(${metadata.cellTypes.code} code, ${metadata.cellTypes.markdown} markdown, ${metadata.cellTypes.raw} raw)`,
      };
    } catch (error) {
      // Convert error to descriptive error
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get notebook info: ${errorMessage}`);
    }
  },
};
