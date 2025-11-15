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

import type { RuntimeJSON } from "@datalayer/core/lib/client";

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
    notebookId?: string; // Also used for webview reuse detection
    theme?: "light" | "dark";
    documentUri?: string; // For logging
  };
}

/** Theme changed in VS Code */
export interface ThemeChangeMessage {
  type: "theme-change";
  body: {
    theme: "light" | "dark";
  };
}

/** Kernel selected from UI */
export interface KernelSelectedMessage {
  type: "kernel-selected";
  body: {
    runtime: RuntimeJSON;
  };
}

/** Kernel was terminated */
export interface KernelTerminatedMessage {
  type: "kernel-terminated";
}

/** Runtime selected (legacy alias for kernel-selected) */
export interface RuntimeSelectedMessage {
  type: "runtime-selected";
  body: {
    runtime: RuntimeJSON;
  };
}

/** Runtime terminated (legacy alias for kernel-terminated) */
export interface RuntimeTerminatedMessage {
  type: "runtime-terminated";
}

/** Runtime has expired */
export interface RuntimeExpiredMessage {
  type: "runtime-expired";
}

/** Set runtime (from Jupyter server) */
export interface SetRuntimeMessage {
  type: "set-runtime";
  body: {
    baseUrl: string;
    token?: string;
  };
}

/** LLM completion response from extension */
export interface LLMCompletionResponseMessage {
  type: "llm-completion-response";
  requestId: string;
  completion: string | null;
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

/** Local kernel connected */
export interface LocalKernelConnectedMessage {
  type: "local-kernel-connected";
  body: {
    kernelInfo?: {
      name: string;
      specFile?: string;
    };
    runtime?: RuntimeJSON;
  };
}

/** Navigate to outline item (extension to webview) */
export interface OutlineNavigateMessage {
  type: "outline-navigate";
  itemId: string;
}

/** Insert cell into notebook (MCP tool support) */
export interface InsertCellMessage {
  type: "insert-cell";
  body: {
    cellType: "code" | "markdown";
    cellSource: string;
    cellIndex?: number;
  };
}

/** Delete cell from notebook (MCP tool support) */
export interface DeleteCellMessage {
  type: "delete-cell";
  body: {
    cellIndex: number;
  };
}

/** Overwrite cell source (MCP tool support) */
export interface OverwriteCellMessage {
  type: "overwrite-cell";
  body: {
    cellIndex: number;
    cellSource: string;
  };
}

/** Read specific cell request (MCP tool support) */
export interface ReadCellRequestMessage {
  type: "read-cell-request";
  requestId: string;
  body: {
    cellIndex: number;
  };
}

/** Read specific cell response (MCP tool support) */
export interface ReadCellResponseMessage {
  type: "read-cell-response";
  requestId: string;
  body: {
    index: number;
    type: string;
    source: string;
    outputs?: string[];
  };
}

/** Read all cells request (MCP tool support) */
export interface ReadAllCellsRequestMessage {
  type: "read-all-cells-request";
  requestId: string;
  body: Record<string, never>;
}

/** Read all cells response (MCP tool support) */
export interface ReadAllCellsResponseMessage {
  type: "read-all-cells-response";
  requestId: string;
  body: Array<{
    index: number;
    type: string;
    source: string;
    outputs?: string[];
  }>;
}

/**
 * Union of all Extension → Webview messages
 */
export type ExtensionToWebviewMessage =
  | InitMessage
  | ThemeChangeMessage
  | RuntimeSelectedMessage
  | KernelSelectedMessage
  | KernelTerminatedMessage
  | RuntimeTerminatedMessage
  | SetRuntimeMessage
  | GetFileDataRequestMessage
  | SavedMessage
  | LocalKernelConnectedMessage
  | InsertCellMessage
  | DeleteCellMessage
  | OverwriteCellMessage
  | ReadCellRequestMessage
  | ReadCellResponseMessage
  | ReadAllCellsRequestMessage
  | ReadAllCellsResponseMessage
  | WebSocketProxyMessage
  | WebSocketOpenMessage
  | WebSocketCloseMessage
  | HttpResponseMessage
  | RuntimeExpiredMessage
  | LLMCompletionResponseMessage
  | OutlineNavigateMessage;

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
  id: string;
  body: {
    data: unknown;
  };
}

/** WebSocket open message */
export interface WebSocketOpenMessage {
  type: "websocket-open";
  id: string;
  body: {
    origin: string;
    protocol?: string;
  };
}

/** WebSocket close message */
export interface WebSocketCloseMessage {
  type: "websocket-close";
  id: string;
  body: {
    origin: string;
  };
}

/** HTTP request to proxy through extension */
export interface HttpRequestMessage {
  type: "http-request";
  requestId: string;
  body: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer;
  };
}

/** HTTP response from proxied request */
export interface HttpResponseMessage {
  type: "http-response";
  requestId: string;
  body: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: ArrayBuffer;
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

/** LLM completion request from webview */
export interface LLMCompletionRequestMessage {
  type: "llm-completion-request";
  requestId: string;
  prefix: string;
  suffix: string;
  language: string;
}

/** Outline item structure */
export interface OutlineItem {
  id: string; // Unique identifier
  label: string; // Display text
  type:
    | "heading"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "code"
    | "code-cell"
    | "markdown-cell";
  level?: number; // For headings: 1-6
  line?: number; // Line/node index in editor
  cellIndex?: number; // For notebooks: cell index
  children?: OutlineItem[]; // Nested structure (optional)
}

/** Outline update from webview to extension */
export interface OutlineUpdateMessage {
  type: "outline-update";
  documentUri: string;
  items: OutlineItem[];
  activeItemId?: string; // Currently focused/selected item
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
  | WebSocketOpenMessage
  | WebSocketCloseMessage
  | WebSocketProxyMessage
  | HttpRequestMessage
  | WebviewErrorMessage
  | LLMCompletionRequestMessage
  | OutlineUpdateMessage;

/**
 * Bidirectional message type (for backward compatibility)
 */
export type ExtensionMessage =
  | ExtensionToWebviewMessage
  | WebviewToExtensionMessage;
