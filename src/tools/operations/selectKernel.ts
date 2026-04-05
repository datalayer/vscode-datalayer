/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Select Kernel Operation
 *
 * @module tools/operations/selectKernel
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { ToolOperation } from "@datalayer/jupyter-react";
import { validateWithZod } from "@datalayer/jupyter-react";
import type { PythonExtension } from "@vscode/python-extension";
import * as vscode from "vscode";

import { getValidatedSettingsGroup } from "../../services/config/settingsValidator";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import type { IKernelBridge } from "../../services/interfaces/IKernelBridge";
import type { NativeKernelInfo } from "../../services/kernel/nativeKernelIntegration";
import { generateRuntimeName } from "../../utils/runtimeNameGenerator";
import {
  type SelectKernelParams,
  selectKernelParamsSchema,
} from "../schemas/selectKernel";
import { ensurePythonExtensionActive } from "../utils/pythonExtensionActivation";
import { getActiveDocumentOperation } from "./getActiveDocument";

/**
 * Result of a kernel selection operation including connection status.
 */
export interface SelectKernelResult {
  success: boolean;
  kernelId?: string;
  documentUri?: string;
  message: string;
  error?: string;
  chatMessage?: string;
}

/**
 * Common context passed to kernel handler functions.
 */
interface KernelHandlerContext {
  datalayer: DatalayerClient;
  auth: IAuthProvider;
  kernelBridge: IKernelBridge;
  documentUri: vscode.Uri;
}

/**
 * Creates an error result for unauthenticated cloud operations.
 * @param action - Description of the operation that requires authentication.
 *
 * @returns A failed SelectKernelResult with an authentication error message.
 */
function notAuthenticatedResult(action: string): SelectKernelResult {
  return {
    success: false,
    error: "Not authenticated",
    message: vscode.l10n.t(
      "Cannot {0} - not authenticated to Datalayer",
      action,
    ),
    chatMessage: vscode.l10n.t(
      "Not authenticated. Please sign in to access cloud runtimes.",
    ),
  };
}

/**
 * Handles the "active runtime" kernel selection by finding the single running runtime.
 * @param ctx - Kernel handler context with authenticated Datalayer client and bridge.
 *
 * @returns Connection result indicating success or failure with diagnostic details.
 */
async function handleActiveRuntime(
  ctx: KernelHandlerContext,
): Promise<SelectKernelResult> {
  if (!ctx.datalayer || !ctx.auth?.isAuthenticated?.()) {
    return notAuthenticatedResult("connect to active runtime");
  }

  const runtimes = await ctx.datalayer.listRuntimes();
  const runningRuntimes = runtimes.filter((r) => r.ingress);

  if (runningRuntimes.length === 0) {
    return {
      success: false,
      error: "No running runtimes found",
      message: vscode.l10n.t(
        "No active runtimes found. Use listKernels to see available options or create a new runtime.",
      ),
      chatMessage: vscode.l10n.t(
        "No running runtimes found. Create a new runtime with 'new' or use a specific runtime ID.",
      ),
    };
  }

  if (runningRuntimes.length > 1) {
    const runtimeNames = runningRuntimes
      .map((r) => `"${r.givenName || r.podName}"`)
      .join(", ");
    return {
      success: false,
      error: "Multiple runtimes found",
      message: vscode.l10n.t(
        "Found {0} running runtimes: {1}. Please specify which one to connect to.",
        runningRuntimes.length,
        runtimeNames,
      ),
      chatMessage: vscode.l10n.t(
        "Multiple runtimes running ({0}). Please specify which runtime to use.",
        runningRuntimes.length,
      ),
    };
  }

  const runtime = runningRuntimes[0]!;
  await ctx.kernelBridge.connectWebviewDocument(ctx.documentUri, runtime);

  const runtimeDisplayName = runtime.givenName || runtime.podName;
  return {
    success: true,
    kernelId: runtime.uid,
    documentUri: ctx.documentUri.toString(),
    message: vscode.l10n.t('Connected to runtime "{0}"', runtimeDisplayName),
    chatMessage: vscode.l10n.t("Connected to {0}", runtimeDisplayName),
  };
}

/**
 * Handles connecting to the default local Python kernel.
 * @param ctx - Kernel handler context with bridge for local kernel connection.
 *
 * @returns Connection result with the local kernel identifier or an error.
 */
async function handleLocalDefault(
  ctx: KernelHandlerContext,
): Promise<SelectKernelResult> {
  await ensurePythonExtensionActive();
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");

  if (!pythonExtension?.isActive) {
    return {
      success: false,
      error: "Python extension not active",
      message: vscode.l10n.t(
        "Python extension is not installed or active. Install ms-python.python to use local kernels.",
      ),
      chatMessage: vscode.l10n.t(
        "Python extension not found. Install it to use local kernels.",
      ),
    };
  }

  const pythonApi = pythonExtension.exports as PythonExtension;
  const activeEnvPath = await pythonApi.environments.getActiveEnvironmentPath();
  if (!activeEnvPath) {
    return {
      success: false,
      error: "No active Python environment found",
      message: vscode.l10n.t(
        "No active Python environment found. Please select a Python interpreter in VS Code.",
      ),
      chatMessage: vscode.l10n.t(
        "No active Python environment. Select a Python interpreter first.",
      ),
    };
  }

  const environment =
    await pythonApi.environments.resolveEnvironment(activeEnvPath);
  if (!environment) {
    return {
      success: false,
      error: "Failed to resolve Python environment",
      message: vscode.l10n.t(
        "Failed to resolve the active Python environment.",
      ),
      chatMessage: vscode.l10n.t("Failed to resolve Python environment."),
    };
  }

  const pythonPath = environment.executable?.uri?.fsPath;
  if (!pythonPath) {
    return {
      success: false,
      error: "Failed to get Python executable path",
      message: vscode.l10n.t(
        "Could not determine Python executable path for the active environment.",
      ),
      chatMessage: vscode.l10n.t("Failed to resolve Python executable path."),
    };
  }

  const envName =
    environment.environment?.name || environment.path || "Python 3";
  const kernelInfo: NativeKernelInfo = {
    type: "python-environment",
    id: `python-env-${pythonPath}`,
    displayName: envName,
    pythonPath,
    environment,
    kernelSpec: { name: "python3", display_name: envName, language: "python" },
  };

  await ctx.kernelBridge.connectWebviewDocumentToLocalKernel(
    ctx.documentUri,
    kernelInfo,
  );

  return {
    success: true,
    kernelId: kernelInfo.id,
    documentUri: ctx.documentUri.toString(),
    message: vscode.l10n.t(
      'Connected to local Python environment "{0}"',
      envName,
    ),
    chatMessage: vscode.l10n.t("Connected to local IPykernel: {0}", envName),
  };
}

/**
 * Handles creating a new cloud runtime and connecting to it.
 * @param ctx - Kernel handler context with authenticated Datalayer client and bridge.
 * @param environmentType - Runtime environment variant such as "CPU" or "GPU".
 * @param durationMinutes - Maximum runtime duration in minutes before automatic shutdown.
 *
 * @returns Connection result after provisioning and connecting to the new runtime.
 */
async function handleCreateNewRuntime(
  ctx: KernelHandlerContext,
  environmentType: string | undefined,
  durationMinutes: number | undefined,
): Promise<SelectKernelResult> {
  if (!ctx.datalayer || !ctx.auth?.isAuthenticated?.()) {
    return notAuthenticatedResult("create new runtime");
  }

  const runtimeConfig = getValidatedSettingsGroup("runtime");
  const defaultMinutes = runtimeConfig.defaultMinutes;
  const defaultType = runtimeConfig.defaultType;
  const envType = environmentType || defaultType;
  const runtimeMinutes = durationMinutes || defaultMinutes;

  const environmentNameMap: Record<string, string> = {
    CPU: "python-cpu-env",
    GPU: "ai-env",
  };
  const targetEnvironmentName = environmentNameMap[envType];

  if (!targetEnvironmentName) {
    return {
      success: false,
      error: `Invalid environment type: ${envType}`,
      message: vscode.l10n.t(
        'Invalid environment type "{0}". Must be "CPU" or "GPU".',
        envType,
      ),
      chatMessage: vscode.l10n.t("Invalid environment type: {0}", envType),
    };
  }

  const environments = await ctx.datalayer.listEnvironments();
  if (!environments || environments.length === 0) {
    return {
      success: false,
      error: "No environments available",
      message: vscode.l10n.t(
        "No environments available on the Datalayer platform. Contact support.",
      ),
      chatMessage: vscode.l10n.t("No environments available on platform."),
    };
  }

  const environment = environments.find(
    (env) => env.name === targetEnvironmentName,
  );
  if (!environment) {
    const availableEnvs = environments.map((e) => e.name).join(", ");
    return {
      success: false,
      error: `Environment "${targetEnvironmentName}" not found`,
      message: vscode.l10n.t(
        'Environment "{0}" not found. Available: {1}',
        targetEnvironmentName,
        availableEnvs,
      ),
      chatMessage: vscode.l10n.t(
        'Environment "{0}" not available.',
        targetEnvironmentName,
      ),
    };
  }

  const generatedName = generateRuntimeName();
  const creditsLimit = (runtimeMinutes * environment.burningRate) / 60;

  let runtime = await ctx.datalayer.createRuntime(
    environment.name,
    "notebook",
    generatedName,
    creditsLimit,
    undefined,
  );

  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const refreshed = await ctx.datalayer.getRuntime(runtime.podName);
    if (refreshed?.ingress) {
      runtime = refreshed;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!runtime.ingress) {
    return {
      success: false,
      error: "Runtime creation timed out",
      message: vscode.l10n.t(
        'Runtime "{0}" was created but did not become ready in time. Check the Datalayer dashboard.',
        generatedName,
      ),
      chatMessage: vscode.l10n.t(
        "Runtime creation timed out. Check Datalayer dashboard.",
      ),
    };
  }

  await ctx.kernelBridge.connectWebviewDocument(ctx.documentUri, runtime);

  return {
    success: true,
    kernelId: runtime.uid,
    documentUri: ctx.documentUri.toString(),
    message: vscode.l10n.t(
      'Created and connected to {0} runtime "{1}" ({2} min)',
      envType,
      generatedName,
      runtimeMinutes,
    ),
    chatMessage: vscode.l10n.t(
      'Started new {0} runtime "{1}" ({2} minutes)',
      envType,
      generatedName,
      runtimeMinutes,
    ),
  };
}

/**
 * Handles connecting to an existing cloud runtime by ID.
 * @param ctx - Kernel handler context with authenticated Datalayer client and bridge.
 * @param normalizedKernelId - Runtime identifier, optionally prefixed with "runtime-".
 *
 * @returns Connection result after locating and connecting to the specified runtime.
 */
async function handleCloudRuntime(
  ctx: KernelHandlerContext,
  normalizedKernelId: string,
): Promise<SelectKernelResult> {
  if (!ctx.datalayer || !ctx.auth?.isAuthenticated?.()) {
    return notAuthenticatedResult("connect to runtime");
  }

  const runtimeUid = normalizedKernelId.startsWith("runtime-")
    ? normalizedKernelId.replace("runtime-", "")
    : normalizedKernelId;

  const runtime = await ctx.datalayer.getRuntime(runtimeUid);
  if (!runtime) {
    return {
      success: false,
      error: `Runtime ${runtimeUid} not found`,
      message: vscode.l10n.t(
        'Runtime "{0}" not found. Use listKernels to see available runtimes.',
        runtimeUid,
      ),
      chatMessage: vscode.l10n.t("Runtime not found: {0}", runtimeUid),
    };
  }

  if (!runtime.ingress) {
    const cloudRuntimeName = runtime.givenName || runtime.podName;
    return {
      success: false,
      error: `Runtime ${runtimeUid} is not ready`,
      message: vscode.l10n.t(
        'Runtime "{0}" is not ready. It may still be starting.',
        cloudRuntimeName,
      ),
      chatMessage: vscode.l10n.t("Runtime not ready: {0}", cloudRuntimeName),
    };
  }

  await ctx.kernelBridge.connectWebviewDocument(ctx.documentUri, runtime);

  const cloudDisplayName = runtime.givenName || runtime.podName;
  return {
    success: true,
    kernelId: runtime.uid,
    documentUri: ctx.documentUri.toString(),
    message: vscode.l10n.t('Connected to runtime "{0}"', cloudDisplayName),
    chatMessage: vscode.l10n.t("Connected to {0}", cloudDisplayName),
  };
}

/**
 * Handles connecting to a specific local Python environment by path.
 * @param ctx - Kernel handler context with bridge for local kernel connection.
 * @param kernelId - Identifier in the format "python-env-{pythonPath}" specifying which environment to use.
 *
 * @returns Connection result after resolving the Python environment and connecting.
 */
async function handleLocalPython(
  ctx: KernelHandlerContext,
  kernelId: string,
): Promise<SelectKernelResult> {
  const pythonPath = kernelId.replace("python-env-", "");

  await ensurePythonExtensionActive();
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");

  if (!pythonExtension?.isActive) {
    return {
      success: false,
      error: "Python extension not active",
      message: vscode.l10n.t(
        "Python extension is not installed or active. Install ms-python.python to use local kernels.",
      ),
      chatMessage: vscode.l10n.t(
        "Python extension not found. Install it to use local kernels.",
      ),
    };
  }

  const pythonApi = pythonExtension.exports as PythonExtension;
  const environments = pythonApi.environments.known;
  const environment = environments.find(
    (env) =>
      env.path === pythonPath || env.executable?.uri?.fsPath === pythonPath,
  );

  if (!environment) {
    return {
      success: false,
      error: `Python environment not found: ${pythonPath}`,
      message: vscode.l10n.t(
        "Python environment not found at path: {0}",
        pythonPath,
      ),
      chatMessage: vscode.l10n.t("Python environment not found."),
    };
  }

  const resolvedPythonPath = environment.executable?.uri?.fsPath;
  if (!resolvedPythonPath) {
    return {
      success: false,
      error: "Failed to get Python executable path",
      message: vscode.l10n.t(
        "Could not determine Python executable path for environment at {0}",
        pythonPath,
      ),
      chatMessage: vscode.l10n.t("Failed to resolve Python executable path."),
    };
  }

  const envName =
    environment.environment?.name || environment.path || "Python 3";
  const kernelInfo: NativeKernelInfo = {
    type: "python-environment",
    id: kernelId,
    displayName: envName,
    pythonPath: resolvedPythonPath,
    environment,
    kernelSpec: { name: "python3", display_name: envName, language: "python" },
  };

  await ctx.kernelBridge.connectWebviewDocumentToLocalKernel(
    ctx.documentUri,
    kernelInfo,
  );

  return {
    success: true,
    kernelId,
    documentUri: ctx.documentUri.toString(),
    message: vscode.l10n.t(
      'Connected to local Python environment "{0}"',
      envName,
    ),
    chatMessage: vscode.l10n.t("Connected to {0}", envName),
  };
}

/** Map of human-friendly aliases to normalized kernel IDs. */
const KERNEL_ALIAS_MAP: Record<string, string> = {
  active: "ACTIVE_RUNTIME",
  current: "ACTIVE_RUNTIME",
  local: "LOCAL_IPYKERNEL",
  ipykernel: "LOCAL_IPYKERNEL",
  new: "CREATE_NEW_RUNTIME",
  create: "CREATE_NEW_RUNTIME",
  pyodide: "PYODIDE_KERNEL",
};

/**
 * Select Kernel Operation
 *
 * Selects and connects a kernel to the active document (notebook or lexical) for code execution.
 * Supports natural language aliases like 'active', 'local', 'new', etc.
 */
export const selectKernelOperation: ToolOperation<
  SelectKernelParams,
  SelectKernelResult
> = {
  name: "selectKernel",

  async execute(params, context): Promise<SelectKernelResult> {
    const validated = validateWithZod(
      selectKernelParamsSchema,
      params,
      "selectKernel",
    );
    const { kernelId, environmentType, durationMinutes } = validated;
    const { extras } = context;
    const datalayer = (extras as Record<string, unknown>)
      ?.datalayer as DatalayerClient;
    const auth = (extras as Record<string, unknown>)?.auth as IAuthProvider;
    const kernelBridge = (extras as Record<string, unknown>)
      ?.kernelBridge as IKernelBridge;

    try {
      console.log("[selectKernel] Selecting kernel:", {
        kernelId,
        environmentType,
        durationMinutes,
      });

      const normalizedKernelId =
        KERNEL_ALIAS_MAP[kernelId.toLowerCase().trim()] || kernelId;

      const activeDoc = await getActiveDocumentOperation.execute({}, context);
      if (!activeDoc.uri) {
        return {
          success: false,
          error: "No active document",
          message: vscode.l10n.t(
            "No notebook or lexical document is currently active. Open a document first.",
          ),
          chatMessage: vscode.l10n.t(
            "No active document. Please open a notebook or lexical document first.",
          ),
        };
      }

      const documentUri = vscode.Uri.parse(activeDoc.uri);
      const ctx: KernelHandlerContext = {
        datalayer,
        auth,
        kernelBridge,
        documentUri,
      };

      if (normalizedKernelId === "ACTIVE_RUNTIME") {
        return handleActiveRuntime(ctx);
      }
      if (normalizedKernelId === "LOCAL_IPYKERNEL") {
        return handleLocalDefault(ctx);
      }
      if (
        normalizedKernelId === "PYODIDE_KERNEL" ||
        normalizedKernelId === "pyodide-local"
      ) {
        await kernelBridge.connectWebviewDocumentToPyodide(documentUri);
        return {
          success: true,
          kernelId: "pyodide-local",
          documentUri: documentUri.toString(),
          message: vscode.l10n.t(
            "Connected to Pyodide (browser-based Python kernel)",
          ),
          chatMessage: vscode.l10n.t(
            "Connected to Pyodide - browser Python (no server required!)",
          ),
        };
      }
      if (normalizedKernelId === "CREATE_NEW_RUNTIME") {
        return handleCreateNewRuntime(ctx, environmentType, durationMinutes);
      }
      if (normalizedKernelId.startsWith("python-env-")) {
        return handleLocalPython(ctx, kernelId);
      }

      // Cloud runtime (by ID or runtime- prefix)
      if (
        normalizedKernelId.startsWith("runtime-") ||
        !normalizedKernelId.startsWith("python-env-")
      ) {
        return handleCloudRuntime(ctx, normalizedKernelId);
      }

      return {
        success: false,
        error: `Unknown kernel type: ${kernelId}`,
        message: vscode.l10n.t(
          'Could not recognize kernel ID "{0}". Use listKernels to see available options.',
          kernelId,
        ),
        chatMessage: vscode.l10n.t("Unknown kernel type: {0}", kernelId),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[selectKernel] Error:", error);
      return {
        success: false,
        error: `Failed to select kernel: ${errorMessage}`,
        message: vscode.l10n.t("Failed to select kernel: {0}", errorMessage),
        chatMessage: vscode.l10n.t(
          "Could not connect to kernel: {0}",
          errorMessage,
        ),
      };
    }
  },
};
