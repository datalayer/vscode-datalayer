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
  /** Message type discriminator */
  type: "init";
  /** Initialization payload */
  body: {
    /** Serialized notebook content */
    value: Uint8Array;
    /** Whether this is an untitled document */
    untitled?: boolean;
    /** Whether this is a Datalayer cloud notebook */
    isDatalayerNotebook?: boolean;
    /** Datalayer cloud document ID */
    documentId?: string;
    /** Jupyter server URL */
    serverUrl?: string;
    /** Authentication token for Jupyter server */
    token?: string;
    /** Datalayer cloud notebook ID (also used for webview reuse detection) */
    notebookId?: string;
    /** VS Code theme */
    theme?: "light" | "dark";
    /** Document URI for logging */
    documentUri?: string;
  };
}

/** Theme changed in VS Code */
export interface ThemeChangeMessage {
  /** Message type discriminator */
  type: "theme-change";
  /** Theme change payload */
  body: {
    /** New theme */
    theme: "light" | "dark";
  };
}

/** Kernel selected from UI */
export interface KernelSelectedMessage {
  /** Message type discriminator */
  type: "kernel-selected";
  /** Kernel selection payload */
  body: {
    /** Selected runtime details */
    runtime: RuntimeJSON;
  };
}

/** Kernel is starting (sent before kernel is created to trigger spinner) */
export interface KernelStartingMessage {
  /** Message type discriminator */
  type: "kernel-starting";
  /** Kernel starting payload */
  body: {
    /** Runtime that is being started */
    runtime: RuntimeJSON;
  };
}

/** Kernel was terminated */
export interface KernelTerminatedMessage {
  /** Message type discriminator */
  type: "kernel-terminated";
}

/** Kernel is ready (sent from webview when Pyodide kernel finishes preloading) */
export interface KernelReadyMessage {
  /** Message type discriminator */
  type: "kernel-ready";
  /** Empty payload */
  body: Record<string, never>;
}

/** Runtime selected (legacy alias for kernel-selected) */
export interface RuntimeSelectedMessage {
  /** Message type discriminator */
  type: "runtime-selected";
  /** Runtime selection payload */
  body: {
    /** Selected runtime details */
    runtime: RuntimeJSON;
  };
}

/** Runtime terminated (legacy alias for kernel-terminated) */
export interface RuntimeTerminatedMessage {
  /** Message type discriminator */
  type: "runtime-terminated";
}

/** Runtime has expired */
export interface RuntimeExpiredMessage {
  /** Message type discriminator */
  type: "runtime-expired";
}

/** Set runtime (from Jupyter server) */
export interface SetRuntimeMessage {
  /** Message type discriminator */
  type: "set-runtime";
  /** Runtime configuration payload */
  body: {
    /** Jupyter server base URL */
    baseUrl: string;
    /** Authentication token */
    token?: string;
  };
}

/** LLM completion response from extension */
export interface LLMCompletionResponseMessage {
  /** Message type discriminator */
  type: "llm-completion-response";
  /** Request ID for correlation */
  requestId: string;
  /** Completion text or null if failed */
  completion: string | null;
}

/** Request file data from webview */
export interface GetFileDataRequestMessage {
  /** Message type discriminator */
  type: "getFileData";
  /** Request ID for correlation */
  requestId: string;
  /** Empty payload */
  body: Record<string, never>;
}

/** Notebook was saved */
export interface SavedMessage {
  /** Message type discriminator */
  type: "saved";
  /** Empty payload */
  body: Record<string, never>;
}

/** Local kernel connected */
export interface LocalKernelConnectedMessage {
  /** Message type discriminator */
  type: "local-kernel-connected";
  /** Connection details */
  body: {
    /** Kernel information */
    kernelInfo?: {
      /** Kernel display name */
      name: string;
      /** Path to kernel spec file */
      specFile?: string;
    };
    /** Runtime details */
    runtime?: RuntimeJSON;
  };
}

/** Navigate to outline item (extension to webview) */
export interface OutlineNavigateMessage {
  /** Message type discriminator */
  type: "outline-navigate";
  /** ID of the outline item to navigate to */
  itemId: string;
}

/** Insert cell into notebook (MCP tool support) */
export interface InsertCellMessage {
  /** Message type discriminator */
  type: "insert-cell";
  /** Cell insertion payload */
  body: {
    /** Type of cell to insert */
    cellType: "code" | "markdown";
    /** Cell source content */
    source: string;
    /** Index where to insert (defaults to end) */
    index?: number;
  };
}

/** Delete cell from notebook (MCP tool support) */
export interface DeleteCellMessage {
  /** Message type discriminator */
  type: "delete-cell";
  /** Deletion payload */
  body: {
    /** Index of cell to delete */
    index: number;
  };
}

/** Overwrite cell source (MCP tool support) */
export interface OverwriteCellMessage {
  /** Message type discriminator */
  type: "overwrite-cell";
  /** Overwrite payload */
  body: {
    /** Index of cell to overwrite */
    index: number;
    /** New source content */
    source: string;
  };
}

/** Set active cell (select a cell programmatically) */
export interface SetActiveCellMessage {
  /** Message type discriminator */
  type: "set-active-cell";
  /** Selection payload */
  body: {
    /** Index of cell to select */
    index: number;
  };
}

/** Read specific cell request (MCP tool support) */
export interface ReadCellRequestMessage {
  /** Message type discriminator */
  type: "read-cell-request";
  /** Request ID for correlation */
  requestId: string;
  /** Request payload */
  body: {
    /** Index of cell to read */
    index: number;
  };
}

/** Read specific cell response (MCP tool support) */
export interface ReadCellResponseMessage {
  /** Message type discriminator */
  type: "read-cell-response";
  /** Request ID for correlation */
  requestId: string;
  /** Response payload */
  body: {
    /** Cell index */
    index: number;
    /** Cell type */
    type: string;
    /** Cell source content */
    source: string;
    /** Cell outputs (for code cells) */
    outputs?: string[];
  };
}

/** Read all cells request (MCP tool support) */
export interface ReadAllCellsRequestMessage {
  /** Message type discriminator */
  type: "get-cells-request";
  /** Request ID for correlation */
  requestId: string;
  /** Empty payload */
  body: Record<string, never>;
}

/** Read all cells response (MCP tool support) */
export interface ReadAllCellsResponseMessage {
  /** Message type discriminator */
  type: "get-cells-response";
  /** Request ID for correlation */
  requestId: string;
  /** Array of cell data */
  body: Array<{
    /** Cell index */
    index: number;
    /** Cell type */
    type: string;
    /** Cell source content */
    source: string;
    /** Cell outputs (for code cells) */
    outputs?: string[];
  }>;
}

/** Get notebook info request (MCP tool support) */
export interface GetNotebookInfoRequestMessage {
  /** Message type discriminator */
  type: "get-notebook-info-request";
  /** Request ID for correlation */
  requestId: string;
  /** Empty payload */
  body: Record<string, never>;
}

/** Get notebook info response (MCP tool support) */
export interface GetNotebookInfoResponseMessage {
  /** Message type discriminator */
  type: "get-notebook-info-response";
  /** Request ID for correlation */
  requestId: string;
  /** Notebook metadata */
  body: {
    /** Notebook file path */
    path: string;
    /** Total number of cells */
    cellCount: number;
    /** Count of cells by type */
    cellTypes: {
      /** Number of code cells */
      code: number;
      /** Number of markdown cells */
      markdown: number;
      /** Number of raw cells */
      raw: number;
    };
  };
}

/**
 * Union of all Extension → Webview messages
 */
export type ExtensionToWebviewMessage =
  | InitMessage
  | ThemeChangeMessage
  | RuntimeSelectedMessage
  | KernelSelectedMessage
  | KernelStartingMessage
  | KernelTerminatedMessage
  | RuntimeTerminatedMessage
  | SetRuntimeMessage
  | GetFileDataRequestMessage
  | SavedMessage
  | LocalKernelConnectedMessage
  | InsertCellMessage
  | DeleteCellMessage
  | OverwriteCellMessage
  | SetActiveCellMessage
  | ReadCellRequestMessage
  | ReadCellResponseMessage
  | ReadAllCellsRequestMessage
  | ReadAllCellsResponseMessage
  | GetNotebookInfoRequestMessage
  | GetNotebookInfoResponseMessage
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
  /** Message type discriminator */
  type: "ready";
  /** Optional empty payload */
  body?: Record<string, never>;
}

/** Response to getFileData request */
export interface GetFileDataResponseMessage {
  /** Message type discriminator */
  type: "response";
  /** Request ID for correlation */
  requestId: string;
  /** Byte array of file data */
  body: number[];
}

/** Notebook content changed (for auto-save) */
export interface NotebookContentChangedMessage {
  /** Message type discriminator */
  type: "notebook-content-changed";
  /** Content change payload */
  body: {
    /** Serialized notebook content */
    content: Uint8Array;
  };
}

/** Runtime selection requested from webview */
export interface SelectRuntimeRequestMessage {
  /** Message type discriminator */
  type: "select-runtime";
  /** Empty payload */
  body: Record<string, never>;
}

/** Kernel selection requested from webview */
export interface SelectKernelRequestMessage {
  /** Message type discriminator */
  type: "select-kernel";
  /** Empty payload */
  body: Record<string, never>;
}

/** Runtime termination requested from webview */
export interface TerminateRuntimeRequestMessage {
  /** Message type discriminator */
  type: "terminate-runtime";
  /** Termination payload */
  body: {
    /** ID of runtime to terminate */
    runtimeId: string;
  };
}

/** WebSocket message to proxy */
export interface WebSocketProxyMessage {
  /** Message type discriminator */
  type: "websocket-message";
  /** WebSocket connection ID */
  id: string;
  /** Message payload */
  body: {
    /** WebSocket message data */
    data: unknown;
  };
}

/** WebSocket open message */
export interface WebSocketOpenMessage {
  /** Message type discriminator */
  type: "websocket-open";
  /** WebSocket connection ID */
  id: string;
  /** Connection details */
  body: {
    /** WebSocket origin URL */
    origin: string;
    /** WebSocket subprotocol */
    protocol?: string;
  };
}

/** WebSocket close message */
export interface WebSocketCloseMessage {
  /** Message type discriminator */
  type: "websocket-close";
  /** WebSocket connection ID */
  id: string;
  /** Close details */
  body: {
    /** WebSocket origin URL */
    origin: string;
  };
}

/** HTTP request to proxy through extension */
export interface HttpRequestMessage {
  /** Message type discriminator */
  type: "http-request";
  /** Request ID for correlation */
  requestId: string;
  /** Request details */
  body: {
    /** Target URL */
    url: string;
    /** HTTP method */
    method: string;
    /** HTTP headers */
    headers?: Record<string, string>;
    /** Request body */
    body?: string | ArrayBuffer;
  };
}

/** HTTP response from proxied request */
export interface HttpResponseMessage {
  /** Message type discriminator */
  type: "http-response";
  /** Request ID for correlation */
  requestId: string;
  /** Response details */
  body: {
    /** HTTP status code */
    status: number;
    /** HTTP status text */
    statusText: string;
    /** Response headers */
    headers: Record<string, string>;
    /** Response body */
    body?: ArrayBuffer;
  };
}

/** Error from webview */
export interface WebviewErrorMessage {
  /** Message type discriminator */
  type: "error";
  /** Error details */
  body: {
    /** Error message */
    message: string;
    /** Stack trace */
    stack?: string;
  };
}

/** LLM completion request from webview */
export interface LLMCompletionRequestMessage {
  /** Message type discriminator */
  type: "llm-completion-request";
  /** Request ID for correlation */
  requestId: string;
  /** Text before cursor */
  prefix: string;
  /** Text after cursor */
  suffix: string;
  /** Programming language */
  language: string;
  /** Content type: 'code' for Jupyter cells, 'prose' for natural language */
  contentType?: "code" | "prose";
}

/** Outline item structure */
export interface OutlineItem {
  /** Unique identifier */
  id: string;
  /** Display text */
  label: string;
  /** Item type */
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
  /** Heading level (1-6 for headings) */
  level?: number;
  /** Line or node index in editor */
  line?: number;
  /** Cell index (for notebooks) */
  cellIndex?: number;
  /** Nested children */
  children?: OutlineItem[];
}

/** Outline update from webview to extension */
export interface OutlineUpdateMessage {
  /** Message type discriminator */
  type: "outline-update";
  /** Document URI */
  documentUri: string;
  /** Outline items */
  items: OutlineItem[];
  /** Currently focused/selected item ID */
  activeItemId?: string;
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
  | KernelReadyMessage
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
