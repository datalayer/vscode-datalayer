/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { z } from "zod";

/**
 * Schema for createLexical operation
 * Lexical document creation with smart location detection
 *
 * @property name - Name of the lexical document
 * @property description - Optional description of the document's purpose
 * @property space - Optional cloud space name (implies cloud location if specified)
 * @property spaceId - Optional cloud space ID
 * @property location - Explicit location override (auto-detected if not specified)
 */
export const createLexicalParamsSchema = z.object({
  /** Name of the lexical document */
  name: z.string().describe("Name of the lexical document"),
  /** Optional description of the document's purpose */
  description: z
    .string()
    .optional()
    .describe("Optional description of the document's purpose"),
  /** Optional cloud space name (implies cloud location if specified) */
  space: z
    .string()
    .optional()
    .describe(
      "Optional cloud space name (implies cloud location if specified)",
    ),
  /** Optional cloud space ID */
  spaceId: z.string().optional().describe("Optional cloud space ID"),
  /** Explicit location override (auto-detected if not specified) */
  location: z
    .enum(["local", "cloud", "remote"])
    .optional()
    .describe("Explicit location override (auto-detected if not specified)"),
});

/**
 * Inferred TypeScript type from schema
 */
export type CreateLexicalParams = z.infer<typeof createLexicalParamsSchema>;
