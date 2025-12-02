/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tools Module
 *
 * Organized structure:
 * - core/: Core infrastructure (BridgeExecutor, toolAdapter, registration)
 * - operations/: VS Code-specific tool operations (createDocument, createNotebook, createLexical, getActiveDocument)
 * - definitions/: Tool schemas
 * - utils/: Helper utilities
 * - schemas/: Zod validation schemas
 * - internal/: Internal helper functions
 *
 * @module tools
 */

export * from "./core/toolAdapter";
export * from "./core/registration";
