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

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as vscode from "vscode";

/**
 * Tree item for displaying a runtime in the VS Code tree view.
 * Shows runtime details with appropriate icons and formatting.
 *
 */
export class RuntimeTreeItem extends vscode.TreeItem {
  /**
   * Creates a new RuntimeTreeItem with formatted description and tooltip.
   *
   * @param runtime - The RuntimeDTO instance containing runtime details to display.
   */
  constructor(public readonly runtime: RuntimeDTO) {
    super(
      runtime.givenName || runtime.podName,
      vscode.TreeItemCollapsibleState.None,
    );

    // Description: environment + time remaining
    const timeRemaining = this.getTimeRemaining();
    this.description = `${runtime.environmentTitle || runtime.environmentName} • ${timeRemaining}`;

    // Tooltip with full details
    this.tooltip = new vscode.MarkdownString(
      `**${vscode.l10n.t("Runtime")}:** ${runtime.givenName || runtime.podName}\n\n` +
        `**${vscode.l10n.t("Environment")}:** ${runtime.environmentTitle || runtime.environmentName}\n\n` +
        `**${vscode.l10n.t("Started")}:** ${runtime.startedAt.toLocaleString()}\n\n` +
        `**${vscode.l10n.t("Expires")}:** ${runtime.expiredAt.toLocaleString()}\n\n` +
        `**${vscode.l10n.t("Time Remaining")}:** ${timeRemaining}\n\n` +
        `**${vscode.l10n.t("Credits/hour")}:** ${runtime.burningRate}`,
    );

    // Context for menu items
    this.contextValue = "runtime";

    // Use consistent icon for all runtimes
    this.iconPath = new vscode.ThemeIcon("vm-running");
  }

  /**
   * Calculates and formats the time remaining until the runtime expires.
   *
   * @returns Formatted duration string like "2h 30m", "15m", or "Expired".
   */
  private getTimeRemaining(): string {
    const now = new Date();
    const remaining = this.runtime.expiredAt.getTime() - now.getTime();

    if (remaining < 0) {
      return vscode.l10n.t("Expired");
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
