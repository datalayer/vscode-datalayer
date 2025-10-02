/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Type-safe message protocol for extension-webview communication.
 * Uses discriminated unions for compile-time type safety and IDE autocomplete.
 *
 * @module types/messages
 */

import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";

/**
 * Extension → Webview Messages
 */

/** Initialize the webview with document data */
export interface InitMessage {
  type: "init";
  body: {
    value: Uint8Array;
    untitled?: boolean;
    isDatalayerNotebook?: boolean;
    documentId?: string;
    serverUrl?: string;
    token?: string;
    notebookId?: string;
    theme?: "light" | "dark";
  };
}

/** Theme changed in VS Code */
export interface ThemeChangeMessage {
  type: "theme-change";
  body: {
    theme: "light" | "dark";
  };
}

/** Runtime selected from UI */
export interface RuntimeSelectedMessage {
  type: "runtime-selected";
  body: {
    runtime: RuntimeJSON;
  };
}

/** Kernel selected from UI (deprecated, use runtime-selected) */
export interface KernelSelectedMessage {
  type: "kernel-selected";
  body: {
    runtime: RuntimeJSON;
  };
}

/** Runtime was terminated */
export interface RuntimeTerminatedMessage {
  type: "runtime-terminated";
  body: Record<string, never>; // Empty object
}

/** Set runtime (from Jupyter server) */
export interface SetRuntimeMessage {
  type: "set-runtime";
  body: {
    baseUrl: string;
    token?: string;
  };
}

/** Request file data from webview */
export interface GetFileDataRequestMessage {
  type: "getFileData";
  requestId: string;
  body: Record<string, never>; // Empty object
}

/** Notebook was saved */
export interface SavedMessage {
  type: "saved";
  body: Record<string, never>; // Empty object
}

/**
 * Union of all Extension → Webview messages
 */
export type ExtensionToWebviewMessage =
  | InitMessage
  | ThemeChangeMessage
  | RuntimeSelectedMessage
  | KernelSelectedMessage
  | RuntimeTerminatedMessage
  | SetRuntimeMessage
  | GetFileDataRequestMessage
  | SavedMessage;

/**
 * Webview → Extension Messages
 */

/** Webview is ready to receive messages */
export interface ReadyMessage {
  type: "ready";
  body?: Record<string, never>;
}

/** Response to getFileData request */
export interface GetFileDataResponseMessage {
  type: "response";
  requestId: string;
  body: number[]; // Byte array
}

/** Notebook content changed (for auto-save) */
export interface NotebookContentChangedMessage {
  type: "notebook-content-changed";
  body: {
    content: Uint8Array;
  };
}

/** Runtime selection requested from webview */
export interface SelectRuntimeRequestMessage {
  type: "select-runtime";
  body: Record<string, never>;
}

/** Kernel selection requested from webview */
export interface SelectKernelRequestMessage {
  type: "select-kernel";
  body: Record<string, never>;
}

/** Runtime termination requested from webview */
export interface TerminateRuntimeRequestMessage {
  type: "terminate-runtime";
  body: {
    runtimeId: string;
  };
}

/** WebSocket message to proxy */
export interface WebSocketProxyMessage {
  type: "websocket-message";
  body: {
    message: any;
    clientId: string;
  };
}

/** Error from webview */
export interface WebviewErrorMessage {
  type: "error";
  body: {
    message: string;
    stack?: string;
  };
}

/**
 * Union of all Webview → Extension messages
 */
export type WebviewToExtensionMessage =
  | ReadyMessage
  | GetFileDataResponseMessage
  | NotebookContentChangedMessage
  | SelectRuntimeRequestMessage
  | SelectKernelRequestMessage
  | TerminateRuntimeRequestMessage
  | WebSocketProxyMessage
  | WebviewErrorMessage;

/**
 * Bidirectional message type (for backward compatibility)
 */
export type ExtensionMessage =
  | ExtensionToWebviewMessage
  | WebviewToExtensionMessage;

/**
 * Type guard to check if message is from extension
 */
export function isExtensionToWebviewMessage(
  message: ExtensionMessage,
): message is ExtensionToWebviewMessage {
  const extensionTypes = new Set([
    "init",
    "theme-change",
    "runtime-selected",
    "kernel-selected",
    "runtime-terminated",
    "set-runtime",
    "getFileData",
    "saved",
  ]);
  return extensionTypes.has(message.type);
}

/**
 * Type guard to check if message is from webview
 */
export function isWebviewToExtensionMessage(
  message: ExtensionMessage,
): message is WebviewToExtensionMessage {
  const webviewTypes = new Set([
    "ready",
    "response",
    "notebook-content-changed",
    "select-runtime",
    "select-kernel",
    "terminate-runtime",
    "websocket-message",
    "error",
  ]);
  return webviewTypes.has(message.type);
}

/**
 * Extract message body type from message type
 */
export type MessageBody<T extends ExtensionMessage> = T extends {
  body: infer B;
}
  ? B
  : never;

/**
 * Helper to create type-safe messages
 */
export const createMessage = {
  // Extension → Webview
  init: (body: InitMessage["body"]): InitMessage => ({
    type: "init",
    body,
  }),

  themeChange: (theme: "light" | "dark"): ThemeChangeMessage => ({
    type: "theme-change",
    body: { theme },
  }),

  runtimeSelected: (runtime: RuntimeJSON): RuntimeSelectedMessage => ({
    type: "runtime-selected",
    body: { runtime },
  }),

  runtimeTerminated: (): RuntimeTerminatedMessage => ({
    type: "runtime-terminated",
    body: {},
  }),

  setRuntime: (baseUrl: string, token?: string): SetRuntimeMessage => ({
    type: "set-runtime",
    body: { baseUrl, token },
  }),

  getFileData: (requestId: string): GetFileDataRequestMessage => ({
    type: "getFileData",
    requestId,
    body: {},
  }),

  saved: (): SavedMessage => ({
    type: "saved",
    body: {},
  }),

  // Webview → Extension
  ready: (): ReadyMessage => ({
    type: "ready",
    body: {},
  }),

  fileDataResponse: (
    requestId: string,
    content: number[],
  ): GetFileDataResponseMessage => ({
    type: "response",
    requestId,
    body: content,
  }),

  notebookContentChanged: (
    content: Uint8Array,
  ): NotebookContentChangedMessage => ({
    type: "notebook-content-changed",
    body: { content },
  }),

  selectRuntime: (): SelectRuntimeRequestMessage => ({
    type: "select-runtime",
    body: {},
  }),

  selectKernel: (): SelectKernelRequestMessage => ({
    type: "select-kernel",
    body: {},
  }),

  terminateRuntime: (runtimeId: string): TerminateRuntimeRequestMessage => ({
    type: "terminate-runtime",
    body: { runtimeId },
  }),

  websocketMessage: (
    message: any,
    clientId: string,
  ): WebSocketProxyMessage => ({
    type: "websocket-message",
    body: { message, clientId },
  }),

  error: (message: string, stack?: string): WebviewErrorMessage => ({
    type: "error",
    body: { message, stack },
  }),
};
