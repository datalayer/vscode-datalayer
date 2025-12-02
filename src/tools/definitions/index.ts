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

// Import package tool definitions
import { notebookToolDefinitions } from "@datalayer/jupyter-react";
import { lexicalToolDefinitions } from "@datalayer/jupyter-lexical";

// Filter out executeCode from package tools to avoid duplication
// Also filter out tools that have missing operations
const notebookToolsFiltered = notebookToolDefinitions.filter(
  (tool) =>
    tool.name !== "datalayer_executeCode" &&
    tool.name !== "datalayer_insertCells", // Operation doesn't exist
);
const lexicalToolsFiltered = lexicalToolDefinitions.filter(
  (tool) => tool.name !== "datalayer_executeCode_lexical",
);

/**
 * Array of all tool definitions (VS Code-specific + package tools)
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

  // Notebook tools from package (7 tools, excluding executeCode and insertCells)
  ...notebookToolsFiltered,

  // Lexical tools from package (9 tools, excluding executeCode)
  ...lexicalToolsFiltered,
] as const;
