/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Command to open datasource creation dialog in webview.
 *
 * @module commands/createDatasourceDialog
 */

import * as vscode from "vscode";
import { getDatasourceDialogHtml } from "../ui/templates/datasourceTemplate";
import { getDatasourceEditDialogHtml } from "../ui/templates/datasourceEditTemplate";
import { getServiceContainer } from "../extension";

export function createDatasourceDialogCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "datalayer.createDatasourceDialog",
    () => showDatasourceDialog(context),
  );
}

async function showDatasourceDialog(
  context: vscode.ExtensionContext,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "datalayer.datasourceCreation",
    "Create Datasource",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true, // Changed to true for theme handling
      localResourceRoots: [vscode.Uri.file(context.extensionPath + "/dist")],
    },
  );

  // Set HTML content with current theme colors
  const updateContent = () => {
    panel.webview.html = getDatasourceDialogHtml(
      panel.webview,
      context.extensionUri,
    );
  };

  updateContent();

  // Set datalayer icon
  panel.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "images",
    "datalayer-logo.png",
  );

  // Handle theme changes - CRITICAL pattern from showcase
  const updateTheme = () => {
    const colorTheme = vscode.window.activeColorTheme.kind;
    const isDark =
      colorTheme === vscode.ColorThemeKind.Dark ||
      colorTheme === vscode.ColorThemeKind.HighContrast;

    panel.webview.postMessage({
      type: "theme-changed",
      theme: isDark ? "dark" : "light",
    });
  };

  // Send initial theme
  updateTheme();

  // Listen for theme changes - VS Code updates CSS variables automatically
  // IMPORTANT: Dispose when panel closes, don't add to context.subscriptions
  const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(
    () => {
      if (!panel.visible) {
        return; // Panel is hidden/disposed, don't update
      }
      // Only send theme message, don't reload HTML (CSS vars update automatically)
      updateTheme();
    },
  );

  // Clean up theme listener when panel is disposed
  panel.onDidDispose(() => {
    themeChangeDisposable.dispose();
  });

  // Wait for webview ready
  const readyPromise = new Promise<void>((resolve) => {
    const disposable = panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "ready") {
        disposable.dispose();
        resolve();
      }
    });
  });

  await readyPromise;

  // Send initialization data
  const sdk = getServiceContainer().sdk;
  const token = sdk.getToken();

  panel.webview.postMessage({
    type: "init",
    body: {
      token,
      iamRunUrl: "https://prod1.datalayer.run",
    },
  });

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case "create-datasource":
        try {
          console.log(
            "[Datasource] Creating datasource with data:",
            message.body,
          );
          const datasource = await sdk.createDatasource(message.body);
          console.log("[Datasource] Created successfully:", datasource);
          vscode.window.showInformationMessage(
            `Datasource "${datasource.name}" created successfully`,
          );

          // Refresh settings tree
          const { getSettingsTreeProvider } = await import("../extension");
          const settingsProvider = getSettingsTreeProvider();
          if (settingsProvider) {
            settingsProvider.refresh();
          }

          panel.dispose();
        } catch (error) {
          console.error("[Datasource] Error creating datasource:", error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to create datasource";

          // Send error to webview
          panel.webview.postMessage({
            type: "datasource-error",
            body: {
              error: errorMessage,
            },
          });
        }
        break;

      case "cancel":
        panel.dispose();
        break;
    }
  });
}

export async function showDatasourceEditDialog(
  context: vscode.ExtensionContext,
  datasourceUid: string,
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "datalayer.datasourceEdit",
    "Loading Datasource...",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath + "/dist")],
    },
  );

  // Set HTML content with current theme colors
  const updateContent = () => {
    panel.webview.html = getDatasourceEditDialogHtml(
      panel.webview,
      context.extensionUri,
    );
  };

  updateContent();

  // Set datalayer icon
  panel.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "images",
    "datalayer-logo.png",
  );

  // Handle theme changes
  const updateTheme = () => {
    const colorTheme = vscode.window.activeColorTheme.kind;
    const isDark =
      colorTheme === vscode.ColorThemeKind.Dark ||
      colorTheme === vscode.ColorThemeKind.HighContrast;

    panel.webview.postMessage({
      type: "theme-changed",
      theme: isDark ? "dark" : "light",
    });
  };

  // Send initial theme
  updateTheme();

  // Listen for theme changes
  const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(
    () => {
      if (!panel.visible) {
        return;
      }
      updateTheme();
    },
  );

  // Clean up theme listener when panel is disposed
  panel.onDidDispose(() => {
    themeChangeDisposable.dispose();
  });

  // Wait for webview ready
  const readyPromise = new Promise<void>((resolve) => {
    const disposable = panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "ready") {
        disposable.dispose();
        resolve();
      }
    });
  });

  await readyPromise;

  // Fetch datasource data and send initialization data
  try {
    const sdk = getServiceContainer().sdk;
    const datasource = await sdk.getDatasource(datasourceUid);
    const token = sdk.getToken();

    // Update panel title with datasource name
    panel.title = `Datasource: ${datasource.name}`;

    panel.webview.postMessage({
      type: "init-edit",
      body: {
        token,
        iamRunUrl: "https://prod1.datalayer.run",
        datasource: {
          uid: datasource.uid,
          type: datasource.type,
          variant: datasource.variant || datasource.type,
          name: datasource.name,
          description: datasource.description,
          database: datasource.database,
          outputBucket: datasource.outputBucket,
        },
      },
    });
  } catch (error) {
    console.error("[Datasource] Error loading datasource:", error);
    vscode.window.showErrorMessage(
      `Failed to load datasource: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    panel.dispose();
    return;
  }

  // Handle messages from webview (reuse the same handler as create)
  panel.webview.onDidReceiveMessage(async (message) => {
    const sdk = getServiceContainer().sdk;

    switch (message.type) {
      case "update-datasource":
        try {
          console.log(
            "[Datasource] Updating datasource with data:",
            message.body,
          );
          const datasource = await sdk.updateDatasource(
            message.body.uid,
            message.body,
          );
          console.log("[Datasource] Update API call completed");
          console.log("[Datasource] Response type:", typeof datasource);
          console.log("[Datasource] Response value:", datasource);

          // Check if datasource is valid before accessing properties
          if (!datasource) {
            throw new Error("Update returned null/undefined datasource");
          }

          const datasourceName = message.body.name; // Use the name we sent
          console.log("[Datasource] Updated successfully");
          vscode.window.showInformationMessage(
            `Datasource "${datasourceName}" updated successfully`,
          );

          // Refresh settings tree
          const { getSettingsTreeProvider } = await import("../extension");
          const settingsProvider = getSettingsTreeProvider();
          if (settingsProvider) {
            settingsProvider.refresh();
          }

          panel.dispose();
        } catch (error) {
          console.error("[Datasource] Error updating datasource:", error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update datasource";

          // Send error to webview
          panel.webview.postMessage({
            type: "datasource-error",
            body: {
              error: errorMessage,
            },
          });
        }
        break;

      case "cancel":
        panel.dispose();
        break;
    }
  });
}
