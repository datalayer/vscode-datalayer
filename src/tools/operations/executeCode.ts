/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as vscode from "vscode";
import type { ToolOperation } from "@datalayer/jupyter-react";
import {
  notebookToolOperations,
  formatResponse,
} from "@datalayer/jupyter-react";
import { lexicalToolOperations } from "@datalayer/jupyter-lexical";
import { ActiveRuntimeStrategy } from "../../services/autoConnect/strategies/activeRuntimeStrategy";
import { getRuntimesTreeProvider, getServiceContainer } from "../../extension";
import { executeOnRuntime } from "../utils/runtimeExecutor";
import { getActiveDocumentInfo } from "../../utils/activeDocument";

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
export const executeCodeOperation: ToolOperation<ExecuteCodeParams, unknown> = {
  name: "executeCode",

  async execute(params, context): Promise<unknown> {
    const { code } = params;

    console.log("=== [executeCode] START EXECUTION ===");
    console.log(
      "[executeCode] Code to execute:",
      code.substring(0, 100) + (code.length > 100 ? "..." : ""),
    );
    console.log("[executeCode] Context format:", context.format);
    console.log("[executeCode] Context documentId:", context.documentId);
    console.log(
      "[executeCode] Context extras keys:",
      Object.keys(context.extras || {}),
    );

    // Log documentsContext if available
    if (context.extras?.documentsContext) {
      const docCtx = context.extras.documentsContext as {
        activeDocument?: {
          fileName: string;
          type: string;
          editorType: string;
          viewType?: string;
          scheme: string;
        };
        totalCount: number;
        counts: Record<string, number>;
      };
      console.log("[executeCode] DocumentsContext:", {
        activeDocument: docCtx.activeDocument
          ? {
              fileName: docCtx.activeDocument.fileName,
              type: docCtx.activeDocument.type,
              editorType: docCtx.activeDocument.editorType,
              viewType: docCtx.activeDocument.viewType,
              scheme: docCtx.activeDocument.scheme,
            }
          : "NONE",
        totalCount: docCtx.totalCount,
        counts: docCtx.counts,
      });
    } else {
      console.error("[executeCode] ❌ NO documentsContext in context.extras!");
    }

    // PRIMARY PATH: Check for active document and which editor is being used
    const docInfo = getActiveDocumentInfo();
    console.log(
      "[executeCode] Active document info:",
      docInfo
        ? {
            uri: docInfo.uri.toString(),
            editorType: docInfo.editorType,
            viewType: docInfo.viewType,
          }
        : "NONE",
    );

    // Route to appropriate executeCode based on editor type
    if (docInfo) {
      const { uri, editorType, viewType } = docInfo;
      console.log("[executeCode] Document scheme:", uri.scheme);
      console.log("[executeCode] Document path:", uri.path);
      console.log("[executeCode] Editor type:", editorType);
      console.log("[executeCode] View type:", viewType);

      // Extract filename
      const fileName = uri.path.split("/").pop() || "";
      console.log("[executeCode] Document filename:", fileName);

      // Only execute on Datalayer custom editors, NOT native notebook editor
      if (editorType === "datalayer-notebook") {
        console.log(
          "[executeCode] ✓ Delegating to Datalayer notebook executeCode",
        );
        try {
          // Resolve documentId from URI
          const services = getServiceContainer();
          const documentId = services.documentRegistry.getIdFromUri(
            uri.toString(),
          );
          console.log("[executeCode] Resolved documentId:", documentId);

          // Pass documentId in context
          const result = await notebookToolOperations.executeCode.execute(
            { code },
            { ...context, documentId } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          );
          console.log(
            "[executeCode] ✓ Notebook executeCode result:",
            typeof result,
          );
          return result;
        } catch (error) {
          console.error("[executeCode] ❌ Notebook executeCode FAILED:", error);
          throw error;
        }
      } else if (editorType === "datalayer-lexical") {
        console.log(
          "[executeCode] ✓ Delegating to Datalayer lexical executeCode",
        );
        console.log("[executeCode] Lexical context:", {
          documentId: context.documentId,
          hasExecutor: !!context.executor,
        });
        try {
          // Resolve documentId from URI
          const services = getServiceContainer();
          const documentId = services.documentRegistry.getIdFromUri(
            uri.toString(),
          );
          console.log("[executeCode] Resolved documentId:", documentId);

          // Pass documentId in context
          const result = await lexicalToolOperations.executeCode.execute(
            { code },
            { ...context, documentId } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          );
          console.log(
            "[executeCode] ✓ Lexical executeCode result:",
            typeof result,
          );
          console.log(
            "[executeCode] Result preview:",
            JSON.stringify(result).substring(0, 200),
          );
          return result;
        } catch (error) {
          console.error("[executeCode] ❌ Lexical executeCode FAILED:", error);
          throw error;
        }
      } else if (editorType === "native-notebook") {
        console.log(
          "[executeCode] ⚠️ Native VS Code notebook editor detected - not supported",
        );
        console.log("[executeCode] Falling through to runtime fallback");
      } else {
        console.log("[executeCode] ⚠️ Other editor type:", editorType);
        console.log("[executeCode] Falling through to runtime fallback");
      }
    } else {
      console.log("[executeCode] ⚠️ No active document detected");
    }

    // FALLBACK PATH: No document, try runtime (new behavior)
    console.log(
      "[executeCode] No active document, attempting runtime fallback...",
    );

    const runtimesTreeProvider = getRuntimesTreeProvider();
    if (!runtimesTreeProvider) {
      console.error("[executeCode] RuntimesTreeProvider is NULL");
      return formatResponse(
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
    console.log("[executeCode] Cached runtimes count:", cachedRuntimes.length);
    if (cachedRuntimes.length > 0) {
      console.log(
        "[executeCode] Cached runtimes:",
        cachedRuntimes.map((r) => ({
          name: r.givenName,
          uid: r.uid,
          expiredAt: r.expiredAt.toISOString(),
        })),
      );
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

    console.log(
      `[executeCode] Using runtime fallback: ${runtime.givenName} (${runtime.uid})`,
    );

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
