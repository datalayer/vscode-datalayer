/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Network proxy service for Jupyter notebook communications.
 * Handles WebSocket and HTTP request forwarding between webview and servers.
 *
 * @module services/notebookNetwork
 */

import * as vscode from "vscode";
import { ExtensionMessage } from "../utils/messages";

/**
 * Handles network communications between webview and Jupyter servers.
 * Manages WebSocket connections and HTTP request proxying for notebook operations.
 *
 * @example
 * ```typescript
 * const networkService = new NotebookNetworkService();
 * networkService.forwardRequest(message, webview);
 * ```
 */
export class NotebookNetworkService {
  private readonly _websockets = new Map<string, WebSocket>();

  constructor() {}

  /**
   * Forwards HTTP requests from webview to target server.
   * Handles method, headers, and body forwarding with response relay.
   *
   * @param message - Extension message containing request details
   * @param webview - Target webview panel for response
   */
  forwardRequest(
    message: ExtensionMessage,
    webview: vscode.WebviewPanel
  ): void {
    const { body, id } = message;
    fetch(body.url, {
      body: body.body,
      headers: body.headers,
      method: body.method,
    }).then(async (reply: any) => {
      const headers: Record<string, string> = [...reply.headers].reduce(
        (agg, pair) => ({ ...agg, [pair[0]]: pair[1] }),
        {}
      );
      const rawBody =
        body.method !== "DELETE" ? await reply.arrayBuffer() : undefined;
      this.postMessage(
        webview,
        "http-response",
        {
          headers,
          body: rawBody,
          status: reply.status,
          statusText: reply.statusText,
        },
        id
      );
    });
  }

  /**
   * Opens a WebSocket connection for Jupyter kernel communication.
   * Sets up event handlers for open, message, close, and error events.
   *
   * @param message - Extension message with WebSocket configuration
   * @param webview - Target webview panel for event notifications
   */
  openWebsocket(message: ExtensionMessage, webview: vscode.WebviewPanel): void {
    const { body, id } = message;
    const wsURL = new URL(body.origin);
    if (wsURL.searchParams.has("token")) {
      wsURL.searchParams.set("token", "xxxxx");
    }
    const protocol = body.protocol ?? undefined;
    const ws = new WebSocket(body.origin, protocol);
    this._websockets.set(id!, ws);
    webview.onDidDispose(() => {
      this._websockets.delete(id!);
      ws.close();
    });
    ws.onopen = (event) => {
      this.postMessage(webview, "websocket-open", {}, id);
    };
    ws.onmessage = (event) => {
      const { data } = event;
      this.postMessage(webview, "websocket-message", { data }, id);
    };
    ws.onclose = (event) => {
      const { code, reason, wasClean } = event;
      this.postMessage(
        webview,
        "websocket-close",
        { code, reason, wasClean },
        id
      );
    };
    ws.onerror = (event) => {
      const error = (event as any).error;
      const message = (event as any).message ?? "WebSocket error occurred";
      this.postMessage(webview, "websocket-error", { error, message }, id);
    };
  }

  /**
   * Sends a message to an existing WebSocket connection.
   *
   * @param message - Extension message containing data to send
   */
  sendWebsocketMessage(message: ExtensionMessage): void {
    const { id } = message;
    const ws = this._websockets.get(id ?? "");
    if (!ws) {
      return;
    }
    ws.send(message.body.data);
  }

  /**
   * Closes a WebSocket connection by ID.
   *
   * @param message - Extension message containing connection ID
   */
  closeWebsocket(message: ExtensionMessage): void {
    const { id } = message;
    this._websockets.get(id ?? "")?.close();
  }

  /**
   * Posts a message to the webview.
   *
   * @param panel - Target webview panel
   * @param type - Message type identifier
   * @param body - Message payload
   * @param id - Optional message ID for correlation
   */
  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any,
    id?: string
  ): void {
    panel.webview.postMessage({ type, body, id });
  }

  /**
   * Cleans up all WebSocket connections.
   * Closes all active connections and clears the connection map.
   */
  dispose(): void {
    for (const ws of this._websockets.values()) {
      ws.close();
    }
    this._websockets.clear();
  }
}
