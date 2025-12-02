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
 * Kernel connection information returned from native pickers.
 * Contains all necessary details to establish a connection to either a local Python environment
 * or a remote Jupyter server.
 */
export interface NativeKernelInfo {
  /** The type of kernel source: local Python environment or remote Jupyter server */
  type: "python-environment" | "jupyter-server";
  /** Unique identifier for this kernel connection */
  id: string;
  /** Human-readable display name for the kernel */
  displayName: string;
  /** Path to the Python executable (only for python-environment type) */
  pythonPath?: string;
  /** Base URL of the Jupyter server (only for jupyter-server type) */
  serverUrl?: string;
  /** Authentication token for the Jupyter server */
  token?: string;
  /** Jupyter kernel specification with execution details */
  kernelSpec?: {
    /** Internal name of the kernel */
    name: string;
    /** Display name for the kernel */
    display_name: string;
    /** Programming language of the kernel */
    language: string;
    /** Command line arguments to launch the kernel */
    argv?: string[];
    /** Additional metadata about the kernel */
    metadata?: Record<string, unknown>;
  };
  /** Python environment object from the VS Code Python extension */
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

    /**
     * Quick pick item for environment selection.
     * Extends VS Code's QuickPickItem with environment data.
     */
    interface EnvironmentPickItem extends vscode.QuickPickItem {
      /** The Python environment object from the extension API, undefined for special items */
      env?: Environment;
      /** Flags this item as the "Create New Environment" option */
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

    // Use a loop instead of recursion to prevent stack overflow
    // Maximum 5 attempts to handle repeated environment creation
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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

          // After creation, refresh environments and rebuild the list
          await pythonApi.environments.refreshEnvironments();
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Rebuild environment list
          environments = pythonApi.environments.known;
          items.length = 0; // Clear items array

          // Re-add "Create New Environment" option
          items.push({
            label: "$(add) Create Python Environment",
            description:
              "Create a new virtual environment or Conda environment",
            detail: "Opens the Python environment creation wizard",
            isCreateNew: true,
          });

          // Re-add separator
          items.push({
            label: "Existing Environments",
            kind: vscode.QuickPickItemKind.Separator,
          });

          // Re-add existing environments
          if (environments && environments.length > 0) {
            const envItems = environments.map((env) => {
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

          // Continue loop to show picker again
          continue;
        } catch (error) {
          console.error(
            "[showPythonEnvironmentPicker] Create env error:",
            error,
          );
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

      // Break out of loop - we have a valid selection
      return await processSelectedEnvironment(selected.env, selected.label);
    }

    // If we exhausted all attempts
    vscode.window.showWarningMessage(
      "Maximum environment creation attempts reached. Please try again.",
    );
    return undefined;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to select Python environment: ${error}`,
    );
    return undefined;
  }
}

/**
 * Processes a selected Python environment and creates kernel connection information.
 * Resolves full environment details from the Python extension API and generates
 * a kernel specification with the appropriate Python executable path.
 *
 * @param env - The Python environment to process
 * @param label - The display label for the environment
 * @returns Promise resolving to kernel info or undefined if processing fails
 */
async function processSelectedEnvironment(
  env: Environment,
  label: string,
): Promise<NativeKernelInfo | undefined> {
  try {
    const pythonExt = vscode.extensions.getExtension("ms-python.python");
    if (!pythonExt?.isActive) {
      throw new Error("Python extension is not active");
    }
    const pythonApi: PythonExtension = pythonExt.exports as PythonExtension;

    // Resolve the full environment details
    const resolvedEnv = await pythonApi.environments.resolveEnvironment(
      env.path,
    );
    if (!resolvedEnv) {
      vscode.window.showErrorMessage(
        `Failed to resolve environment: ${env.path}`,
      );
      return undefined;
    }

    // Get the Python executable path
    const pythonPath = env.path;
    return {
      type: "python-environment",
      id: `python-env-${Date.now()}`,
      displayName: label,
      pythonPath: pythonPath,
      environment: env,
      kernelSpec: {
        name: "python3",
        display_name: label,
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
    vscode.window.showErrorMessage(`Failed to process environment: ${error}`);
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
  /**
   * Quick pick item representing a kernel source option.
   * Used in the unified kernel picker to show different kernel connection sources.
   */
  interface KernelSourceItem extends vscode.QuickPickItem {
    /** The kernel source type: either Python environments or Jupyter server */
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
