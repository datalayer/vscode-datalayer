/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as vscode from "vscode";

import { getPrimerVSCodeThemeCSS } from "../styles/primerVSCodeTheme";

/**
 * Generates the HTML content for the *Datalayer* home page webview with Primer theme CSS and CSP.
 * @param webview - Webview instance for generating secure URIs and CSP source.
 * @param extensionUri - Extension root URI for resolving bundled script paths.
 *
 * @returns Complete HTML string for the home page webview.
 */
export function getHomeHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "home.js"),
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource};">
  <title>Datalayer</title>
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
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** Generates a cryptographically random 32-character nonce for CSP headers.
 * @returns A 32-character alphanumeric nonce string.
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
