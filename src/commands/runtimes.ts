/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime management commands for the Datalayer VS Code extension.
 * Handles runtime selection, status display, and kernel management.
 *
 * @module commands/runtimes
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 *
 * @remarks
 * This module registers the following commands:
 * - `datalayer.selectRuntime` - Shows runtime selection dialog
 * - `datalayer.resetRuntime` - Resets the selected runtime
 * - `datalayer.showRuntimeStatus` - Displays current runtime status
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as vscode from "vscode";

import { getServiceContainer } from "../extension";
import { RuntimeTreeItem } from "../models/runtimeTreeItem";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import {
  CommonConfirmations,
  showTwoStepConfirmation,
} from "../ui/dialogs/confirmationDialog";
import { formatDateForName } from "../utils/dateFormatter";

interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime?: RuntimeDTO;
  isTerminateAll?: boolean;
}

/**
 * Registers all runtime-related commands for creating, terminating, and managing cloud runtimes.
 *
 * @param context - Extension context for command subscriptions.
 * @param controllerManager - The Smart Dynamic Controller Manager for notebook integration.
 * @param runtimesTreeProvider - The Runtimes tree view provider for UI refresh.
 *
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  controllerManager: SmartDynamicControllerManager,
  runtimesTreeProvider?: RuntimesTreeProvider,
): void {
  const container = getServiceContainer();
  const datalayer = container.datalayer;
  const authProvider = container.authProvider;
  /**
   * Command: datalayer.selectRuntime
   * Shows the runtime selection dialog to choose or create a runtime.
   * Works for both notebooks and lexical editors.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.selectRuntime", async () => {
      // Get active notebook editor
      const activeEditor = vscode.window.activeNotebookEditor;
      if (!activeEditor) {
        // If no notebook, check for lexical editor
        if (vscode.window.tabGroups.activeTabGroup.activeTab) {
          const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
          const input = activeTab.input;

          // Check if it's a custom editor (lexical)
          if (
            input &&
            typeof input === "object" &&
            input !== null &&
            "viewType" in input &&
            (input as { viewType: string }).viewType ===
              "datalayer.lexical-editor" &&
            "uri" in input
          ) {
            // Extract document URI from custom editor input
            const uri = (input as { uri: vscode.Uri }).uri;

            // Show runtime selector for lexical editor
            const { selectDatalayerRuntime } =
              await import("../ui/dialogs/runtimeSelector");
            const selectedRuntime = await selectDatalayerRuntime(
              datalayer,
              authProvider,
              {
                // Show spinner immediately when runtime is selected
                onRuntimeSelected: async (runtime) => {
                  // Send "kernel-starting" message to lexical webview
                  await getServiceContainer().kernelBridge.sendKernelStartingMessage(
                    uri,
                    runtime,
                  );
                },
              },
            );

            if (selectedRuntime) {
              // Connect the runtime to the lexical webview
              // This sends the "kernel-selected" message and creates the kernel
              await getServiceContainer().kernelBridge.connectWebviewDocument(
                uri,
                selectedRuntime,
              );

              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  "Selected runtime: {0}",
                  selectedRuntime.givenName || selectedRuntime.uid,
                ),
              );
            } else {
              // User cancelled - clear the spinner by sending kernel-terminated message
              await vscode.commands.executeCommand(
                "datalayer.internal.document.sendToWebview",
                uri.toString(),
                {
                  type: "kernel-terminated",
                  body: {},
                },
              );
            }
            return;
          }
        }

        vscode.window.showInformationMessage(
          vscode.l10n.t(
            "Please open a notebook or lexical editor first to select a runtime",
          ),
        );
        return;
      }

      // Directly trigger runtime selection on the controller manager
      await controllerManager.selectRuntimeForNotebook(activeEditor.notebook);
    }),
  );

  /**
   * Command: datalayer.resetRuntime
   * Refreshes all runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.resetRuntime", async () => {
      await controllerManager.refreshControllers();
      vscode.window.showInformationMessage(
        vscode.l10n.t(
          "Runtime controllers refreshed. Select a runtime from the kernel picker.",
        ),
      );
    }),
  );

  /**
   * Command: datalayer.showRuntimeStatus
   * Shows information about available runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.showRuntimeStatus", async () => {
      await controllerManager.refreshControllers();
      vscode.window.showInformationMessage(
        vscode.l10n.t(
          "Runtime controllers are available in the kernel picker. Select 'Datalayer Platform' to choose a runtime.",
        ),
      );
    }),
  );

  /**
   * Command: datalayer.refreshRuntimeControllers
   * Refreshes all runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.refreshRuntimeControllers",
      async (_selectRuntimeUid?: string) => {
        await controllerManager.refreshControllers();
        vscode.window.showInformationMessage(
          vscode.l10n.t(
            "Runtime controllers refreshed. Available runtimes are shown in the kernel picker.",
          ),
        );
      },
    ),
  );

  /**
   * Command: datalayer.showNotebookControllerStatus
   * Legacy command for backward compatibility.
   * Shows the current runtime status.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.showNotebookControllerStatus",
      () => {
        vscode.commands.executeCommand("datalayer.showRuntimeStatus");
      },
    ),
  );

  /**
   * Command: datalayer.terminateRuntimes
   * Shows QuickPick to terminate either all runtimes or a specific runtime.
   * "Terminate All" option is placed LAST for safety (prevents accidental selection).
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.terminateRuntimes", async () => {
      try {
        // Check authentication
        const authState = authProvider.getAuthState();
        if (!authState.isAuthenticated) {
          vscode.window.showErrorMessage(
            vscode.l10n.t("Please login first to manage runtimes"),
          );
          return;
        }

        // Fetch all runtimes
        const runtimes = await datalayer.listRuntimes();

        if (!runtimes || runtimes.length === 0) {
          vscode.window.showInformationMessage(
            vscode.l10n.t("No running runtimes found"),
          );
          return;
        }

        // Helper to format time remaining
        const formatTimeRemaining = (expiredAt: Date): string => {
          const now = new Date();
          const msRemaining = expiredAt.getTime() - now.getTime();
          if (msRemaining <= 0) {
            return vscode.l10n.t("expired");
          }

          const minutes = Math.floor(msRemaining / 60000);
          const hours = Math.floor(minutes / 60);

          if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return vscode.l10n.t("{0}h {1}m left", hours, remainingMinutes);
          }
          return vscode.l10n.t("{0}m left", minutes);
        };

        // Create QuickPick items for individual runtimes
        const runtimeItems: RuntimeQuickPickItem[] = runtimes.map(
          (runtime) => ({
            label: `$(server) ${runtime.givenName || runtime.podName}`,
            description: `${runtime.environmentTitle || runtime.environmentName}`,
            detail: formatTimeRemaining(runtime.expiredAt),
            runtime, // Store runtime object for later use
          }),
        );

        // Add separator and "Terminate All" option at the END (safety!)
        const allItems: RuntimeQuickPickItem[] = [
          ...runtimeItems,
          { label: "", kind: vscode.QuickPickItemKind.Separator },
          {
            label: `$(trash) ${runtimes.length === 1 ? vscode.l10n.t("Terminate All ({0} runtime)", runtimes.length) : vscode.l10n.t("Terminate All ({0} runtimes)", runtimes.length)}`,
            description: vscode.l10n.t(
              "This will terminate all running runtimes",
            ),
            isTerminateAll: true,
          },
        ];

        // Show QuickPick
        const selected = await vscode.window.showQuickPick(allItems, {
          placeHolder: vscode.l10n.t("Select runtime to terminate"),
          title: vscode.l10n.t("Terminate Runtimes"),
        });

        if (!selected) {
          return;
        } // User cancelled

        // Handle "Terminate All"
        if (selected.isTerminateAll) {
          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateAllRuntimes(runtimes.length),
          );

          if (!confirmed) {
            return;
          }

          // Terminate all runtimes in parallel
          const results = await Promise.allSettled(
            runtimes.map((runtime) =>
              datalayer
                .deleteRuntime(runtime.podName)
                .then(() => ({ success: true, runtime }))
                .catch((error) => ({ success: false, runtime, error })),
            ),
          );

          // Count successes and failures
          const successes = results.filter(
            (r) =>
              r.status === "fulfilled" &&
              (r.value as { success: boolean }).success,
          ).length;
          const failures = results.length - successes;

          if (failures === 0) {
            vscode.window.showInformationMessage(
              runtimes.length === 1
                ? vscode.l10n.t(
                    "Successfully terminated {0} runtime",
                    runtimes.length,
                  )
                : vscode.l10n.t(
                    "Successfully terminated all {0} runtimes",
                    runtimes.length,
                  ),
            );
          } else {
            vscode.window.showWarningMessage(
              successes === 1
                ? vscode.l10n.t(
                    "Terminated {0} runtime, {1} failed",
                    successes,
                    failures,
                  )
                : vscode.l10n.t(
                    "Terminated {0} runtimes, {1} failed",
                    successes,
                    failures,
                  ),
            );
          }

          // Notify all open documents that runtimes were terminated
          await notifyAllDocuments();
          return;
        }

        // Handle single runtime termination
        const selectedRuntime = selected.runtime;
        if (!selectedRuntime) {
          return;
        }

        const runtimeName =
          selectedRuntime.givenName || selectedRuntime.podName;
        const confirmed = await showTwoStepConfirmation(
          CommonConfirmations.terminateRuntime(runtimeName),
        );

        if (!confirmed) {
          return;
        }

        // Terminate the runtime
        await datalayer.deleteRuntime(selectedRuntime.podName);

        vscode.window.showInformationMessage(
          vscode.l10n.t('Runtime "{0}" terminated successfully', runtimeName),
        );

        // Notify all open documents that runtime was terminated
        await notifyAllDocuments();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to terminate runtime: {0}", errorMessage),
        );
      }
    }),
  );

  /**
   * Command: datalayer.debugRuntimeTermination
   * Debug command to test runtime termination API without confirmation.
   * Shows detailed logs and error information.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.debugRuntimeTermination",
      async () => {
        try {
          // Check authentication
          const authState = authProvider.getAuthState();
          if (!authState.isAuthenticated) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("Please login first to debug runtime termination"),
            );
            return;
          }

          const runtimes = await datalayer.listRuntimes();

          if (!runtimes || runtimes.length === 0) {
            vscode.window.showInformationMessage(
              vscode.l10n.t("No runtimes found for debugging"),
            );
            return;
          }

          // Test deleteRuntime API with detailed error handling
          const runtime = runtimes[0]!;
          const podName = runtime.podName;
          if (!podName) {
            throw new Error("Runtime missing podName from Datalayer");
          }

          vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Debug: Terminating runtime "{0}". Check console for details.',
              runtime.givenName,
            ),
          );

          const _result = await datalayer.deleteRuntime(podName);
          vscode.window.showInformationMessage(
            vscode.l10n.t(
              "Debug: Runtime terminated successfully. Result: {0}",
              JSON.stringify(_result),
            ),
          );
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Debug: Runtime termination failed. Error: {0}. Check console for full details.",
              errorMessage,
            ),
          );
        }
      },
    ),
  );

  /**
   * Internal command: datalayer.internal.terminateRuntime
   * Called from kernel selector to terminate a specific runtime for a document.
   * Used by both notebooks and lexical editors.
   *
   * Handles BOTH Datalayer runtimes and local kernels:
   * - Datalayer runtimes: Calls API to delete runtime
   * - Local kernels: Just disconnects and shuts down locally
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.runtime.terminate",
      async (uri: vscode.Uri, runtime: unknown) => {
        const runtimeObj = runtime as {
          podName?: string;
          givenName?: string;
          given_name?: string;
          uid?: string;
          displayName?: string;
          serverUrl?: string;
          ingress?: string;
        };

        try {
          // Check if this is a Datalayer runtime or a local kernel
          // Local kernels have ingress URLs like "http://local-kernel-*.localhost" or "http://pyodide-local"
          const isLocalKernel =
            runtimeObj.ingress?.startsWith("http://local-kernel-") ||
            runtimeObj.ingress === "http://pyodide-local";
          const isDatalayerRuntime = !isLocalKernel && !!runtimeObj.podName;

          if (isDatalayerRuntime) {
            // Datalayer runtime - call API to terminate

            // Check authentication before calling API
            if (!authProvider.isAuthenticated()) {
              vscode.window.showErrorMessage(
                vscode.l10n.t(
                  "You must be logged in to terminate Datalayer runtimes. Local kernels can be terminated without login.",
                ),
              );
              return;
            }

            await datalayer.deleteRuntime(runtimeObj.podName!);
            const runtimeName =
              runtimeObj.givenName ||
              runtimeObj.given_name ||
              runtimeObj.podName ||
              runtimeObj.uid ||
              "runtime";
            vscode.window.showInformationMessage(
              vscode.l10n.t(
                'Runtime "{0}" terminated successfully.',
                runtimeName,
              ),
            );
          } else {
            // Local kernel (Python environment, Jupyter server, or Pyodide)
            // Just disconnect - no API call needed
            const kernelName =
              runtimeObj.displayName ||
              runtimeObj.givenName ||
              runtimeObj.given_name ||
              "kernel";
            vscode.window.showInformationMessage(
              vscode.l10n.t('Disconnected from "{0}".', kernelName),
            );
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            vscode.l10n.t("Failed to terminate runtime: {0}", errorMessage),
          );
          return; // Don't clear runtime if termination failed
        }

        // Clear from centralized runtime tracking
        const { clearConnectedRuntime } = await import("./internal");
        clearConnectedRuntime(uri);

        // Send kernel-terminated message to appropriate provider
        // This is a fire-and-forget command to notify the UI
        vscode.commands.executeCommand(
          "datalayer.internal.runtime.notifyTerminated",
          uri,
        );
      },
    ),
  );

  /**
   * Command: datalayer.terminateRuntime
   * Terminates the current runtime or allows selection of runtime to terminate.
   * Shows confirmation dialog before termination.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.terminateRuntime", async () => {
      try {
        // Check if user is authenticated
        const authState = authProvider.getAuthState();
        if (!authState.isAuthenticated) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "You must be logged in to manage runtimes. Please run 'Datalayer: Login' first.",
            ),
          );
          return;
        }

        // Get list of active runtimes
        const runtimes = await datalayer.listRuntimes();

        if (!runtimes || runtimes.length === 0) {
          vscode.window.showInformationMessage(
            vscode.l10n.t("No active runtimes found."),
          );
          return;
        }

        // If only one runtime, confirm termination
        if (runtimes.length === 1) {
          const runtime = runtimes[0]!;
          const name = runtime.givenName;

          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(name),
          );

          if (confirmed) {
            await terminateRuntime(datalayer, runtime);
          }
          return;
        }

        // Multiple runtimes - show quick pick
        const items = runtimes.map((runtime: RuntimeDTO) => {
          const name = runtime.givenName;
          const environment = runtime.environmentName;
          // Note: state property may not exist on Runtime type
          const status = "ready"; // runtime.state

          return {
            label: name,
            description: `${environment} - ${status}`,
            detail: vscode.l10n.t("Credits: {0}", runtime.burningRate),
            runtime: runtime,
          };
        });

        const selected = (await vscode.window.showQuickPick(items, {
          placeHolder: vscode.l10n.t("Select a runtime to terminate"),
          title: vscode.l10n.t("Terminate Runtime"),
        })) as RuntimeQuickPickItem | undefined;

        if (selected && selected.runtime) {
          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(selected.label),
          );

          if (confirmed) {
            await terminateRuntime(datalayer, selected.runtime);
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to terminate runtime: {0}", errorMessage),
        );
      }
    }),
  );

  /**
   * Command: datalayer.runtimes.refresh
   * Refreshes the runtimes tree view.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.runtimes.refresh", () => {
      runtimesTreeProvider?.refresh();
    }),
  );

  /**
   * Command: datalayer.runtimes.create
   * Opens runtime creation dialog (hides existing runtimes).
   * Works without any document open.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.runtimes.create", async () => {
      // Import runtime selector directly to avoid document requirement
      const { selectDatalayerRuntime } =
        await import("../ui/dialogs/runtimeSelector");

      // Hide existing runtimes - user explicitly wants to CREATE a new one
      const selectedRuntime = await selectDatalayerRuntime(
        datalayer,
        authProvider,
        {
          hideExistingRuntimes: true,
          // Show spinner in status bar when runtime selection starts
          onRuntimeSelected: async (runtime) => {
            vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t(
                  "Creating runtime: {0}",
                  runtime.givenName,
                ),
                cancellable: false,
              },
              async () => {
                // Progress indicator will stay visible until the Promise resolves
                // The actual runtime creation happens after this callback
                // We just need to show the UI feedback immediately
                return new Promise<void>((resolve) => {
                  // Resolve after a short delay to keep spinner visible
                  setTimeout(resolve, 500);
                });
              },
            );
          },
        },
      );

      if (selectedRuntime) {
        vscode.window.showInformationMessage(
          vscode.l10n.t(
            'Runtime "{0}" is ready',
            selectedRuntime.givenName || selectedRuntime.uid,
          ),
        );
        // Immediately refresh to show the runtime (may use cached data)
        runtimesTreeProvider?.refresh();
        // Wait for server to fully propagate the change, then refresh again
        setTimeout(() => {
          runtimesTreeProvider?.refresh();
        }, 1000);
        // Also refresh controllers to pick up the new runtime
        await controllerManager.refreshControllers();
        await notifyAllDocuments();
      }
    }),
  );

  /**
   * Command: datalayer.runtimes.terminate
   * Terminates a single runtime from the tree view context menu.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.runtimes.terminate",
      async (item: RuntimeTreeItem) => {
        if (!item || !item.runtime) {
          return;
        }

        const runtimeName = item.runtime.givenName || item.runtime.podName;

        const confirmed = await showTwoStepConfirmation(
          CommonConfirmations.terminateRuntime(runtimeName),
        );

        if (!confirmed) {
          return;
        }

        try {
          await datalayer.deleteRuntime(item.runtime.podName);
          vscode.window.showInformationMessage(
            vscode.l10n.t('Runtime "{0}" terminated successfully', runtimeName),
          );
          // Wait a moment for server to process deletion before refreshing
          await new Promise((resolve) => setTimeout(resolve, 500));
          runtimesTreeProvider?.refresh();
          // Refresh controllers to remove terminated runtime's controller
          await controllerManager.refreshControllers();
          await notifyAllDocuments();
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            vscode.l10n.t("Failed to terminate runtime: {0}", errorMessage),
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.runtimes.terminateAll
   * Terminates all runtimes with confirmation dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.runtimes.terminateAll",
      async () => {
        try {
          // Check authentication
          const authState = authProvider.getAuthState();
          if (!authState.isAuthenticated) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("Please login first to manage runtimes"),
            );
            return;
          }

          // Fetch all runtimes
          const runtimes = await datalayer.listRuntimes();

          if (!runtimes || runtimes.length === 0) {
            vscode.window.showInformationMessage(
              vscode.l10n.t("No running runtimes found"),
            );
            return;
          }

          // Confirm termination
          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateAllRuntimes(runtimes.length),
          );

          if (!confirmed) {
            return;
          }

          // Terminate all runtimes in parallel
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t("Terminating runtimes..."),
              cancellable: false,
            },
            async (progress) => {
              const results = await Promise.allSettled(
                runtimes.map((runtime, index) => {
                  progress.report({
                    message: vscode.l10n.t(
                      "Terminating {0} ({1}/{2})",
                      runtime.givenName || runtime.podName,
                      index + 1,
                      runtimes.length,
                    ),
                  });
                  return datalayer.deleteRuntime(runtime.podName);
                }),
              );

              // Count successes and failures
              const successes = results.filter(
                (r) => r.status === "fulfilled",
              ).length;
              const failures = results.length - successes;

              if (failures === 0) {
                vscode.window.showInformationMessage(
                  runtimes.length === 1
                    ? vscode.l10n.t(
                        "Successfully terminated {0} runtime",
                        runtimes.length,
                      )
                    : vscode.l10n.t(
                        "Successfully terminated all {0} runtimes",
                        runtimes.length,
                      ),
                );
              } else {
                vscode.window.showWarningMessage(
                  successes === 1
                    ? vscode.l10n.t(
                        "Terminated {0} runtime, {1} failed",
                        successes,
                        failures,
                      )
                    : vscode.l10n.t(
                        "Terminated {0} runtimes, {1} failed",
                        successes,
                        failures,
                      ),
                );
              }
            },
          );

          // Wait a moment for server to process deletions before refreshing
          await new Promise((resolve) => setTimeout(resolve, 500));
          runtimesTreeProvider?.refresh();
          // Refresh controllers to remove terminated runtimes' controllers
          await controllerManager.refreshControllers();
          await notifyAllDocuments();
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            vscode.l10n.t("Failed to terminate runtimes: {0}", errorMessage),
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.runtimes.createSnapshot
   * Creates a snapshot from a runtime.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.runtimes.createSnapshot",
      async (item: RuntimeTreeItem) => {
        if (!item || !item.runtime) {
          vscode.window.showErrorMessage(vscode.l10n.t("No runtime selected"));
          return;
        }

        const runtime = item.runtime;
        const runtimeName = runtime.givenName || runtime.podName;

        // Check if runtime is running (has ingress URL)
        if (!runtime.ingress) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              'Runtime "{0}" must be running to create a snapshot',
              runtimeName,
            ),
          );
          return;
        }

        // Generate a suggested snapshot name based on the runtime name
        const timestamp = formatDateForName(new Date());
        const suggestedName =
          `snapshot-${runtimeName}-${timestamp}`.toLowerCase();

        // Prompt for snapshot name
        const snapshotName = await vscode.window.showInputBox({
          title: vscode.l10n.t('Create Snapshot from "{0}"', runtimeName),
          prompt: vscode.l10n.t("Enter a name for the snapshot"),
          placeHolder: vscode.l10n.t("e.g., my-checkpoint"),
          value: suggestedName,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t("Snapshot name cannot be empty");
            }
            // Basic validation - alphanumeric, hyphens, underscores
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return vscode.l10n.t(
                "Snapshot name can only contain letters, numbers, hyphens, and underscores",
              );
            }
            return undefined;
          },
        });

        if (!snapshotName) {
          return; // User cancelled
        }

        // Prompt for snapshot description
        const description = await vscode.window.showInputBox({
          title: vscode.l10n.t('Create Snapshot from "{0}"', runtimeName),
          prompt: vscode.l10n.t(
            "Enter a description for the snapshot (optional)",
          ),
          placeHolder: vscode.l10n.t("e.g., Checkpoint after training model"),
        });

        if (description === undefined) {
          return; // User cancelled
        }

        // Ask if runtime should be stopped after snapshot
        const stopAfterSnapshot = await vscode.window.showQuickPick(
          [
            {
              label: `$(debug-continue) ${vscode.l10n.t("Keep runtime running")}`,
              description: vscode.l10n.t(
                "Continue using the runtime after creating snapshot",
              ),
              picked: true,
              stop: false,
            },
            {
              label: `$(debug-stop) ${vscode.l10n.t("Stop runtime after snapshot")}`,
              description: vscode.l10n.t(
                "Terminate the runtime after snapshot is created",
              ),
              stop: true,
            },
          ],
          {
            title: vscode.l10n.t('Create Snapshot from "{0}"', runtimeName),
            placeHolder: vscode.l10n.t(
              "What should happen to the runtime after snapshot?",
            ),
          },
        );

        if (!stopAfterSnapshot) {
          return; // User cancelled
        }

        try {
          // Create snapshot with progress
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t('Creating snapshot "{0}"...', snapshotName),
              cancellable: false,
            },
            async () => {
              const snapshot = await datalayer.createSnapshot(
                runtime.podName,
                snapshotName,
                description || "",
                stopAfterSnapshot.stop,
              );

              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  'Snapshot "{0}" created successfully!',
                  snapshotName,
                ),
              );

              // Refresh the runtime tree
              vscode.commands.executeCommand("datalayer.runtimes.refresh");

              return snapshot;
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t("Failed to create snapshot: {0}", String(error)),
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.runtimes.delete
   * Deletes/terminates a runtime from the context menu.
   * Alias for datalayer.runtimes.terminate for better UX.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.runtimes.delete",
      async (item: RuntimeTreeItem) => {
        // Reuse the existing terminate command logic
        await vscode.commands.executeCommand(
          "datalayer.runtimes.terminate",
          item,
        );
      },
    ),
  );
}

/**
 * Notifies all open notebook and lexical documents that runtimes were terminated by sending kernel-terminated messages to all active webviews.
 */
async function notifyAllDocuments(): Promise<void> {
  // Get all open tabs
  const allTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);

  // Notify all custom editor documents (notebooks and lexicals)
  for (const tab of allTabs) {
    const input = tab.input;
    if (
      input &&
      typeof input === "object" &&
      "viewType" in input &&
      "uri" in input
    ) {
      const viewType = (input as { viewType: string }).viewType;
      // Check for both Datalayer notebook and lexical editors
      if (
        viewType === "datalayer.jupyter-notebook" ||
        viewType === "datalayer.lexical-editor"
      ) {
        const uri = (input as { uri: vscode.Uri }).uri;
        vscode.commands.executeCommand(
          "datalayer.internal.runtime.notifyTerminated",
          uri,
        );
      }
    }
  }
}

/**
 * Terminates a runtime and shows appropriate feedback with progress notification.
 *
 * @param datalayer - The Datalayer client instance for API calls.
 * @param runtime - The runtime to terminate.
 */
async function terminateRuntime(
  datalayer: DatalayerClient,
  runtime: RuntimeDTO,
): Promise<void> {
  const name = runtime.givenName;

  try {
    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Terminating runtime "{0}"...', name),
        cancellable: false,
      },
      async () => {
        // MUST use pod_name for deleteRuntime API
        const podName = runtime.podName;
        if (!podName) {
          throw new Error("Runtime missing podName from Datalayer");
        }

        await datalayer.deleteRuntime(podName);
      },
    );

    // Show success message
    vscode.window.showInformationMessage(
      vscode.l10n.t('Runtime "{0}" terminated successfully.', name),
    );

    // Notify all open documents that runtime was terminated
    await notifyAllDocuments();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Failed to terminate runtime "{0}": {1}',
        name,
        errorMessage,
      ),
    );
  }
}
