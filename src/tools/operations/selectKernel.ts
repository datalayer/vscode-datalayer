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

import * as vscode from "vscode";
import type { PythonExtension } from "@vscode/python-extension";
import type { ToolOperation } from "@datalayer/jupyter-react";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import type { IKernelBridge } from "../../services/interfaces/IKernelBridge";
import type { NativeKernelInfo } from "../../services/kernel/nativeKernelIntegration";
import {
  selectKernelParamsSchema,
  type SelectKernelParams,
} from "../schemas/selectKernel";
import { validateWithZod } from "@datalayer/jupyter-react/lib/tools/core/zodUtils";
import { generateRuntimeName } from "../../utils/runtimeNameGenerator";
import { ensurePythonExtensionActive } from "../utils/pythonExtensionActivation";
import { getActiveDocumentOperation } from "./getActiveDocument";

/**
 * Select kernel result
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
    // Validate params with Zod
    const validated = validateWithZod(
      selectKernelParamsSchema,
      params,
      "selectKernel",
    );

    const { kernelId, autoStart, environmentType, durationMinutes } = validated;
    const { extras } = context;
    const sdk = (extras as Record<string, unknown>)?.sdk as DatalayerClient;
    const auth = (extras as Record<string, unknown>)?.auth as IAuthProvider;
    const kernelBridge = (extras as Record<string, unknown>)
      ?.kernelBridge as IKernelBridge;

    try {
      console.log("[selectKernel] Selecting kernel:", {
        kernelId,
        autoStart,
        environmentType,
        durationMinutes,
      });

      // Step 1: Normalize human-friendly aliases to actual kernel IDs
      let normalizedKernelId = kernelId.toLowerCase().trim();

      // Handle aliases for natural language support
      const aliasMap: Record<string, string> = {
        active: "ACTIVE_RUNTIME",
        current: "ACTIVE_RUNTIME",
        local: "LOCAL_IPYKERNEL",
        ipykernel: "LOCAL_IPYKERNEL",
        new: "CREATE_NEW_RUNTIME",
        create: "CREATE_NEW_RUNTIME",
        pyodide: "PYODIDE_KERNEL", // Future support
      };

      normalizedKernelId = aliasMap[normalizedKernelId] || kernelId;

      // Step 2: Get active document (notebook or lexical) - always connect to active document
      const activeDoc = await getActiveDocumentOperation.execute({}, context);
      if (!activeDoc.uri) {
        return {
          success: false,
          error: "No active document",
          message:
            "No notebook or lexical document is currently active. Open a document first.",
          chatMessage:
            "❌ No active document. Please open a notebook or lexical document first.",
        };
      }
      const documentUri = vscode.Uri.parse(activeDoc.uri);

      // Step 3: Determine kernel type from normalized ID
      const isCreateNew = normalizedKernelId === "CREATE_NEW_RUNTIME";
      const isActiveRuntime = normalizedKernelId === "ACTIVE_RUNTIME";
      const isLocalDefault = normalizedKernelId === "LOCAL_IPYKERNEL";
      const isPyodide =
        normalizedKernelId === "PYODIDE_KERNEL" ||
        normalizedKernelId === "pyodide-local";
      const isCloudRuntime =
        normalizedKernelId.startsWith("runtime-") ||
        (!isCreateNew &&
          !isActiveRuntime &&
          !isLocalDefault &&
          !isPyodide &&
          !normalizedKernelId.startsWith("python-env-"));
      const isLocalPython = normalizedKernelId.startsWith("python-env-");

      // Handler: Active Runtime (Connect to Currently Running Runtime)
      if (isActiveRuntime) {
        // Get list of running runtimes
        if (!sdk || !auth?.isAuthenticated?.()) {
          return {
            success: false,
            error: "Not authenticated",
            message:
              "Cannot connect to active runtime - not authenticated to Datalayer",
            chatMessage:
              "❌ Not authenticated. Please sign in to access cloud runtimes.",
          };
        }

        const runtimes = await sdk.listRuntimes();
        const runningRuntimes = runtimes.filter((r) => r.ingress);

        if (runningRuntimes.length === 0) {
          return {
            success: false,
            error: "No running runtimes found",
            message:
              "No active runtimes found. Use listKernels to see available options or create a new runtime.",
            chatMessage:
              "❌ No running runtimes found. Create a new runtime with 'new' or use a specific runtime ID.",
          };
        }

        if (runningRuntimes.length > 1) {
          const runtimeNames = runningRuntimes
            .map((r) => `"${r.givenName || r.podName}"`)
            .join(", ");
          return {
            success: false,
            error: "Multiple runtimes found",
            message: `Found ${runningRuntimes.length} running runtimes: ${runtimeNames}. Please specify which one to connect to.`,
            chatMessage: `❌ Multiple runtimes running (${runningRuntimes.length}). Please specify which runtime to use.`,
          };
        }

        // Exactly one running runtime - use it
        const runtime = runningRuntimes[0];
        await kernelBridge.connectWebviewDocument(documentUri, runtime);

        return {
          success: true,
          kernelId: runtime.uid,
          documentUri: documentUri.toString(),
          message: `Connected to runtime "${runtime.givenName || runtime.podName}"`,
          chatMessage: `✅ Connected to ${runtime.givenName || runtime.podName}`,
        };
      }

      // Handler: Local IPykernel (Connect to Default Local Python)
      if (isLocalDefault) {
        // Get the default Python environment from VS Code Python extension
        await ensurePythonExtensionActive();
        const pythonExtension =
          vscode.extensions.getExtension("ms-python.python");

        if (!pythonExtension?.isActive) {
          return {
            success: false,
            error: "Python extension not active",
            message:
              "Python extension is not installed or active. Install ms-python.python to use local kernels.",
            chatMessage:
              "❌ Python extension not found. Install it to use local kernels.",
          };
        }

        const pythonApi = pythonExtension.exports as PythonExtension;

        // Get active/default Python environment
        const activeEnvPath =
          await pythonApi.environments.getActiveEnvironmentPath();
        if (!activeEnvPath) {
          return {
            success: false,
            error: "No active Python environment found",
            message:
              "No active Python environment found. Please select a Python interpreter in VS Code.",
            chatMessage:
              "❌ No active Python environment. Select a Python interpreter first.",
          };
        }

        const environment =
          await pythonApi.environments.resolveEnvironment(activeEnvPath);
        if (!environment) {
          return {
            success: false,
            error: "Failed to resolve Python environment",
            message: "Failed to resolve the active Python environment.",
            chatMessage: "❌ Failed to resolve Python environment.",
          };
        }

        // Extract Python path and environment name
        const pythonPath = environment.executable?.uri?.fsPath;
        if (!pythonPath) {
          return {
            success: false,
            error: "Failed to get Python executable path",
            message:
              "Could not determine Python executable path for the active environment.",
            chatMessage: "❌ Failed to resolve Python executable path.",
          };
        }

        const envName =
          environment.environment?.name || environment.path || "Python 3";

        // Create kernel info
        const kernelInfo: NativeKernelInfo = {
          type: "python-environment",
          id: `python-env-${pythonPath}`,
          displayName: envName,
          pythonPath: pythonPath,
          environment: environment,
          kernelSpec: {
            name: "python3",
            display_name: envName,
            language: "python",
          },
        };

        // Connect to local kernel
        await kernelBridge.connectWebviewDocumentToLocalKernel(
          documentUri,
          kernelInfo,
        );

        return {
          success: true,
          kernelId: kernelInfo.id,
          documentUri: documentUri.toString(),
          message: `Connected to local Python environment "${envName}"`,
          chatMessage: `✅ Connected to local IPykernel: ${envName}`,
        };
      }

      // Handler: Pyodide Kernel (Browser-based Python)
      if (isPyodide) {
        // Connect to Pyodide (webview will initialize browser-based Python kernel)
        await kernelBridge.connectWebviewDocumentToPyodide(documentUri);

        return {
          success: true,
          kernelId: "pyodide-local",
          documentUri: documentUri.toString(),
          message: "Connected to Pyodide (browser-based Python kernel)",
          chatMessage:
            "✅ Connected to Pyodide - browser Python (no server required!)",
        };
      }

      // Handler: Create New Runtime (Fully Automated)
      if (isCreateNew) {
        // Check authentication
        if (!sdk || !auth?.isAuthenticated?.()) {
          return {
            success: false,
            error: "Not authenticated",
            message:
              "Cannot create new runtime - not authenticated to Datalayer",
            chatMessage:
              "❌ Not authenticated. Please sign in to create cloud runtimes.",
          };
        }

        // 1. Get default config from VS Code settings
        const config = vscode.workspace.getConfiguration("datalayer.runtime");
        const defaultMinutes = config.get<number>("defaultMinutes", 3);
        const defaultType = config.get<string>("defaultType", "CPU"); // "CPU" or "GPU"

        // 2. Determine environment type and duration (parameters override settings)
        const envType = environmentType || defaultType;
        const runtimeMinutes = durationMinutes || defaultMinutes;

        // 3. Map type to environment name
        const environmentNameMap: Record<string, string> = {
          CPU: "python-cpu-env",
          GPU: "ai-env",
        };
        const targetEnvironmentName = environmentNameMap[envType];

        if (!targetEnvironmentName) {
          return {
            success: false,
            error: `Invalid environment type: ${envType}`,
            message: `Invalid environment type "${envType}". Must be "CPU" or "GPU".`,
            chatMessage: `❌ Invalid environment type: ${envType}`,
          };
        }

        // 4. List available environments and find the target
        const environments = await sdk.listEnvironments();
        if (!environments || environments.length === 0) {
          return {
            success: false,
            error: "No environments available",
            message:
              "No environments available on the Datalayer platform. Contact support.",
            chatMessage: "❌ No environments available on platform.",
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
            message: `Environment "${targetEnvironmentName}" not found. Available: ${availableEnvs}`,
            chatMessage: `❌ Environment "${targetEnvironmentName}" not available.`,
          };
        }

        // 5. Auto-generate name
        const generatedName = generateRuntimeName();

        // 6. Calculate credits from minutes
        const creditsLimit = (runtimeMinutes * environment.burningRate) / 60;

        // 7. Create runtime (no snapshot)
        let runtime = await sdk.createRuntime(
          environment.name,
          "notebook",
          generatedName,
          creditsLimit,
          undefined, // no snapshot
        );

        // 8. Wait for runtime to be ready
        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
          const refreshed = await sdk.getRuntime(runtime.podName);
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
            message: `Runtime "${generatedName}" was created but didn't become ready in time. Check the Datalayer dashboard.`,
            chatMessage: `❌ Runtime creation timed out. Check Datalayer dashboard.`,
          };
        }

        // 9. Connect to newly created runtime
        await kernelBridge.connectWebviewDocument(documentUri, runtime);

        return {
          success: true,
          kernelId: runtime.uid,
          documentUri: documentUri.toString(),
          message: `Created and connected to ${envType} runtime "${generatedName}" (${runtimeMinutes} min)`,
          chatMessage: `✅ Started new ${envType} runtime "${generatedName}" (${runtimeMinutes} minutes)`,
        };
      }

      // Handler: Existing Cloud Runtime
      if (isCloudRuntime) {
        // Check authentication
        if (!sdk || !auth?.isAuthenticated?.()) {
          return {
            success: false,
            error: "Not authenticated",
            message:
              "Cannot connect to runtime - not authenticated to Datalayer",
            chatMessage:
              "❌ Not authenticated. Please sign in to access cloud runtimes.",
          };
        }

        // 1. Extract runtime UID from kernelId
        const runtimeUid = normalizedKernelId.startsWith("runtime-")
          ? normalizedKernelId.replace("runtime-", "")
          : normalizedKernelId;

        // 2. Fetch runtime from API
        const runtime = await sdk.getRuntime(runtimeUid);
        if (!runtime) {
          return {
            success: false,
            error: `Runtime ${runtimeUid} not found`,
            message: `Runtime "${runtimeUid}" not found. Use listKernels to see available runtimes.`,
            chatMessage: `❌ Runtime not found: ${runtimeUid}`,
          };
        }

        // 3. Verify runtime is running
        if (!runtime.ingress) {
          return {
            success: false,
            error: `Runtime ${runtimeUid} is not ready`,
            message: `Runtime "${runtime.givenName || runtime.podName}" is not ready. It may still be starting.`,
            chatMessage: `❌ Runtime not ready: ${runtime.givenName || runtime.podName}`,
          };
        }

        // 4. Connect to runtime
        await kernelBridge.connectWebviewDocument(documentUri, runtime);

        return {
          success: true,
          kernelId: runtime.uid,
          documentUri: documentUri.toString(),
          message: `Connected to runtime "${runtime.givenName || runtime.podName}"`,
          chatMessage: `✅ Connected to ${runtime.givenName || runtime.podName}`,
        };
      }

      // Handler: Local Python Environment
      if (isLocalPython) {
        // 1. Extract environment path from kernelId
        const pythonPath = kernelId.replace("python-env-", "");

        // 2. Get Python extension API
        await ensurePythonExtensionActive();
        const pythonExtension =
          vscode.extensions.getExtension("ms-python.python");

        if (!pythonExtension?.isActive) {
          return {
            success: false,
            error: "Python extension not active",
            message:
              "Python extension is not installed or active. Install ms-python.python to use local kernels.",
            chatMessage:
              "❌ Python extension not found. Install it to use local kernels.",
          };
        }

        const pythonApi = pythonExtension.exports as PythonExtension;

        // 3. Find environment by path
        const environments = pythonApi.environments.known;
        const environment = environments.find(
          (env) =>
            env.path === pythonPath ||
            env.executable?.uri?.fsPath === pythonPath,
        );

        if (!environment) {
          return {
            success: false,
            error: `Python environment not found: ${pythonPath}`,
            message: `Python environment not found at path: ${pythonPath}`,
            chatMessage: `❌ Python environment not found`,
          };
        }

        // 4. Extract Python path and environment name
        const resolvedPythonPath = environment.executable?.uri?.fsPath;
        if (!resolvedPythonPath) {
          return {
            success: false,
            error: "Failed to get Python executable path",
            message: `Could not determine Python executable path for environment at ${pythonPath}`,
            chatMessage: "❌ Failed to resolve Python executable path.",
          };
        }

        const envName =
          environment.environment?.name || environment.path || "Python 3";

        // 5. Create kernel info object
        const kernelInfo: NativeKernelInfo = {
          type: "python-environment",
          id: kernelId,
          displayName: envName,
          pythonPath: resolvedPythonPath,
          environment: environment,
          kernelSpec: {
            name: "python3",
            display_name: envName,
            language: "python",
          },
        };

        // 6. Connect to local kernel
        await kernelBridge.connectWebviewDocumentToLocalKernel(
          documentUri,
          kernelInfo,
        );

        return {
          success: true,
          kernelId: kernelId,
          documentUri: documentUri.toString(),
          message: `Connected to local Python environment "${envName}"`,
          chatMessage: `✅ Connected to ${envName}`,
        };
      }

      // Fallback: Unknown kernel type
      return {
        success: false,
        error: `Unknown kernel type: ${kernelId}`,
        message: `Could not recognize kernel ID "${kernelId}". Use listKernels to see available options.`,
        chatMessage: `❌ Unknown kernel type: ${kernelId}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[selectKernel] Error:", error);
      return {
        success: false,
        error: `Failed to select kernel: ${errorMessage}`,
        message: `Failed to select kernel: ${errorMessage}`,
        chatMessage: `❌ Could not connect to kernel: ${errorMessage}`,
      };
    }
  },
};
