/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ag-ui/CopilotKit Tool Adapter
 *
 * Converts unified tool definitions to CopilotKit's useCopilotAction format.
 *
 * @module tools/adapters/agui/AgUIToolAdapter
 */

import type { ToolDefinition } from "../../definitions/schema";
import type { ToolOperation } from "../../core/interfaces";
import type { SaaSToolContext } from "../saas/SaaSToolContext";
import { SaaSToolAdapter } from "../saas/SaaSToolAdapter";

/**
 * CopilotKit action definition (matches useCopilotAction interface)
 */
export interface CopilotKitAction {
  /** Action name (tool identifier) */
  name: string;

  /** Human-readable description for AI model */
  description: string;

  /** JSON Schema for parameters */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  /** Handler function that executes the action */
  handler: (params: unknown) => Promise<string>;

  /** Optional: Render function for custom UI */
  render?: (props: {
    status: string;
    args: unknown;
    result: unknown;
  }) => React.ReactNode;
}

/**
 * Converts a unified tool definition to CopilotKit action format
 *
 * @param definition - Unified tool definition
 * @param operation - Core operation implementation
 * @param context - SaaS tool context (reuses SaaS document handle)
 * @returns CopilotKit action ready for useCopilotAction
 */
export function createCopilotKitAction(
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
  context: SaaSToolContext,
): CopilotKitAction {
  // Create SaaS adapter (ag-ui runs in browser, same as SaaS)
  const adapter = new SaaSToolAdapter(definition, operation, context);

  return {
    name: definition.toolReferenceName || definition.name,
    description: definition.description,
    parameters: {
      type: "object",
      properties: definition.parameters.properties,
      required: definition.parameters.required,
    },

    handler: async (params: unknown): Promise<string> => {
      try {
        const result = await adapter.execute(params);

        // Format result as string for CopilotKit
        if (typeof result === "object" && result !== null) {
          const resultObj = result as {
            message?: string;
            success?: boolean;
            error?: string;
          };

          // Return success message if available
          if (resultObj.message) {
            return resultObj.message;
          }

          // Return error if failed
          if (resultObj.success === false && resultObj.error) {
            return `❌ Error: ${resultObj.error}`;
          }

          // Otherwise format as JSON
          return JSON.stringify(result, null, 2);
        }

        return String(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `❌ Error: ${errorMessage}`;
      }
    },

    // Optional: Custom render function for ag-ui
    render: definition.platformConfig?.agui?.renderingHints?.customRender
      ? (definition.platformConfig.agui.renderingHints.customRender as (props: {
          status: string;
          args: unknown;
          result: unknown;
        }) => React.ReactNode)
      : undefined,
  };
}

/**
 * Creates all CopilotKit actions from tool definitions
 *
 * @param definitions - Array of tool definitions
 * @param operations - Registry of core operations
 * @param context - SaaS tool context
 * @returns Array of CopilotKit actions
 */
export function createAllCopilotKitActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: SaaSToolContext,
): CopilotKitAction[] {
  const actions: CopilotKitAction[] = [];

  for (const definition of definitions) {
    const operation = operations[definition.operation];

    if (!operation) {
      console.warn(
        `[ag-ui Tools] No operation found for ${definition.name} (operation: ${definition.operation})`,
      );
      continue;
    }

    const action = createCopilotKitAction(definition, operation, context);
    actions.push(action);
  }

  console.log(`[ag-ui Tools] Created ${actions.length} CopilotKit actions`);

  return actions;
}
