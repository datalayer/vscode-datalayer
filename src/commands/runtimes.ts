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
import {
  showTwoStepConfirmation,
  showSimpleConfirmation,
  CommonConfirmations,
} from "../ui/dialogs/confirmationDialog";

import type { Runtime } from "../../../core/lib/client/models/Runtime";

interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime: Runtime;
}

/**
 * Registers all runtime-related commands for the Smart Dynamic Controller Manager.
 *
 * @param context - Extension context for command subscriptions
 * @param controllerManager - The Smart Dynamic Controller Manager
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  controllerManager: SmartDynamicControllerManager,
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
            (input as any).viewType === "datalayer.lexical-editor"
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

      // Also ensure the controller is selected for this notebook
      // This makes sure "Datalayer Platform" is the active kernel
      vscode.window.showInformationMessage(
        "Runtime selector opened. Select or create a runtime.",
      );
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
      async (selectRuntimeUid?: string) => {
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
   * Command: datalayer.restartNotebookRuntime
   * Refreshes runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.restartNotebookRuntime",
      async () => {
        const restart = await showSimpleConfirmation(
          CommonConfirmations.refreshRuntimes(),
        );

        if (restart) {
          await controllerManager.refreshControllers();
          vscode.window.showInformationMessage(
            "Runtime controllers refreshed. Select a runtime from the kernel picker.",
          );
        }
      },
    ),
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

          const result = await sdk.deleteRuntime(podName);
          vscode.window.showInformationMessage(
            `Debug: Runtime terminated successfully. Result: ${JSON.stringify(
              result,
            )}`,
          );
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Debug: Runtime termination failed. Error: ${error.message}. Check console for full details.`,
          );
        }
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
        const items = runtimes.map((runtime: any) => {
          const name = runtime.givenName;
          const environment = runtime.environmentName;
          const status = runtime.state;

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

        if (selected) {
          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(selected.label),
          );

          if (confirmed) {
            await terminateRuntime(sdk, selected.runtime);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to terminate runtime: ${error.message}`,
        );
      }
    }),
  );
}

/**
 * Terminates a runtime and shows appropriate feedback.
 *
 * @param sdk - The SDK instance
 * @param runtime - The runtime to terminate
 */
async function terminateRuntime(sdk: any, runtime: any): Promise<void> {
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

        const result = await sdk.deleteRuntime(podName);
      },
    );

    // Show success message
    vscode.window.showInformationMessage(
      `Runtime "${name}" terminated successfully.`,
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to terminate runtime "${name}": ${error.message}`,
    );
  }
}
