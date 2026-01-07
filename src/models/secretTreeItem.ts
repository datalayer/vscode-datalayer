/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item for displaying secrets in the Settings tree view.
 *
 * @module models/secretTreeItem
 */

import * as vscode from "vscode";
import type { SecretDTO } from "@datalayer/core/lib/models/Secret";

/**
 * Tree item for displaying a secret with masked value.
 * Shows secret name, variant, and masked value but never the actual secret value.
 *
 * @example
 * ```typescript
 * const item = new SecretTreeItem(secretDto);
 * // Displays: "my_secret" with description "password • ••••••••"
 * ```
 */
export class SecretTreeItem extends vscode.TreeItem {
  /**
   * Creates a new SecretTreeItem.
   *
   * @param secret - Secret model from SDK
   */
  constructor(public readonly secret: SecretDTO) {
    super(secret.name, vscode.TreeItemCollapsibleState.None);

    // Show variant and masked value in description
    this.description = `${secret.variant} • ••••••••`;

    // Tooltip with secret details (NO actual value)
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${secret.name}**\n\n`);
    this.tooltip.appendMarkdown(`- **Type:** ${secret.variant}\n`);
    if (secret.description) {
      this.tooltip.appendMarkdown(`- **Description:** ${secret.description}\n`);
    }
    this.tooltip.appendMarkdown(`- **ID:** ${secret.uid}\n`);
    this.tooltip.appendMarkdown(
      `\n_Value is hidden for security. Use "View Secret Value" to reveal._`,
    );

    // Use key icon
    this.iconPath = new vscode.ThemeIcon("key");

    // Context value for menu filtering
    this.contextValue = "secret";
  }
}
