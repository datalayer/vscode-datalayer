/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Manages virtual TextDocuments for notebook cells using vscode-notebook-cell:// URIs.
 * Creates virtual documents that Pylance and Markdown LSP can analyze without temp files.
 *
 * URI format: vscode-notebook-cell://datalayer/{type}/{docId}#{cellId}.{ext}
 * - type: "notebook" or "lexical"
 * - docId: notebook or lexical document identifier
 * - cellId: unique cell identifier
 * - ext: "py" for Python, "md" for Markdown
 *
 * @module services/lsp/lspDocumentManager
 */

import * as vscode from "vscode";
import { CellLanguage, VirtualDocument } from "./types";

/**
 * Manages virtual TextDocuments for notebook cells using vscode-notebook-cell:// URIs.
 * Uses VS Code's TextDocumentContentProvider to serve cell content in memory.
 */
export class LSPDocumentManager implements vscode.TextDocumentContentProvider {
  /** Map of cell ID to virtual document info */
  private documents = new Map<string, VirtualDocument>();

  /** Event emitter for document content changes */
  private readonly _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  /** Event fired when document content changes (required by TextDocumentContentProvider) */
  public readonly onDidChange = this._onDidChangeEmitter.event;

  /** Content provider disposable */
  private contentProviderDisposable?: vscode.Disposable;

  constructor() {
    // Register as content provider for vscode-notebook-cell scheme
    this.contentProviderDisposable =
      vscode.workspace.registerTextDocumentContentProvider(
        "vscode-notebook-cell",
        this,
      );
  }

  /**
   * Provide text document content (required by TextDocumentContentProvider).
   *
   * @param uri - Document URI
   * @returns Document content or undefined if not found
   */
  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    // Extract cellId from URI fragment
    const cellId = this.extractCellIdFromUri(uri);
    if (!cellId) {
      console.warn(
        "[LSPDocumentManager] Could not extract cellId from URI:",
        uri.toString(),
      );
      return undefined;
    }

    const virtualDoc = this.documents.get(cellId);
    if (!virtualDoc) {
      console.warn(
        "[LSPDocumentManager] No document found for cellId:",
        cellId,
      );
      return undefined;
    }

    return virtualDoc.content;
  }

  /**
   * Create a new virtual document for a cell.
   *
   * @param notebookId - Unique notebook identifier
   * @param cellId - Unique cell identifier
   * @param content - Initial cell content
   * @param language - Cell language (python or markdown)
   * @param source - Source type (notebook or lexical)
   * @returns Promise that resolves to URI of the created document
   */
  public async createCellDocument(
    notebookId: string,
    cellId: string,
    content: string,
    language: CellLanguage,
    source: "notebook" | "lexical" = "notebook",
  ): Promise<vscode.Uri> {
    // Check if document already exists
    if (this.documents.has(cellId)) {
      const existingDoc = this.documents.get(cellId)!;

      // Update content and fire change event
      existingDoc.content = content;
      existingDoc.version++;
      this._onDidChangeEmitter.fire(existingDoc.uri);

      return existingDoc.uri;
    }

    // Create virtual URI: vscode-notebook-cell://datalayer/{type}/{docId}#{cellId}.{ext}
    // URL-encode notebookId and cellId to handle special characters (/, :, etc.)
    const fileExtension = language === "python" ? "py" : "md";
    const encodedNotebookId = encodeURIComponent(notebookId);
    const encodedCellId = encodeURIComponent(cellId);
    const uri = vscode.Uri.parse(
      `vscode-notebook-cell://datalayer/${source}/${encodedNotebookId}#${encodedCellId}.${fileExtension}`,
    );

    // Store document info
    const virtualDoc: VirtualDocument = {
      cellId,
      notebookId,
      language,
      source,
      uri,
      version: 1,
      content,
    };

    this.documents.set(cellId, virtualDoc);

    // Open the document in VS Code's text document system
    // This triggers LSP activation for the appropriate language server
    try {
      const doc = await vscode.workspace.openTextDocument(uri);

      // CRITICAL: Explicitly set the language ID
      // Without this, VS Code defaults to 'plaintext' and Pylance won't activate
      const vscodeLanguageId = language === "python" ? "python" : "markdown";
      await vscode.languages.setTextDocumentLanguage(doc, vscodeLanguageId);
    } catch (error) {
      console.error("[LSPDocumentManager] Error opening TextDocument:", error);
    }

    return uri;
  }

  /**
   * Update the content of an existing virtual document.
   *
   * @param cellId - Cell identifier
   * @param content - New cell content
   */
  public updateCellContent(cellId: string, content: string): void {
    const virtualDoc = this.documents.get(cellId);
    if (!virtualDoc) {
      console.warn(
        "[LSPDocumentManager] Cannot update: no document found for cell:",
        cellId,
      );
      return;
    }

    // Update content and increment version
    virtualDoc.content = content;
    virtualDoc.version++;

    // Fire change event to notify LSP servers
    this._onDidChangeEmitter.fire(virtualDoc.uri);
  }

  /**
   * Close and remove a virtual document for a cell.
   *
   * @param cellId - Cell identifier
   */
  public closeCellDocument(cellId: string): void {
    const virtualDoc = this.documents.get(cellId);
    if (!virtualDoc) {
      console.warn(
        "[LSPDocumentManager] Cannot close: no document found for cell:",
        cellId,
      );
      return;
    }

    // Remove from tracking (no file cleanup needed!)
    this.documents.delete(cellId);

    // Note: We don't fire onDidClose because we don't have that event
    // The document will be garbage collected when no longer referenced
  }

  /**
   * Get virtual document info for a cell.
   *
   * @param cellId - Cell identifier
   * @returns Virtual document or undefined
   */
  public getCellDocument(cellId: string): VirtualDocument | undefined {
    return this.documents.get(cellId);
  }

  /**
   * Get TextDocument for a cell (opens if not already open).
   *
   * @param cellId - Cell identifier
   * @returns Promise that resolves to TextDocument or undefined
   */
  public async getTextDocument(
    cellId: string,
  ): Promise<vscode.TextDocument | undefined> {
    const virtualDoc = this.documents.get(cellId);
    if (!virtualDoc) {
      return undefined;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(virtualDoc.uri);

      // CRITICAL: Set language ID on every retrieval
      // VS Code doesn't detect .py/.md extension in URI fragment, defaults to plaintext
      // We must explicitly set the language each time
      const vscodeLanguageId =
        virtualDoc.language === "python" ? "python" : "markdown";

      // Only set if it's not already correct (avoid unnecessary operations)
      if (doc.languageId !== vscodeLanguageId) {
        await vscode.languages.setTextDocumentLanguage(doc, vscodeLanguageId);
      }

      return doc;
    } catch (error) {
      console.error("[LSPDocumentManager] Error opening TextDocument:", error);
      return undefined;
    }
  }

  /**
   * Extract cell ID from vscode-notebook-cell:// URI.
   *
   * @param uri - Document URI
   * @returns Cell ID or undefined
   */
  private extractCellIdFromUri(uri: vscode.Uri): string | undefined {
    // URI format: vscode-notebook-cell://datalayer/{type}/{docId}#{cellId}.{ext}
    // Fragment contains: {encodedCellId}.{ext}
    const fragment = uri.fragment;
    if (!fragment) {
      return undefined;
    }

    // Remove file extension
    const cellIdWithExt = fragment;
    const lastDot = cellIdWithExt.lastIndexOf(".");
    if (lastDot === -1) {
      // Decode URL-encoded cellId
      return decodeURIComponent(cellIdWithExt);
    }

    const encodedCellId = cellIdWithExt.substring(0, lastDot);
    // Decode URL-encoded cellId
    return decodeURIComponent(encodedCellId);
  }

  /**
   * Dispose of the document manager and cleanup resources.
   */
  public dispose(): void {
    // Clear all documents (no file cleanup needed!)
    this.documents.clear();

    // Dispose content provider
    if (this.contentProviderDisposable) {
      this.contentProviderDisposable.dispose();
    }

    // Dispose event emitter
    this._onDidChangeEmitter.dispose();
  }
}
