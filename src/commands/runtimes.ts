/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime management commands for the Datalayer VS Code extension.
 * Handles runtime selection, status display, and kernel management.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands/runtimes
 *
 * @remarks
 * This module registers the following commands:
 * - `datalayer.selectRuntime` - Shows runtime selection dialog
 * - `datalayer.resetRuntime` - Resets the selected runtime
 * - `datalayer.showRuntimeStatus` - Displays current runtime status
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../extension";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { RuntimeTreeItem } from "../models/runtimeTreeItem";
import {
  showTwoStepConfirmation,
  CommonConfirmations,
} from "../ui/dialogs/confirmationDialog";

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { DatalayerClient } from "@datalayer/core/lib/client";

interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime?: RuntimeDTO;
  isTerminateAll?: boolean;
}

/**
 * Registers all runtime-related commands for the Smart Dynamic Controller Manager.
 *
 * @param context - Extension context for command subscriptions
 * @param controllerManager - The Smart Dynamic Controller Manager
 * @param runtimesTreeProvider - The Runtimes tree view provider
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  controllerManager: SmartDynamicControllerManager,
  runtimesTreeProvider?: RuntimesTreeProvider,
): void {
  const container = getServiceContainer();
  const sdk = container.sdk;
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
              "datalayer.lexical-editor"
          ) {
            // Show runtime selector for lexical editor
            const { selectDatalayerRuntime } = await import(
              "../ui/dialogs/runtimeSelector"
            );
            const selectedRuntime = await selectDatalayerRuntime(
              sdk,
              authProvider,
            );

            if (selectedRuntime) {
              // Convert Runtime model to JSON for serialization
              const runtimeJSON = selectedRuntime.toJSON();

              // Fire event that lexical provider can listen to
              vscode.commands.executeCommand(
                "datalayer.internal.runtimeSelected",
                runtimeJSON,
              );

              vscode.window.showInformationMessage(
                `Selected runtime: ${selectedRuntime.givenName || selectedRuntime.uid}`,
              );
            }
            return;
          }
        }

        vscode.window.showInformationMessage(
          "Please open a notebook or lexical editor first to select a runtime",
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
        "Runtime controllers refreshed. Select a runtime from the kernel picker.",
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
        "Runtime controllers are available in the kernel picker. Select 'Datalayer Platform' to choose a runtime.",
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
          "Runtime controllers refreshed. Available runtimes are shown in the kernel picker.",
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
            "Please login first to manage runtimes",
          );
          return;
        }

        // Fetch all runtimes
        const runtimes = await sdk.listRuntimes();

        if (!runtimes || runtimes.length === 0) {
          vscode.window.showInformationMessage("No running runtimes found");
          return;
        }

        // Helper to format time remaining
        const formatTimeRemaining = (expiredAt: Date): string => {
          const now = new Date();
          const msRemaining = expiredAt.getTime() - now.getTime();
          if (msRemaining <= 0) {
            return "expired";
          }

          const minutes = Math.floor(msRemaining / 60000);
          const hours = Math.floor(minutes / 60);

          if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m left`;
          }
          return `${minutes}m left`;
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
            label: `$(trash) Terminate All (${runtimes.length} runtime${runtimes.length !== 1 ? "s" : ""})`,
            description: "⚠️  This will terminate all running runtimes",
            isTerminateAll: true,
          },
        ];

        // Show QuickPick
        const selected = await vscode.window.showQuickPick(allItems, {
          placeHolder: "Select runtime to terminate",
          title: "Terminate Runtimes",
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
              sdk
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
              `Successfully terminated all ${runtimes.length} runtime${runtimes.length !== 1 ? "s" : ""}`,
            );
          } else {
            vscode.window.showWarningMessage(
              `Terminated ${successes} runtime${successes !== 1 ? "s" : ""}, ${failures} failed`,
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
        await sdk.deleteRuntime(selectedRuntime.podName);

        vscode.window.showInformationMessage(
          `Runtime "${runtimeName}" terminated successfully`,
        );

        // Notify all open documents that runtime was terminated
        await notifyAllDocuments();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Failed to terminate runtime: ${errorMessage}`,
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
              "Please login first to debug runtime termination",
            );
            return;
          }

          const runtimes = await sdk.listRuntimes();

          if (!runtimes || runtimes.length === 0) {
            vscode.window.showInformationMessage(
              "No runtimes found for debugging",
            );
            return;
          }

          // Test deleteRuntime API with detailed error handling
          const runtime = runtimes[0];
          const podName = runtime.podName;
          if (!podName) {
            throw new Error("Runtime missing podName from SDK");
          }

          vscode.window.showInformationMessage(
            `Debug: Terminating runtime "${runtime.givenName}". Check console for details.`,
          );

          const _result = await sdk.deleteRuntime(podName);
          vscode.window.showInformationMessage(
            `Debug: Runtime terminated successfully. Result: ${JSON.stringify(
              _result,
            )}`,
          );
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `Debug: Runtime termination failed. Error: ${errorMessage}. Check console for full details.`,
          );
        }
      },
    ),
  );

  /**
   * Internal command: datalayer.internal.terminateRuntime
   * Called from kernel selector to terminate a specific runtime for a document.
   * Used by both notebooks and lexical editors.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.terminateRuntime",
      async (uri: vscode.Uri, runtime: unknown) => {
        const runtimeObj = runtime as {
          podName?: string;
          givenName?: string;
          uid?: string;
        };

        try {
          // Terminate the runtime on the server using podName
          if (runtimeObj.podName) {
            await sdk.deleteRuntime(runtimeObj.podName);
            const runtimeName = runtimeObj.givenName || runtimeObj.podName;
            vscode.window.showInformationMessage(
              `Runtime "${runtimeName}" terminated successfully.`,
            );
          } else {
            throw new Error("Runtime podName not found");
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `Failed to terminate runtime: ${errorMessage}`,
          );
          return; // Don't clear runtime if termination failed
        }

        // Clear from centralized runtime tracking
        const { clearConnectedRuntime } = await import("./internal");
        clearConnectedRuntime(uri);

        // Send kernel-terminated message to appropriate provider
        // This is a fire-and-forget command to notify the UI
        vscode.commands.executeCommand(
          "datalayer.internal.notifyRuntimeTerminated",
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
            "You must be logged in to manage runtimes. Please run 'Datalayer: Login' first.",
          );
          return;
        }

        // Get list of active runtimes
        const runtimes = await sdk.listRuntimes();

        if (!runtimes || runtimes.length === 0) {
          vscode.window.showInformationMessage("No active runtimes found.");
          return;
        }

        // If only one runtime, confirm termination
        if (runtimes.length === 1) {
          const runtime = runtimes[0];
          const name = runtime.givenName;

          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(name),
          );

          if (confirmed) {
            await terminateRuntime(sdk, runtime);
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
            detail: `Credits: ${runtime.burningRate}`,
            runtime: runtime,
          };
        });

        const selected = (await vscode.window.showQuickPick(items, {
          placeHolder: "Select a runtime to terminate",
          title: "Terminate Runtime",
        })) as RuntimeQuickPickItem | undefined;

        if (selected && selected.runtime) {
          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(selected.label),
          );

          if (confirmed) {
            await terminateRuntime(sdk, selected.runtime);
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Failed to terminate runtime: ${errorMessage}`,
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
      const { selectDatalayerRuntime } = await import(
        "../ui/dialogs/runtimeSelector"
      );

      // Hide existing runtimes - user explicitly wants to CREATE a new one
      const selectedRuntime = await selectDatalayerRuntime(sdk, authProvider, {
        hideExistingRuntimes: true,
      });

      if (selectedRuntime) {
        vscode.window.showInformationMessage(
          `Runtime "${selectedRuntime.givenName || selectedRuntime.uid}" is ready`,
        );
        runtimesTreeProvider?.refresh();
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
          await sdk.deleteRuntime(item.runtime.podName);
          vscode.window.showInformationMessage(
            `Runtime "${runtimeName}" terminated successfully`,
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
            `Failed to terminate runtime: ${errorMessage}`,
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
              "Please login first to manage runtimes",
            );
            return;
          }

          // Fetch all runtimes
          const runtimes = await sdk.listRuntimes();

          if (!runtimes || runtimes.length === 0) {
            vscode.window.showInformationMessage("No running runtimes found");
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
              title: "Terminating runtimes...",
              cancellable: false,
            },
            async (progress) => {
              const results = await Promise.allSettled(
                runtimes.map((runtime, index) => {
                  progress.report({
                    message: `Terminating ${runtime.givenName || runtime.podName} (${index + 1}/${runtimes.length})`,
                  });
                  return sdk.deleteRuntime(runtime.podName);
                }),
              );

              // Count successes and failures
              const successes = results.filter(
                (r) => r.status === "fulfilled",
              ).length;
              const failures = results.length - successes;

              if (failures === 0) {
                vscode.window.showInformationMessage(
                  `Successfully terminated all ${runtimes.length} runtime${runtimes.length !== 1 ? "s" : ""}`,
                );
              } else {
                vscode.window.showWarningMessage(
                  `Terminated ${successes} runtime${successes !== 1 ? "s" : ""}, ${failures} failed`,
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
            `Failed to terminate runtimes: ${errorMessage}`,
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
          vscode.window.showErrorMessage("No runtime selected");
          return;
        }

        const runtime = item.runtime;
        const runtimeName = runtime.givenName || runtime.podName;

        // Check if runtime is running (has ingress URL)
        if (!runtime.ingress) {
          vscode.window.showErrorMessage(
            `Runtime "${runtimeName}" must be running to create a snapshot`,
          );
          return;
        }

        // Generate a suggested snapshot name based on the runtime name
        const timestamp = new Date()
          .toISOString()
          .split("T")[0]
          .replace(/-/g, "");
        const suggestedName =
          `snapshot-${runtimeName}-${timestamp}`.toLowerCase();

        // Prompt for snapshot name
        const snapshotName = await vscode.window.showInputBox({
          title: `Create Snapshot from "${runtimeName}"`,
          prompt: "Enter a name for the snapshot",
          placeHolder: "e.g., my-checkpoint",
          value: suggestedName,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Snapshot name cannot be empty";
            }
            // Basic validation - alphanumeric, hyphens, underscores
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return "Snapshot name can only contain letters, numbers, hyphens, and underscores";
            }
            return undefined;
          },
        });

        if (!snapshotName) {
          return; // User cancelled
        }

        // Prompt for snapshot description
        const description = await vscode.window.showInputBox({
          title: `Create Snapshot from "${runtimeName}"`,
          prompt: "Enter a description for the snapshot (optional)",
          placeHolder: "e.g., Checkpoint after training model",
        });

        if (description === undefined) {
          return; // User cancelled
        }

        // Ask if runtime should be stopped after snapshot
        const stopAfterSnapshot = await vscode.window.showQuickPick(
          [
            {
              label: "$(debug-continue) Keep runtime running",
              description: "Continue using the runtime after creating snapshot",
              picked: true,
              stop: false,
            },
            {
              label: "$(debug-stop) Stop runtime after snapshot",
              description: "Terminate the runtime after snapshot is created",
              stop: true,
            },
          ],
          {
            title: `Create Snapshot from "${runtimeName}"`,
            placeHolder: "What should happen to the runtime after snapshot?",
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
              title: `Creating snapshot "${snapshotName}"...`,
              cancellable: false,
            },
            async () => {
              const snapshot = await sdk.createSnapshot(
                runtime.podName,
                snapshotName,
                description || "",
                stopAfterSnapshot.stop,
              );

              vscode.window.showInformationMessage(
                `Snapshot "${snapshotName}" created successfully!`,
              );

              // Refresh the runtime tree
              vscode.commands.executeCommand("datalayer.runtimes.refresh");

              return snapshot;
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to create snapshot: ${error}`);
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
 * Notifies all open notebook and lexical documents that runtimes were terminated.
 * Sends kernel-terminated message to all active webviews.
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
          "datalayer.internal.notifyRuntimeTerminated",
          uri,
        );
      }
    }
  }
}

/**
 * Terminates a runtime and shows appropriate feedback.
 *
 * @param sdk - The SDK instance
 * @param runtime - The runtime to terminate
 */
async function terminateRuntime(
  sdk: DatalayerClient,
  runtime: RuntimeDTO,
): Promise<void> {
  const name = runtime.givenName;

  try {
    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Terminating runtime "${name}"...`,
        cancellable: false,
      },
      async () => {
        // MUST use pod_name for deleteRuntime API
        const podName = runtime.podName;
        if (!podName) {
          throw new Error("Runtime missing podName from SDK");
        }

        await sdk.deleteRuntime(podName);
      },
    );

    // Show success message
    vscode.window.showInformationMessage(
      `Runtime "${name}" terminated successfully.`,
    );

    // Notify all open documents that runtime was terminated
    await notifyAllDocuments();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to terminate runtime "${name}": ${errorMessage}`,
    );
  }
}
