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

import { getServiceContainer } from "../extension";
import { DatasourceTreeItem } from "../models/datasourceTreeItem";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import {
  createDatasourceDialogCommand,
  showDatasourceEditDialog,
} from "./createDatasourceDialog";

/**
 * Registers all datasource-related commands including create, edit, delete, and refresh.
 *
 * @param context - Extension context for command subscriptions.
 * @param settingsTreeProvider - The Settings tree view provider for refresh.
 *
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
        const deleteLabel = vscode.l10n.t("Delete");
        const confirmation = await vscode.window.showWarningMessage(
          vscode.l10n.t(
            'Are you sure you want to delete datasource "{0}"?',
            datasource.name,
          ),
          { modal: true },
          deleteLabel,
        );

        if (confirmation !== deleteLabel) {
          return;
        }

        try {
          const datalayer = getServiceContainer().datalayer;
          await datalayer.deleteDatasource(datasource.uid);

          vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Datasource "{0}" deleted successfully',
              datasource.name,
            ),
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
            vscode.l10n.t("Failed to delete datasource: {0}", errorMessage),
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
