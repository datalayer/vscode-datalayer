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

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { ToolOperation } from "@datalayer/jupyter-react";
import { validateWithZod } from "@datalayer/jupyter-react";
import type { PythonExtension } from "@vscode/python-extension";
import * as vscode from "vscode";

import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import {
  type ListKernelsParams,
  listKernelsParamsSchema,
} from "../schemas/listKernels";
import { hasIpykernel } from "../utils/ipykernelDetection";
import { ensurePythonExtensionActive } from "../utils/pythonExtensionActivation";

/**
 * Kernel information representing a local or cloud kernel available for execution.
 */
export interface KernelInfo {
  /** Unique identifier for the kernel. */
  id: string;
  /** Technical name of the kernel (e.g., "python3"). */
  name: string;
  /** Human-readable display name shown in UI. */
  displayName: string;
  /** Programming language supported by the kernel. */
  language: string;
  /** Execution environment type. */
  type: "local" | "cloud";
  /** Current operational status of the kernel. */
  status: "idle" | "busy" | "starting" | "stopped";
  /** Additional metadata about the kernel (e.g., Python path, environment info). */
  metadata?: Record<string, unknown>;
}

/**
 * Result of listing available kernels with optional chat context message.
 */
export interface ListKernelsResult {
  /** Array of available kernels matching the filter criteria. */
  kernels: KernelInfo[];
  /** Optional informative message for AI chat context about the kernels found. */
  chatMessage?: string;
}

/**
 * Discovers local Python/conda environments with ipykernel installed.
 * @param kernels - Array to append discovered kernels to.
 */
async function discoverLocalKernels(kernels: KernelInfo[]): Promise<void> {
  try {
    const pythonExt = vscode.extensions.getExtension("ms-python.python");
    if (pythonExt && !pythonExt.isActive) {
      await ensurePythonExtensionActive();
    }
    if (!pythonExt?.isActive) {
      return;
    }

    const pythonApi = pythonExt.exports as PythonExtension;
    for (const env of pythonApi.environments.known) {
      const version = env.version
        ? `${env.version.major}.${env.version.minor}.${env.version.micro}`
        : "unknown";
      const envType = env.environment?.type;
      const envName = env.environment?.name;
      const hasKernel = hasIpykernel(env.path, envType);

      if (!hasKernel) {
        continue;
      }

      const displayPrefix =
        envType?.toLowerCase() === "conda" ? "\uD83D\uDC0D" : "\uD83D\uDD37";
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
        metadata: { pythonPath: env.path, envType, envName, version },
      });
    }
  } catch (error) {
    console.error("[listKernels] Error getting local environments:", error);
  }
}

/**
 * Discovers active cloud runtimes and adds a "create new" option.
 * @param kernels - Array to append discovered kernels to.
 * @param datalayer - Datalayer client (may be undefined).
 * @param auth - Auth provider (may be undefined).
 */
async function discoverCloudKernels(
  kernels: KernelInfo[],
  datalayer: unknown,
  auth: unknown,
): Promise<void> {
  try {
    const datalayerClient = datalayer as DatalayerClient;
    const authProvider = auth as IAuthProvider;

    if (datalayerClient && authProvider?.isAuthenticated?.()) {
      const runtimes = await datalayerClient.listRuntimes();
      for (const runtime of runtimes) {
        const expiredAt = new Date(runtime.expiredAt).getTime();
        const minutesRemaining = Math.floor((expiredAt - Date.now()) / 60000);
        kernels.push({
          id: runtime.uid,
          name: runtime.givenName || runtime.uid,
          displayName: `\u2601\uFE0F ${runtime.givenName} (${minutesRemaining}min)`,
          language: "python",
          type: "cloud",
          status: "idle",
          metadata: {
            environmentName: runtime.environmentName,
            ingress: runtime.ingress,
            minutesRemaining,
            burningRate: runtime.burningRate,
          },
        });
      }
    }

    kernels.push({
      id: "CREATE_NEW_RUNTIME",
      name: "create-new",
      displayName: "\u26A1 " + vscode.l10n.t("Start New Runtime..."),
      language: "python",
      type: "cloud",
      status: "idle",
      metadata: {
        isCreateNewOption: true,
        requiresAuth: !(auth as IAuthProvider)?.isAuthenticated?.(),
      },
    });
  } catch (error) {
    console.error("[listKernels] Error getting cloud runtimes:", error);
  }
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
   * Executes the list kernels operation.
   *
   * @param params - Parameters controlling which kernels to list and how to filter them.
   * @param context - Execution context containing Datalayer client and auth provider.
   *
   * @returns Promise resolving to list of available kernels with optional chat message.
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
    const datalayer = (extras as Record<string, unknown>)?.datalayer;
    const auth = (extras as Record<string, unknown>)?.auth;

    const kernels: KernelInfo[] = [];

    // Always include Pyodide (browser-based Python kernel)
    kernels.push({
      id: "pyodide-local",
      name: "pyodide",
      displayName: "\uD83C\uDF10 " + vscode.l10n.t("Pyodide (Browser Python)"),
      language: "python",
      type: "local",
      status: "idle",
      metadata: {
        isPyodide: true,
        description: vscode.l10n.t(
          "Browser-based Python kernel powered by WebAssembly. No server required.",
        ),
      },
    });

    if (includeLocal) {
      await discoverLocalKernels(kernels);
    }

    if (includeCloud) {
      await discoverCloudKernels(kernels, datalayer, auth);
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

    let chatMessage = vscode.l10n.t(
      "Found {0} kernel(s)",
      filteredKernels.length,
    );
    if (pyodideCount > 0) {
      chatMessage += " " + vscode.l10n.t("(Pyodide browser Python)");
    }
    if (cloudCount > 0) {
      chatMessage +=
        " " +
        (cloudCount === 1
          ? vscode.l10n.t("({0} cloud runtime)", cloudCount)
          : vscode.l10n.t("({0} cloud runtimes)", cloudCount));
    }
    if (localCount > 0) {
      chatMessage +=
        " " +
        (localCount === 1
          ? vscode.l10n.t("({0} local environment)", localCount)
          : vscode.l10n.t("({0} local environments)", localCount));
    }
    if (hasCreateNew) {
      chatMessage += " + " + vscode.l10n.t("option to start new runtime");
    }

    return {
      kernels: filteredKernels,
      chatMessage,
    };
  },
};
