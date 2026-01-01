/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Factory registration for VS Code tools
 *
 * @module tools/vscode/registration
 */

import * as vscode from "vscode";
import type { ToolDefinition, ToolOperation } from "@datalayer/jupyter-react";
import { VSCodeToolAdapter } from "./toolAdapter";
import { createNotebookOperation } from "../operations/createNotebook";
import { createLexicalOperation } from "../operations/createLexical";
import { getAllToolDefinitionsAsync } from "../definitions";
import { getActiveDocumentOperation } from "../operations/getActiveDocument";
import { listKernelsOperation } from "../operations/listKernels";
import { selectKernelOperation } from "../operations/selectKernel";
import { executeCodeOperation } from "../operations/executeCode";

/**
 * Combined operations registry type
 *
 * Maps operation names to their corresponding ToolOperation implementations
 */
export interface CombinedOperations {
  /** List available Jupyter kernels */
  listKernels: ToolOperation<unknown, unknown>;
  /** Select a Jupyter kernel for the active document */
  selectKernel: ToolOperation<unknown, unknown>;
  /** Get the currently active document in VS Code */
  getActiveDocument: ToolOperation<unknown, unknown>;
  /** Create a new notebook (local or remote) */
  createNotebook: ToolOperation<unknown, unknown>;
  /** Create a new Lexical document */
  createLexical: ToolOperation<unknown, unknown>;
  /** Execute code in a notebook or runtime */
  executeCode: ToolOperation<unknown, unknown>;
  /** Additional operations from notebook and lexical packages */
  [key: string]: ToolOperation<unknown, unknown>;
}

/**
 * Get combined operations registry
 *
 * @returns Combined operations registry
 * @internal
 */
export function getCombinedOperations(): CombinedOperations {
  // Import package operations from /tools export (Node.js compatible, excludes React components)
  const { notebookToolOperations } = require("@datalayer/jupyter-react/tools");
  const {
    lexicalToolOperations,
  } = require("@datalayer/jupyter-lexical/lib/tools");

  return {
    // Notebook operations (from datalayer-react)
    ...notebookToolOperations,

    // Lexical operations (from datalayer-lexical)
    ...lexicalToolOperations,

    // Kernel management operations
    listKernels: listKernelsOperation,
    selectKernel: selectKernelOperation,

    // VS Code-specific operations (all use standard ToolOperation pattern)
    getActiveDocument: getActiveDocumentOperation,
    createNotebook: createNotebookOperation,
    createLexical: createLexicalOperation,

    // Unified code execution (overrides package executeCode operations)
    executeCode: executeCodeOperation,
  };
}

/**
 * Validation result for tool definitions
 */
export interface ToolValidationResult {
  /** Whether all tool definitions have corresponding operations */
  valid: boolean;
  /** Array of error messages for missing operations */
  errors: string[];
}

/**
 * Validates that all tool definitions have corresponding operations
 *
 * @param definitions - Array of tool definitions to validate
 * @param operations - Registry of available operations
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const validation = validateToolDefinitions(allToolDefinitions, allOperations);
 * if (!validation.valid) {
 *   console.error("Missing operations:", validation.errors);
 * }
 * ```
 */
export function validateToolDefinitions(
  definitions: readonly ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
): ToolValidationResult {
  const errors: string[] = [];

  for (const definition of definitions) {
    if (!operations[definition.operation]) {
      errors.push(
        `Tool '${definition.name}' references operation '${definition.operation}' which does not exist`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Registers all tools in VS Code using the unified architecture
 *
 * This function replaces manual tool registration with automatic
 * registration based on tool definitions and core operations.
 *
 * @param context - VS Code extension context
 * @param definitions - Optional array of tool definitions (if not provided, will be loaded dynamically)
 * @param operations - Optional registry of core operations (if not provided, will be loaded dynamically)
 *
 * @example
 * ```typescript
 * // In extension.ts activate():
 * await registerVSCodeTools(context);
 * ```
 */
export async function registerVSCodeTools(
  context: vscode.ExtensionContext,
  definitions?: readonly ToolDefinition[],
  operations?: Record<string, ToolOperation<unknown, unknown>>,
): Promise<void> {
  // Load definitions and operations if not provided
  const resolvedDefinitions =
    definitions ?? (await getAllToolDefinitionsAsync());
  const resolvedOperations = operations ?? getCombinedOperations();

  // Validate all definitions before registration
  const validation = validateToolDefinitions(
    resolvedDefinitions,
    resolvedOperations,
  );
  if (!validation.valid) {
    const errorMessage = [
      "[Datalayer Tools] ❌ Tool validation failed:",
      ...validation.errors.map((err) => `  - ${err}`),
      "",
      "Available operations:",
      ...Object.keys(resolvedOperations).map((op) => `  - ${op}`),
    ].join("\n");

    console.error(errorMessage);

    // In development, fail fast. In production, just warn.
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `Tool validation failed: ${validation.errors.length} definition(s) missing operations`,
      );
    }
  }

  for (const definition of resolvedDefinitions) {
    try {
      // Find the operation for this tool
      const operation = resolvedOperations[definition.operation];

      if (!operation) {
        console.warn(
          `[Datalayer Tools] No operation found for tool ${definition.name} (operation: ${definition.operation})`,
        );
        continue;
      }

      // Create adapter and register with VS Code
      const adapter = new VSCodeToolAdapter(definition, operation);

      context.subscriptions.push(
        vscode.lm.registerTool(definition.name, adapter),
      );
    } catch (error) {
      console.error(
        `[Datalayer Tools] Failed to register tool ${definition.name}:`,
        error,
      );
    }
  }
}

/**
 * Registers a single tool (for testing or selective registration)
 *
 * @param context - VS Code extension context
 * @param definition - Tool definition to register
 * @param operation - Core operation implementation
 * @returns Disposable for cleanup
 *
 * @example
 * ```typescript
 * // Register a single tool for testing
 * const disposable = registerSingleTool(
 *   context,
 *   createNotebookDefinition,
 *   createNotebookOperation
 * );
 * ```
 */
export function registerSingleTool(
  context: vscode.ExtensionContext,
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
): vscode.Disposable {
  const adapter = new VSCodeToolAdapter(definition, operation);
  const disposable = vscode.lm.registerTool(definition.name, adapter);
  context.subscriptions.push(disposable);
  return disposable;
}
