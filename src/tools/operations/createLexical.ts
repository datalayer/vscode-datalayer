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
import {
  createDocumentOperation,
  type CreateDocumentResult,
} from "../utils/createDocument";
import {
  createLexicalParamsSchema,
  type CreateLexicalParams,
} from "../schemas/createLexical";
import { validateWithZod } from "@datalayer/jupyter-react/lib/tools/core/zodUtils";

/**
 * Lexical creation parameters
 */
export type LexicalCreationParams = CreateLexicalParams;

/**
 * Lexical creation result
 */
export type LexicalCreationResult = CreateDocumentResult;

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
    // Validate params with Zod
    const validated = validateWithZod(
      createLexicalParamsSchema,
      params,
      "createLexical",
    );

    // Delegate to unified createDocument operation with documentType: 'lexical'
    return createDocumentOperation.execute(
      {
        ...validated,
        spaceName: validated.space,
        documentType: "lexical",
      },
      context,
    );
  },
};
