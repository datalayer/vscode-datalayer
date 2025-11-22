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
import type {
  NotebookCreationParams,
  NotebookCreationResult,
} from "@datalayer/jupyter-react";
import {
  createDocumentOperation,
  type CreateDocumentParams,
  type CreateDocumentResult,
} from "./createDocument";

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
    // Map notebook-specific params to unified document params
    const documentParams: CreateDocumentParams = {
      name: params.name,
      description: params.description,
      spaceName: params.spaceName,
      spaceId: params.spaceId,
      location: params.location,
      documentType: "notebook",
      initialCells: params.initialCells,
    };

    // Delegate to unified operation
    const result: CreateDocumentResult = await createDocumentOperation.execute(
      documentParams,
      context,
    );

    // Map result back to notebook-specific format
    return {
      success: result.success,
      uri: result.uri,
      notebookId: result.notebookId,
      error: result.error,
      chatMessage: result.chatMessage,
    };
  },
};
