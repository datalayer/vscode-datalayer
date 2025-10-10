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
 * @see https://docs.copilotkit.ai/langgraph/frontend-actions
 * @module tools/adapters/agui/AgUIToolAdapter
 */

import type { ToolDefinition } from "../../definitions/schema";
import type {
  ToolOperation,
  ToolExecutionContext,
} from "@datalayer/jupyter-react";

/**
 * CopilotKit parameter definition (array format, not JSON Schema)
 */
export interface CopilotKitParameter {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "object[]";
  description?: string;
  required?: boolean;
  attributes?: CopilotKitParameter[];
}

/**
 * CopilotKit action definition (matches useCopilotAction interface)
 */
export interface CopilotKitAction {
  /** Action name */
  name: string;

  /** Description for AI model */
  description: string;

  /** Parameters array (NOT JSON Schema) */
  parameters: CopilotKitParameter[];

  /** Handler function */
  handler: (params: unknown) => Promise<string>;

  /** Optional custom UI renderer */
  render?: (props: {
    status: string;
    args: unknown;
    result: unknown;
  }) => React.ReactNode;
}

/**
 * Converts JSON Schema to CopilotKit parameter array format
 *
 * @param jsonSchema - JSON Schema parameters object
 * @returns CopilotKit parameters array
 */
function jsonSchemaToParameters(
  jsonSchema: ToolDefinition["parameters"],
): CopilotKitParameter[] {
  const parameters: CopilotKitParameter[] = [];
  const required = jsonSchema.required || [];

  for (const [name, schema] of Object.entries(jsonSchema.properties || {})) {
    const propSchema = schema as {
      type?: string;
      description?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };

    // Map JSON Schema type to CopilotKit type
    const copilotType =
      (propSchema.type as
        | "string"
        | "number"
        | "boolean"
        | "object"
        | "object[]"
        | undefined) || "string";

    const param: CopilotKitParameter = {
      name,
      type: copilotType,
      description: propSchema.description,
      required: required.includes(name),
    };

    // Handle nested object properties (for object types)
    if (propSchema.type === "object" && propSchema.properties) {
      // Cast to proper type for recursive call
      param.attributes = jsonSchemaToParameters({
        type: "object",
        properties: propSchema.properties as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        required: propSchema.required || [],
      });
    }

    parameters.push(param);
  }

  console.log(
    "[ag-ui] Converted parameters:",
    JSON.stringify(parameters, null, 2),
  );
  return parameters;
}

/**
 * Converts unified tool definition to CopilotKit action format
 *
 * @param definition - Tool definition
 * @param operation - Core operation
 * @param context - Execution context (notebookId + executeCommand)
 * @returns CopilotKit action
 */
export function createCopilotKitAction(
  definition: ToolDefinition,
  operation: ToolOperation<unknown, unknown>,
  context: ToolExecutionContext,
): CopilotKitAction {
  return {
    name: definition.toolReferenceName || definition.name,
    description: definition.description,
    parameters: jsonSchemaToParameters(definition.parameters),

    handler: async (params: unknown): Promise<string> => {
      try {
        // Call operation directly - no adapter needed!
        const result = await operation.execute(params, context);

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
 * Creates CopilotKit actions from all tool definitions
 *
 * @param definitions - Tool definitions
 * @param operations - Core operations registry
 * @param context - Execution context (notebookId + executeCommand)
 * @returns CopilotKit actions
 */
export function createAllCopilotKitActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: ToolExecutionContext,
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
