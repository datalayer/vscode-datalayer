/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Webview view provider for Agent Chat sidebar panel.
 * Integrates @datalayer/agent-runtimes chat components into VS Code sidebar.
 *
 * @module providers/agentChatProvider
 */

import * as vscode from "vscode";
import * as path from "path";
import { getNonce } from "../utils/webviewSecurity";
import { Logger } from "../services/logging/loggers";
import { getServiceContainer } from "../extension";

/**
 * Provider for the Agent Chat webview in the sidebar.
 * Displays the ChatSidebar component from @datalayer/agent-runtimes.
 */
export class AgentChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "datalayer.agentChat";

  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Resolves the webview view when it's opened.
   * Sets up the webview content and message handlers.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      // Restrict the webview to only loading content from our extension's dist directory
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Setup message handlers
    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message, webviewView.webview),
      null,
      this.context.subscriptions
    );

    Logger.info("[AgentChatProvider] Webview view resolved");
  }

  /**
   * Generates the HTML content for the webview.
   * Loads the agentChatWebview.js bundle and sets up CSP.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Get the resource paths for the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, "dist/agentChatWebview.js")
      )
    );

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">

        <!--
          Use a content security policy to only allow loading images from https or from our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; connect-src https: http: ws: wss:; font-src ${webview.cspSource};">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta property="csp-nonce" content="${nonce}">

        <title>Datalayer Agent Chat</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;
  }

  /**
   * Handles messages received from the webview.
   * Routes messages to the AgentRuntimeBridge for processing.
   */
  private async handleMessage(message: any, webview: vscode.Webview) {
    try {
      // Get the agent runtime bridge from service container
      const services = getServiceContainer();
      const bridge = services.agentRuntimeBridge;

      // Route message to bridge
      await bridge.handleMessage(message, webview);
    } catch (error) {
      Logger.error(
        "[AgentChatProvider] Error handling message:",
        error as Error
      );

      // Send error back to webview
      webview.postMessage({
        type: "error",
        error: (error as Error).message,
      });
    }
  }

  /**
   * Gets the current webview view instance, if available.
   */
  public get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  /**
   * Sends a message to the webview (if it's currently visible).
   */
  public postMessage(message: any): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    } else {
      Logger.warn(
        "[AgentChatProvider] Cannot post message - view not initialized"
      );
    }
  }
}
