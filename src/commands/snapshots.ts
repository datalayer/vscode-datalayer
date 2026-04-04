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

import { getServiceContainer } from "../extension";
import { SnapshotTreeItem } from "../models/snapshotTreeItem";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { showTwoStepConfirmation } from "../ui/dialogs/confirmationDialog";
import { createRuntime } from "../ui/dialogs/runtimeSelector";

/**
 * Registers all snapshot-related commands for restoration, deletion, and viewing details.
 * Snapshots are now part of the runtimes tree view.
 *
 * @param context - Extension context for command subscriptions.
 * @param runtimesTreeProvider - The Runtimes tree view provider (includes snapshots section).
 *
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
          vscode.window.showErrorMessage(vscode.l10n.t("No snapshot selected"));
          return;
        }

        const snapshot = item.snapshot;
        const snapshotName = snapshot.name;

        try {
          const container = getServiceContainer();
          const datalayer = container.datalayer;

          // Get available environments
          const environments = await datalayer.listEnvironments();
          if (!environments || environments.length === 0) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("No environments available"),
            );
            return;
          }

          // Find the environment that matches the snapshot
          // Default to the snapshot's environment if it exists
          const snapshotEnv = environments.find(
            (env) => env.name === snapshot.environment,
          );
          const defaultEnv = snapshotEnv ?? environments[0];

          // Show environment selection
          const envItems = environments.map((env) => ({
            label: env.title || env.name,
            description: env.name,
            detail:
              env.name === snapshot.environment
                ? `✓ Original environment from snapshot "${snapshotName}"`
                : undefined,
            environment: env,
            picked: defaultEnv !== undefined && env.name === defaultEnv.name,
          }));

          const selectedEnv = await vscode.window.showQuickPick(envItems, {
            title: vscode.l10n.t("Restore from Snapshot: {0}", snapshotName),
            placeHolder: vscode.l10n.t(
              "Select an environment for the new runtime",
            ),
          });

          if (!selectedEnv) {
            return; // User cancelled
          }

          // Create runtime with the snapshot pre-selected (skips snapshot selection step)
          const runtime = await createRuntime(
            datalayer,
            selectedEnv.environment,
            snapshot.uid,
          );

          if (runtime) {
            vscode.window.showInformationMessage(
              vscode.l10n.t(
                'Runtime "{0}" created from snapshot "{1}"!',
                runtime.givenName,
                snapshotName,
              ),
            );
            // Refresh runtimes tree to show the new runtime and update snapshots section
            runtimesTreeProvider?.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to restore from snapshot: {0}",
              String(error),
            ),
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
          vscode.window.showErrorMessage(vscode.l10n.t("No snapshot selected"));
          return;
        }

        const snapshot = item.snapshot;
        const snapshotName = snapshot.name;

        // Show confirmation dialog
        const deleteSnapshotLabel = vscode.l10n.t("Delete Snapshot");
        const confirmed = await showTwoStepConfirmation({
          itemName: snapshotName,
          consequences: [
            vscode.l10n.t("This snapshot will be permanently deleted"),
            vscode.l10n.t("Any saved state in this snapshot will be lost"),
            vscode.l10n.t("This action cannot be undone"),
          ],
          actionButton: deleteSnapshotLabel,
        });

        if (!confirmed) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t('Deleting snapshot "{0}"...', snapshotName),
              cancellable: false,
            },
            async () => {
              await snapshot.delete();
              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  'Snapshot "{0}" deleted successfully',
                  snapshotName,
                ),
              );
              // Refresh the runtimes tree (includes snapshots section)
              runtimesTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t("Failed to delete snapshot: {0}", String(error)),
          );
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
          vscode.window.showErrorMessage(vscode.l10n.t("No snapshot selected"));
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
        const restoreLabel = vscode.l10n.t("Restore from Snapshot");
        const deleteLabel = vscode.l10n.t("Delete Snapshot");
        const action = await vscode.window.showInformationMessage(
          vscode.l10n.t("Snapshot: {0}", snapshot.name),
          { detail: details, modal: false },
          restoreLabel,
          deleteLabel,
        );

        if (action === restoreLabel) {
          await vscode.commands.executeCommand(
            "datalayer.snapshots.restore",
            item,
          );
        } else if (action === deleteLabel) {
          await vscode.commands.executeCommand(
            "datalayer.snapshots.delete",
            item,
          );
        }
      },
    ),
  );
}
