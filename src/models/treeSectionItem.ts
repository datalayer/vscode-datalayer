/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item for section headers in tree views.
 * Used to create collapsible sections like "Runtimes" and "Snapshots".
 *
 * @module models/treeSectionItem
 */

import * as vscode from "vscode";

/**
 * Types of tree sections available across different tree views.
 * - runtimes-section: Runtimes list in Runtimes view
 * - snapshots-section: Snapshots list in Runtimes view
 * - secrets-section: Secrets list in Settings view
 * - datasources-section: Datasources list in Settings view
 */
export type TreeSectionType =
  | "runtimes-section"
  | "snapshots-section"
  | "secrets-section"
  | "datasources-section";

/**
 * Tree item for displaying collapsible section headers.
 * Creates visual separation between different types of items in a tree view.
 *
 */
export class TreeSectionItem extends vscode.TreeItem {
  /**
   * Creates a new TreeSectionItem with optional icon.
   *
   * @param label - Display label for the section header.
   * @param sectionType - Type identifier used for conditional menu items.
   * @param iconId - Optional ThemeIcon identifier such as "vm" or "archive".
   */
  constructor(
    label: string,
    public readonly sectionType: TreeSectionType,
    iconId?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);

    // Context value for conditional menu items
    this.contextValue = sectionType;

    // Optional icon
    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId);
    }

    // No tooltip needed for section headers
    this.tooltip = label;
  }
}
