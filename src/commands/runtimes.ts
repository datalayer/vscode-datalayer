/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime management commands for the Datalayer VS Code extension.
 * Handles runtime status display, restart, and refresh operations.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands/runtimes
 *
 * @remarks
 * This module registers the following commands:
 * - `datalayer.refreshRuntimeControllers` - Forces refresh of runtime controllers
 * - `datalayer.showNotebookControllerStatus` - Displays active runtime status
 * - `datalayer.restartNotebookRuntime` - Restarts selected runtime with confirmation
 */

import * as vscode from "vscode";
import { RuntimeControllerManager } from "../providers/runtimeControllerManager";

/**
 * Registers all runtime-related commands for managing Datalayer runtime controllers.
 *
 * Establishes command handlers for runtime operations including status display,
 * controller refresh, and runtime restart with user confirmation flows.
 *
 * @param context - Extension context for command subscriptions
 * @param runtimeControllerManager - Manager for notebook runtime controllers
 */
export function registerRuntimeCommands(
  context: vscode.ExtensionContext,
  runtimeControllerManager: RuntimeControllerManager
): void {
  /**
   * Command: datalayer.refreshRuntimeControllers
   * Forces refresh of runtime controllers and optionally selects a specific runtime.
   * Updates the runtime controller registry with latest platform state.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.refreshRuntimeControllers",
      async (selectRuntimeUid?: string) => {
        console.log(
          "[Extension] Runtime controller refresh triggered",
          selectRuntimeUid ? `(select: ${selectRuntimeUid})` : ""
        );
        return await runtimeControllerManager.forceRefresh(selectRuntimeUid);
      }
    )
  );

  /**
   * Command: datalayer.showNotebookControllerStatus
   * Displays current status of all active Datalayer runtime controllers.
   * Shows runtime details including pod names, status, environment, and credits.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.showNotebookControllerStatus",
      () => {
        const controllers = runtimeControllerManager.getActiveControllers();

        if (controllers.length === 0) {
          vscode.window.showInformationMessage(
            "No active Datalayer runtime controllers. Login to see available runtimes."
          );
          return;
        }

        let statusMessage = `Active Datalayer Controllers (${controllers.length}):\n\n`;

        for (const controller of controllers) {
          const config = controller.config;
          const runtime = controller.activeRuntime;

          statusMessage += `• ${config.displayName}\n`;

          if (runtime) {
            statusMessage += `  Pod: ${runtime.pod_name || "N/A"}\n`;
            statusMessage += `  Status: ${runtime.status || "Unknown"}\n`;
            statusMessage += `  Environment: ${
              runtime.environment_name || runtime.environment_title || "default"
            }\n`;
            if (
              (runtime as any).creditsUsed !== undefined &&
              (runtime as any).creditsLimit
            ) {
              statusMessage += `  Credits: ${(runtime as any).creditsUsed}/${
                (runtime as any).creditsLimit
              }\n`;
            }
          } else {
            statusMessage += `  Type: ${config.type}\n`;
            if (config.environmentName) {
              statusMessage += `  Environment: ${config.environmentName}\n`;
            }
          }
          statusMessage += "\n";
        }

        vscode.window.showInformationMessage(statusMessage);
      }
    )
  );

  /**
   * Command: datalayer.restartNotebookRuntime
   * Restarts selected runtime with mandatory confirmation dialog.
   * Handles single runtime auto-selection or multi-runtime picker.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.restartNotebookRuntime",
      async () => {
        try {
          if (runtimeControllerManager) {
            const controllers = runtimeControllerManager.getActiveControllers();
            const runtimeControllers = controllers.filter(
              (c) => c.activeRuntime
            );

            if (runtimeControllers.length === 0) {
              vscode.window.showInformationMessage(
                "No active runtimes to restart."
              );
              return;
            }

            if (runtimeControllers.length === 1) {
              const controller = runtimeControllers[0];
              const runtime = controller.activeRuntime!;

              const restart = await vscode.window.showWarningMessage(
                `Restart runtime "${
                  runtime.pod_name || runtime.uid
                }"? This will interrupt any running executions.`,
                "Restart",
                "Cancel"
              );

              if (restart === "Restart") {
                controller.dispose();
                await runtimeControllerManager.forceRefresh();

                vscode.window.showInformationMessage(
                  "Runtime restarted. Controllers have been refreshed."
                );
              }
            } else {
              const runtimeNames = runtimeControllers.map((c) => {
                const runtime = c.activeRuntime!;
                return runtime.pod_name || runtime.uid;
              });

              const selectedRuntime = await vscode.window.showQuickPick(
                runtimeNames,
                {
                  placeHolder: "Select runtime to restart",
                }
              );

              if (selectedRuntime) {
                const controller = runtimeControllers.find(
                  (c) =>
                    (c.activeRuntime!.pod_name || c.activeRuntime!.uid) ===
                    selectedRuntime
                );

                if (controller) {
                  const restart = await vscode.window.showWarningMessage(
                    `Restart runtime "${selectedRuntime}"? This will interrupt any running executions.`,
                    "Restart",
                    "Cancel"
                  );

                  if (restart === "Restart") {
                    controller.dispose();
                    await runtimeControllerManager.forceRefresh();

                    vscode.window.showInformationMessage(
                      `Runtime "${selectedRuntime}" restarted. Controllers have been refreshed.`
                    );
                  }
                }
              }
            }
          } else {
            vscode.window.showInformationMessage(
              "No active runtimes to restart."
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to restart runtime: ${error}`);
        }
      }
    )
  );
}
