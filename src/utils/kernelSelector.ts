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
import { selectDatalayerRuntime, setRuntime } from "./runtimeSelector";
import type { DatalayerSDK } from "../../../core/lib/index.js";
import { SDKAuthProvider } from "../services/authProvider";
import { KernelBridge } from "../services/kernelBridge";

interface KernelOption {
  label: string;
  description?: string;
  detail?: string;
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
 * @returns Promise that resolves when selection is complete
 */
export async function showKernelSelector(
  sdk: DatalayerSDK,
  authProvider: SDKAuthProvider,
  kernelBridge: KernelBridge,
  documentUri?: vscode.Uri
): Promise<void> {
  const options: KernelOption[] = [
    {
      label: "Datalayer Platform",
      action: async () => {
        const runtime = await selectDatalayerRuntime(sdk, authProvider);
        if (runtime) {
          console.log("[KernelSelector] Datalayer runtime selected:", runtime);
          // If we have a document URI, connect it to the runtime
          if (documentUri) {
            await kernelBridge.connectWebviewNotebook(documentUri, runtime);
          }
        }
      },
    },
    {
      label: "Python Environments... (coming soon)",
      action: async () => {
        vscode.window.showInformationMessage(
          "Local Python kernel support is coming soon. For now, please use Datalayer Platform or open the notebook directly in VS Code."
        );
      },
    },
    {
      label: "Existing Jupyter Server...",
      action: async () => {
        // Use the existing setRuntime function to get Jupyter server URL
        const serverUrl = await setRuntime();
        if (serverUrl) {
          try {
            const parsedURL = new URL(serverUrl);
            const token = parsedURL.searchParams.get("token") ?? "";
            parsedURL.search = "";
            const baseUrl = parsedURL.toString();

            console.log("[KernelSelector] Jupyter server selected:", baseUrl);

            // Create a runtime-like object for the Jupyter server
            const jupyterRuntime: any = {
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
              await kernelBridge.connectWebviewNotebook(
                documentUri,
                jupyterRuntime
              );
            }

            vscode.window.showInformationMessage(
              `Connected to Jupyter server at ${baseUrl}`
            );
          } catch (error) {
            console.error(
              "[KernelSelector] Failed to connect to Jupyter server:",
              error
            );
            vscode.window.showErrorMessage(
              `Failed to connect to Jupyter server: ${error}`
            );
          }
        }
      },
    },
  ];

  const items = options.map((opt) => ({
    label: opt.label,
    option: opt,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Type to choose a kernel source",
  });

  if (selected && selected.option) {
    await selected.option.action();
  }
}
