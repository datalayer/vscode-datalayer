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

import type { ToolDefinition } from "@datalayer/jupyter-react";

// Document creation tools
export * from "./createNotebook";
export * from "./createLexical";

// Document access tools
export * from "./getActiveDocument";

// Kernel management tools
export * from "./listKernels";
export * from "./selectKernel";

// Code execution tools
export * from "./executeCode";

// Import all definitions for registry
import { createNotebookTool } from "./createNotebook";
import { createLexicalTool } from "./createLexical";
import { getActiveDocumentTool } from "./getActiveDocument";
import { listKernelsTool } from "./listKernels";
import { selectKernelTool } from "./selectKernel";
import { executeCodeTool } from "./executeCode";

/**
 * Get all tool definitions
 *
 * This function loads tool definitions from packages.
 *
 * @returns Promise resolving to array of all tool definitions
 * @internal
 */
async function getAllToolDefinitionsAsync() {
  // CRITICAL: Preload os module before loading package dependencies
  // Some dependencies (or their transitive dependencies) call os.platform() during module initialization
  // This ensures os is in the require cache before any code tries to use it
  require("os");

  // Import package tool definitions from /tools export (Node.js compatible, excludes React components)
  const { notebookToolDefinitions } = require("@datalayer/jupyter-react/tools");
  const {
    lexicalToolDefinitions,
  } = require("@datalayer/jupyter-lexical/lib/tools");

  // Filter out executeCode from package tools to avoid duplication
  // Also filter out tools that have missing operations
  const notebookToolsFiltered = notebookToolDefinitions.filter(
    (tool: ToolDefinition) =>
      tool.name !== "datalayer_executeCode" &&
      tool.name !== "datalayer_insertCells", // Operation doesn't exist
  );
  const lexicalToolsFiltered = lexicalToolDefinitions.filter(
    (tool: ToolDefinition) => tool.name !== "datalayer_executeCode_lexical",
  );

  return [
    // Document access (1 tool)
    getActiveDocumentTool,

    // Document creation (2 unified smart tools)
    createNotebookTool,
    createLexicalTool,

    // Kernel management (2 tools)
    listKernelsTool,
    selectKernelTool,

    // Code execution (1 unified tool)
    executeCodeTool,

    // Notebook tools from package (7 tools, excluding executeCode and insertCells)
    ...notebookToolsFiltered,

    // Lexical tools from package (9 tools, excluding executeCode)
    ...lexicalToolsFiltered,
  ] as const;
}

/**
 * Array of all tool definitions (VS Code-specific + package tools)
 *
 * DEPRECATED: Use getAllToolDefinitionsAsync() instead to avoid loading React at startup.
 * This export is kept for backwards compatibility but will be removed.
 *
 * This includes 22 tools total (after unifying executeCode and filtering broken tools):
 * - 6 VS Code-specific tools:
 *   - 2 unified smart document creation tools (createNotebook + createLexical)
 *   - 1 VS Code document access tool (getActiveDocument)
 *   - 2 kernel management tools (listKernels + selectKernel)
 *   - 1 unified code execution tool (executeCode - routes to notebook or lexical)
 * - 7 notebook tools from @datalayer/jupyter-react (excluding executeCode and insertCells):
 *   - insertCell, deleteCell, updateCell, readCell, readAllCells
 *   - runCell, runAllCells
 * - 9 lexical tools from @datalayer/jupyter-lexical (excluding executeCode):
 *   - insertBlock, insertBlocks, updateBlock, deleteBlock, readBlock, readAllBlocks
 *   - runBlock, runAllBlocks, listAvailableBlocks
 *
 * Note: insertCells is filtered out because its operation doesn't exist in the package.
 */
export const allToolDefinitions = [
  // Document access (1 tool)
  getActiveDocumentTool,

  // Document creation (2 unified smart tools)
  createNotebookTool,
  createLexicalTool,

  // Kernel management (2 tools)
  listKernelsTool,
  selectKernelTool,

  // Code execution (1 unified tool)
  executeCodeTool,

  // NOTE: Package tools (notebook/lexical) are NOT included in this static export
  // to avoid loading React at module evaluation time.
  // Use getAllToolDefinitionsAsync() in registration.ts instead.
] as const;

/**
 * Export the async function for use in registration
 */
export { getAllToolDefinitionsAsync };
