/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Message type definitions for extension-webview communication.
 * Defines the protocol for messages exchanged between the extension and webview.
 *
 * @module types/vscode/messages
 *
 * @see https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-a-webview-to-an-extension
 *
 */

/**
 * Extension message structure for bidirectional communication between
 * the VS Code extension host and webview panels.
 *
 */
export type ExtensionMessage = {
  /**
   * Message type identifier.
   * Common types: 'document-content', 'save-document', 'websocket-message',
   * 'authentication-token', 'runtime-config', 'error'
   */
  type: string;
  /**
   * Message payload.
   * Contains the actual data being transmitted (document content, edits, etc.)
   */
  body?: unknown;
  /**
   * Error information if the message represents an error response.
   * Used when responding to a request that failed.
   */
  error?: unknown;
  /**
   * Message owner/context identifier.
   * - For HTTP requests: request ID
   * - For WebSocket messages: client ID
   * - For documents: document UID
   */
  id?: string;
  /**
   * Request ID for matching responses to requests.
   * Used in request-response patterns to correlate messages.
   */
  requestId?: string;
};
