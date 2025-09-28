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
import { DynamicControllerManager } from "../providers/dynamicControllerManager";

interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime: any;
}

/**
 * Registers all runtime-related commands for the Dynamic Controller Manager.
 *
 * @param context - Extension context for command subscriptions
 * @param controllerManager - The Dynamic Controller Manager
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  controllerManager: DynamicControllerManager
): void {
  /**
   * Command: datalayer.selectRuntime
   * Shows the runtime selection dialog to choose or create a runtime.
   * This simulates selecting the Datalayer Platform kernel from the picker.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.selectRuntime", async () => {
      console.log("[Extension] Manual runtime selection triggered");

      // Get active notebook editor
      const activeEditor = vscode.window.activeNotebookEditor;
      if (!activeEditor) {
        vscode.window.showInformationMessage(
          "Please open a notebook first to select a runtime"
        );
        return;
      }

      // Directly trigger runtime selection on the controller manager
      await controllerManager.selectRuntimeForNotebook(activeEditor.notebook);

      // Also ensure the controller is selected for this notebook
      // This makes sure "Datalayer Platform" is the active kernel
      vscode.window.showInformationMessage(
        "Runtime selector opened. Select or create a runtime."
      );
    })
  );

  /**
   * Command: datalayer.resetRuntime
   * Refreshes all runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.resetRuntime", async () => {
      console.log("[Extension] Runtime reset triggered");

      await controllerManager.refreshControllers();

      vscode.window.showInformationMessage(
        "Runtime controllers refreshed. Select a runtime from the kernel picker."
      );
    })
  );

  /**
   * Command: datalayer.showRuntimeStatus
   * Shows information about available runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.showRuntimeStatus", async () => {
      await controllerManager.refreshControllers();
      vscode.window.showInformationMessage(
        "Runtime controllers are available in the kernel picker. Select 'Datalayer Platform' to choose a runtime."
      );
    })
  );

  /**
   * Command: datalayer.refreshRuntimeControllers
   * Refreshes all runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.refreshRuntimeControllers",
      async (selectRuntimeUid?: string) => {
        console.log(
          "[Extension] Runtime refresh triggered",
          selectRuntimeUid ? `(select: ${selectRuntimeUid})` : ""
        );

        await controllerManager.refreshControllers();

        vscode.window.showInformationMessage(
          "Runtime controllers refreshed. Available runtimes are shown in the kernel picker."
        );
      }
    )
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
      }
    )
  );

  /**
   * Command: datalayer.restartNotebookRuntime
   * Refreshes runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.restartNotebookRuntime",
      async () => {
        const restart = await vscode.window.showWarningMessage(
          `Refresh runtime controllers? This will update the available runtimes in the kernel picker.`,
          "Refresh",
          "Cancel"
        );

        if (restart === "Refresh") {
          await controllerManager.refreshControllers();
          vscode.window.showInformationMessage(
            "Runtime controllers refreshed. Select a runtime from the kernel picker."
          );
        }
      }
    )
  );

  /**
   * Command: datalayer.terminateRuntime
   * Terminates the current runtime or allows selection of runtime to terminate.
   * Shows confirmation dialog before termination.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.terminateRuntime", async () => {
      try {
        // Import SDK and auth provider
        const { getSDKInstance } = await import("../services/sdkAdapter");
        const { SDKAuthProvider } = await import("../services/authProvider");

        const sdk = getSDKInstance();
        const authProvider = SDKAuthProvider.getInstance();

        // Check if user is authenticated
        const authState = authProvider.getAuthState();
        if (!authState.isAuthenticated) {
          vscode.window.showErrorMessage(
            "You must be logged in to manage runtimes. Please run 'Datalayer: Login' first."
          );
          return;
        }

        // Get list of active runtimes
        const runtimes = await (sdk as any).listRuntimes();

        if (!runtimes || runtimes.length === 0) {
          vscode.window.showInformationMessage("No active runtimes found.");
          return;
        }

        // If only one runtime, confirm termination
        if (runtimes.length === 1) {
          const runtime = runtimes[0];
          const name = runtime.givenName || runtime.given_name || runtime.uid;

          const selection = await vscode.window.showWarningMessage(
            `Terminate runtime "${name}"? This will stop all running notebooks using this runtime.`,
            { modal: true },
            "Terminate"
          );

          if (selection === "Terminate") {
            await terminateRuntime(sdk, runtime);
          }
          return;
        }

        // Multiple runtimes - show quick pick
        const items = runtimes.map((runtime: any) => {
          const name = runtime.givenName || runtime.given_name || runtime.uid;
          const environment =
            runtime.environmentName || runtime.environment_name || "Unknown";
          const status = runtime.state || runtime.status || "Unknown";

          return {
            label: name,
            description: `${environment} - ${status}`,
            detail: `Credits: ${
              runtime.credits || runtime.burningRate || "N/A"
            }`,
            runtime: runtime,
          };
        });

        const selected = (await vscode.window.showQuickPick(items, {
          placeHolder: "Select a runtime to terminate",
          title: "Terminate Runtime",
        })) as RuntimeQuickPickItem | undefined;

        if (selected) {
          const selection = await vscode.window.showWarningMessage(
            `Terminate runtime "${selected.label}"? This will stop all running notebooks using this runtime.`,
            { modal: true },
            "Terminate"
          );

          if (selection === "Terminate") {
            await terminateRuntime(sdk, selected.runtime);
          }
        }
      } catch (error: any) {
        console.error("[RuntimeCommands] Failed to terminate runtime:", error);
        vscode.window.showErrorMessage(
          `Failed to terminate runtime: ${error.message || error}`
        );
      }
    })
  );
}

/**
 * Terminates a runtime and shows appropriate feedback.
 *
 * @param sdk - The SDK instance
 * @param runtime - The runtime to terminate
 */
async function terminateRuntime(sdk: any, runtime: any): Promise<void> {
  const name = runtime.givenName || runtime.given_name || runtime.uid;

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
        const podName = runtime.pod_name || runtime.podName || runtime.uid;
        console.log(
          "[RuntimeCommands] Deleting runtime with pod_name:",
          podName
        );
        console.log(
          "[RuntimeCommands] Runtime object for context:",
          JSON.stringify(runtime, null, 2)
        );

        const result = await (sdk as any).deleteRuntime(podName);
        console.log("[RuntimeCommands] deleteRuntime API result:", result);
      }
    );

    // Show success message
    vscode.window.showInformationMessage(
      `Runtime "${name}" terminated successfully.`
    );
  } catch (error: any) {
    console.error("[RuntimeCommands] Failed to terminate runtime:", error);
    vscode.window.showErrorMessage(
      `Failed to terminate runtime "${name}": ${error.message || error}`
    );
  }
}
