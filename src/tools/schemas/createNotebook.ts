/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { z } from "zod";

/**
 * Schema for createNotebook operation
 * Notebook-specific creation with smart location detection
 */
export const createNotebookParamsSchema = z.object({
  /**
   * Name of the notebook
   * Required field that specifies the display name for the created notebook
   */
  name: z.string().describe("Name of the notebook"),
  /**
   * Optional description of the notebook's purpose
   * Provides additional context about the notebook's intended use or content
   */
  description: z
    .string()
    .optional()
    .describe("Optional description of the notebook's purpose"),
  /**
   * Optional cloud space name
   * Implies cloud location if specified; used to identify which space the notebook belongs to
   */
  space: z
    .string()
    .optional()
    .describe(
      "Optional cloud space name (implies cloud location if specified)",
    ),
  /**
   * Optional cloud space ID
   * Unique identifier for the space; used as an alternative to space name for direct space lookup
   */
  spaceId: z.string().optional().describe("Optional cloud space ID"),
  /**
   * Explicit location override for notebook storage
   * Determines where the notebook will be stored: local filesystem, cloud platform, or remote server
   * Auto-detected if not specified based on context and space parameters
   */
  location: z
    .enum(["local", "cloud", "remote"])
    .optional()
    .describe("Explicit location override (auto-detected if not specified)"),
  /**
   * Optional initial cells for the notebook
   * Pre-populated cells to include when creating the notebook; can contain code or markdown cells
   */
  initialCells: z
    .array(z.any())
    .optional()
    .describe("Optional initial cells for the notebook"),
});

/**
 * Inferred TypeScript type from schema
 */
export type CreateNotebookParams = z.infer<typeof createNotebookParamsSchema>;
