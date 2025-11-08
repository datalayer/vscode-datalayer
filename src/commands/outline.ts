/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Command handlers for document outline navigation.
 *
 * @module commands/outline
 */

import * as vscode from "vscode";
import type {
  OutlineTreeProvider,
  OutlineTreeItem,
} from "../providers/outlineTreeProvider";

/**
 * Registers all outline-related commands.
 *
 * @param context - Extension context
 * @param outlineTreeProvider - The outline tree provider instance
 */
export function registerOutlineCommands(
  context: vscode.ExtensionContext,
  outlineTreeProvider: OutlineTreeProvider,
): void {
  // Navigate to outline item
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.outline.navigate",
      async (item: OutlineTreeItem) => {
        await outlineTreeProvider.navigateToItem(item);
      },
    ),
  );

  // Refresh outline
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.outline.refresh", () => {
      outlineTreeProvider.refresh();
    }),
  );

  // Collapse all outline items
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.outline.collapseAll", () => {
      // This is handled by VS Code's tree view automatically
      // The command just needs to be registered for the icon to work
      vscode.commands.executeCommand(
        "workbench.actions.treeView.datalayerOutline.collapseAll",
      );
    }),
  );
}
