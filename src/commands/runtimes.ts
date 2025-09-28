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
    vscode.commands.registerCommand(
      "datalayer.selectRuntime",
      async () => {
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
      }
    )
  );

  /**
   * Command: datalayer.resetRuntime
   * Refreshes all runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.resetRuntime",
      async () => {
        console.log("[Extension] Runtime reset triggered");
        
        await controllerManager.refreshControllers();
        
        vscode.window.showInformationMessage(
          "Runtime controllers refreshed. Select a runtime from the kernel picker."
        );
      }
    )
  );

  /**
   * Command: datalayer.showRuntimeStatus
   * Shows information about available runtime controllers.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.showRuntimeStatus",
      async () => {
        await controllerManager.refreshControllers();
        vscode.window.showInformationMessage(
          "Runtime controllers are available in the kernel picker. Select 'Datalayer Platform' to choose a runtime."
        );
      }
    )
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
}