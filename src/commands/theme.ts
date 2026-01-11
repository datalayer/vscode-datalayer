/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Commands for Primer theme showcase and demos.
 *
 * @module commands/theme
 */

import * as vscode from "vscode";
import * as path from "path";
import { getPrimerVSCodeThemeCSS } from "../ui/styles/primerVSCodeTheme";

/**
 * Registers theme-related commands.
 *
 * @param context - Extension context for command subscriptions
 */
export function registerThemeCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.showPrimerThemeShowcase", () =>
      showPrimerThemeShowcase(context),
    ),
  );
}

/**
 * Opens a webview panel showcasing Primer React components
 * styled with the VSCode Primer theme.
 */
function showPrimerThemeShowcase(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    "datalayer.primerThemeShowcase",
    "Primer Theme Showcase",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "dist")),
      ],
    },
  );

  // Get the URI for the webview assets
  const webviewUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, "dist", "showcase.js")),
  );

  // Set the HTML content with current theme colors
  const updateContent = () => {
    panel.webview.html = getWebviewContent(panel.webview, webviewUri);
  };

  updateContent();

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

  // Listen for theme changes - update content to refresh CSS variables
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      updateContent();
      updateTheme();
    }),
  );
}

/**
 * Generates the HTML content for the webview.
 */
function getWebviewContent(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
): string {
  // Get nonce for CSP
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
    <title>Primer Theme Showcase</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            overflow-x: hidden;
        }

        #root {
            width: 100%;
            height: 100%;
        }

        ${getPrimerVSCodeThemeCSS()}
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        // Debug: Log CSS variables before React loads
        console.log("VSCode CSS Variables Check:");
        const root = document.documentElement;
        const computed = getComputedStyle(root);
        console.log("--vscode-editor-background:", computed.getPropertyValue('--vscode-editor-background'));
        console.log("--vscode-editor-foreground:", computed.getPropertyValue('--vscode-editor-foreground'));
        console.log("--vscode-button-background:", computed.getPropertyValue('--vscode-button-background'));
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Generates a nonce for CSP.
 */
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
