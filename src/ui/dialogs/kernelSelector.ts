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
  const {
    showPythonEnvironmentPicker,
    showJupyterKernelPicker,
    showJupyterServerPicker,
  } = await import("../../services/kernel/nativeKernelIntegration");

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
      label: "Jupyter Kernel...",
      action: async () => {
        const kernelInfo = await showJupyterKernelPicker();
        if (kernelInfo && documentUri) {
          try {
            // Connect to Jupyter kernel spec via kernel bridge
            await kernelBridge.connectWebviewDocumentToLocalKernel(
              documentUri,
              kernelInfo,
            );
            vscode.window.showInformationMessage(
              `Connected to Jupyter kernel: ${kernelInfo.displayName}`,
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to connect to Jupyter kernel: ${error}`,
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
            "datalayer.internal.terminateRuntime",
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

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a kernel source or manage current runtime",
  });

  if (selected?.option) {
    await selected.option.action();
  }
}
