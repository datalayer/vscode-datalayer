/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item for displaying datasources in the Settings tree view.
 *
 * @module models/datasourceTreeItem
 */

import type { DatasourceDTO } from "@datalayer/core/lib/models/Datasource";
import * as vscode from "vscode";

/**
 * Tree item for displaying a datasource.
 *
 */
export class DatasourceTreeItem extends vscode.TreeItem {
  /**
   * Creates a new DatasourceTreeItem with icon, tooltip, and click command.
   *
   * @param datasource - Datasource DTO from the Datalayer platform.
   */
  constructor(public readonly datasource: DatasourceDTO) {
    super(datasource.name, vscode.TreeItemCollapsibleState.None);

    // Show variant in description (e.g., "athena", "bigquery")
    this.description = datasource.variant || datasource.type;

    // Tooltip with datasource details
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${datasource.name}**\n\n`);
    this.tooltip.appendMarkdown(`- **Type:** ${datasource.type}\n`);
    if (datasource.description) {
      this.tooltip.appendMarkdown(
        `- **Description:** ${datasource.description}\n`,
      );
    }
    if (datasource.database) {
      this.tooltip.appendMarkdown(`- **Database:** ${datasource.database}\n`);
    }
    if (datasource.outputBucket) {
      this.tooltip.appendMarkdown(
        `- **Output Bucket:** ${datasource.outputBucket}\n`,
      );
    }
    if (datasource.createdAt) {
      this.tooltip.appendMarkdown(
        `- **Created:** ${new Date(datasource.createdAt).toLocaleString()}\n`,
      );
    }
    this.tooltip.appendMarkdown(`- **ID:** ${datasource.uid}\n`);

    // Use database icon
    this.iconPath = new vscode.ThemeIcon("database");

    // Context value for menu filtering
    this.contextValue = "datasource";

    // Click command - opens edit dialog
    this.command = {
      command: "datalayer.editDatasource",
      title: "Edit Datasource",
      arguments: [this],
    };
  }
}
