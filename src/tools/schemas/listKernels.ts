/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Zod schema for listKernels operation parameters
 *
 * @module tools/schemas/listKernels
 */

import { z } from "zod";

/**
 * Schema for listKernels parameters
 * Defines validation rules for listing available kernel sources
 */
export const listKernelsParamsSchema = z.object({
  /**
   * Include local Jupyter kernels in the results
   * When true, includes kernels from the local Jupyter installation and Python environments
   * Defaults to true if not specified
   */
  includeLocal: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include local Jupyter kernels"),
  /**
   * Include cloud Datalayer runtimes in the results
   * When true, includes available cloud-based kernel runtimes from the Datalayer platform
   * Defaults to true if not specified
   */
  includeCloud: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include cloud Datalayer runtimes"),
  /**
   * Optional filter string for kernel name or language
   * Filters the kernel list to only include kernels matching the specified name or language
   * Case-insensitive substring matching is applied
   */
  filter: z
    .string()
    .optional()
    .describe("Optional filter by kernel name or language"),
});

/**
 * Inferred TypeScript type from schema
 * Represents the validated parameters for the listKernels operation
 */
export type ListKernelsParams = z.infer<typeof listKernelsParamsSchema>;
