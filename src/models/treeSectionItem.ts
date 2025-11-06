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
 * Types of tree sections available in the runtimes view.
 */
export type TreeSectionType = "runtimes-section" | "snapshots-section";

/**
 * Tree item for displaying collapsible section headers.
 * Creates visual separation between different types of items in a tree view.
 *
 * @example
 * ```typescript
 * const section = new TreeSectionItem("Runtimes", "runtimes-section", "$(vm)");
 * // Displays: "🖥️ Runtimes" (collapsible)
 * ```
 */
export class TreeSectionItem extends vscode.TreeItem {
  /**
   * Creates a new TreeSectionItem.
   *
   * @param label - Display label for the section
   * @param sectionType - Type identifier for the section
   * @param iconId - Optional ThemeIcon id (e.g., "vm", "archive")
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
