/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Datasources management commands for the Datalayer VS Code extension.
 *
 * @module commands/datasources
 */

import * as vscode from "vscode";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import { DatasourceTreeItem } from "../models/datasourceTreeItem";
import {
  createDatasourceDialogCommand,
  showDatasourceEditDialog,
} from "./createDatasourceDialog";
import { getServiceContainer } from "../extension";

/**
 * Registers all datasource-related commands.
 *
 * @param context - Extension context for command subscriptions
 * @param settingsTreeProvider - The Settings tree view provider for refresh
 */
export function registerDatasourcesCommands(
  context: vscode.ExtensionContext,
  settingsTreeProvider?: SettingsTreeProvider,
): void {
  /**
   * Command: datalayer.createDatasourceDialog
   * Opens webview dialog for creating a new datasource.
   */
  context.subscriptions.push(createDatasourceDialogCommand(context));

  /**
   * Command: datalayer.createDatasource
   * Creates a new datasource by opening the webview dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.createDatasource", async () => {
      // Open the webview dialog instead of QuickPick
      await vscode.commands.executeCommand("datalayer.createDatasourceDialog");
    }),
  );

  /**
   * Command: datalayer.editDatasource
   * Opens datasource in edit mode.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.editDatasource",
      async (item: DatasourceTreeItem) => {
        await showDatasourceEditDialog(context, item.datasource.uid);
      },
    ),
  );

  /**
   * Command: datalayer.deleteDatasource
   * Deletes a datasource after confirmation.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.deleteDatasource",
      async (item: DatasourceTreeItem) => {
        const datasource = item.datasource;
        const confirmation = await vscode.window.showWarningMessage(
          `Are you sure you want to delete datasource "${datasource.name}"?`,
          { modal: true },
          "Delete",
        );

        if (confirmation !== "Delete") {
          return;
        }

        try {
          const sdk = getServiceContainer().sdk;
          await sdk.deleteDatasource(datasource.uid);

          vscode.window.showInformationMessage(
            `Datasource "${datasource.name}" deleted successfully`,
          );

          // Refresh the tree
          if (settingsTreeProvider) {
            settingsTreeProvider.refresh();
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to delete datasource";
          vscode.window.showErrorMessage(
            `Failed to delete datasource: ${errorMessage}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.refreshDatasources
   * Refreshes the datasources section.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.refreshDatasources", () => {
      if (settingsTreeProvider) {
        settingsTreeProvider.refresh();
      }
    }),
  );
}
