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
export * from "./createLexical";
export * from "./createNotebook";

// Document access tools
export * from "./getActiveDocument";

// Kernel management tools
export * from "./listKernels";
export * from "./selectKernel";

// Code execution tools
export * from "./executeCode";

// Import all definitions for registry
import { createLexicalTool } from "./createLexical";
import { createNotebookTool } from "./createNotebook";
import { executeCodeTool } from "./executeCode";
import { getActiveDocumentTool } from "./getActiveDocument";
import { listKernelsTool } from "./listKernels";
import { selectKernelTool } from "./selectKernel";

/**
 * The tool definitions a package's tools entry exports, or a refusal that
 * says which package answered what — rather than a TypeError further on.
 *
 * @param loaded - What `require` gave for the entry.
 * @param entry - The entry's specifier.
 * @param name - The export holding the definitions.
 *
 * @returns The entry's tool definitions, as exported.
 *
 * @throws Error naming the entry and what it answered, when the export is not an array.
 */
function definitionsOf(
  loaded: unknown,
  entry: string,
  name: string,
): ToolDefinition[] {
  const value = (loaded as Record<string, unknown> | undefined)?.[name];
  if (!Array.isArray(value)) {
    const keys =
      loaded && typeof loaded === "object"
        ? Object.keys(loaded).slice(0, 12).join(", ")
        : typeof loaded;
    throw new Error(
      `${entry} has no ${name} array (it answered: ${keys || "nothing"})`,
    );
  }
  return value as ToolDefinition[];
}

/**
 * Loads all tool definitions from VS Code-specific and package sources asynchronously.
 *
 * @returns Promise resolving to array of all tool definitions.
 *
 * @internal
 */
async function getAllToolDefinitionsAsync(): Promise<ToolDefinition[]> {
  // CRITICAL: Preload os module before loading package dependencies
  // Some dependencies (or their transitive dependencies) call os.platform() during module initialization
  // This ensures os is in the require cache before any code tries to use it
  require("os");

  // Import package tool definitions from /tools export (Node.js compatible, excludes React components)
  // Imported, not required: both entries are ES modules, and the extension
  // host's require answered jupyter-react's with an empty object, so no tool
  // was registered and activation stopped there. A native import reads them
  // as Node's ESM loader does (webpack keeps them external, as `import`).
  const notebookToolDefinitions = definitionsOf(
    await import("@datalayer/jupyter-react/tools"),
    "@datalayer/jupyter-react/tools",
    "notebookToolDefinitions",
  );
  const lexicalToolDefinitions = definitionsOf(
    await import("@datalayer/jupyter-lexical/lib/tools/index.js"),
    "@datalayer/jupyter-lexical/lib/tools/index.js",
    "lexicalToolDefinitions",
  );

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
 * Export the async function for use in tool registration.
 */
export { getAllToolDefinitionsAsync };
