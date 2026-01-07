/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Snapshot management commands for the Datalayer VS Code extension.
 * Handles snapshot restoration, deletion, and viewing.
 *
 * @module commands/snapshots
 */

import * as vscode from "vscode";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { SnapshotTreeItem } from "../models/snapshotTreeItem";
import { showTwoStepConfirmation } from "../ui/dialogs/confirmationDialog";
import { createRuntime } from "../ui/dialogs/runtimeSelector";
import { getServiceContainer } from "../extension";

/**
 * Registers all snapshot-related commands.
 * Snapshots are now part of the runtimes tree view.
 *
 * @param context - Extension context for command subscriptions
 * @param runtimesTreeProvider - The Runtimes tree view provider (includes snapshots section)
 */
export function registerSnapshotCommands(
  context: vscode.ExtensionContext,
  runtimesTreeProvider?: RuntimesTreeProvider,
): void {
  /**
   * Command: datalayer.snapshots.refresh
   * Refreshes the snapshots section in the runtimes tree view.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.snapshots.refresh", () => {
      if (runtimesTreeProvider) {
        runtimesTreeProvider.refresh();
      }
    }),
  );

  /**
   * Command: datalayer.snapshots.restore
   * Creates a new runtime from a snapshot.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.snapshots.restore",
      async (item: SnapshotTreeItem) => {
        if (!item || !item.snapshot) {
          vscode.window.showErrorMessage("No snapshot selected");
          return;
        }

        const snapshot = item.snapshot;
        const snapshotName = snapshot.name;

        try {
          const container = getServiceContainer();
          const sdk = container.sdk;

          // Get available environments
          const environments = await sdk.listEnvironments();
          if (!environments || environments.length === 0) {
            vscode.window.showErrorMessage("No environments available");
            return;
          }

          // Find the environment that matches the snapshot
          // Default to the snapshot's environment if it exists
          const snapshotEnv = environments.find(
            (env) => env.name === snapshot.environment,
          );
          const defaultEnv = snapshotEnv || environments[0];

          // Show environment selection
          const envItems = environments.map((env) => ({
            label: env.title || env.name,
            description: env.name,
            detail:
              env.name === snapshot.environment
                ? `✓ Original environment from snapshot "${snapshotName}"`
                : undefined,
            environment: env,
            picked: env.name === defaultEnv.name,
          }));

          const selectedEnv = await vscode.window.showQuickPick(envItems, {
            title: `Restore from Snapshot: ${snapshotName}`,
            placeHolder: "Select an environment for the new runtime",
          });

          if (!selectedEnv) {
            return; // User cancelled
          }

          // Create runtime with the snapshot pre-selected (skips snapshot selection step)
          const runtime = await createRuntime(
            sdk,
            selectedEnv.environment,
            snapshot.uid,
          );

          if (runtime) {
            vscode.window.showInformationMessage(
              `Runtime "${runtime.givenName}" created from snapshot "${snapshotName}"!`,
            );
            // Refresh runtimes tree to show the new runtime and update snapshots section
            runtimesTreeProvider?.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to restore from snapshot: ${error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.snapshots.delete
   * Deletes a snapshot permanently.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.snapshots.delete",
      async (item: SnapshotTreeItem) => {
        if (!item || !item.snapshot) {
          vscode.window.showErrorMessage("No snapshot selected");
          return;
        }

        const snapshot = item.snapshot;
        const snapshotName = snapshot.name;

        // Show confirmation dialog
        const confirmed = await showTwoStepConfirmation({
          itemName: snapshotName,
          action: "delete",
          consequences: [
            "This snapshot will be permanently deleted",
            "Any saved state in this snapshot will be lost",
            "This action cannot be undone",
          ],
          actionButton: "Delete Snapshot",
          finalActionButton: "Delete Snapshot",
        });

        if (!confirmed) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Deleting snapshot "${snapshotName}"...`,
              cancellable: false,
            },
            async () => {
              await snapshot.delete();
              vscode.window.showInformationMessage(
                `Snapshot "${snapshotName}" deleted successfully`,
              );
              // Refresh the runtimes tree (includes snapshots section)
              runtimesTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete snapshot: ${error}`);
        }
      },
    ),
  );

  /**
   * Command: datalayer.snapshots.viewDetails
   * Shows detailed information about a snapshot.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.snapshots.viewDetails",
      async (item: SnapshotTreeItem) => {
        if (!item || !item.snapshot) {
          vscode.window.showErrorMessage("No snapshot selected");
          return;
        }

        const snapshot = item.snapshot;
        const snapshotData = snapshot.toJSON();

        const details = `**Snapshot Details**

**Name:** ${snapshot.name}

**Description:** ${snapshot.description || "No description"}

**Environment:** ${snapshot.environment}

**Created:** ${new Date(snapshotData.updatedAt).toLocaleString()}

**ID:** ${snapshotData.uid}`;

        // Show in information message or quick pick
        const action = await vscode.window.showInformationMessage(
          `Snapshot: ${snapshot.name}`,
          { detail: details, modal: false },
          "Restore from Snapshot",
          "Delete Snapshot",
        );

        if (action === "Restore from Snapshot") {
          await vscode.commands.executeCommand(
            "datalayer.snapshots.restore",
            item,
          );
        } else if (action === "Delete Snapshot") {
          await vscode.commands.executeCommand(
            "datalayer.snapshots.delete",
            item,
          );
        }
      },
    ),
  );
}
