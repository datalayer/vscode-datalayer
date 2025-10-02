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
import { ExtensionMessage } from "../../types/vscode/messages";

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
    webview: vscode.WebviewPanel,
  ): void {
    const { body, id } = message;
    const requestBody = body as {
      url: string;
      body?: string | ArrayBuffer | Blob | FormData;
      headers?: Record<string, string>;
      method: string;
    };
    fetch(requestBody.url, {
      body: requestBody.body,
      headers: requestBody.headers,
      method: requestBody.method,
    }).then(async (reply: Response) => {
      const headers: Record<string, string> = [...reply.headers].reduce(
        (agg, pair) => ({ ...agg, [pair[0]]: pair[1] }),
        {},
      );
      const rawBody =
        requestBody.method !== "DELETE" ? await reply.arrayBuffer() : undefined;
      this.postMessage(
        webview,
        "http-response",
        {
          headers,
          body: rawBody,
          status: reply.status,
          statusText: reply.statusText,
        },
        id,
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
    const wsBody = body as {
      origin: string;
      protocol?: string | string[];
    };
    const wsURL = new URL(wsBody.origin);
    if (wsURL.searchParams.has("token")) {
      wsURL.searchParams.set("token", "xxxxx");
    }

    // Validate and sanitize the protocol
    let protocol: string | string[] | undefined = wsBody.protocol;

    // WebSocket protocol must be a valid token (alphanumeric, hyphen, dot, underscore)
    // If protocol is invalid or empty, don't pass it
    if (protocol) {
      if (Array.isArray(protocol)) {
        // Filter out invalid protocols
        const validProtocols = protocol.filter(
          (p) =>
            typeof p === "string" &&
            p.length > 0 &&
            /^[a-zA-Z0-9._-]+$/.test(p),
        );
        protocol = validProtocols.length > 0 ? validProtocols : undefined;
      } else if (typeof protocol === "string") {
        // Check if it's a valid protocol token (empty strings are invalid)
        if (protocol.length === 0 || !/^[a-zA-Z0-9._-]+$/.test(protocol)) {
          protocol = undefined;
        }
      } else {
        protocol = undefined;
      }
    }

    // Only pass protocol if it's defined and not empty
    // Node.js WebSocket rejects empty string protocols
    const ws = protocol
      ? new WebSocket(wsBody.origin, protocol)
      : new WebSocket(wsBody.origin);
    this._websockets.set(id!, ws);
    webview.onDidDispose(() => {
      this._websockets.delete(id!);
      ws.close();
    });
    ws.onopen = (_event) => {
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
        id,
      );
    };
    ws.onerror = (event) => {
      const errorEvent = event as Event & { error?: Error; message?: string };
      const error = errorEvent.error;
      const message = errorEvent.message ?? "WebSocket error occurred";
      this.postMessage(webview, "websocket-error", { error, message }, id);
    };
  }

  /**
   * Sends a message to an existing WebSocket connection.
   *
   * @param message - Extension message containing data to send
   */
  sendWebsocketMessage(message: ExtensionMessage): void {
    const { id, body } = message;
    const ws = this._websockets.get(id ?? "");
    if (!ws) {
      return;
    }
    const wsData = body as {
      data: string | ArrayBufferLike | Blob | ArrayBufferView;
    };
    ws.send(wsData.data);
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
    body: unknown,
    id?: string,
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
