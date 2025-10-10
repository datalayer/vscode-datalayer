/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Type-safe message handler for webview-extension communication.
 * Provides async/await request/response pattern and discriminated union types.
 *
 * @module services/messageHandler
 */

import { createContext } from "react";
export type {
  ExtensionMessage,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../types/messages";

declare let acquireVsCodeApi: () => {
  /** Post a message to the VS Code extension host */
  postMessage: (message: unknown) => void;
  /** Get the persisted state for this webview */
  getState: () => unknown;
  /** Set the persisted state for this webview */
  setState: (state: unknown) => void;
};

/**
 * VS Code API singleton - can only be called once
 */
const vscode = acquireVsCodeApi();

/**
 * VS Code API singleton instance.
 * Use this to access postMessage, getState, and setState methods.
 */
export const vsCodeAPI = vscode;

/**
 * Disposable object with dispose method
 */
export interface Disposable {
  /** Dispose the resource and clean up event listeners */
  dispose(): void;
}

/**
 * Pending request with promise resolver/rejector
 */
export interface PendingRequest<T = unknown> {
  /** Resolve the promise with the response value */
  resolve: (value: T) => void;
  /** Reject the promise with an error */
  reject: (error: Error) => void;
  /** Timeout handle to cancel the request */
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Type-safe message handler with async/await support.
 * Handles bidirectional communication between webview and extension.
 */
export class MessageHandler {
  /** Counter for generating unique callback IDs */
  private _callbackCount = 0;

  /** Map of callback ID to message handler functions */
  private _messageCallbacks = new Map<number, (message: unknown) => void>();

  /** Counter for generating unique request IDs */
  private static _requestCount = 0;

  /** Map of pending request IDs to promise resolvers */
  private _pendingRequests = new Map<string, PendingRequest>();

  /** Default timeout for requests (30 seconds) */
  private _defaultTimeout = 30000;

  /**
   * Creates a new MessageHandler instance
   */
  constructor() {
    window.addEventListener("message", this._handleMessage.bind(this));
  }

  /**
   * Send a message to the extension (fire and forget).
   *
   * @param message - Message to send
   */
  send<T = unknown>(message: T): void {
    vscode.postMessage(message);
  }

  /**
   * Send a request to the extension and wait for response.
   *
   * @param message - Request message
   * @param timeout - Request timeout in milliseconds (default: 30000)
   * @returns Promise resolving to response message
   */
  async request<TRequest = unknown, TResponse = unknown>(
    message: TRequest,
    timeout = this._defaultTimeout,
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      const requestId = `req-${MessageHandler._requestCount++}`;

      // Set timeout for request
      const timeoutHandle = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(
          new Error(`Request timed out after ${timeout}ms (id: ${requestId})`),
        );
      }, timeout);

      // Store pending request
      this._pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      // Send request with ID
      vscode.postMessage({
        ...message,
        requestId,
      });
    });
  }

  /**
   * Register a callback for all incoming messages.
   *
   * @param handler - Message handler function
   * @returns Disposable to unregister the handler
   */
  on(handler: (message: unknown) => void): Disposable {
    const id = this._callbackCount++;
    this._messageCallbacks.set(id, handler);

    return {
      dispose: () => {
        this._messageCallbacks.delete(id);
      },
    };
  }

  /**
   * Handle incoming messages from the extension
   */
  private _handleMessage(event: MessageEvent): void {
    const message = event.data;

    // Check if this is a response to a pending request
    if (message.requestId || message.id) {
      const requestId = message.requestId || message.id;
      const pending = this._pendingRequests.get(requestId);

      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingRequests.delete(requestId);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.body || message);
        }
        return;
      }
    }

    // Broadcast to all registered callbacks
    for (const handler of this._messageCallbacks.values()) {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in message handler:", error);
      }
    }
  }

  /**
   * Clear all pending requests (useful for cleanup)
   */
  clearPendingRequests(): void {
    for (const [_id, pending] of this._pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Request cancelled"));
    }
    this._pendingRequests.clear();
  }

  /**
   * Register a callback to receive all messages from the extension.
   * Returns a disposable to unregister the callback.
   *
   * @param callback Function to call when messages are received
   * @returns Disposable to unregister the callback
   */
  onMessage(callback: (message: unknown) => void): Disposable {
    const id = this._callbackCount++;
    this._messageCallbacks.set(id, callback);

    return {
      dispose: () => {
        this._messageCallbacks.delete(id);
      },
    };
  }

  /**
   * Dispose the message handler and cleanup resources.
   */
  dispose(): void {
    this.clearPendingRequests();
    this._messageCallbacks.clear();
  }

  /**
   * Singleton instance of MessageHandler
   */
  static instance = new MessageHandler();
}

/**
 * React context for MessageHandler
 */
export const MessageHandlerContext = createContext<MessageHandler>(
  MessageHandler.instance,
);
