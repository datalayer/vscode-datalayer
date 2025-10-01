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
import { getNonce } from "./webviewSecurity";

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
  const scriptUri =
    webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
    ) + `?t=${Date.now()}`;

  // Get the codicon CSS file from dist folder
  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "codicon.css"),
  );

  // Use a nonce to whitelist which scripts can be run
  const nonce = getNonce();

  /*
    FIXME we use very light Content Security Policy;
    - any inline style are allowed
    - any data: image are allowed
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
          Use a content security policy to only allow loading images from https or from our extension directory, and only allow scripts that have a specific nonce.
          Note: font-src is added to allow codicon font loading
          -->
          <!--
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
          -->
          <!--
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
          -->

        </head>

        <body>
          <div id="notebook-editor"></div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>

      </html>`;
}
