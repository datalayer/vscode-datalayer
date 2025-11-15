/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Core Tool Operations - Platform Agnostic
 *
 * This module exports all platform-agnostic tool operations that can be
 * reused across VS Code, SaaS, and ag-ui environments.
 *
 * @module tools/core/operations
 */

// Cell manipulation operations
export * from "./insertCell";
export * from "./deleteCell";
export * from "./updateCell";
export * from "./readCell";
export * from "./readAllCells";
export * from "./executeCell";
export * from "./getNotebookInfo";

// Document creation operations
export * from "./createNotebook";
export * from "./createLexical";

// Runtime management operations
export * from "./manageRuntime";

// Re-export operation instances for convenience
import { insertCellOperation } from "./insertCell";
import { deleteCellOperation } from "./deleteCell";
import { updateCellOperation } from "./updateCell";
import { readCellOperation } from "./readCell";
import { readAllCellsOperation } from "./readAllCells";
import { executeCellOperation } from "./executeCell";
import { getNotebookInfoOperation } from "./getNotebookInfo";
import {
  createRemoteNotebookOperation,
  createLocalNotebookOperation,
} from "./createNotebook";
import {
  createRemoteLexicalOperation,
  createLocalLexicalOperation,
} from "./createLexical";
import {
  startRuntimeOperation,
  connectRuntimeOperation,
} from "./manageRuntime";

/**
 * Registry of all available operations
 */
export const allOperations = {
  // Cell operations
  insertCell: insertCellOperation,
  deleteCell: deleteCellOperation,
  updateCell: updateCellOperation,
  readCell: readCellOperation,
  readAllCells: readAllCellsOperation,
  executeCell: executeCellOperation,
  getNotebookInfo: getNotebookInfoOperation,

  // Notebook creation
  createRemoteNotebook: createRemoteNotebookOperation,
  createLocalNotebook: createLocalNotebookOperation,

  // Lexical creation
  createRemoteLexical: createRemoteLexicalOperation,
  createLocalLexical: createLocalLexicalOperation,

  // Runtime management
  startRuntime: startRuntimeOperation,
  connectRuntime: connectRuntimeOperation,
} as const;

/**
 * Get operation by name
 */
export function getOperation(name: string) {
  return allOperations[name as keyof typeof allOperations];
}

/**
 * Get all operation names
 */
export function getAllOperationNames(): string[] {
  return Object.keys(allOperations);
}
