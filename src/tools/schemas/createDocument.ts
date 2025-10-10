/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Zod schema for createDocument operation parameters
 *
 * @module tools/schemas/createDocument
 */

import { z } from "zod";

/**
 * Schema for createDocument parameters
 */
export const createDocumentParamsSchema = z.object({
  name: z.string().describe("Name of the document"),
  description: z.string().optional().describe("Optional description"),
  spaceName: z.string().optional().describe("Cloud space name"),
  spaceId: z.string().optional().describe("Cloud space ID"),
  location: z
    .enum(["local", "cloud", "remote"])
    .optional()
    .describe("Explicit location override"),
  documentType: z
    .enum(["notebook", "lexical"])
    .describe("Type of document to create"),
  initialCells: z
    .array(z.any())
    .optional()
    .describe("Initial cells for notebooks"),
});

/**
 * Inferred TypeScript type from schema
 */
export type CreateDocumentParams = z.infer<typeof createDocumentParamsSchema>;
