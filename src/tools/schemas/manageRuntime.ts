/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Zod schemas for runtime management operation parameters
 *
 * @module tools/schemas/manageRuntime
 */

import { z } from "zod";

/**
 * Schema for startRuntime parameters
 */
export const startRuntimeParamsSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe('Environment name (e.g., "python-3.11")'),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Runtime duration in minutes"),
});

/**
 * Schema for connectRuntime parameters
 */
export const connectRuntimeParamsSchema = z.object({
  runtimeName: z.string().describe("Name of runtime to connect"),
  notebookUri: z
    .string()
    .optional()
    .describe("Optional notebook URI to connect to"),
});

/**
 * Inferred TypeScript types from schemas
 */
export type StartRuntimeParams = z.infer<typeof startRuntimeParamsSchema>;
export type ConnectRuntimeParams = z.infer<typeof connectRuntimeParamsSchema>;
