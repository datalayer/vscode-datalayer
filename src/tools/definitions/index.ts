/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool Definitions Export
 *
 * VS Code-specific tool definitions only.
 * Cell and block tool definitions live in their respective packages.
 *
 * @module tools/definitions
 */

// Document creation tools
export * from "./createNotebook";
export * from "./createLexical";

// Document access tools
export * from "./getActiveDocument";

// Import all definitions for registry
import { createNotebookTool } from "./createNotebook";
import { createLexicalTool } from "./createLexical";
import { getActiveDocumentTool } from "./getActiveDocument";

/**
 * Array of VS Code-specific tool definitions
 *
 * NOTE: This includes 3 VS Code-specific tools:
 * - 2 unified smart document creation tools (createNotebook + createLexical)
 * - 1 VS Code document access tool (getActiveDocument)
 *
 * Cell and block manipulation tools are defined in their respective packages:
 * - datalayer-react/tools/core/ (cell tools)
 * - datalayer-lexical/tools/core/ (block tools)
 */
export const allToolDefinitions = [
  // Document access (1 tool)
  getActiveDocumentTool,

  // Document creation (2 unified smart tools)
  createNotebookTool,
  createLexicalTool,
] as const;
