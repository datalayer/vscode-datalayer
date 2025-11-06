/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item representation for a snapshot in the Runtimes tree view.
 * Displays snapshot name, environment, and creation date.
 *
 * @module models/snapshotTreeItem
 */

import * as vscode from "vscode";
import type { RuntimeSnapshotDTO } from "@datalayer/core/lib/models/RuntimeSnapshotDTO";
import { formatRelativeTime } from "../utils/dateFormatter";

/**
 * Tree item for displaying a snapshot in the VS Code tree view.
 * Shows snapshot details with appropriate icons and formatting.
 *
 * @example
 * ```typescript
 * const item = new SnapshotTreeItem(snapshot);
 * // Displays: "my-checkpoint"
 * // Description: "Python 3.11 • 2 days ago"
 * ```
 */
export class SnapshotTreeItem extends vscode.TreeItem {
  /**
   * Creates a new SnapshotTreeItem.
   *
   * @param snapshot - The RuntimeSnapshotDTO instance to display
   */
  constructor(public readonly snapshot: RuntimeSnapshotDTO) {
    super(snapshot.name, vscode.TreeItemCollapsibleState.None);

    // Description: environment + time since creation
    const timeAgo = this.getTimeAgo();
    this.description = `${snapshot.environment} • ${timeAgo}`;

    // Tooltip with full details
    const snapshotData = snapshot.toJSON();
    this.tooltip = new vscode.MarkdownString(
      `**Snapshot:** ${snapshot.name}\n\n` +
        `**Environment:** ${snapshot.environment}\n\n` +
        `**Description:** ${snapshot.description || "No description"}\n\n` +
        `**Created:** ${new Date(snapshotData.updatedAt).toLocaleString()}\n\n` +
        `**ID:** ${snapshotData.uid.slice(0, 8)}...`,
    );

    // Context for menu items
    this.contextValue = "snapshot";

    // Use archive icon for snapshots
    this.iconPath = new vscode.ThemeIcon("archive");
  }

  /**
   * Calculates and formats the time since snapshot was created.
   *
   * @returns Formatted string like "2 days ago" or "5 hours ago"
   */
  private getTimeAgo(): string {
    const snapshotData = this.snapshot.toJSON();
    const created = new Date(snapshotData.updatedAt);
    return formatRelativeTime(created);
  }
}
