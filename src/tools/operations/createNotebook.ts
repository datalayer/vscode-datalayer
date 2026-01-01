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
  createDocumentOperation,
  type CreateDocumentResult,
} from "../utils/createDocument";
import {
  createNotebookParamsSchema,
  type CreateNotebookParams,
} from "../schemas/createNotebook";

/**
 * Notebook creation parameters
 */
export type NotebookCreationParams = CreateNotebookParams;

/**
 * Notebook creation result
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
