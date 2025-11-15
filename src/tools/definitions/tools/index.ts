/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool Definitions Export
 *
 * All tool definitions are exported from this module for easy import
 * and registration across platforms.
 *
 * @module tools/definitions/tools
 */

// Cell manipulation tools
export * from "./insertCell";
export * from "./deleteCell";
export * from "./updateCell";
export * from "./readCell";
export * from "./executeCell";

// Notebook creation tools
export * from "./createNotebook";

// Import all definitions for registry
import { insertCellTool } from "./insertCell";
import { deleteCellTool } from "./deleteCell";
import { updateCellTool } from "./updateCell";
import { readCellTool, readAllCellsTool } from "./readCell";
import { executeCellTool, getNotebookInfoTool } from "./executeCell";
import {
  createRemoteNotebookTool,
  createLocalNotebookTool,
} from "./createNotebook";

/**
 * Array of all tool definitions (subset for demonstration)
 *
 * NOTE: This is a partial implementation showing 9 tools.
 * The full implementation would include all 17 tools:
 * - 2 appendCell tools (markdown + execute code)
 * - 2 lexical creation tools
 * - 2 runtime management tools
 */
export const allToolDefinitions = [
  // Cell manipulation (7 tools)
  insertCellTool,
  deleteCellTool,
  updateCellTool,
  readCellTool,
  readAllCellsTool,
  executeCellTool,
  getNotebookInfoTool,

  // Notebook creation (2 tools)
  createRemoteNotebookTool,
  createLocalNotebookTool,

  // TODO: Add remaining tools:
  // - appendDatalayerMarkdownCell
  // - appendExecuteDatalayerCodeCell
  // - createLocalLexical
  // - createRemoteLexical
  // - startRuntime
  // - connectRuntime
  // - insertDatalayerMarkdownCell (if different from insertCell)
] as const;
