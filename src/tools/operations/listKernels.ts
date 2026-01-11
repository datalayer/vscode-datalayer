/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * List Kernels Operation
 *
 * @module tools/operations/listKernels
 */

import * as vscode from "vscode";
import type { PythonExtension } from "@vscode/python-extension";
import type { ToolOperation } from "@datalayer/jupyter-react";
import { validateWithZod } from "@datalayer/jupyter-react";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import {
  listKernelsParamsSchema,
  type ListKernelsParams,
} from "../schemas/listKernels";
import { hasIpykernel } from "../utils/ipykernelDetection";
import { ensurePythonExtensionActive } from "../utils/pythonExtensionActivation";

/**
 * Kernel information representing a local or cloud kernel available for execution
 */
export interface KernelInfo {
  /** Unique identifier for the kernel */
  id: string;
  /** Technical name of the kernel (e.g., "python3") */
  name: string;
  /** Human-readable display name shown in UI */
  displayName: string;
  /** Programming language supported by the kernel */
  language: string;
  /** Execution environment type */
  type: "local" | "cloud";
  /** Current operational status of the kernel */
  status: "idle" | "busy" | "starting" | "stopped";
  /** Additional metadata about the kernel (e.g., Python path, environment info) */
  metadata?: Record<string, unknown>;
}

/**
 * Result of listing available kernels
 */
export interface ListKernelsResult {
  /** Array of available kernels matching the filter criteria */
  kernels: KernelInfo[];
  /** Optional informative message for AI chat context about the kernels found */
  chatMessage?: string;
}

/**
 * List Kernels Operation
 *
 * Lists all available kernels including local Jupyter kernels and cloud runtimes.
 * Supports filtering by name/language and selective inclusion of local vs cloud kernels.
 */
export const listKernelsOperation: ToolOperation<
  ListKernelsParams,
  ListKernelsResult
> = {
  name: "listKernels",

  /**
   * Execute the list kernels operation
   *
   * @param params - Parameters controlling which kernels to list and how to filter them
   * @param context - Execution context containing SDK client and auth provider
   * @returns Promise resolving to list of available kernels with optional chat message
   */
  async execute(params, context): Promise<ListKernelsResult> {
    // Validate params with Zod
    const validated = validateWithZod(
      listKernelsParamsSchema,
      params,
      "listKernels",
    );

    const { includeLocal, includeCloud, filter } = validated;
    const { extras } = context;
    const sdk = (extras as Record<string, unknown>)?.sdk;
    const auth = (extras as Record<string, unknown>)?.auth;

    const kernels: KernelInfo[] = [];

    // Always include Pyodide (browser-based Python kernel)
    kernels.push({
      id: "pyodide-local",
      name: "pyodide",
      displayName: "🌐 Pyodide (Browser Python)",
      language: "python",
      type: "local",
      status: "idle",
      metadata: {
        isPyodide: true,
        description:
          "Browser-based Python kernel powered by WebAssembly. No server required.",
      },
    });

    // Discover local Python/conda environments with ipykernel
    if (includeLocal) {
      try {
        const pythonExt = vscode.extensions.getExtension("ms-python.python");

        // If not active yet, trigger activation as fallback (shouldn't normally happen)
        if (pythonExt && !pythonExt.isActive) {
          await ensurePythonExtensionActive();
        }

        if (pythonExt?.isActive) {
          const pythonApi = pythonExt.exports as PythonExtension;
          const environments = pythonApi.environments.known;

          environments.forEach((env) => {
            const version = env.version
              ? `${env.version.major}.${env.version.minor}.${env.version.micro}`
              : "unknown";

            const envType = env.environment?.type; // "venv" | "conda" | "pyenv" | "poetry" | "global"
            const envName = env.environment?.name;

            // Fast filesystem check for ipykernel
            const hasKernel = hasIpykernel(env.path, envType);

            if (hasKernel) {
              const displayPrefix =
                envType?.toLowerCase() === "conda" ? "🐍" : "🔷";
              const displayName = envName
                ? `${displayPrefix} ${envName} (Python ${version})`
                : `${displayPrefix} Python ${version}`;

              kernels.push({
                id: `python-env-${env.path}`,
                name: "python3",
                displayName,
                language: "python",
                type: "local",
                status: "idle",
                metadata: {
                  pythonPath: env.path,
                  envType,
                  envName,
                  version,
                },
              });
            }
          });
        }
      } catch (error) {
        console.error("[listKernels] Error getting local environments:", error);
      }
    }

    // Discover active cloud runtimes
    if (includeCloud) {
      try {
        const sdkClient = sdk as DatalayerClient;
        const authProvider = auth as IAuthProvider;

        if (sdkClient && authProvider?.isAuthenticated?.()) {
          const runtimes = await sdkClient.listRuntimes();

          // Include ALL running runtimes (not just "ready" status)
          runtimes.forEach((runtime) => {
            const expiredAt = new Date(runtime.expiredAt).getTime();
            const minutesRemaining = Math.floor(
              (expiredAt - Date.now()) / 60000,
            );

            kernels.push({
              id: runtime.uid,
              name: runtime.givenName || runtime.uid,
              displayName: `☁️ ${runtime.givenName} (${minutesRemaining}min)`,
              language: "python",
              type: "cloud",
              status: "idle",
              metadata: {
                environmentName: runtime.environmentName,
                ingress: runtime.ingress,
                token: runtime.token,
                minutesRemaining,
                burningRate: runtime.burningRate,
              },
            });
          });
        }

        // Always show "Create New Runtime" option when includeCloud is true
        // (Authentication will be checked when user selects it)
        kernels.push({
          id: "CREATE_NEW_RUNTIME",
          name: "create-new",
          displayName: "⚡ Start New Runtime...",
          language: "python",
          type: "cloud",
          status: "idle",
          metadata: {
            isCreateNewOption: true,
            requiresAuth: !authProvider?.isAuthenticated?.(),
          },
        });
      } catch (error) {
        console.error("[listKernels] Error getting cloud runtimes:", error);
      }
    }

    // Apply filter if provided
    let filteredKernels = kernels;
    if (filter) {
      filteredKernels = kernels.filter(
        (k) =>
          k.name.toLowerCase().includes(filter.toLowerCase()) ||
          k.language.toLowerCase().includes(filter.toLowerCase()),
      );
    }

    // Build informative chat message
    const cloudCount = filteredKernels.filter(
      (k) => k.type === "cloud" && k.id !== "CREATE_NEW_RUNTIME",
    ).length;
    const pyodideCount = filteredKernels.filter(
      (k) => k.id === "pyodide-local",
    ).length;
    const localCount = filteredKernels.filter(
      (k) => k.type === "local" && k.id !== "pyodide-local",
    ).length;
    const hasCreateNew = filteredKernels.some(
      (k) => k.id === "CREATE_NEW_RUNTIME",
    );

    let chatMessage = `Found ${filteredKernels.length} kernel(s)`;
    if (pyodideCount > 0) {
      chatMessage += ` (Pyodide browser Python)`;
    }
    if (cloudCount > 0) {
      chatMessage += ` (${cloudCount} cloud runtime${cloudCount > 1 ? "s" : ""})`;
    }
    if (localCount > 0) {
      chatMessage += ` (${localCount} local environment${localCount > 1 ? "s" : ""})`;
    }
    if (hasCreateNew) {
      chatMessage += ` + option to start new runtime`;
    }

    return {
      kernels: filteredKernels,
      chatMessage,
    };
  },
};
