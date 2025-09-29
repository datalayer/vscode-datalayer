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
import { getSDKInstance } from "../services/sdkAdapter";
import { SDKAuthProvider } from "../services/authProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import {
  showTwoStepConfirmation,
  showSimpleConfirmation,
  CommonConfirmations,
} from "../utils/confirmationDialog";

interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime: any;
}

/**
 * Registers all runtime-related commands for the Smart Dynamic Controller Manager.
 *
 * @param context - Extension context for command subscriptions
 * @param controllerManager - The Smart Dynamic Controller Manager
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  controllerManager: SmartDynamicControllerManager
): void {
  const sdk = getSDKInstance();
  const authProvider = SDKAuthProvider.getInstance();
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
        const restart = await showSimpleConfirmation(
          CommonConfirmations.refreshRuntimes()
        );

        if (restart) {
          await controllerManager.refreshControllers();
          vscode.window.showInformationMessage(
            "Runtime controllers refreshed. Select a runtime from the kernel picker."
          );
        }
      }
    )
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
              "Please login first to debug runtime termination"
            );
            return;
          }

          // List available SDK methods for debugging
          console.log("[DEBUG] SDK instance type:", typeof sdk);
          console.log(
            "[DEBUG] SDK methods:",
            Object.getOwnPropertyNames(Object.getPrototypeOf(sdk))
          );
          console.log(
            "[DEBUG] SDK static methods:",
            Object.getOwnPropertyNames(sdk.constructor)
          );

          // Test listRuntimes first
          console.log("[DEBUG] Testing listRuntimes...");
          const runtimes = await (sdk as any).listRuntimes();
          console.log(
            "[DEBUG] listRuntimes result:",
            JSON.stringify(runtimes, null, 2)
          );

          if (!runtimes || runtimes.length === 0) {
            vscode.window.showInformationMessage(
              "No runtimes found for debugging"
            );
            return;
          }

          // Test deleteRuntime API with detailed error handling
          const runtime = runtimes[0];
          const podName = runtime.podName;
          if (!podName) {
            throw new Error("Runtime missing podName from SDK");
          }
          console.log("[DEBUG] Attempting to terminate runtime:", {
            runtime_name: runtime.givenName,
            pod_name: podName,
            uid: runtime.uid,
            full_runtime: runtime,
          });

          vscode.window.showInformationMessage(
            `Debug: Terminating runtime "${runtime.givenName}". Check console for details.`
          );

          const result = await (sdk as any).deleteRuntime(podName);
          console.log("[DEBUG] deleteRuntime success result:", result);
          vscode.window.showInformationMessage(
            `Debug: Runtime terminated successfully. Result: ${JSON.stringify(
              result
            )}`
          );
        } catch (error: any) {
          console.error("[DEBUG] Runtime termination error:", error);
          console.error("[DEBUG] Error stack:", error.stack);
          console.error("[DEBUG] Error message:", error.message);
          console.error("[DEBUG] Error type:", typeof error);
          console.error("[DEBUG] Error properties:", Object.keys(error));

          vscode.window.showErrorMessage(
            `Debug: Runtime termination failed. Error: ${error.message}. Check console for full details.`
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
          const name = runtime.givenName;

          const confirmed = await showTwoStepConfirmation(
            CommonConfirmations.terminateRuntime(name)
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
            CommonConfirmations.terminateRuntime(selected.label)
          );

          if (confirmed) {
            await terminateRuntime(sdk, selected.runtime);
          }
        }
      } catch (error: any) {
        console.error("[RuntimeCommands] Failed to terminate runtime:", error);
        vscode.window.showErrorMessage(
          `Failed to terminate runtime: ${error.message}`
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
        console.log(
          "[RuntimeCommands] Deleting runtime with pod_name:",
          podName
        );
        console.log(
          "[RuntimeCommands] Runtime object for context:",
          JSON.stringify(runtime, null, 2)
        );

        console.log(
          "[RuntimeCommands] About to call SDK deleteRuntime with podName:",
          podName
        );
        console.log("[RuntimeCommands] SDK instance type:", typeof sdk);
        console.log(
          "[RuntimeCommands] SDK deleteRuntime method exists:",
          typeof (sdk as any).deleteRuntime
        );

        const result = await (sdk as any).deleteRuntime(podName);
        console.log("[RuntimeCommands] deleteRuntime API result:", result);
        console.log(
          "[RuntimeCommands] deleteRuntime result type:",
          typeof result
        );

        // Also try to list runtimes after deletion to verify
        console.log(
          "[RuntimeCommands] Verifying deletion by listing runtimes..."
        );
        const afterDeletion = await (sdk as any).listRuntimes();
        console.log(
          "[RuntimeCommands] Runtimes after deletion:",
          afterDeletion
        );
      }
    );

    // Show success message
    vscode.window.showInformationMessage(
      `Runtime "${name}" terminated successfully.`
    );
  } catch (error: any) {
    console.error("[RuntimeCommands] Failed to terminate runtime:", error);
    vscode.window.showErrorMessage(
      `Failed to terminate runtime "${name}": ${error.message}`
    );
  }
}
