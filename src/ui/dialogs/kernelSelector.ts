/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Simple kernel selector that shows available kernel options
 * for Datalayer notebooks.
 *
 * @module utils/kernelSelector
 */

import * as vscode from "vscode";
import { selectDatalayerRuntime } from "./runtimeSelector";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import { SDKAuthProvider } from "../../services/core/authProvider";
import type { IKernelBridge } from "../../services/interfaces/IKernelBridge";

interface KernelOption {
  label: string;
  description?: string;
  detail?: string;
  isSeparator?: boolean;
  action: () => Promise<void>;
}

/**
 * Shows a kernel selection menu with available options.
 * This provides a clean interface for selecting between different kernel types.
 *
 * @param sdk - Datalayer SDK instance
 * @param authProvider - Authentication provider
 * @param kernelBridge - Kernel bridge for connecting notebooks
 * @param documentUri - Optional document URI for context
 * @param currentRuntime - Currently selected runtime (if any)
 * @returns Promise that resolves when selection is complete
 */
export async function showKernelSelector(
  sdk: DatalayerClient,
  authProvider: SDKAuthProvider,
  kernelBridge: IKernelBridge,
  documentUri?: vscode.Uri,
  currentRuntime?: unknown,
): Promise<void> {
  // Import native kernel integration
  const { showPythonEnvironmentPicker, showJupyterServerPicker } = await import(
    "../../services/kernel/nativeKernelIntegration"
  );

  console.log("[KernelSelector] showKernelSelector called", {
    documentUri: documentUri?.toString(),
    currentRuntime,
  });

  const options: KernelOption[] = [
    {
      label: "Datalayer Platform",
      action: async () => {
        const runtime = await selectDatalayerRuntime(sdk, authProvider);
        if (runtime) {
          // If we have a document URI, connect it to the runtime
          if (documentUri) {
            await kernelBridge.connectWebviewDocument(documentUri, runtime);
          }
        }
      },
    },
    {
      label: "Python Environments...",
      action: async () => {
        const kernelInfo = await showPythonEnvironmentPicker();
        if (kernelInfo && documentUri) {
          try {
            // Connect to local Python environment via kernel bridge
            await kernelBridge.connectWebviewDocumentToLocalKernel(
              documentUri,
              kernelInfo,
            );
            vscode.window.showInformationMessage(
              `Connected to Python environment: ${kernelInfo.displayName}`,
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to connect to Python environment: ${error}`,
            );
          }
        }
      },
    },
    {
      label: "Pyodide (Browser Python)",
      description: "Run Python in the browser without a server",
      action: async () => {
        if (documentUri) {
          try {
            // Switch to Pyodide kernel via command
            await vscode.commands.executeCommand(
              "datalayer.internal.switchToPyodide",
              documentUri,
            );
            vscode.window.showInformationMessage(
              "Switched to Pyodide (Browser Python). Python code will run in your browser.",
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to switch to Pyodide: ${error}`,
            );
          }
        }
      },
    },
    {
      label: "Existing Jupyter Server...",
      action: async () => {
        const kernelInfo = await showJupyterServerPicker();
        if (kernelInfo && documentUri) {
          try {
            const parsedURL = new URL(kernelInfo.serverUrl || "");
            const token = parsedURL.searchParams.get("token") ?? "";
            parsedURL.search = "";
            const baseUrl = parsedURL.toString();

            // Create a runtime-like object for the Jupyter server
            const jupyterRuntime: Record<string, unknown> = {
              uid: `jupyter-${Date.now()}`,
              given_name: "Jupyter Server",
              name: "Jupyter Server",
              ingress: baseUrl,
              token: token,
              status: "ready",
              environment_name: "jupyter",
              pod_name: "jupyter-server",
              burning_rate: 0,
            };

            // If we have a document URI, connect it to the Jupyter server
            if (documentUri) {
              await kernelBridge.connectWebviewDocument(
                documentUri,
                jupyterRuntime as unknown as RuntimeDTO,
              );
            }

            // Connect to Jupyter server via kernel bridge
            await kernelBridge.connectWebviewDocumentToLocalKernel(
              documentUri,
              kernelInfo,
            );
            vscode.window.showInformationMessage(
              `Connected to Jupyter server: ${kernelInfo.displayName}`,
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to connect to Jupyter server: ${error}`,
            );
          }
        }
      },
    },
  ];

  console.log(
    "[KernelSelector] Options array created, length:",
    options.length,
    "labels:",
    options.map((o) => o.label),
  );

  // Add "Terminate Runtime" option if a runtime is currently selected
  if (currentRuntime) {
    const runtimeObj = currentRuntime as {
      givenName?: string;
      given_name?: string;
      environmentTitle?: string;
      environmentName?: string;
      uid?: string;
    };
    const runtimeName =
      runtimeObj.givenName ||
      runtimeObj.given_name ||
      runtimeObj.environmentTitle ||
      runtimeObj.environmentName ||
      runtimeObj.uid ||
      "Runtime";

    options.push({
      label: `$(trash) Terminate Runtime: ${runtimeName}`,
      description: "Stop and remove the current runtime",
      isSeparator: true, // Mark as needing separator before it
      action: async () => {
        // Import confirmation utilities
        const { showTwoStepConfirmation, CommonConfirmations } = await import(
          "./confirmationDialog"
        );

        const confirmed = await showTwoStepConfirmation(
          CommonConfirmations.terminateRuntime(runtimeName),
        );

        if (confirmed && documentUri) {
          // Send terminate message to the document's webview
          vscode.commands.executeCommand(
            "datalayer.internal.runtime.terminate",
            documentUri,
            currentRuntime,
          );
        }
      },
    });
  }

  const items = options.flatMap((opt, index) => {
    const result: Array<vscode.QuickPickItem & { option?: KernelOption }> = [];

    // Add separator before terminate option
    if (opt.isSeparator && index > 0) {
      result.push({
        label: "",
        kind: vscode.QuickPickItemKind.Separator,
      });
    }

    result.push({
      label: opt.label,
      description: opt.description,
      option: opt,
    });

    return result;
  });

  console.log(
    "[KernelSelector] Items to show in QuickPick:",
    items.length,
    "labels:",
    items.map((i) => i.label),
  );

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a kernel source or manage current runtime",
  });

  if (selected?.option) {
    await selected.option.action();
  }
}
