/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Notebook document model for VS Code custom editor.
 * Handles document lifecycle, content state, and persistence for Jupyter notebooks.
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 * @module notebookDocument
 */

import * as vscode from "vscode";
import { Disposable } from "../utils/dispose";
import { DocumentBridge } from "../services/bridges/documentBridge";

/**
 * Represents an edit operation performed on a notebook document.
 *
 * Currently supports content updates that replace the entire notebook content.
 * Used for tracking edit history and implementing undo/redo functionality.
 *
 * @example
 * ```typescript
 * const edit: NotebookEdit = {
 *   type: "content-update",
 *   content: new TextEncoder().encode(JSON.stringify(notebookData))
 * };
 * document.makeEdit(edit);
 * ```
 */
export interface NotebookEdit {
  /** The type of edit operation - currently only content updates are supported */
  readonly type: "content-update";
  /** Binary representation of the notebook content after the edit */
  readonly content: Uint8Array;
}

/**
 * Delegate interface that provides document persistence and webview access capabilities.
 *
 * Implements the delegate pattern to allow the document model to interact with
 * the webview for content retrieval and panel management without tight coupling.
 *
 * @example
 * ```typescript
 * const delegate: NotebookDocumentDelegate = {
 *   async getFileData() {
 *     // Retrieve current notebook content from webview
 *     const notebook = await webview.getNotebookContent();
 *     return new TextEncoder().encode(JSON.stringify(notebook));
 *   },
 *   getWebviewPanel() {
 *     return currentWebviewPanel;
 *   }
 * };
 * ```
 */
export interface NotebookDocumentDelegate {
  /**
   * Retrieves current notebook content from the webview in binary format.
   * Used during save operations to get the latest notebook state.
   *
   * @returns Binary representation of the current notebook content
   */
  getFileData(): Promise<Uint8Array>;

  /**
   * Optional method to access the associated webview panel.
   * Used for webview lifecycle management and communication.
   *
   * @returns The webview panel instance or undefined if not available
   */
  getWebviewPanel?: () => vscode.WebviewPanel | undefined;
}

/**
 * Represents a Jupyter notebook document in VS Code custom editor.
 * Manages document lifecycle, content persistence, and edit tracking with support
 * for both collaborative Datalayer notebooks and local file-based notebooks.
 *
 * This class implements different behaviors based on the URI scheme:
 * - `datalayer://` URIs: Collaborative notebooks with real-time sync (read-only locally)
 * - `file://` URIs: Local notebooks with full edit tracking and persistence
 *
 * @example
 * ```typescript
 * const document = await NotebookDocument.create(uri, undefined, delegate);
 * document.makeEdit({ type: "content-update", content: newContent });
 * await document.save(cancellationToken);
 * ```
 */
export class NotebookDocument
  extends Disposable
  implements vscode.CustomDocument
{
  /**
   * Creates a new NotebookDocument instance from a URI.
   *
   * Handles both regular notebook files and backup restoration scenarios.
   * For backup restoration, the backupId parameter should contain the backup file URI.
   * Supports both local file URIs and collaborative Datalayer URIs.
   *
   * @param uri - The notebook URI to open
   * @param backupId - Optional backup ID for document restoration
   * @param delegate - Delegate for webview content retrieval and management
   * @returns Promise resolving to the created notebook document instance
   */
  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
    delegate: NotebookDocumentDelegate,
  ): Promise<NotebookDocument> {
    const dataFile =
      typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
    const fileData = await NotebookDocument.readFile(dataFile);
    return new NotebookDocument(uri, fileData, delegate);
  }

  /**
   * Reads notebook content from a URI.
   *
   * Handles different URI schemes:
   * - `untitled`: Returns empty content for new notebooks
   * - `datalayer`: Returns empty notebook, content will sync via collaboration
   * - Other schemes: Reads from VS Code file system
   *
   * @param uri - URI to read notebook content from
   * @returns Binary representation of the notebook content
   */
  private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      return new Uint8Array();
    }

    // For datalayer:// URIs, these are collaborative documents
    // Content will be synced from the collaboration server (Y.js) once the editor connects
    if (uri.scheme === "datalayer") {
      try {
        // Wait for extension to be ready
        await DocumentBridge.getInstanceAsync();

        // Try reading from cached file
        try {
          return new Uint8Array(await vscode.workspace.fs.readFile(uri));
        } catch (readError) {
          // Cache miss - this is expected after VS Code restart if temp files were cleaned
          // Return empty notebook structure - collaboration will sync the real content
          return NotebookDocument.getEmptyNotebook();
        }
      } catch (error) {
        // Extension not ready or other error
        return NotebookDocument.getEmptyNotebook();
      }
    }

    // For regular file:// URIs, read directly
    const fileData = new Uint8Array(await vscode.workspace.fs.readFile(uri));

    // Handle empty files gracefully - return minimal valid notebook
    if (fileData.length === 0) {
      return NotebookDocument.getEmptyNotebook();
    }

    return fileData;
  }

  /**
   * Returns a minimal valid empty Jupyter notebook.
   * Used when opening blank/empty .ipynb files.
   *
   * @returns Binary representation of an empty notebook
   */
  private static getEmptyNotebook(): Uint8Array {
    const emptyNotebook = {
      cells: [],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };
    return new TextEncoder().encode(JSON.stringify(emptyNotebook));
  }

  private readonly _uri: vscode.Uri;
  private _documentData: Uint8Array;
  private _edits: NotebookEdit[] = [];
  private _savedEdits: NotebookEdit[] = [];
  private readonly _delegate: NotebookDocumentDelegate;

  private readonly _onDidDispose = this._register(
    new vscode.EventEmitter<void>(),
  );
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeDocument = this._register(
    new vscode.EventEmitter<{
      readonly content?: Uint8Array;
      readonly edits: readonly NotebookEdit[];
    }>(),
  );
  public readonly onDidChangeContent = this._onDidChangeDocument.event;

  private readonly _onDidChange = this._register(
    new vscode.EventEmitter<{
      readonly label: string;
      undo(): void;
      redo(): void;
    }>(),
  );
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Creates a new NotebookDocument instance.
   *
   * @param uri - Document URI that determines collaborative vs local behavior
   * @param initialContent - Initial notebook content as binary data
   * @param delegate - Delegate for webview interactions and content retrieval
   */
  private constructor(
    uri: vscode.Uri,
    initialContent: Uint8Array,
    delegate: NotebookDocumentDelegate,
  ) {
    super();
    this._uri = uri;
    this._documentData = initialContent;
    this._delegate = delegate;
  }

  /**
   * The notebook's URI.
   *
   * The URI scheme determines the document's behavior:
   * - `datalayer://`: Collaborative notebook with real-time synchronization
   * - `file://`: Local notebook with traditional file persistence
   * - `untitled:`: New unsaved notebook
   *
   * @returns The VS Code URI for this notebook document
   */
  public get uri() {
    return this._uri;
  }

  /**
   * Current notebook content as binary data.
   *
   * Contains the serialized Jupyter notebook JSON structure.
   * Updated automatically when edits are applied via makeEdit().
   *
   * @returns Binary representation of the notebook content
   */
  public get documentData(): Uint8Array {
    return this._documentData;
  }

  /**
   * Records an edit operation on the notebook document.
   *
   * Behavior differs based on the URI scheme:
   * - **Collaborative notebooks** (`datalayer://`): Skips edit tracking since changes
   *   are managed by the Datalayer platform's real-time synchronization
   * - **Local notebooks**: Tracks edits for undo/redo functionality and dirty state
   *
   * For local notebooks, updates the document content and fires change events
   * with undo/redo handlers for VS Code's edit history.
   *
   * @param edit - The edit operation to apply
   *
   * @example
   * ```typescript
   * // Apply content update to local notebook
   * const notebookJson = { cells: [...], metadata: {...} };
   * const edit: NotebookEdit = {
   *   type: "content-update",
   *   content: new TextEncoder().encode(JSON.stringify(notebJson))
   * };
   *
   * document.makeEdit(edit);
   * // Document content is updated and undo/redo is available
   * ```
   *
   * @example
   * ```typescript
   * // Edit on collaborative notebook (no-op for tracking)
   * collaborativeDoc.makeEdit(edit);
   * // Edit is ignored for history but still fires change events
   * ```
   */
  makeEdit(edit: NotebookEdit) {
    // Skip dirty state tracking for collaborative Datalayer notebooks
    if (this.uri.scheme === "datalayer") {
      return;
    }

    this._edits.push(edit);

    if (edit.type === "content-update") {
      this._documentData = edit.content;
    }

    this._onDidChange.fire({
      label: "Edit",
      undo: async () => {
        this._edits.pop();
        if (this._edits.length > 0) {
          const lastEdit = this._edits[this._edits.length - 1];
          if (lastEdit.type === "content-update") {
            this._documentData = lastEdit.content;
          }
        }
        this._onDidChangeDocument.fire({
          edits: this._edits,
          content: this._documentData,
        });
      },
      redo: async () => {
        this._edits.push(edit);
        if (edit.type === "content-update") {
          this._documentData = edit.content;
        }
        this._onDidChangeDocument.fire({
          edits: this._edits,
          content: this._documentData,
        });
      },
    });

    this._onDidChangeDocument.fire({
      edits: this._edits,
      content: this._documentData,
    });
  }

  /**
   * Saves the notebook document to its original location.
   *
   * Behavior differs based on the URI scheme:
   * - **Collaborative notebooks** (`datalayer://`): No-op since changes are
   *   automatically synchronized to the Datalayer platform
   * - **Local notebooks**: Persists current content to the file system
   *
   * @param cancellation - Cancellation token for the save operation
   */
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    if (this.uri.scheme === "datalayer") {
      return;
    }

    await this.saveAs(this.uri, cancellation);
    this._savedEdits = Array.from(this._edits);
  }

  /**
   * Saves the notebook document to a specified location.
   *
   * Handles different scenarios based on URI schemes and target locations:
   * - **Collaborative to same location**: No-op since changes are auto-synchronized
   * - **Collaborative to different location**: Exports current content as local file
   * - **Local notebook**: Retrieves fresh content from webview and saves to target
   *
   * @param targetResource - URI where to save the notebook
   * @param cancellation - Cancellation token for the save operation
   */
  async saveAs(
    targetResource: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (this.uri.scheme === "datalayer") {
      if (targetResource.toString() === this.uri.toString()) {
        return;
      }
      // Export current content for different location
      const fileData = this._documentData;
      if (cancellation.isCancellationRequested) {
        return;
      }
      await vscode.workspace.fs.writeFile(targetResource, fileData);
      return;
    }

    // For local notebooks, get current data from the delegate
    try {
      const fileData = await this._delegate.getFileData();
      if (cancellation.isCancellationRequested) {
        return;
      }
      await vscode.workspace.fs.writeFile(targetResource, fileData);

      this._documentData = fileData;
      this._savedEdits = Array.from(this._edits);
      this._edits = [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reverts the notebook document to its last saved state.
   *
   * Reloads content from disk and restores the edit history to the last saved state.
   * Fires document change events to notify the UI of the content restoration.
   *
   * @param _cancellation - Cancellation token (currently unused)
   */
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    const diskContent = await NotebookDocument.readFile(this.uri);
    this._documentData = diskContent;
    this._edits = this._savedEdits;
    this._onDidChangeDocument.fire({
      content: diskContent,
      edits: this._edits,
    });
  }

  /**
   * Creates a backup of the notebook document.
   *
   * Saves the current document state to a backup location and returns
   * a backup descriptor for VS Code's backup/restore system.
   *
   * @param destination - URI for the backup location
   * @param cancellation - Cancellation token for the backup operation
   * @returns Promise resolving to backup descriptor with cleanup function
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
   * Disposes of the notebook document and cleans up resources.
   *
   * Fires disposal events and calls the parent disposable cleanup.
   * Should be called when the document is no longer needed to prevent memory leaks.
   */
  override dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }
}
