/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Native kernel integration using Python and Jupyter extension APIs.
 * Provides access to standard VS Code kernel selection dialogs.
 *
 * @module services/kernel/nativeKernelIntegration
 */

import * as vscode from "vscode";
import { PythonExtension, Environment } from "@vscode/python-extension";

/**
 * Kernel connection information returned from native pickers
 */
export interface NativeKernelInfo {
  type: "python-environment" | "jupyter-server" | "jupyter-kernel";
  id: string;
  displayName: string;
  pythonPath?: string;
  serverUrl?: string;
  token?: string;
  kernelSpec?: {
    name: string;
    display_name: string;
    language: string;
    argv?: string[];
    metadata?: Record<string, unknown>;
  };
  environment?: Environment;
}

/**
 * Shows the Python extension's environment picker and returns selected environment info.
 * This corresponds to the "Python Environments..." option in VS Code's kernel picker.
 *
 * @returns Promise resolving to kernel info, or undefined if cancelled
 */
export async function showPythonEnvironmentPicker(): Promise<
  NativeKernelInfo | undefined
> {
  try {
    // Get Python extension
    const pythonExt = vscode.extensions.getExtension("ms-python.python");
    if (!pythonExt) {
      vscode.window.showErrorMessage(
        "Python extension is not installed. Please install the Python extension to use Python environments.",
      );
      return undefined;
    }

    // Check if extension is active
    if (!pythonExt.isActive) {
      await pythonExt.activate();
    }

    // Get the Python extension API
    const pythonApi: PythonExtension = pythonExt.exports as PythonExtension;

    if (!pythonApi || !pythonApi.environments) {
      vscode.window.showErrorMessage(
        "Python extension API is not available. Please update to the latest Python extension.",
      );
      return undefined;
    }

    // Get all known environments
    const environments = pythonApi.environments.known;
    if (!environments || environments.length === 0) {
      vscode.window.showWarningMessage(
        "No Python environments found. Please create a Python environment first.",
      );
      return undefined;
    }

    // Create quick pick items from environments
    interface EnvironmentPickItem extends vscode.QuickPickItem {
      env: Environment;
    }

    const items: EnvironmentPickItem[] = environments.map((env) => {
      // Get environment details
      const path = env.path;
      const version = env.version
        ? `${env.version.major}.${env.version.minor}.${env.version.micro}`
        : "unknown";
      const envType = env.environment?.type || "global";
      const envName = env.environment?.name || "";

      return {
        label: envName ? `${envName} (Python ${version})` : `Python ${version}`,
        description: envType,
        detail: path,
        env: env,
      };
    });

    // Show picker
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Python environment",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return undefined;
    }

    // Resolve full environment details
    const envDetails = await pythonApi.environments.resolveEnvironment(
      selected.env.path,
    );
    if (!envDetails) {
      vscode.window.showErrorMessage(
        `Failed to resolve environment: ${selected.env.path}`,
      );
      return undefined;
    }

    // Find Python executable path
    let pythonPath = selected.env.path;
    if (envDetails.executable?.uri) {
      pythonPath = envDetails.executable.uri.fsPath;
    }

    return {
      type: "python-environment",
      id: `python-env-${Date.now()}`,
      displayName: selected.label,
      pythonPath: pythonPath,
      environment: selected.env,
      kernelSpec: {
        name: "python3",
        display_name: selected.label,
        language: "python",
        argv: [
          pythonPath,
          "-m",
          "ipykernel_launcher",
          "-f",
          "{connection_file}",
        ],
        metadata: {
          interpreter: {
            path: pythonPath,
          },
        },
      },
    };
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to select Python environment: ${error}`,
    );
    return undefined;
  }
}

/**
 * Shows a dialog to connect to an existing Jupyter server.
 * This corresponds to the "Existing Jupyter Server..." option.
 *
 * @returns Promise resolving to kernel info, or undefined if cancelled
 */
export async function showJupyterServerPicker(): Promise<
  NativeKernelInfo | undefined
> {
  const serverUrl = await vscode.window.showInputBox({
    prompt: "Enter the URL of the Jupyter server",
    placeHolder: "http://localhost:8888/?token=...",
    validateInput: (value) => {
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Please enter a valid URL";
      }
    },
  });

  if (!serverUrl) {
    return undefined;
  }

  try {
    const parsedURL = new URL(serverUrl);
    const token = parsedURL.searchParams.get("token") ?? "";
    parsedURL.search = "";
    const baseUrl = parsedURL.toString();

    return {
      type: "jupyter-server",
      id: `jupyter-server-${Date.now()}`,
      displayName: `Jupyter Server (${parsedURL.hostname})`,
      serverUrl: baseUrl,
      token: token,
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Invalid Jupyter server URL: ${error}`);
    return undefined;
  }
}

/**
 * Shows the Jupyter extension's kernel spec picker.
 * This corresponds to the "Jupyter Kernel..." option.
 *
 * @returns Promise resolving to kernel info, or undefined if cancelled
 */
export async function showJupyterKernelPicker(): Promise<
  NativeKernelInfo | undefined
> {
  try {
    // Get Jupyter extension
    const jupyterExt = vscode.extensions.getExtension("ms-toolsai.jupyter");
    if (!jupyterExt) {
      vscode.window.showErrorMessage(
        "Jupyter extension is not installed. Please install the Jupyter extension to use Jupyter kernels.",
      );
      return undefined;
    }

    // Check if extension is active
    if (!jupyterExt.isActive) {
      await jupyterExt.activate();
    }

    // Get the Jupyter extension API
    const jupyterApi = jupyterExt.exports;
    if (!jupyterApi) {
      vscode.window.showErrorMessage(
        "Jupyter extension API is not available. Please update to the latest Jupyter extension.",
      );
      return undefined;
    }

    // Get kernel service from the API
    let kernelService;
    try {
      kernelService = await jupyterApi.getKernelService();
      if (!kernelService) {
        vscode.window.showErrorMessage(
          "Jupyter kernel service is not available. Please update to the latest Jupyter extension.",
        );
        return undefined;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to get Jupyter kernel service: ${error}`,
      );
      return undefined;
    }

    // Check if getKernelSpecifications method exists
    if (typeof kernelService.getKernelSpecifications !== "function") {
      vscode.window.showErrorMessage(
        "Jupyter kernel service does not support getKernelSpecifications. Please update to the latest Jupyter extension.",
      );
      return undefined;
    }

    // Get kernel specifications
    const kernels = await kernelService.getKernelSpecifications();
    if (!kernels || kernels.length === 0) {
      vscode.window.showWarningMessage(
        "No Jupyter kernels found. Please install a Jupyter kernel first.",
      );
      return undefined;
    }

    // Create quick pick items
    interface KernelPickItem extends vscode.QuickPickItem {
      kernel: (typeof kernels)[0];
    }

    const items: KernelPickItem[] = kernels.map(
      (kernel: (typeof kernels)[0]) => ({
        label: kernel.display_name || kernel.name,
        description: kernel.language,
        detail: kernel.metadata?.interpreter?.path,
        kernel: kernel,
      }),
    );

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Jupyter kernel",
    });

    if (!selected) {
      return undefined;
    }

    return {
      type: "jupyter-kernel",
      id: selected.kernel.id || selected.kernel.name,
      displayName: selected.kernel.display_name || selected.kernel.name,
      kernelSpec: {
        name: selected.kernel.name,
        display_name: selected.kernel.display_name || selected.kernel.name,
        language: selected.kernel.language,
        argv: selected.kernel.argv || [],
        metadata: selected.kernel.metadata,
      },
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to select Jupyter kernel: ${error}`);
    return undefined;
  }
}

/**
 * Shows a combined kernel picker with all native options.
 * Provides the same experience as VS Code's native "Select Kernel" dialog.
 *
 * @returns Promise resolving to kernel info, or undefined if cancelled
 */
export async function showNativeKernelPicker(): Promise<
  NativeKernelInfo | undefined
> {
  interface KernelSourceItem extends vscode.QuickPickItem {
    source: "python" | "jupyter-server" | "jupyter-kernel";
  }

  const items: KernelSourceItem[] = [];

  // Check if Python extension is available
  const pythonExt = vscode.extensions.getExtension("ms-python.python");
  if (pythonExt) {
    items.push({
      label: "$(symbol-namespace) Python Environments...",
      description: "Select from installed Python environments",
      source: "python",
    });
  }

  // Check if Jupyter extension is available for kernel specs
  const jupyterExt = vscode.extensions.getExtension("ms-toolsai.jupyter");
  if (jupyterExt) {
    items.push({
      label: "$(notebook-kernel) Jupyter Kernel...",
      description: "Select from Jupyter kernel specifications",
      source: "jupyter-kernel",
    });
  }

  // Always show Jupyter server option
  items.push({
    label: "$(server) Existing Jupyter Server...",
    description: "Connect to a remote Jupyter server",
    source: "jupyter-server",
  });

  if (items.length === 0) {
    vscode.window.showErrorMessage(
      "No kernel sources available. Please install the Python or Jupyter extension.",
    );
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a kernel source",
  });

  if (!selected) {
    return undefined;
  }

  switch (selected.source) {
    case "python":
      return showPythonEnvironmentPicker();
    case "jupyter-server":
      return showJupyterServerPicker();
    case "jupyter-kernel":
      return showJupyterKernelPicker();
  }
}
