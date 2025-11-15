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
import type { IKernelBridge } from "../interfaces/IKernelBridge";
import { LocalKernelProxy } from "./localKernelProxy";
import {
  LOCAL_KERNEL_URL_PREFIX,
  isLocalKernelUrl,
} from "../../constants/kernelConstants";

/**
 * Handles network communications between webview and Jupyter servers.
 * Manages WebSocket connections and HTTP request proxying for notebook operations.
 * For local ZMQ kernels, uses LocalKernelProxy instead of real WebSockets.
 *
 * @example
 * ```typescript
 * const networkService = new NotebookNetworkService(kernelBridge);
 * networkService.forwardRequest(message, webview);
 * ```
 */
export class NotebookNetworkService {
  private readonly _websockets = new Map<string, WebSocket>();
  // Map of kernelId -> LocalKernelProxy (one proxy per kernel, reused for all connections)
  private readonly _localKernelProxies = new Map<string, LocalKernelProxy>();
  // Map of WebSocket connection ID -> kernelId (to route messages to correct proxy)
  private readonly _connectionToKernel = new Map<string, string>();

  constructor(private readonly _kernelBridge?: IKernelBridge) {
    console.log(
      "[NotebookNetwork] Constructor called with kernelBridge:",
      !!_kernelBridge,
    );
  }

  /**
   * Forwards HTTP requests from webview to target server.
   * For local kernels, intercepts and handles REST API calls.
   * Handles method, headers, and body forwarding with response relay.
   *
   * @param message - Extension message containing request details
   * @param webview - Target webview panel for response
   */
  forwardRequest(
    message: ExtensionMessage,
    webview: vscode.WebviewPanel,
  ): void {
    const { body, requestId } = message;
    const requestBody = body as {
      url: string;
      body?: string | ArrayBuffer | Blob | FormData;
      headers?: Record<string, string>;
      method: string;
    };

    // Check if this is a local kernel REST API request using shared utility
    if (isLocalKernelUrl(requestBody.url)) {
      this._handleLocalKernelRequest(message, webview);
      return;
    }

    fetch(requestBody.url, {
      body: requestBody.body,
      headers: requestBody.headers,
      method: requestBody.method,
    })
      .then(async (reply: Response) => {
        const headers: Record<string, string> = {};
        reply.headers.forEach((value, key) => {
          headers[key] = value;
        });
        const rawBody =
          requestBody.method !== "DELETE"
            ? await reply.arrayBuffer()
            : undefined;

        this.postMessage(
          webview,
          "http-response",
          {
            headers,
            body: rawBody,
            status: reply.status,
            statusText: reply.statusText,
          },
          requestId,
        );
      })
      .catch((error) => {
        console.error("[NotebookNetwork] Request failed:", error);
        // Send error response back to webview
        this.postMessage(
          webview,
          "http-response",
          {
            headers: {},
            body: undefined,
            status: 500,
            statusText: error.message || "Network request failed",
          },
          requestId,
        );
      });
  }

  /**
   * Handles HTTP REST API requests for local kernels.
   * Provides mock responses for Jupyter REST API endpoints.
   */
  private _handleLocalKernelRequest(
    message: ExtensionMessage,
    webview: vscode.WebviewPanel,
  ): void {
    const { body, requestId } = message;
    const requestBody = body as {
      url: string;
      method: string;
    };

    // Extract kernel ID from URL using regex pattern
    const match = requestBody.url.match(
      new RegExp(`${LOCAL_KERNEL_URL_PREFIX}([^.]+)\\.localhost`),
    );
    if (!match) {
      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: undefined,
          status: 404,
          statusText: "Not Found",
        },
        requestId,
      );
      return;
    }

    const kernelId = match[1];
    console.log(
      `[NotebookNetwork] Local kernel REST API request: ${requestBody.method} ${requestBody.url}`,
    );

    // Parse the REST API endpoint
    const url = new URL(requestBody.url);
    const path = url.pathname;

    // Handle different Jupyter REST API endpoints
    if (path.includes("/api/sessions") && requestBody.method === "POST") {
      // Create new session
      // For local kernels, the kernel is already running, so we can mark it as ready immediately
      const sessionInfo = {
        id: `session-${kernelId}`,
        path: "notebook.ipynb",
        name: "notebook",
        type: "notebook",
        kernel: {
          id: kernelId,
          name: "python3",
          last_activity: new Date().toISOString(),
          execution_state: "idle",
          connections: 1,
        },
      };
      console.log(
        `[NotebookNetwork] Creating session with kernel ID: ${kernelId}, connections: 1`,
      );

      const responseBody = JSON.stringify(sessionInfo);
      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: new TextEncoder().encode(responseBody).buffer,
          status: 201,
          statusText: "Created",
        },
        requestId,
      );
    } else if (
      path.includes("/api/sessions") &&
      requestBody.method === "DELETE"
    ) {
      // Delete session - return 204 No Content (must not have a body)
      // For local kernels, don't actually delete the session - just acknowledge
      console.log(
        `[NotebookNetwork] DELETE session request (not actually deleting for local kernel): ${path}`,
      );
      this.postMessage(
        webview,
        "http-response",
        {
          headers: {},
          // Don't include body for 204 responses
          status: 204,
          statusText: "No Content",
        },
        requestId,
      );
    } else if (path.includes("/api/sessions")) {
      // List sessions
      const sessionInfo = {
        id: `session-${kernelId}`,
        path: "notebook.ipynb",
        name: "notebook",
        type: "notebook",
        kernel: {
          id: kernelId,
          name: "python3",
          last_activity: new Date().toISOString(),
          execution_state: "idle",
          connections: 1, // Mark as connected
        },
      };

      const responseBody = JSON.stringify([sessionInfo]);
      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: new TextEncoder().encode(responseBody).buffer,
          status: 200,
          statusText: "OK",
        },
        requestId,
      );
    } else if (path.includes("/api/kernels") && requestBody.method === "POST") {
      // Start new kernel - return existing kernel info
      const kernelInfo = {
        id: kernelId,
        name: "python3",
        last_activity: new Date().toISOString(),
        execution_state: "idle",
        connections: 1, // Mark as connected
      };

      const responseBody = JSON.stringify(kernelInfo);
      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: new TextEncoder().encode(responseBody).buffer,
          status: 201,
          statusText: "Created",
        },
        requestId,
      );
    } else if (path.includes("/api/kernels")) {
      // List kernels or get kernel info
      const kernelInfo = {
        id: kernelId,
        name: "python3",
        last_activity: new Date().toISOString(),
        execution_state: "idle",
        connections: 1, // Mark as connected
      };

      const responseBody = path.endsWith("/kernels")
        ? JSON.stringify([kernelInfo])
        : JSON.stringify(kernelInfo);

      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: new TextEncoder().encode(responseBody).buffer,
          status: 200,
          statusText: "OK",
        },
        requestId,
      );
    } else {
      // Other endpoints - return empty success
      this.postMessage(
        webview,
        "http-response",
        {
          headers: { "Content-Type": "application/json" },
          body: new TextEncoder().encode("{}").buffer,
          status: 200,
          statusText: "OK",
        },
        requestId,
      );
    }
  }

  /**
   * Opens a WebSocket connection for Jupyter kernel communication.
   * For local kernels, creates a LocalKernelProxy instead.
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

    console.log(`[NotebookNetwork] openWebsocket called: ${wsBody.origin}`);

    // Check if this is a local kernel connection using shared utility
    if (isLocalKernelUrl(wsBody.origin)) {
      console.log(`[NotebookNetwork] Detected local kernel WebSocket request`);
      this._openLocalKernel(message, webview);
      return;
    }

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
   * Opens a local kernel proxy for ZMQ communication.
   */
  private _openLocalKernel(
    message: ExtensionMessage,
    webview: vscode.WebviewPanel,
  ): void {
    const { body, id } = message;
    const wsBody = body as {
      origin: string;
    };

    // Extract kernel ID from URL using regex pattern
    const match = wsBody.origin.match(
      new RegExp(`${LOCAL_KERNEL_URL_PREFIX}([^.]+)\\.localhost`),
    );
    if (!match) {
      console.error(
        "[NotebookNetwork] Could not extract kernel ID from URL:",
        wsBody.origin,
      );
      this.postMessage(
        webview,
        "websocket-error",
        { error: "Invalid local kernel URL" },
        id,
      );
      return;
    }

    const kernelId = match[1];

    if (!this._kernelBridge) {
      console.error("[NotebookNetwork] Kernel bridge not available");
      this.postMessage(
        webview,
        "websocket-error",
        { error: "Kernel bridge not available" },
        id,
      );
      return;
    }

    const kernelClient = this._kernelBridge.getLocalKernel(kernelId);
    if (!kernelClient) {
      console.error(`[NotebookNetwork] Local kernel not found: ${kernelId}`);
      this.postMessage(
        webview,
        "websocket-error",
        { error: `Kernel not found: ${kernelId}` },
        id,
      );
      return;
    }

    // Reuse existing proxy for this kernel, or create new one
    let proxy = this._localKernelProxies.get(kernelId);
    if (!proxy) {
      console.log(
        `[NotebookNetwork] Creating new local kernel proxy for: ${kernelId}`,
      );
      proxy = new LocalKernelProxy(kernelClient, webview, id!);
      this._localKernelProxies.set(kernelId, proxy);
    } else {
      console.log(
        `[NotebookNetwork] Reusing existing local kernel proxy for: ${kernelId}`,
      );
      // Register this new connection with the proxy and get the fake kernel_info_reply
      const openBody = proxy.addConnection(id!);
      // Notify webview that connection is open, including the fake kernel_info_reply
      console.log(
        `[NotebookNetwork] Sending websocket-open with fake reply for connection ID: ${id}`,
      );
      this.postMessage(webview, "websocket-open", openBody, id);
    }

    // Map this connection ID to the kernel ID for message routing
    this._connectionToKernel.set(id!, kernelId);

    // Clean up connection mapping on webview dispose
    webview.onDidDispose(() => {
      this._connectionToKernel.delete(id!);
      // Only close proxy if no more connections to this kernel
      const hasOtherConnections = Array.from(
        this._connectionToKernel.values(),
      ).includes(kernelId);
      if (!hasOtherConnections) {
        console.log(
          `[NotebookNetwork] No more connections to kernel ${kernelId}, closing proxy`,
        );
        this._localKernelProxies.delete(kernelId);
        proxy!.close();
      }
    });
  }

  /**
   * Sends a message to an existing WebSocket connection or local kernel proxy.
   *
   * @param message - Extension message containing data to send
   */
  sendWebsocketMessage(message: ExtensionMessage): void {
    const { id, body } = message;

    // Check if this is a local kernel proxy - route by kernelId
    const kernelId = this._connectionToKernel.get(id ?? "");
    const localProxy = kernelId
      ? this._localKernelProxies.get(kernelId)
      : undefined;
    console.log(
      `[NotebookNetwork] sendWebsocketMessage: id=${id}, kernelId=${kernelId}, hasProxy=${!!localProxy}, hasWS=${!!this._websockets.get(id ?? "")}`,
    );
    if (localProxy) {
      const wsData = body as { data: unknown };
      console.log(
        `[NotebookNetwork] Routing to local proxy, data type=${typeof wsData.data}`,
      );
      localProxy.handleMessage(wsData.data);
      return;
    }

    // Otherwise, use regular WebSocket
    const ws = this._websockets.get(id ?? "");
    if (!ws) {
      console.log(`[NotebookNetwork] No WebSocket found for id=${id}`);
      return;
    }
    const wsData = body as {
      data: string | ArrayBufferLike | Blob | ArrayBufferView;
    };
    ws.send(wsData.data);
  }

  /**
   * Closes a WebSocket connection or local kernel proxy by ID.
   *
   * @param message - Extension message containing connection ID
   */
  closeWebsocket(message: ExtensionMessage): void {
    const { id } = message;

    // Check if this is a local kernel proxy
    const localProxy = this._localKernelProxies.get(id ?? "");
    if (localProxy) {
      localProxy.close();
      this._localKernelProxies.delete(id ?? "");
      return;
    }

    // Otherwise, close regular WebSocket
    this._websockets.get(id ?? "")?.close();
  }

  /**
   * Posts a message to the webview.
   *
   * @param panel - Target webview panel
   * @param type - Message type identifier
   * @param body - Message payload
   * @param requestIdOrId - Optional message ID for correlation (requestId for HTTP, id for WebSocket)
   */
  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: unknown,
    requestIdOrId?: string,
  ): void {
    // HTTP messages use 'requestId', WebSocket messages use 'id'
    const isWebSocketMessage = type.startsWith("websocket-");
    const messageToSend = isWebSocketMessage
      ? { type, body, id: requestIdOrId }
      : { type, body, requestId: requestIdOrId };

    panel.webview.postMessage(messageToSend);
  }

  /**
   * Cleans up all WebSocket connections and local kernel proxies.
   * Closes all active connections and clears the connection maps.
   */
  dispose(): void {
    // Close all local kernel proxies
    for (const proxy of this._localKernelProxies.values()) {
      proxy.close();
    }
    this._localKernelProxies.clear();

    // Close all WebSocket connections
    for (const ws of this._websockets.values()) {
      ws.close();
    }
    this._websockets.clear();
  }
}
