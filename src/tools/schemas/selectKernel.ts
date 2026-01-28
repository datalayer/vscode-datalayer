/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Zod schemas for kernel selection operation parameters
 *
 * @module tools/schemas/selectKernel
 */

import { z } from "zod";

/**
 * Schema for selectKernel operation
 * Selects and connects a kernel to the active document (notebook or lexical)
 */
export const selectKernelParamsSchema = z.object({
  kernelId: z
    .string()
    .describe(
      "REQUIRED: Kernel identifier or alias. " +
        "Common aliases for natural language: " +
        "'pyodide' (when user says 'pyodide', 'browser python', 'connect to pyodide'), " +
        "'new' (when user says 'new runtime', 'create runtime', 'connect to new'), " +
        "'active' (when user says 'active runtime', 'current runtime'), " +
        "'local' (when user says 'local kernel', 'ipykernel', 'local ipykernel'). " +
        "Can also be a specific kernel ID like 'python-env-/path/to/env' or 'runtime-abc123'.",
    ),
  autoStart: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Automatically start the kernel if it's not running (default: true)",
    ),
  environmentType: z
    .enum(["CPU", "GPU"])
    .optional()
    .describe(
      "Environment type for new runtime creation (overrides VS Code setting)",
    ),
  durationMinutes: z
    .number()
    .positive()
    .optional()
    .describe(
      "Runtime duration in minutes for new runtime creation (overrides VS Code setting)",
    ),
});

/**
 * Inferred TypeScript types from schemas
 */
export type SelectKernelParams = z.infer<typeof selectKernelParamsSchema>;
