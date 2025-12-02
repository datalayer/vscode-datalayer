/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { z } from "zod";

/**
 * Schema for getActiveDocument operation
 * This operation takes no parameters
 */
export const getActiveDocumentParamsSchema = z.object({});

/**
 * Inferred TypeScript type from schema
 */
export type GetActiveDocumentParams = z.infer<
  typeof getActiveDocumentParamsSchema
>;
