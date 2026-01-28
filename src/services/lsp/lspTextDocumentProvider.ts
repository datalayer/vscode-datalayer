/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * TextDocumentContentProvider for datalayer-lsp:// URI scheme.
 * Provides content for virtual documents created by LSPDocumentManager.
 *
 * @module services/lsp/lspTextDocumentProvider
 */

import * as vscode from "vscode";
import { LSPDocumentManager } from "./lspDocumentManager";

/**
 * Content provider for virtual documents with datalayer-lsp:// URIs.
 * Returns cell content from the document manager.
 */
export class LSPTextDocumentProvider
  implements vscode.TextDocumentContentProvider
{
  private documentManager: LSPDocumentManager;

  /** Event emitter for content changes */
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  /** Event fired when document content changes */
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Create a new LSPTextDocumentProvider.
   *
   * @param documentManager - Document manager that tracks virtual documents
   */
  constructor(documentManager: LSPDocumentManager) {
    this.documentManager = documentManager;

    // Note: This provider is currently unused.
    // Document changes are handled directly by LSPDocumentManager.onDidChange
  }

  /**
   * Provide content for a virtual document URI.
   *
   * @param uri - Virtual document URI (untitled://...)
   * @returns Document content or empty string if not found
   */
  public provideTextDocumentContent(uri: vscode.Uri): string {
    console.log(
      `🔍🔍🔍 [LSP-DEBUG-ContentProvider] ===  provideTextDocumentContent CALLED for URI: ${uri.toString()}`,
    );

    // Extract cell ID from URI path
    // URI format: untitled:/datalayer-notebook-{notebookId}-cell-{cellId}.py
    const match = uri.path.match(/datalayer-notebook-[^-]+-cell-([^.]+)\./);

    if (!match) {
      console.error(
        `🔍🔍🔍 [LSP-DEBUG-ContentProvider] Invalid URI format: ${uri.toString()}`,
      );
      return "";
    }

    const cellId = match[1];
    console.log(
      `🔍🔍🔍 [LSP-DEBUG-ContentProvider] Extracted cellId: ${cellId}`,
    );

    // Get document from manager
    const virtualDoc = this.documentManager.getCellDocument(cellId);
    if (!virtualDoc) {
      console.warn(
        `🔍🔍🔍 [LSP-DEBUG-ContentProvider] No document found for cell ${cellId}`,
      );
      return "";
    }

    console.log(
      `🔍🔍🔍 [LSP-DEBUG-ContentProvider] Providing content for cell ${cellId} (${virtualDoc.content.length} chars): "${virtualDoc.content.substring(0, 50)}..."`,
    );

    return virtualDoc.content;
  }

  /**
   * Dispose of the provider and clean up resources.
   */
  public dispose(): void {
    this._onDidChange.dispose();
  }
}
