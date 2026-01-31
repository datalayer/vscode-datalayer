/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extension-side WebSocket adapter for Loro collaboration.
 * Manages real WebSocket connection and proxies messages to/from webview.
 *
 * @module services/collaboration/loroWebSocketAdapter
 */

import * as vscode from "vscode";
// import * as ws from "ws"; // Removed to avoid potential runtime conflicts with require

// Define robust types compatible with ws package
type WebSocketConstructor = new (url: string) => WebSocketInstance;

interface WebSocketInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on?(event: string, listener: (...args: any[]) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener?(event: string, listener: (...args: any[]) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(data: any): void;
  close(): void;
  readyState: number;
}

// Robust WebSocket resolution with detailed logging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WebSocketCtor: any = null;

try {
  // Try loading 'ws' module first (preferred for Node.js environment)
  const wsModule = require("ws");

  if (wsModule.WebSocket) {
    WebSocketCtor = wsModule.WebSocket;
  } else if (typeof wsModule === "function") {
    WebSocketCtor = wsModule;
  } else if (wsModule.default) {
    WebSocketCtor = wsModule.default;
  }
} catch (e) {
  // Ignore
}

// Fallback to global WebSocket (Node.js 20+, Electron, etc.)
if (!WebSocketCtor && typeof global.WebSocket === "function") {
  console.log("[LoroAdapter] Using global.WebSocket.");
  WebSocketCtor = global.WebSocket as unknown as WebSocketConstructor;
}

// Final fallback to dummy to prevent crash
if (!WebSocketCtor) {
  console.error(
    "[LoroAdapter] FATAL: Could not find any WebSocket constructor.",
  );
  WebSocketCtor = class DummyWebSocket {
    on() {}
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * Message types exchanged between extension and webview for Loro collaboration
 */
export interface LoroMessage {
  type: "connect" | "disconnect" | "message" | "status" | "error";
  adapterId: string;
  data?: unknown;
}

/**
 * WebSocket adapter that runs in the extension (Node.js context).
 * Manages WebSocket connection to Loro collaboration server.
 */
export class LoroWebSocketAdapter {
  /** The underlying WebSocket connection to the Loro server */
  private ws: WebSocketInstance | null = null;
  /** Timer for scheduled reconnection attempts */
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** Current delay in milliseconds before next reconnection attempt */
  private reconnectDelay = 100;
  /** Maximum delay in milliseconds for exponential backoff */
  private maxReconnectDelay = 2500;
  /** Flag indicating whether the adapter has been disposed */
  private isDisposed = false;
  /** Queue of messages waiting to be sent when connection is established */
  private messageQueue: unknown[] = [];
  /** Maximum number of messages to queue before dropping new ones */
  private readonly maxQueueSize = 1000;

  /**
   * Create a new Loro WebSocket adapter.
   *
   * @param adapterId - Unique identifier for this adapter instance
   * @param websocketUrl - URL of the Loro WebSocket server to connect to
   * @param webview - VS Code Webview instance to send messages to
   */
  constructor(
    private readonly adapterId: string,
    private readonly websocketUrl: string,
    private readonly webview: vscode.Webview,
  ) {}

  /**
   * Connect to the WebSocket server.
   * Establishes a new WebSocket connection if one doesn't already exist.
   * Sets up event handlers for open, message, close, and error events.
   * Messages received while disconnected are queued and sent upon reconnection.
   * Automatically attempts to reconnect with exponential backoff on close.
   *
   * @returns void
   */
  connect(): void {
    if (this.ws || this.isDisposed) {
      return;
    }

    try {
      const wsInstance = new WebSocketCtor(this.websocketUrl);
      this.ws = wsInstance;

      const onOpen = () => {
        this.reconnectDelay = 100; // Reset backoff
        this.sendToWebview({
          type: "status",
          adapterId: this.adapterId,
          data: { status: "connected" },
        });

        // Flush queued messages
        this.flushMessageQueue();
      };

      const onClose = () => {
        this.ws = null;

        this.sendToWebview({
          type: "status",
          adapterId: this.adapterId,
          data: { status: "disconnected" },
        });

        // Attempt reconnection with exponential backoff
        if (!this.isDisposed) {
          this.scheduleReconnect();
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onError = (error: any) => {
        console.error(`[LoroAdapter] WebSocket error:`, error);
        this.sendToWebview({
          type: "error",
          adapterId: this.adapterId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { message: (error as any)?.message || "WebSocket error" },
        });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onMessage = (dataOrEvent: any) => {
        try {
          // Normalize data
          let data = dataOrEvent;

          // Native WebSocket MessageEvent?
          if (
            dataOrEvent &&
            typeof dataOrEvent === "object" &&
            "data" in dataOrEvent
          ) {
            data = dataOrEvent.data;
          }

          // Handle Blob (Browser/Native)
          if (typeof Blob !== "undefined" && data instanceof Blob) {
            data.arrayBuffer().then((buf) => {
              this.processMessageData(Buffer.from(buf));
            });
            return;
          }

          // Handle ArrayBuffer (Native)
          if (data instanceof ArrayBuffer) {
            this.processMessageData(Buffer.from(data));
            return;
          }

          // Handle Node.js Buffer or string
          const buffer = data instanceof Buffer ? data : Buffer.from(data);
          this.processMessageData(buffer);
        } catch (error) {
          console.error(`[LoroAdapter] Error processing message:`, error);
        }
      };

      if (typeof wsInstance.on === "function") {
        // Node.js ws
        wsInstance.on("open", onOpen);
        wsInstance.on("message", onMessage);
        wsInstance.on("close", onClose);
        wsInstance.on("error", onError);
      } else if (typeof wsInstance.addEventListener === "function") {
        // Native WebSocket
        wsInstance.addEventListener("open", onOpen);
        wsInstance.addEventListener("message", onMessage);
        wsInstance.addEventListener("close", onClose);
        wsInstance.addEventListener("error", onError);
      } else {
        console.error(
          "[LoroAdapter] WebSocket instance has neither .on() nor .addEventListener()",
        );
      }
    } catch (error) {
      console.error(`[LoroAdapter] Failed to create WebSocket:`, error);
      this.sendToWebview({
        type: "error",
        adapterId: this.adapterId,
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  private processMessageData(buffer: Buffer): void {
    // Try to parse as JSON first
    try {
      const json = JSON.parse(buffer.toString());
      this.sendToWebview({
        type: "message",
        adapterId: this.adapterId,
        data: json,
      });
    } catch {
      // Not JSON, treat as binary (Loro update bytes)
      const bytes = Array.from(buffer);
      this.sendToWebview({
        type: "message",
        adapterId: this.adapterId,
        data: { type: "update", bytes },
      });
    }
  }

  /**
   * Check if the WebSocket is currently connected and ready to send.
   * Verifies that the WebSocket exists and readyState is 1 (OPEN).
   *
   * @returns true if connected and ready, false otherwise
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  /**
   * Disconnect from the WebSocket server.
   * Cancels any pending reconnection timers and closes the WebSocket connection.
   * Safe to call multiple times; handles null checks internally.
   *
   * @returns void
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a message to the WebSocket server.
   * Supports multiple data types: string (JSON), array (binary/Loro update bytes), or object (JSON).
   * If not connected, messages are queued up to maxQueueSize and sent when connection establishes.
   * Queue overflow is silently dropped to prevent memory issues.
   *
   * @param data - The data to send (string, array, or object)
   * @returns void
   */
  send(data: unknown): void {
    // WebSocket.OPEN = 1
    if (!this.ws || this.ws.readyState !== 1) {
      // Queue message for later delivery
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(data);
      }
      return;
    }

    try {
      if (typeof data === "string") {
        // String message (JSON)
        this.ws.send(data);
      } else if (Array.isArray(data)) {
        // Array of bytes (Loro update)
        const buffer = Buffer.from(data);
        this.ws.send(buffer);
      } else if (typeof data === "object" && data !== null) {
        // Object - stringify as JSON
        this.ws.send(JSON.stringify(data));
      }
    } catch (error) {
      console.error(
        `[LoroAdapter ${this.adapterId}] Error sending message:`,
        error,
      );
    }
  }

  /**
   * Handle incoming messages from the webview.
   * Routes messages to appropriate handlers:
   * - 'connect': Initiates WebSocket connection
   * - 'disconnect': Closes WebSocket connection
   * - 'message': Forwards data to WebSocket server
   *
   * @param message - The message from the webview with type, adapterId, and optional data
   * @returns void
   */
  handleMessage(message: LoroMessage): void {
    switch (message.type) {
      case "connect":
        this.connect();
        break;

      case "disconnect":
        this.disconnect();
        break;

      case "message":
        this.send(message.data);
        break;
    }
  }

  /**
   * Flush all queued messages to the WebSocket server.
   * Called when the WebSocket connection is first established.
   * Clears the queue after sending to prevent duplicate transmissions.
   *
   * @private
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const data of queue) {
      this.send(data);
    }
  }

  /**
   * Clean up resources and prepare for garbage collection.
   * Marks the adapter as disposed, disconnects from the server, and clears the message queue.
   * After disposal, the adapter should not be used.
   *
   * @returns void
   */
  dispose(): void {
    this.isDisposed = true;
    this.disconnect();
    this.messageQueue = [];
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Calculates delay using `reconnectDelay * 2` up to `maxReconnectDelay`.
   * Only schedules if no reconnection is already pending.
   *
   * @private
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();

      // Increase backoff delay for next attempt
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay,
      );
    }, this.reconnectDelay);
  }

  /**
   * Send a message to the webview via postMessage.
   * Wraps the call in try-catch to handle serialization or connection errors.
   *
   * @param message - The message to send to the webview
   * @private
   */
  private sendToWebview(message: LoroMessage): void {
    try {
      this.webview.postMessage(message);
    } catch (error) {
      console.error(
        `[LoroAdapter ${this.adapterId}] Error sending to webview:`,
        error,
      );
    }
  }
}
