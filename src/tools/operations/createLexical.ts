/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Create Lexical Adapter - Thin wrapper around unified createDocument
 *
 * @module tools/vscode/createLexical
 */

import type { ToolOperation } from "@datalayer/jupyter-react";
import type {
  LexicalCreationParams,
  LexicalCreationResult,
} from "@datalayer/jupyter-lexical";
import {
  createDocumentOperation,
  type CreateDocumentParams,
  type CreateDocumentResult,
} from "./createDocument";

/**
 * Create Lexical Operation - Thin Wrapper
 *
 * Delegates to unified createDocumentOperation with documentType: 'lexical'.
 * All smart logic (intent detection, location resolution) is handled by the unified operation.
 */
export const createLexicalOperation: ToolOperation<
  LexicalCreationParams & { location?: "local" | "cloud" | "remote" },
  LexicalCreationResult & { chatMessage?: string }
> = {
  name: "createLexical",

  async execute(
    params,
    context,
  ): Promise<LexicalCreationResult & { chatMessage?: string }> {
    // Map lexical-specific params to unified document params
    const documentParams: CreateDocumentParams = {
      name: params.name,
      description: params.description,
      spaceName: params.spaceName,
      spaceId: params.spaceId,
      location: params.location,
      documentType: "lexical",
    };

    // Delegate to unified operation
    const result: CreateDocumentResult = await createDocumentOperation.execute(
      documentParams,
      context,
    );

    // Map result back to lexical-specific format
    return {
      success: result.success,
      uri: result.uri,
      documentId: result.documentId,
      error: result.error,
      chatMessage: result.chatMessage,
    };
  },
};
