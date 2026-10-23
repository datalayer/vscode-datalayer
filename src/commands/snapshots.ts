/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Snapshot management commands for the Datalayer VS Code extension.
 * Handles snapshot restoration, deletion, and viewing: a click on a snapshot
 * in the Agents view (or its row on the Home page) opens its details page,
 * one panel showing the snapshot clicked last, with its Restore and Delete.
 *
 * @module commands/snapshots
 */

import * as vscode from "vscode";

import { getServiceContainer } from "../extension";
import { SnapshotTreeItem } from "../models/snapshotTreeItem";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { showTwoStepConfirmation } from "../ui/dialogs/confirmationDialog";
import { createRuntime } from "../ui/dialogs/runtimeSelector";
import {
  snapshotDetailsOf,
  type SnapshotHostMessage,
  snapshotPageMessageOf,
} from "../ui/snapshot/snapshotDetails";
import { getSnapshotHtml } from "../ui/templates/snapshotTemplate";

/** The details panel's view type. */
const SNAPSHOT_VIEW_TYPE = "datalayer.snapshotDetails";

/**
 * The snapshot details panel: one, showing the snapshot clicked last —
 * opened, or revealed and told the new snapshot when open.
 */
class SnapshotDetailsPanel {
  private panel: vscode.WebviewPanel | undefined;
  private item: SnapshotTreeItem | undefined;
  /** The uid of the snapshot shown (read once: a deleted one's DTO throws). */
  private uid: string | undefined;
  private disposables: vscode.Disposable[] = [];

  /** @param context - Extension context, for the bundle's location. */
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Shows a snapshot's details.
   *
   * @param item - The snapshot's tree item (its commands take it).
   */
  show(item: SnapshotTreeItem): void {
    this.item = item;
    this.uid = item.snapshot.uid;
    if (this.panel) {
      this.panel.title = `Snapshot: ${item.snapshot.name}`;
      this.panel.reveal();
      this.postDetails();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      SNAPSHOT_VIEW_TYPE,
      `Snapshot: ${item.snapshot.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        ],
      },
    );
    this.panel = panel;
    panel.iconPath = new vscode.ThemeIcon("archive");
    panel.webview.html = getSnapshotHtml(
      panel.webview,
      this.context.extensionUri,
    );
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme()),
      panel.webview.onDidReceiveMessage((raw) => this.onMessage(raw)),
      panel.onDidDispose(() => this.closed()),
    );
  }

  /** Closes the panel, when it is open. */
  dispose(): void {
    this.panel?.dispose();
  }

  /**
   * Closes the panel when it shows a snapshot that was deleted.
   *
   * @param uid - The snapshot deleted.
   */
  closeIfShowing(uid: string): void {
    if (this.panel && this.uid === uid) {
      this.dispose();
    }
  }

  /** The panel closed: its listeners let go. */
  private closed(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.panel = undefined;
    this.item = undefined;
    this.uid = undefined;
  }

  /**
   * Posts a message to the page, when the panel is open.
   *
   * @param message - What the page is told.
   */
  private post(message: SnapshotHostMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  /** Tells the page the snapshot's details. */
  private postDetails(): void {
    if (this.item) {
      this.post({
        type: "snapshot-details",
        body: snapshotDetailsOf(this.item.snapshot.rawData()),
      });
    }
  }

  /** Tells the page whether VS Code's theme is light or dark. */
  private postTheme(): void {
    const kind = vscode.window.activeColorTheme.kind;
    this.post({
      type: "theme-changed",
      theme:
        kind === vscode.ColorThemeKind.Dark ||
        kind === vscode.ColorThemeKind.HighContrast
          ? "dark"
          : "light",
    });
  }

  /**
   * Answers the page: its first paint, its Restore and Delete — the
   * snapshot's own commands, as the tree's menu runs them.
   *
   * @param raw - The page's message, before it is read.
   */
  private async onMessage(raw: unknown): Promise<void> {
    const message = snapshotPageMessageOf(raw);
    const item = this.item;
    if (!message || !item) {
      return;
    }
    switch (message.type) {
      case "ready":
        this.postTheme();
        this.postDetails();
        return;
      case "restore":
        await vscode.commands.executeCommand(
          "datalayer.snapshots.restore",
          item,
        );
        return;
      case "delete":
        // Deleted, the command closes this page: nothing is left to show.
        await vscode.commands.executeCommand(
          "datalayer.snapshots.delete",
          item,
        );
        return;
    }
  }
}

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
  const detailsPanel = new SnapshotDetailsPanel(context);
  context.subscriptions.push(detailsPanel);

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
          const datalayer = container.datalayer;

          // Get available environments
          const environments = await datalayer.listEnvironments();
          if (!environments || environments.length === 0) {
            vscode.window.showErrorMessage("No environments available");
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
            title: `Restore from Snapshot: ${snapshotName}`,
            placeHolder: "Select an environment for the new runtime",
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
   * Deletes a snapshot permanently; resolves true once it is deleted (its
   * details page, when open on it, closes then), false when it is not.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.snapshots.delete",
      async (item: SnapshotTreeItem): Promise<boolean> => {
        if (!item || !item.snapshot) {
          vscode.window.showErrorMessage("No snapshot selected");
          return false;
        }

        const snapshot = item.snapshot;
        const snapshotName = snapshot.name;
        const snapshotUid = snapshot.uid;

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
          return false;
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
          // Its details page, when open on it, has nothing left to show.
          detailsPanel.closeIfShowing(snapshotUid);
          return true;
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete snapshot: ${error}`);
          return false;
        }
      },
    ),
  );

  /**
   * Command: datalayer.snapshots.viewDetails
   * Opens the snapshot's details page: its name, description, environment,
   * date, size, format, language, metadata and files, with its Restore and
   * Delete. A click on a snapshot in the Agents view runs it.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.snapshots.viewDetails",
      (item: SnapshotTreeItem) => {
        if (!item || !item.snapshot) {
          vscode.window.showErrorMessage("No snapshot selected");
          return;
        }
        detailsPanel.show(item);
      },
    ),
  );
}
