/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item representation for a runtime in the Runtimes tree view.
 * Displays runtime name, environment, time remaining, and status.
 *
 * @module models/runtimeTreeItem
 */

import * as vscode from "vscode";
import type { Runtime3 } from "@datalayer/core/lib/models/Runtime3";

/**
 * Tree item for displaying a runtime in the VS Code tree view.
 * Shows runtime details with appropriate icons and formatting.
 *
 * @example
 * ```typescript
 * const item = new RuntimeTreeItem(runtime);
 * // Displays: "my-runtime"
 * // Description: "Python 3.11 • 2h 30m left"
 * ```
 */
export class RuntimeTreeItem extends vscode.TreeItem {
  /**
   * Creates a new RuntimeTreeItem.
   *
   * @param runtime - The Runtime model instance to display
   */
  constructor(public readonly runtime: Runtime3) {
    super(
      runtime.givenName || runtime.podName,
      vscode.TreeItemCollapsibleState.None,
    );

    // Description: environment + time remaining
    const timeRemaining = this.getTimeRemaining();
    this.description = `${runtime.environmentTitle || runtime.environmentName} • ${timeRemaining}`;

    // Tooltip with full details
    this.tooltip = new vscode.MarkdownString(
      `**Runtime:** ${runtime.givenName || runtime.podName}\n\n` +
        `**Environment:** ${runtime.environmentTitle || runtime.environmentName}\n\n` +
        `**Started:** ${runtime.startedAt.toLocaleString()}\n\n` +
        `**Expires:** ${runtime.expiredAt.toLocaleString()}\n\n` +
        `**Time Remaining:** ${timeRemaining}\n\n` +
        `**Credits/hour:** ${runtime.burningRate}`,
    );

    // Context for menu items
    this.contextValue = "runtime";

    // Use consistent icon for all runtimes
    this.iconPath = new vscode.ThemeIcon("vm-running");
  }

  /**
   * Calculates and formats the time remaining until runtime expires.
   *
   * @returns Formatted string like "2h 30m" or "15m" or "Expired"
   */
  private getTimeRemaining(): string {
    const now = new Date();
    const remaining = this.runtime.expiredAt.getTime() - now.getTime();

    if (remaining < 0) {
      return "Expired";
    }

    const minutes = Math.floor(remaining / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  }
}
