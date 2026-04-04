/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Simple kernel selector that shows available kernel options
 * for Datalayer notebooks.
 *
 * @module utils/kernelSelector
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as vscode from "vscode";

import { DatalayerAuthProvider } from "../../services/core/authProvider";
import type { IKernelBridge } from "../../services/interfaces/IKernelBridge";
import { selectDatalayerRuntime } from "./runtimeSelector";

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
 * @param datalayer - Datalayer instance for cloud runtime access.
 * @param authProvider - Authentication provider for login state.
 * @param kernelBridge - Kernel bridge for connecting notebooks to kernels.
 * @param documentUri - Optional document URI for context.
 * @param currentRuntime - Currently selected runtime (if any).
 *
 * @returns Promise that resolves when selection is complete.
 */
export async function showKernelSelector(
  datalayer: DatalayerClient,
  authProvider: DatalayerAuthProvider,
  kernelBridge: IKernelBridge,
  documentUri?: vscode.Uri,
  currentRuntime?: unknown,
): Promise<void> {
  // Import native kernel integration
  const { showPythonEnvironmentPicker, showJupyterServerPicker } =
    await import("../../services/kernel/nativeKernelIntegration");

  const options: KernelOption[] = [
    {
      label: vscode.l10n.t("Datalayer Platform"),
      action: async () => {
        try {
          // eslint-disable-next-line no-console
          console.log("[KernelSelector] Datalayer Platform selected");

          // Check authentication first
          if (!authProvider.isAuthenticated()) {
            // eslint-disable-next-line no-console
            console.log(
              "[KernelSelector] User not authenticated, triggering login",
            );

            // Trigger login directly (same as status bar click)
            await vscode.commands.executeCommand("datalayer.login");

            // eslint-disable-next-line no-console
            console.log(
              "[KernelSelector] Login command executed, checking auth state",
            );

            // Check again after login attempt
            if (!authProvider.isAuthenticated()) {
              // eslint-disable-next-line no-console
              console.log(
                "[KernelSelector] User still not authenticated after login attempt",
              );
              vscode.window.showWarningMessage(
                vscode.l10n.t(
                  "You must be logged in to use Datalayer Platform kernels",
                ),
              );
              return;
            }

            // eslint-disable-next-line no-console
            console.log("[KernelSelector] User successfully authenticated");
          }

          // Now select runtime with instant spinner callback
          const runtime = await selectDatalayerRuntime(
            datalayer,
            authProvider,
            {
              // CRITICAL: Send "kernel-starting" IMMEDIATELY when runtime is selected
              // This callback is called BEFORE QuickPick closes for instant feedback
              onRuntimeSelected: documentUri
                ? async (selectedRuntime) => {
                    // eslint-disable-next-line no-console
                    console.log(
                      "[KernelSelector] Runtime selected (instant callback):",
                      selectedRuntime.uid,
                    );
                    await kernelBridge.sendKernelStartingMessage(
                      documentUri,
                      selectedRuntime,
                    );
                  }
                : undefined,
            },
          );
          // eslint-disable-next-line no-console
          console.log("[KernelSelector] Runtime selected:", runtime?.uid);

          if (runtime) {
            // If we have a document URI, connect it to the runtime
            if (documentUri) {
              // eslint-disable-next-line no-console
              console.log("[KernelSelector] Connecting document to runtime");

              // Spinner message already sent via onRuntimeSelected callback
              await kernelBridge.connectWebviewDocument(documentUri, runtime);
              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  'Connected to runtime "{0}"',
                  runtime.givenName || runtime.podName,
                ),
              );

              // Refresh the runtimes tree to show the new/selected runtime
              const { getRuntimesTreeProvider } =
                await import("../../extension");
              const runtimesTreeProvider = getRuntimesTreeProvider();
              if (runtimesTreeProvider) {
                // Immediately refresh to show the runtime
                runtimesTreeProvider.refresh();
                // Wait for server to fully propagate the change, then refresh again
                setTimeout(() => {
                  runtimesTreeProvider.refresh();
                }, 1000);
              }
            }
          } else {
            // eslint-disable-next-line no-console
            console.log(
              "[KernelSelector] No runtime selected (user cancelled)",
            );
          }
        } catch (error) {
          console.error(
            "[KernelSelector] Error selecting Datalayer Platform:",
            error,
          );
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to connect to Datalayer Platform: {0}",
              error instanceof Error ? error.message : String(error),
            ),
          );
        }
      },
    },
    {
      label: vscode.l10n.t("Python Environments..."),
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
              vscode.l10n.t(
                "Connected to Python environment: {0}",
                kernelInfo.displayName,
              ),
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              vscode.l10n.t(
                "Failed to connect to Python environment: {0}",
                String(error),
              ),
            );
          }
        }
      },
    },
    {
      label: "Pyodide",
      description: vscode.l10n.t("Run Python in the browser without a server"),
      action: async () => {
        if (documentUri) {
          try {
            // eslint-disable-next-line no-console
            console.log(
              "[KernelSelector] Pyodide selected, calling kernelBridge",
            );
            // Connect to Pyodide kernel via kernel bridge (same as other kernel types)
            await kernelBridge.connectWebviewDocumentToPyodide(documentUri);
            // eslint-disable-next-line no-console
            console.log("[KernelSelector] Successfully connected to Pyodide");
            vscode.window.showInformationMessage(
              vscode.l10n.t(
                "Switched to Pyodide (Browser Python). Python code will run in your browser.",
              ),
            );
          } catch (error) {
            console.error(
              "[KernelSelector] Failed to switch to Pyodide:",
              error,
            );
            vscode.window.showErrorMessage(
              vscode.l10n.t("Failed to switch to Pyodide: {0}", String(error)),
            );
          }
        } else {
          console.warn(
            "[KernelSelector] No documentUri provided for Pyodide selection",
          );
        }
      },
    },
    {
      label: vscode.l10n.t("Existing Jupyter Server..."),
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
              vscode.l10n.t(
                "Connected to Jupyter server: {0}",
                kernelInfo.displayName,
              ),
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              vscode.l10n.t(
                "Failed to connect to Jupyter server: {0}",
                String(error),
              ),
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
      label: `$(trash) ${vscode.l10n.t("Terminate Runtime: {0}", runtimeName)}`,
      description: vscode.l10n.t("Stop and remove the current runtime"),
      isSeparator: true, // Mark as needing separator before it
      action: async () => {
        // Import confirmation utilities
        const { showTwoStepConfirmation, CommonConfirmations } =
          await import("./confirmationDialog");

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

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t(
      "Select a kernel source or manage current runtime",
    ),
  });

  if (selected?.option) {
    await selected.option.action();
  }
}
