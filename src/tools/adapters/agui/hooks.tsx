/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * React hooks for ag-ui tool registration
 *
 * @module tools/adapters/agui/hooks
 */

import { useEffect, useMemo } from "react";
import type { ToolDefinition } from "../../definitions/schema";
import type { ToolOperation } from "../../core/interfaces";
import type { SaaSToolContext } from "../saas/SaaSToolContext";
import { createAllCopilotKitActions } from "./AgUIToolAdapter";

// Type for useCopilotAction (from @copilotkit/react-core)
type UseCopilotActionFn = (action: {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any) => Promise<string>;
  render?: (props: any) => any;
}) => void;

/**
 * React hook that automatically registers all Datalayer tools with CopilotKit
 *
 * This hook converts unified tool definitions to CopilotKit actions and
 * registers them using useCopilotAction.
 *
 * @param definitions - Array of tool definitions (defaults to all)
 * @param operations - Registry of core operations (defaults to all)
 * @param context - SaaS tool context (required)
 * @param useCopilotAction - CopilotKit's useCopilotAction hook
 *
 * @example
 * ```typescript
 * import { useCopilotAction } from '@copilotkit/react-core';
 * import { useNotebookTools } from './tools/adapters/agui';
 *
 * function NotebookEditor() {
 *   const context = useSaaSToolContext(); // Your context hook
 *
 *   // Auto-register all notebook tools with CopilotKit
 *   useNotebookTools(context, useCopilotAction);
 *
 *   return <YourNotebookUI />;
 * }
 * ```
 */
export function useNotebookTools(
  context: SaaSToolContext,
  useCopilotAction: UseCopilotActionFn,
  definitions?: ToolDefinition[],
  operations?: Record<string, ToolOperation<any, any>>,
): void {
  // Import defaults if not provided
  const { allToolDefinitions } = require("../../definitions/tools");
  const { allOperations } = require("../../core/operations");

  const toolDefinitions = definitions || allToolDefinitions;
  const toolOperations = operations || allOperations;

  // Create CopilotKit actions from definitions
  const actions = useMemo(
    () => createAllCopilotKitActions(toolDefinitions, toolOperations, context),
    [toolDefinitions, toolOperations, context],
  );

  // Register each action with CopilotKit
  useEffect(() => {
    console.log(
      `[ag-ui Tools] Registering ${actions.length} tools with CopilotKit`,
    );

    actions.forEach((action) => {
      useCopilotAction(action);
      console.log(`[ag-ui Tools] ✓ Registered ${action.name}`);
    });

    return () => {
      console.log("[ag-ui Tools] Cleanup (if needed)");
    };
  }, [actions, useCopilotAction]);
}

/**
 * React hook that registers a single tool with CopilotKit
 *
 * Use this for selective tool registration or custom tools.
 *
 * @example
 * ```typescript
 * import { useSingleTool } from './tools/adapters/agui';
 *
 * function MyComponent() {
 *   const context = useSaaSToolContext();
 *
 *   // Register only insertCell tool
 *   useSingleTool(insertCellTool, insertCellOperation, context, useCopilotAction);
 *
 *   return <UI />;
 * }
 * ```
 */
export function useSingleTool(
  definition: ToolDefinition,
  operation: ToolOperation<any, any>,
  context: SaaSToolContext,
  useCopilotAction: UseCopilotActionFn,
): void {
  const action = useMemo(
    () => {
      const { createCopilotKitAction } = require("./AgUIToolAdapter");
      return createCopilotKitAction(definition, operation, context);
    },
    [definition, operation, context],
  );

  useEffect(() => {
    console.log(`[ag-ui Tools] Registering ${action.name}`);
    useCopilotAction(action);

    return () => {
      console.log(`[ag-ui Tools] Cleanup for ${action.name}`);
    };
  }, [action, useCopilotAction]);
}

/**
 * React hook that provides tool actions without auto-registration
 *
 * Use this when you want manual control over registration or need
 * to inspect actions before registering.
 *
 * @returns Array of CopilotKit actions ready for registration
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const context = useSaaSToolContext();
 *   const actions = useToolActions(context);
 *
 *   // Manually register specific actions
 *   actions.filter(a => a.name.includes('cell')).forEach(useCopilotAction);
 *
 *   return <UI />;
 * }
 * ```
 */
export function useToolActions(
  context: SaaSToolContext,
  definitions?: ToolDefinition[],
  operations?: Record<string, ToolOperation<any, any>>,
): ReturnType<typeof createAllCopilotKitActions> {
  const { allToolDefinitions } = require("../../definitions/tools");
  const { allOperations } = require("../../core/operations");

  const toolDefinitions = definitions || allToolDefinitions;
  const toolOperations = operations || allOperations;

  return useMemo(
    () => createAllCopilotKitActions(toolDefinitions, toolOperations, context),
    [toolDefinitions, toolOperations, context],
  );
}
