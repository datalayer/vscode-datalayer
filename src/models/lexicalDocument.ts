/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Lexical document model for VS Code custom editor.
 * Handles document lifecycle, content state, and persistence.
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 * @module lexicalDocument
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { Disposable } from "../utils/dispose";
import { DocumentBridge } from "../services/documentBridge";

/**
 * Delegate interface that provides document persistence capabilities.
 * Allows the document model to interact with the webview for content retrieval.
 *
 * @example
 * ```typescript
 * const delegate: LexicalDocumentDelegate = {
 *   async getFileData() {
 *     return new Uint8Array(await webview.getContent());
 *   }
 * };
 * ```
 */
export interface LexicalDocumentDelegate {
  /**
   * Retrieves current document content from the webview in binary format.
   * Used during save operations to get the latest editor state.
   *
   * @returns Binary representation of the current lexical editor state
   */
  getFileData(): Promise<Uint8Array>;
}

/**
 * Represents a lexical document in VS Code custom editor.
 * Manages document lifecycle, content state, and collaboration features.
 *
 * This class implements the VS Code CustomDocument interface to provide
 * document management for Datalayer's lexical editor integration.
 *
 * @example
 * ```typescript
 * const document = await LexicalDocument.create(uri, undefined, delegate);
 * document.setCollaborative(true); // Enable collaboration mode
 * ```
 */
export class LexicalDocument
  extends Disposable
  implements vscode.CustomDocument
{
  /**
   * Creates a new LexicalDocument instance from a URI.
   *
   * Handles both regular files and backup scenarios. For backup restoration,
   * the backupId parameter should contain the backup file URI.
   *
   * @param uri - The document URI to open
   * @param backupId - Optional backup ID for document restoration
   * @param delegate - Delegate for webview content retrieval
   * @returns Promise resolving to the created document instance
   */
  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
    delegate: LexicalDocumentDelegate,
  ): Promise<LexicalDocument> {
    const dataFile =
      typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
    const fileData = await LexicalDocument.readFile(dataFile);
    return new LexicalDocument(uri, fileData, delegate);
  }

  private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      return LexicalDocument.getDefaultContent();
    }

    if (uri.scheme === "datalayer") {
      return LexicalDocument.readDatalayerFile(uri);
    }

    return new Uint8Array(await vscode.workspace.fs.readFile(uri));
  }

  private static getDefaultContent(): Uint8Array {
    const defaultState = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "Welcome to Datalayer Lexical Editor!",
                type: "text",
                version: 1,
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
    return new TextEncoder().encode(JSON.stringify(defaultState));
  }

  private static async readDatalayerFile(uri: vscode.Uri): Promise<Uint8Array> {
    const documentBridge = DocumentBridge.getInstance();
    const metadata = documentBridge.getDocumentMetadata(uri);

    if (metadata?.localPath && fs.existsSync(metadata.localPath)) {
      const fileContent = fs.readFileSync(metadata.localPath);
      return new Uint8Array(fileContent);
    }

    try {
      return new Uint8Array(await vscode.workspace.fs.readFile(uri));
    } catch (error) {
      return LexicalDocument.getEmptyContent();
    }
  }

  private static getEmptyContent(): Uint8Array {
    const emptyState = {
      root: {
        children: [],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
    return new TextEncoder().encode(JSON.stringify(emptyState));
  }

  private readonly _uri: vscode.Uri;
  private _documentData: Uint8Array;
  private _isDirty: boolean = false;
  private readonly _delegate: LexicalDocumentDelegate;
  private _isCollaborative: boolean = false;

  private readonly _onDidDispose = this._register(
    new vscode.EventEmitter<void>(),
  );
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeDocument = this._register(
    new vscode.EventEmitter<{
      readonly content?: Uint8Array;
    }>(),
  );
  public readonly onDidChangeContent = this._onDidChangeDocument.event;

  private readonly _onDidChange = this._register(
    new vscode.EventEmitter<void>(),
  );
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Creates a new LexicalDocument instance.
   *
   * @param uri - Document URI
   * @param initialContent - Initial document content as binary data
   * @param delegate - Delegate for webview interactions
   */
  private constructor(
    uri: vscode.Uri,
    initialContent: Uint8Array,
    delegate: LexicalDocumentDelegate,
  ) {
    super();
    this._uri = uri;
    this._documentData = initialContent;
    this._delegate = delegate;
  }

  /**
   * The document's URI.
   *
   * @returns The VS Code URI for this document
   */
  public get uri() {
    return this._uri;
  }

  /**
   * Current document content as binary data.
   *
   * @returns Binary representation of the document content
   */
  public get documentData(): Uint8Array {
    return this._documentData;
  }

  /**
   * Whether the document has unsaved changes.
   *
   * In collaborative mode, this always returns false since changes
   * are automatically synchronized to the platform.
   *
   * @returns True if document has unsaved changes, false otherwise
   */
  public get isDirty(): boolean {
    return this._isCollaborative ? false : this._isDirty;
  }

  /**
   * Sets the collaborative mode for this document.
   *
   * When collaborative mode is enabled, the document becomes read-only
   * and changes are automatically synchronized to the Datalayer platform.
   * The dirty state is cleared when entering collaborative mode.
   *
   * @param isCollaborative - Whether to enable collaborative mode
   */
  public setCollaborative(isCollaborative: boolean): void {
    this._isCollaborative = isCollaborative;
    if (isCollaborative) {
      this._isDirty = false;
    }
  }

  /**
   * Records an edit operation on the document.
   *
   * In non-collaborative mode, marks the document as dirty and fires
   * change events. In collaborative mode, only fires change events
   * since the document state is managed externally.
   *
   * @param _edit - The edit operation (currently unused)
   */
  makeEdit(_edit: any) {
    if (!this._isCollaborative) {
      this._isDirty = true;
    }
    this._onDidChange.fire();
  }

  /**
   * Saves the document to its original location.
   *
   * In collaborative mode, this operation is a no-op since changes
   * are automatically synchronized. Otherwise, retrieves current content
   * from the webview and writes it to the file system.
   *
   * @param cancellation - Cancellation token for the operation
   */
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    if (this._isCollaborative) {
      return;
    }

    const fileData = await this._delegate.getFileData();
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vscode.workspace.fs.writeFile(this.uri, fileData);
    this._documentData = fileData;
    this._isDirty = false;
  }

  /**
   * Saves the document to a new location.
   *
   * Retrieves current content from the webview and writes it to the
   * specified target location. Does not change the document's original URI.
   *
   * @param targetResource - URI where to save the document
   * @param cancellation - Cancellation token for the operation
   */
  async saveAs(
    targetResource: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const fileData = await this._delegate.getFileData();
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetResource, fileData);
  }

  /**
   * Reverts the document to its last saved state.
   *
   * Reloads content from disk, clears the dirty state, and notifies
   * listeners of the content change.
   *
   * @param _cancellation - Cancellation token (currently unused)
   */
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    const diskContent = await LexicalDocument.readFile(this.uri);
    this._documentData = diskContent;
    this._isDirty = false;
    this._onDidChangeDocument.fire({
      content: diskContent,
    });
  }

  /**
   * Creates a backup of the document.
   *
   * Saves the current document state to a backup location and returns
   * a backup descriptor that can be used for restoration.
   *
   * @param destination - URI for the backup location
   * @param cancellation - Cancellation token for the operation
   * @returns Promise resolving to backup descriptor
   */
  async backup(
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation);
    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination);
        } catch {
          // noop
        }
      },
    };
  }

  /**
   * Disposes of the document and cleans up resources.
   *
   * Fires disposal events and calls the parent disposable cleanup.
   * Should be called when the document is no longer needed.
   */
  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }
}
