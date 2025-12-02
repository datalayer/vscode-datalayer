/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ag-ui example commands
 * Opens the ag-ui example webview with CopilotKit integration
 *
 * @module commands/agui
 */

import * as vscode from "vscode";
import * as path from "path";
import { ServiceLoggers } from "../services/logging/loggers";

/**
 * Opens the ag-ui example webview panel
 *
 * Demonstrates platform-agnostic tool usage with CopilotKit's AI copilot interface.
 */
function openAgUIExample(context: vscode.ExtensionContext): void {
  const logger = ServiceLoggers.getLogger("commands/agui");
  logger.info("Opening ag-ui example");

  // Create or show webview panel
  const panel = vscode.window.createWebviewPanel(
    "datalayerAgUIExample",
    "ag-ui Notebook Example",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "dist")),
      ],
    },
  );

  // Set HTML content
  panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

  logger.info("ag-ui example panel created");
}

/**
 * Generate HTML content for the webview
 */
function getWebviewContent(
  webview: vscode.Webview,
  extensionPath: string,
): string {
  const distPath = path.join(extensionPath, "dist");
  const distUri = webview.asWebviewUri(vscode.Uri.file(distPath));
  const aguiScriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(distPath, "aguiExample.js")),
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      script-src ${distUri} 'unsafe-inline' 'unsafe-eval' https: 'self';
      script-src-elem ${distUri} 'unsafe-inline' https: 'self';
      style-src ${distUri} 'unsafe-inline' https: 'self';
      img-src ${distUri} https: http: data: blob: 'self';
      font-src ${distUri} https: data: 'self';
      connect-src https: http: ws: wss: 'self';
      worker-src blob: 'self';
      child-src blob: 'self';">
    <title>ag-ui Notebook Example</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
          Arial, sans-serif;
        overflow: hidden;
      }
      #root {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="${aguiScriptUri}"></script>
  </body>
</html>`;
}

/**
 * Register ag-ui example commands
 *
 * @param context - Extension context for managing disposables
 */
export function registerAgUICommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.showAgUIExample", () => {
      openAgUIExample(context);
    }),
  );

  const logger = ServiceLoggers.getLogger("commands/agui");
  logger.info("ag-ui commands registered");
}
