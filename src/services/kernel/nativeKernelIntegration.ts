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
  type: "python-environment" | "jupyter-server";
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

    // Check if extension is active and activate if needed
    if (!pythonExt.isActive) {
      try {
        // Show progress while activating
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Activating Python extension...",
            cancellable: false,
          },
          async () => {
            await pythonExt.activate();
            // Give the extension a moment to fully initialize
            await new Promise((resolve) => setTimeout(resolve, 1000));
          },
        );
      } catch (activationError) {
        console.error(
          "[showPythonEnvironmentPicker] Activation error:",
          activationError,
        );
        vscode.window.showErrorMessage(
          `Failed to activate Python extension: ${activationError}. Please try again.`,
        );
        return undefined;
      }
    }

    // Get the Python extension API
    const pythonApi: PythonExtension = pythonExt.exports as PythonExtension;

    if (!pythonApi || !pythonApi.environments) {
      vscode.window.showErrorMessage(
        "Python extension API is not available. Please update to the latest Python extension.",
      );
      return undefined;
    }

    // Get all known environments - wait a bit if not ready
    let environments = pythonApi.environments.known;
    if (!environments || environments.length === 0) {
      // Wait a moment for environments to be discovered
      await new Promise((resolve) => setTimeout(resolve, 500));
      environments = pythonApi.environments.known;
    }

    // Create quick pick items from environments
    interface EnvironmentPickItem extends vscode.QuickPickItem {
      env?: Environment;
      isCreateNew?: boolean;
    }

    const items: EnvironmentPickItem[] = [];

    // Add "Create New Environment" option at the top
    items.push({
      label: "$(add) Create Python Environment",
      description: "Create a new virtual environment or Conda environment",
      detail: "Opens the Python environment creation wizard",
      isCreateNew: true,
    });

    // Add separator
    items.push({
      label: "Existing Environments",
      kind: vscode.QuickPickItemKind.Separator,
    });

    // Add existing environments
    if (environments && environments.length > 0) {
      const envItems = environments.map((env) => {
        // Get environment details
        const path = env.path;
        const version = env.version
          ? `${env.version.major}.${env.version.minor}.${env.version.micro}`
          : "unknown";
        const envType = env.environment?.type || "global";
        const envName = env.environment?.name || "";

        return {
          label: envName
            ? `${envName} (Python ${version})`
            : `Python ${version}`,
          description: envType,
          detail: path,
          env: env,
        };
      });
      items.push(...envItems);
    } else {
      items.push({
        label: "No Python environments found",
        description: "Create one using the option above",
      });
    }

    // Show the quick pick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Python environment",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return undefined;
    }

    // Check if user selected "Create New Environment"
    if (selected.isCreateNew) {
      // Trigger Python extension's create environment command
      try {
        await vscode.commands.executeCommand("python.createEnvironment");

        // After creation, refresh environments and let user select again
        await pythonApi.environments.refreshEnvironments();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Recursively call this function to show updated environment list
        return await showPythonEnvironmentPicker();
      } catch (error) {
        console.error("[showPythonEnvironmentPicker] Create env error:", error);
        vscode.window.showErrorMessage(
          `Failed to create environment: ${error}`,
        );
        return undefined;
      }
    }

    // User selected an existing environment
    if (!selected.env) {
      return undefined;
    }

    // Resolve the full environment details
    const resolvedEnv = await pythonApi.environments.resolveEnvironment(
      selected.env.path,
    );
    if (!resolvedEnv) {
      vscode.window.showErrorMessage(
        `Failed to resolve environment: ${selected.env.path}`,
      );
      return undefined;
    }

    // Get the Python executable path
    let pythonPath = selected.env.path;
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
 * Shows a combined kernel picker with all native options.
 * Provides the same experience as VS Code's native "Select Kernel" dialog.
 *
 * @returns Promise resolving to kernel info, or undefined if cancelled
 */
export async function showNativeKernelPicker(): Promise<
  NativeKernelInfo | undefined
> {
  interface KernelSourceItem extends vscode.QuickPickItem {
    source: "python" | "jupyter-server";
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

  // Always show Jupyter server option
  items.push({
    label: "$(server) Existing Jupyter Server...",
    description: "Connect to a remote Jupyter server",
    source: "jupyter-server",
  });

  if (items.length === 0) {
    vscode.window.showErrorMessage(
      "No kernel sources available. Please install the Python extension.",
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
  }
}
