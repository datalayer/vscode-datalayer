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
import * as ws from "ws";

// Use require for better webpack compatibility
const WebSocket = ws.WebSocket || require("ws");

/**
 * Message types exchanged between extension and webview
 */
interface LoroMessage {
  type: "connect" | "disconnect" | "message" | "status" | "error";
  adapterId: string;
  data?: unknown;
}

/**
 * WebSocket adapter that runs in the extension (Node.js context).
 * Manages WebSocket connection to Loro collaboration server.
 */
export class LoroWebSocketAdapter {
  private ws: ws.WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 100;
  private maxReconnectDelay = 2500;
  private isDisposed = false;

  constructor(
    private readonly adapterId: string,
    private readonly websocketUrl: string,
    private readonly webview: vscode.Webview,
  ) {}

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws || this.isDisposed) {
      return;
    }

    try {
      this.ws = new WebSocket(this.websocketUrl);

      this.ws.on("open", () => {
        this.reconnectDelay = 100; // Reset backoff
        this.sendToWebview({
          type: "status",
          adapterId: this.adapterId,
          data: { status: "connected" },
        });
      });

      this.ws.on("message", (data: ws.RawData) => {
        try {
          // Parse the message to determine type
          const buffer =
            data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);

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
        } catch (error) {
          console.error(`[LoroAdapter] Error processing message:`, error);
        }
      });

      this.ws.on("close", () => {
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
      });

      this.ws.on("error", (error: Error) => {
        console.error(`[LoroAdapter] WebSocket error:`, error);
        this.sendToWebview({
          type: "error",
          adapterId: this.adapterId,
          data: { message: error.message },
        });
      });
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

  /**
   * Disconnect from the WebSocket server
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
   * Send a message to the WebSocket server
   */
  send(data: unknown): void {
    // WebSocket.OPEN = 1
    if (!this.ws || this.ws.readyState !== 1) {
      console.warn(
        `[LoroAdapter ${this.adapterId}] Cannot send - WebSocket not connected`,
      );
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
      } else {
        console.warn(
          `[LoroAdapter ${this.adapterId}] Unsupported data type:`,
          typeof data,
        );
      }
    } catch (error) {
      console.error(
        `[LoroAdapter ${this.adapterId}] Error sending message:`,
        error,
      );
    }
  }

  /**
   * Handle incoming messages from the webview
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

      default:
        console.warn(
          `[LoroAdapter ${this.adapterId}] Unknown message type:`,
          message.type,
        );
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.isDisposed = true;
    this.disconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[LoroAdapter ${this.adapterId}] Attempting reconnection...`);
      this.connect();

      // Increase backoff delay for next attempt
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay,
      );
    }, this.reconnectDelay);
  }

  /**
   * Send a message to the webview
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
