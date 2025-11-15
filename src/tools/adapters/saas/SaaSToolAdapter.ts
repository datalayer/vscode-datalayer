/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SaaS Tool Adapter - Wraps operations for web context
 *
 * @module tools/adapters/saas/SaaSToolAdapter
 */

import type { ToolDefinition } from "../../definitions/schema";
import type {
  ToolOperation,
  ToolExecutionContext,
} from "../../core/interfaces";
import type { SaaSToolContext } from "./SaaSToolContext";

/**
 * SaaS Tool Adapter
 *
 * This adapter wraps core operations for execution in the SaaS
 * (browser) environment. Unlike VS Code, SaaS has:
 * - Direct access to Jupyter widgets (no message passing)
 * - Multiple open documents (tabs)
 * - Always-available SDK and auth
 *
 * Usage:
 * ```typescript
 * const adapter = new SaaSToolAdapter(insertCellTool, insertCellOperation, saasContext);
 * const result = await adapter.execute({ cellType: 'code', cellSource: 'x = 42' });
 * ```
 */
export class SaaSToolAdapter<TParams, TResult> {
  constructor(
    private readonly definition: ToolDefinition,
    private readonly operation: ToolOperation<TParams, TResult>,
    private readonly saasContext: SaaSToolContext,
  ) {}

  /**
   * Executes the tool operation in SaaS context
   */
  async execute(params: TParams): Promise<TResult> {
    try {
      // Build execution context
      const context = this.buildExecutionContext(params);

      // Execute core operation (same as VS Code!)
      const result = await this.operation.execute(params, context);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`${this.definition.displayName} failed: ${errorMessage}`);
    }
  }

  /**
   * Builds execution context for SaaS environment
   */
  private buildExecutionContext(params: TParams): ToolExecutionContext {
    const context: ToolExecutionContext = {
      sdk: this.saasContext.sdk,
      auth: this.saasContext.auth,
    };

    // Check if this tool needs a document handle
    const needsDocument = this.definition.tags?.includes("cell");

    if (needsDocument) {
      context.document = this.resolveDocumentHandle(params);
    }

    // Add SaaS-specific extras
    context.extras = {
      // Callback for local file creation (downloads file in browser)
      createLocalFile: async (filename: string, content: unknown) => {
        const contentStr = JSON.stringify(content, null, 2);
        const blob = new Blob([contentStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        // Trigger download
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);

        return `file:///${filename}`; // Pseudo-URI
      },

      // Runtime connection callback (SaaS version)
      connectRuntimeCallback: async (
        runtimeName?: string,
        notebookUri?: string,
      ) => {
        // In SaaS, runtime connection is handled by the UI
        // This would trigger the runtime connection dialog/flow
        console.log("Connecting runtime:", runtimeName, "to", notebookUri);

        // Return mock runtime for now
        // Real implementation would use SaaS runtime management APIs
        return {
          podName: runtimeName || "default-runtime",
          uid: "runtime-uid",
        };
      },

      // Default runtime duration (from app settings or config)
      defaultRuntimeDuration: 10,

      // SaaS app reference for advanced operations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app: (this.saasContext as any).app,
    };

    return context;
  }

  /**
   * Resolves document handle from parameters or active document
   */
  private resolveDocumentHandle(params: TParams) {
    // Try to get document ID from parameters
    const paramsWithId = params as {
      notebook_uri?: string;
      document_id?: string;
    };
    const docId = paramsWithId.notebook_uri || paramsWithId.document_id;

    const notebook = docId
      ? this.saasContext.getDocumentById(docId)
      : this.saasContext.getActiveDocument();

    if (!notebook) {
      throw new Error(
        "No active notebook found. Please open a notebook and try again.",
      );
    }

    return this.saasContext.createDocumentHandle(notebook);
  }

  /**
   * Gets tool definition (for introspection)
   */
  getDefinition(): ToolDefinition {
    return this.definition;
  }

  /**
   * Gets operation (for introspection)
   */
  getOperation(): ToolOperation<TParams, TResult> {
    return this.operation;
  }
}

/**
 * Creates SaaS tool adapters for all tool definitions
 */
export function createSaaSToolAdapters(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<unknown, unknown>>,
  context: SaaSToolContext,
): Map<string, SaaSToolAdapter<unknown, unknown>> {
  const adapters = new Map<string, SaaSToolAdapter<unknown, unknown>>();

  for (const definition of definitions) {
    const operation = operations[definition.operation];

    if (!operation) {
      console.warn(
        `[SaaS Tools] No operation found for ${definition.name} (operation: ${definition.operation})`,
      );
      continue;
    }

    const adapter = new SaaSToolAdapter(definition, operation, context);
    adapters.set(definition.name, adapter);
  }

  return adapters;
}
