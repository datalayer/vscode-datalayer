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

/**
 * Registers theme-related commands.
 *
 * @param context - Extension context for command subscriptions
 */
export function registerThemeCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.showPrimerThemeShowcase",
      () => showPrimerThemeShowcase(context),
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
        
        /* CRITICAL: Override Primer colors with VSCode CSS variables using !important */
        :root {
            /* Base colors */
            --bgColor-default: var(--vscode-editor-background) !important;
            --fgColor-default: var(--vscode-editor-foreground) !important;
            --fgColor-muted: var(--vscode-descriptionForeground) !important;
            --bgColor-muted: var(--vscode-editorWidget-background) !important;
            --borderColor-default: var(--vscode-panel-border) !important;
            
            /* Button variant colors - Default */
            --button-default-bgColor-rest: var(--vscode-button-secondaryBackground) !important;
            --button-default-bgColor-hover: var(--vscode-button-secondaryHoverBackground) !important;
            --button-default-fgColor-rest: var(--vscode-button-secondaryForeground) !important;
            --button-default-borderColor-rest: var(--vscode-button-border) !important;
            
            /* Button variant colors - Primary */
            --button-primary-bgColor-rest: var(--vscode-button-background) !important;
            --button-primary-bgColor-hover: var(--vscode-button-hoverBackground) !important;
            --button-primary-fgColor-rest: var(--vscode-button-foreground) !important;
            --button-primary-borderColor-rest: var(--vscode-button-border) !important;
            
            /* Button variant colors - Danger */
            --button-danger-bgColor-rest: transparent !important;
            --button-danger-bgColor-hover: var(--vscode-errorForeground) !important;
            --button-danger-fgColor-rest: var(--vscode-errorForeground) !important;
            --button-danger-fgColor-hover: var(--vscode-button-foreground) !important;
            --button-danger-borderColor-rest: var(--vscode-errorForeground) !important;
            
            /* Flash/Banner colors - use bgColor and fgColor patterns */
            --bgColor-success-muted: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent) !important;
            --fgColor-success: var(--vscode-testing-iconPassed) !important;
            --borderColor-success-muted: var(--vscode-testing-iconPassed) !important;
            
            --bgColor-danger-muted: color-mix(in srgb, var(--vscode-errorForeground) 15%, transparent) !important;
            --fgColor-danger: var(--vscode-errorForeground) !important;
            --borderColor-danger-muted: var(--vscode-errorForeground) !important;
            --borderColor-danger-emphasis: var(--vscode-errorForeground) !important;
            
            --bgColor-attention-muted: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent) !important;
            --fgColor-attention: var(--vscode-editorWarning-foreground) !important;
            --borderColor-attention-muted: var(--vscode-editorWarning-foreground) !important;
            --borderColor-attention-emphasis: var(--vscode-editorWarning-foreground) !important;
            
            /* Label colors - Labels use emphasis variants for borders */
            --bgColor-success-emphasis: var(--vscode-testing-iconPassed) !important;
            
            /* Progress bar */
            --progressBar-bgColor: var(--vscode-testing-iconPassed) !important;
        }
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
