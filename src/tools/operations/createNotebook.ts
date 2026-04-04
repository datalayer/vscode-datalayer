/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Create Notebook Adapter - Thin wrapper around unified createDocument
 *
 * @module tools/vscode/createNotebook
 */

import type { ToolOperation } from "@datalayer/jupyter-react";
import { validateWithZod } from "@datalayer/jupyter-react";

import {
  type CreateNotebookParams,
  createNotebookParamsSchema,
} from "../schemas/createNotebook";
import {
  createDocumentOperation,
  type CreateDocumentResult,
} from "../utils/createDocument";

/**
 * Parameters for creating a notebook (aliased from schema type).
 */
export type NotebookCreationParams = CreateNotebookParams;

/**
 * Result of notebook creation (aliased from unified result type).
 */
export type NotebookCreationResult = CreateDocumentResult;

/**
 * Create Notebook Operation - Thin Wrapper
 *
 * Delegates to unified createDocumentOperation with documentType: 'notebook'.
 * All smart logic (intent detection, location resolution) is handled by the unified operation.
 */
export const createNotebookOperation: ToolOperation<
  NotebookCreationParams & { location?: "local" | "cloud" | "remote" },
  NotebookCreationResult & { chatMessage?: string }
> = {
  name: "createNotebook",

  async execute(
    params,
    context,
  ): Promise<NotebookCreationResult & { chatMessage?: string }> {
    // Validate params with Zod
    const validated = validateWithZod(
      createNotebookParamsSchema,
      params,
      "createNotebook",
    );

    // Delegate to unified createDocument operation with documentType: 'notebook'
    return createDocumentOperation.execute(
      {
        ...validated,
        spaceName: validated.space,
        documentType: "notebook",
      },
      context,
    );
  },
};
