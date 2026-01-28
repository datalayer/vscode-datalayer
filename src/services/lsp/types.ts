/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Type definitions for LSP integration with Datalayer notebooks.
 * @module services/lsp/types
 */

import * as vscode from "vscode";

/**
 * Supported cell languages for LSP integration
 */
export type CellLanguage = "python" | "markdown";

/**
 * LSP request message types sent from webview to extension host
 */
export type LSPRequest =
  | LSPCompletionRequest
  | LSPHoverRequest
  | LSPDocumentSyncRequest
  | LSPDocumentOpenRequest
  | LSPDocumentCloseRequest;

/**
 * LSP response message types sent from extension host to webview
 */
export type LSPResponse =
  | LSPCompletionResponse
  | LSPHoverResponse
  | LSPErrorResponse;

/**
 * Request completions for a cell at a specific position
 */
export interface LSPCompletionRequest {
  type: "lsp-completion-request";
  requestId: string;
  cellId: string;
  language: CellLanguage;
  position: { line: number; character: number };
  trigger?: string;
}

/**
 * Request hover information for a cell at a specific position
 */
export interface LSPHoverRequest {
  type: "lsp-hover-request";
  requestId: string;
  cellId: string;
  language: CellLanguage;
  position: { line: number; character: number };
}

/**
 * Sync cell content changes to virtual document
 */
export interface LSPDocumentSyncRequest {
  type: "lsp-document-sync";
  cellId: string;
  content: string;
  version: number;
}

/**
 * Open a new virtual document for a cell
 */
export interface LSPDocumentOpenRequest {
  type: "lsp-document-open";
  cellId: string;
  notebookId: string;
  content: string;
  language: CellLanguage;
  source?: "notebook" | "lexical"; // Source of the document (notebook or lexical editor)
}

/**
 * Close a virtual document for a cell
 */
export interface LSPDocumentCloseRequest {
  type: "lsp-document-close";
  cellId: string;
}

/**
 * Serializable completion item (plain object for postMessage)
 */
export interface SerializableCompletionItem {
  label: string | vscode.CompletionItemLabel;
  kind?: vscode.CompletionItemKind;
  detail?: string;
  documentation?: string | vscode.MarkdownString;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  range?: vscode.Range | { inserting: vscode.Range; replacing: vscode.Range };
  command?: vscode.Command;
  commitCharacters?: string[];
  additionalTextEdits?: vscode.TextEdit[];
  tags?: readonly vscode.CompletionItemTag[];
}

/**
 * Completion response with LSP completion items
 */
export interface LSPCompletionResponse {
  type: "lsp-completion-response";
  requestId: string;
  completions: SerializableCompletionItem[];
}

/**
 * Hover response with LSP hover information
 */
export interface LSPHoverResponse {
  type: "lsp-hover-response";
  requestId: string;
  hover: vscode.Hover | null;
}

/**
 * Error response when LSP request fails
 */
export interface LSPErrorResponse {
  type: "lsp-error";
  requestId: string;
  error: string;
}

/**
 * Virtual document information tracked by LSPDocumentManager
 */
export interface VirtualDocument {
  /** Unique cell identifier */
  cellId: string;
  /** Notebook identifier */
  notebookId: string;
  /** Cell language (python or markdown) */
  language: CellLanguage;
  /** Source type (notebook or lexical editor) */
  source: "notebook" | "lexical";
  /** Virtual document URI */
  uri: vscode.Uri;
  /** Current document version */
  version: number;
  /** Current document content */
  content: string;
}
