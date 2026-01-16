/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Message handler for Agent Chat webview.
 * Manages bidirectional communication between webview and extension.
 *
 * @module webview/agentChat/messageHandler
 */

import type { ChatMessage } from "@datalayer/agent-runtimes";

/**
 * Message types for agent chat communication.
 */
interface AgentMessage {
  type:
    | "agent-send-message"
    | "agent-response"
    | "agent-clear"
    | "agent-new-chat"
    | "webview-ready"
    | "error";
  content?: string;
  messages?: ChatMessage[];
  options?: any;
  error?: string;
  requestId?: number;
}

/**
 * VS Code API type definition.
 */
interface VSCodeAPI {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
}

declare function acquireVsCodeApi(): VSCodeAPI;

/**
 * Handles message passing between webview and extension.
 * Implements request-response pattern with timeout handling.
 */
export class MessageHandler {
  private vscode: VSCodeAPI;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (response: any) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.vscode = acquireVsCodeApi();

    // Listen for messages from the extension
    window.addEventListener("message", this.handleMessage.bind(this));
  }

  /**
   * Sends a request to the extension and waits for a response.
   *
   * @param message - Message to send
   * @param timeout - Timeout in milliseconds (default: 30000)
   * @returns Promise that resolves with the response
   */
  async request(message: AgentMessage, timeout = 30000): Promise<any> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(id, { resolve, reject });

      // Send message with request ID
      this.vscode.postMessage({ ...message, requestId: id });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, timeout);
    });
  }

  /**
   * Posts a message to the extension without waiting for a response.
   *
   * @param message - Message to send
   */
  postMessage(message: AgentMessage): void {
    this.vscode.postMessage(message);
  }

  /**
   * Handles incoming messages from the extension.
   *
   * @param event - Message event
   */
  private handleMessage(event: MessageEvent) {
    const message = event.data;
    const { requestId } = message;

    // If this is a response to a pending request, resolve it
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;
      this.pendingRequests.delete(requestId);

      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message);
      }
    }

    // Handle other message types (broadcasts, notifications, etc.)
    this.handleBroadcast(message);
  }

  /**
   * Handles broadcast messages from the extension.
   *
   * @param message - Broadcast message
   */
  private handleBroadcast(message: AgentMessage): void {
    switch (message.type) {
      case "agent-clear":
        // Handle clear chat command
        console.log("[MessageHandler] Clear chat requested");
        // TODO: Dispatch event to clear chat
        break;

      case "agent-new-chat":
        // Handle new chat command
        console.log("[MessageHandler] New chat requested");
        // TODO: Dispatch event to start new chat
        break;

      case "error":
        console.error("[MessageHandler] Error from extension:", message.error);
        break;

      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Gets the persisted webview state.
   *
   * @returns The current state, or undefined if no state exists
   */
  getState(): any {
    return this.vscode.getState();
  }

  /**
   * Persists webview state.
   *
   * @param state - State to persist
   */
  setState(state: any): void {
    this.vscode.setState(state);
  }
}
