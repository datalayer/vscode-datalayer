/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tools Module
 *
 * Organized structure:
 * - operations/: VS Code-specific tool operations (createDocument, createNotebook, createLexical, getActiveDocument)
 * - definitions/: Tool schemas
 * - utils/: Helper utilities
 * - toolAdapter.ts: VS Code tool adapter implementation
 * - registration.ts: Tool registration logic
 *
 * @module tools
 */

export * from "./toolAdapter";
export * from "./registration";
