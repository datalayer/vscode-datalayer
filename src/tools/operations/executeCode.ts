/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { ToolOperation } from "@datalayer/jupyter-react";
import { formatResponse } from "@datalayer/jupyter-react";
import * as vscode from "vscode";

import { getRuntimesTreeProvider, getServiceContainer } from "../../extension";
import { ActiveRuntimeStrategy } from "../../services/autoConnect/strategies/activeRuntimeStrategy";
import { getActiveDocumentInfo } from "../../utils/activeDocument";
import { executeOnRuntime } from "../utils/runtimeExecutor";

/**
 * Execute code parameters
 */
export interface ExecuteCodeParams {
  code: string;
}

/**
 * Unified executeCode operation that routes to the correct document type.
 *
 * This operation examines the active document's URI scheme to determine whether
 * it's a notebook or lexical document, then delegates to the appropriate package
 * operation. If no document is active, it falls back to executing on an active
 * Datalayer runtime (if available).
 *
 * Execution flow:
 * 1. If document is open → use document's kernel (existing behavior)
 * 2. If no document but active runtime exists → execute on runtime (fallback)
 * 3. If no document and no runtime → return helpful error message
 *
 * @module tools/operations/executeCode
 */
/** Operation that routes code execution to the appropriate document or runtime. */
export const executeCodeOperation: ToolOperation<ExecuteCodeParams, unknown> = {
  name: "executeCode",

  async execute(params, context): Promise<unknown> {
    const { code } = params;

    // PRIMARY PATH: Check for active document and which editor is being used
    const docInfo = getActiveDocumentInfo();

    // Route to appropriate executeCode based on editor type
    if (docInfo) {
      const { uri, editorType } = docInfo;

      // Only execute on Datalayer custom editors, NOT native notebook editor
      if (editorType === "datalayer-notebook") {
        try {
          // Import notebook operations from /tools export (Node.js compatible, excludes React components)
          const {
            notebookToolOperations,
          } = require("@datalayer/jupyter-react/tools");

          // Resolve documentId from URI
          const services = getServiceContainer();
          const documentId = services.documentRegistry.getIdFromUri(
            uri.toString(),
          );

          // Pass documentId in context
          const result = await notebookToolOperations.executeCode.execute(
            { code },
            { ...context, documentId } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          );
          return result;
        } catch (error) {
          console.error("[executeCode] Notebook executeCode FAILED:", error);
          throw error;
        }
      } else if (editorType === "datalayer-lexical") {
        try {
          // Import lexical operations from /tools export (Node.js compatible, excludes React components)
          const {
            lexicalToolOperations,
          } = require("@datalayer/jupyter-lexical/lib/tools");

          // Resolve documentId from URI
          const services = getServiceContainer();
          const documentId = services.documentRegistry.getIdFromUri(
            uri.toString(),
          );

          // Pass documentId in context
          const result = await lexicalToolOperations.executeCode.execute(
            { code },
            { ...context, documentId } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          );
          return result;
        } catch (error) {
          console.error("[executeCode] Lexical executeCode FAILED:", error);
          throw error;
        }
      } else if (editorType === "native-notebook") {
      } else {
      }
    } else {
    }

    // FALLBACK PATH: No document, try runtime (new behavior)

    const runtimesTreeProvider = getRuntimesTreeProvider();
    if (!runtimesTreeProvider) {
      console.error("[executeCode] RuntimesTreeProvider is NULL");
      return await formatResponse(
        {
          success: false,
          error:
            "INTERNAL ERROR: Runtime tree provider not available. Cannot execute code without a document.",
        },
        context.format,
      );
    }

    // Check what runtimes are cached
    const cachedRuntimes = runtimesTreeProvider.getCachedRuntimes();
    if (cachedRuntimes.length > 0) {
    }

    // Use ActiveRuntimeStrategy to select best runtime (most time remaining)
    const strategy = new ActiveRuntimeStrategy();
    const runtime = await strategy.tryConnect({
      runtimesTreeProvider,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!runtime) {
      console.error(
        "[executeCode] ActiveRuntimeStrategy returned NULL runtime",
      );

      // Provide specific error based on what's actually missing
      if (cachedRuntimes.length === 0) {
        return formatResponse(
          {
            success: false,
            error:
              "NO ACTIVE DOCUMENT: No notebook or lexical document is currently open.\n" +
              "NO RUNNING RUNTIMES: No Datalayer runtimes are currently running.\n" +
              "SOLUTION: Either open a notebook/lexical document with a connected kernel, OR start a Datalayer runtime from the Runtimes panel.",
          },
          context.format,
        );
      } else {
        // Runtimes exist but strategy couldn't select one (maybe expired?)
        return formatResponse(
          {
            success: false,
            error:
              "NO ACTIVE DOCUMENT: No notebook or lexical document is currently open.\n" +
              `RUNTIMES UNAVAILABLE: Found ${cachedRuntimes.length} runtime(s) but none are usable (may be expired or invalid).\n` +
              "SOLUTION: Open a notebook/lexical document with a connected kernel, OR start a new Datalayer runtime.",
          },
          context.format,
        );
      }
    }

    // Notify user about runtime execution (fire-and-forget)
    void vscode.window.showInformationMessage(
      `Executing code on runtime: ${runtime.givenName}`,
    );

    // Execute on runtime
    const result = await executeOnRuntime(runtime, code);

    // Apply formatting (TOON or JSON) based on context.format
    return formatResponse(result, context.format);
  },
};
