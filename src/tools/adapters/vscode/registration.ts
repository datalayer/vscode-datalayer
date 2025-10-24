/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Factory registration for VS Code tools
 *
 * @module tools/adapters/vscode/registration
 */

import * as vscode from "vscode";
import type { ToolDefinition } from "../../definitions/schema";
import type { ToolOperation } from "../../core/interfaces";
import { VSCodeToolAdapter } from "./VSCodeToolAdapter";
import { allOperations } from "../../core/operations";
import { allToolDefinitions } from "../../definitions/tools";

/**
 * Registers all tools in VS Code using the unified architecture
 *
 * This function replaces manual tool registration with automatic
 * registration based on tool definitions and core operations.
 *
 * @param context - VS Code extension context
 * @param definitions - Array of tool definitions (defaults to all)
 * @param operations - Registry of core operations (defaults to all)
 *
 * @example
 * ```typescript
 * // In extension.ts activate():
 * registerVSCodeTools(context);
 * ```
 */
export function registerVSCodeTools(
  context: vscode.ExtensionContext,
  definitions: readonly ToolDefinition[] = allToolDefinitions,
  operations: Record<string, ToolOperation<any, any>> = allOperations,
): void {
  console.log(
    `[Datalayer Tools] Registering ${definitions.length} tools with unified architecture`,
  );

  for (const definition of definitions) {
    try {
      // Find the operation for this tool
      const operation = operations[definition.operation];

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

      console.log(
        `[Datalayer Tools] ✓ Registered ${definition.name} → ${definition.operation}`,
      );
    } catch (error) {
      console.error(
        `[Datalayer Tools] Failed to register tool ${definition.name}:`,
        error,
      );
    }
  }

  console.log(
    `[Datalayer Tools] Successfully registered ${definitions.length} tools`,
  );
}

/**
 * Registers a single tool (for testing or selective registration)
 */
export function registerSingleTool(
  context: vscode.ExtensionContext,
  definition: ToolDefinition,
  operation: ToolOperation<any, any>,
): vscode.Disposable {
  const adapter = new VSCodeToolAdapter(definition, operation);
  const disposable = vscode.lm.registerTool(definition.name, adapter);
  context.subscriptions.push(disposable);
  return disposable;
}
