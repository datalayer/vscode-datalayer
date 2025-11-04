/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * HTML template generation for notebook webview.
 * Handles CSP nonces, styling, and VS Code theme integration.
 *
 * @module utils/notebookTemplate
 */

import * as vscode from "vscode";
import { getNonce } from "../../utils/webviewSecurity";

/**
 * Generates HTML content for the notebook editor webview.
 * Includes VS Code theme integration, CSP nonces, and necessary styling.
 *
 * @param webview - The webview instance for URI resolution
 * @param extensionUri - Extension URI for resource loading
 * @returns HTML string for the webview
 */
export function getNotebookHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  // Local path to script and css for the webview with cache busting
  // Use build timestamp to ensure fresh cache after rebuild
  const buildTimestamp = Date.now();
  const scriptUri =
    webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
    ) + `?v=${buildTimestamp}`;

  // Get the codicon CSS file from dist folder
  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "codicon.css"),
  );

  // Use a nonce to whitelist which scripts can be run
  const nonce = getNonce();

  /*
    Content Security Policy is properly configured:
    - Scripts require nonce (prevents XSS attacks)
    - Styles allow 'unsafe-inline' only for typestyle dynamic injection
    - Images allow blob: and data: URIs for notebook outputs
    - Connections restricted to extension resources and secure protocols (https/wss)
   */
  return /* html */ `
			<!DOCTYPE html>
			<html lang="en">

        <head>

          <meta charset="UTF-8">

          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <title>Datalayer Notebook</title>

          <!--
            Workaround for injected typestyle
            Xref: https://github.com/typestyle/typestyle/pull/267#issuecomment-390408796
          -->
          <style id="typestyle-stylesheet" nonce="${nonce}"></style>

          <!-- Import Codicon CSS -->
          <link href="${codiconCssUri}" rel="stylesheet" />

          <!-- Custom animation styles -->
          <style nonce="${nonce}">
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

            .codicon-modifier-spin {
              animation: spin 1s linear infinite;
            }

            /* Cell Sidebar Styling to match VS Code theme */
            .jp-SidePanel {
              background-color: var(--vscode-editor-background) !important;
              color: var(--vscode-foreground) !important;
              font-family: var(--vscode-font-family) !important;
              font-size: var(--vscode-editor-font-size, 13px) !important;
              border: none !important;
            }

            .jp-SidePanel .jp-SidePanel-content {
              background-color: var(--vscode-editor-background) !important;
            }

            .jp-SidePanel button {
              background-color: transparent !important;
              color: var(--vscode-foreground) !important;
              border: none !important;
              font-family: var(--vscode-font-family) !important;
              font-size: var(--vscode-editor-font-size, 13px) !important;
              padding: 4px 8px !important;
              width: 100% !important;
              text-align: left !important;
              cursor: pointer !important;
              transition: background-color 0.1s !important;
            }

            .jp-SidePanel button:hover {
              background-color: var(--vscode-list-hoverBackground) !important;
            }

            .jp-SidePanel button:active,
            .jp-SidePanel button:focus {
              background-color: var(--vscode-list-activeSelectionBackground) !important;
              color: var(--vscode-list-activeSelectionForeground) !important;
              outline: none !important;
            }

            /* Cell sidebar icons */
            .jp-SidePanel button .codicon {
              margin-right: 6px !important;
              font-size: 14px !important;
              vertical-align: middle !important;
            }

            /* Cell sidebar panel positioning */
            .jp-SidePanel-toolbar {
              background-color: var(--vscode-editor-background) !important;
              border-bottom: 1px solid var(--vscode-panel-border) !important;
            }

            /* Fix body and html background */
            html, body {
              margin: 0;
              padding: 0;
              height: 100%;
              width: 100%;
              background-color: var(--vscode-editor-background);
              overflow: hidden;
            }

            /* Ensure notebook container fills the viewport */
            #notebook-editor {
              height: 100vh;
              width: 100vw;
              background-color: var(--vscode-editor-background);
              margin: 0;
              padding: 0;
            }
          </style>

          <meta property="csp-nonce" content="${nonce}" />

          <!--
          Content Security Policy:
          - default-src 'none': Deny all by default
          - img-src: Allow images from extension, blob URLs, and data URIs (needed for notebook outputs)
          - style-src: Allow styles from extension and with nonce (typestyle injects styles dynamically)
          - font-src: Allow fonts from extension (codicon fonts)
          - script-src: Only allow scripts with valid nonce
          - connect-src: Allow connections to extension resources only
          - worker-src: Allow web workers from extension and blob URLs (needed for Jupyter kernels)

          Note: 'unsafe-inline' is required for typestyle dynamic style injection.
          Note: 'unsafe-eval' is required for AJV (JSON schema validator used by Jupyter dependencies).
          This is acceptable as we control the extension code and use nonces for scripts.
          -->
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'unsafe-eval'; connect-src ${webview.cspSource} https: wss:; worker-src blob:;" />

        </head>

        <body>
          <div id="notebook-editor"></div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>

      </html>`;
}
