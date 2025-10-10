/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * React hooks and components for ag-ui (CopilotKit) tool registration.
 * Provides: useNotebookToolActions, CopilotActionsProvider, createNotebookToolActions.
 *
 * @module tools/adapters/agui/hooks
 */

import * as React from "react";
import { useEffect, useMemo } from "react";
import type { ToolDefinition } from "../../definitions/schema";
import type {
  ToolOperation,
  ToolExecutionContext,
} from "@datalayer/jupyter-react";

import {
  createAllCopilotKitActions,
  createCopilotKitAction,
} from "./AgUIToolAdapter";

// Import from jupyter-react
import { useNotebookStore2 } from "@datalayer/jupyter-react";

// Import DefaultExecutor from core tools
import { DefaultExecutor } from "@datalayer/jupyter-react";

// Type for useCopilotAction (from @copilotkit/react-core)
type UseCopilotActionFn = (action: {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any) => Promise<string>;
  render?: (props: any) => any;
}) => void;

/**
 * Creates CopilotKit actions from tool definitions without auto-registration.
 * Components must register actions individually using CopilotActionsProvider.
 *
 * @param definitions - Tool definitions
 * @param operations - Core operations registry
 * @param context - Execution context (notebookId + executeCommand)
 * @returns CopilotKit actions
 */
export function createNotebookToolActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<any, any>>,
  context: ToolExecutionContext,
): ReturnType<typeof createAllCopilotKitActions> {
  return createAllCopilotKitActions(definitions, operations, context);
}

/**
 * Hook that registers a single tool with CopilotKit.
 * For selective tool registration or custom tools.
 *
 * @param definition - Tool definition
 * @param operation - Tool operation
 * @param context - Execution context
 * @param useCopilotAction - CopilotKit's useCopilotAction hook
 */
export function useSingleTool(
  definition: ToolDefinition,
  operation: ToolOperation<any, any>,
  context: ToolExecutionContext,
  useCopilotAction: UseCopilotActionFn,
): void {
  const action = useMemo(() => {
    const { createCopilotKitAction } = require("./AgUIToolAdapter");
    return createCopilotKitAction(definition, operation, context);
  }, [definition, operation, context]);

  useEffect(() => {
    console.log(`[ag-ui Tools] Registering ${action.name}`);
    useCopilotAction(action);

    return () => {
      console.log(`[ag-ui Tools] Cleanup for ${action.name}`);
    };
  }, [action, useCopilotAction]);
}

/**
 * Hook that provides tool actions without auto-registration.
 * For manual control over registration.
 *
 * @param context - Execution context
 * @param definitions - Tool definitions (optional)
 * @param operations - Tool operations (optional)
 * @returns CopilotKit actions
 */
export function useToolActions(
  context: ToolExecutionContext,
  definitions?: ToolDefinition[],
  operations?: Record<string, ToolOperation<any, any>>,
): ReturnType<typeof createAllCopilotKitActions> {
  const toolDefinitions = definitions || [];
  const toolOperations = operations || {};

  return useMemo(
    () => createAllCopilotKitActions(toolDefinitions, toolOperations, context),
    [toolDefinitions, toolOperations, context],
  );
}

/**
 * Component that registers a single CopilotKit action at top level (for Rules of Hooks compliance)
 */
function CopilotActionRegistrar({
  action,
  useCopilotAction,
}: {
  action: ReturnType<typeof createCopilotKitAction>;
  useCopilotAction: UseCopilotActionFn;
}): null {
  useCopilotAction(action);
  return null;
}

/**
 * Component that registers multiple CopilotKit actions dynamically.
 * Creates separate component instance per action (Rules of Hooks compliance).
 *
 * @param actions - CopilotKit actions to register
 * @param children - Child components
 * @param useCopilotAction - CopilotKit's useCopilotAction hook
 */
export function CopilotActionsProvider({
  actions,
  children,
  useCopilotAction,
}: {
  actions: ReturnType<typeof createAllCopilotKitActions>;
  children: React.ReactNode;
  useCopilotAction: UseCopilotActionFn;
}): JSX.Element {
  return (
    <>
      {actions.map((action, index) => (
        <CopilotActionRegistrar
          key={`${action.name}-${index}`}
          action={action}
          useCopilotAction={useCopilotAction}
        />
      ))}
      {children}
    </>
  );
}

/**
 * Hook that creates CopilotKit actions for notebook tools.
 * Use with CopilotActionsProvider for registration.
 *
 * @param notebookId - Notebook ID
 * @returns CopilotKit actions
 *
 * @example
 * ```typescript
 * function AgUIExample() {
 *   const actions = useNotebookToolActions("my-notebook-id");
 *   return (
 *     <CopilotActionsProvider actions={actions} useCopilotAction={useCopilotAction}>
 *       <NotebookUI />
 *     </CopilotActionsProvider>
 *   );
 * }
 * ```
 */
export function useNotebookToolActions(
  notebookId: string,
): ReturnType<typeof createAllCopilotKitActions> {
  const notebookStore = useNotebookStore2();

  // Create DefaultExecutor (default executor with direct store access)
  // Note: notebookStore methods are stable, so we only depend on notebookId
  const executor = useMemo(
    () => new DefaultExecutor(notebookId, notebookStore),
    [notebookId],
  );

  // Create execution context with executor
  const context = useMemo(
    () => ({
      notebookId,
      executor,
    }),
    [notebookId, executor],
  );

  // Import notebook tools
  const {
    notebookToolDefinitions,
    notebookToolOperations,
  } = require("../../../../datalayer-react");

  // Create and return CopilotKit actions
  return useMemo(
    () =>
      createNotebookToolActions(
        notebookToolDefinitions,
        notebookToolOperations,
        context,
      ),
    [notebookToolDefinitions, notebookToolOperations, context],
  );
}
