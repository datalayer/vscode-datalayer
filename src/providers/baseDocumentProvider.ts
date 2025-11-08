/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Base class for custom document providers (notebooks and lexical documents).
 * Provides common functionality for webview management, message routing, and lifecycle.
 *
 * @module providers/baseDocumentProvider
 */

import * as vscode from "vscode";
import { DocumentMessageRouter } from "../services/messaging/messageRouter";
import { NetworkBridgeService } from "../services/bridges/networkBridge";
import { RuntimeBridgeService } from "../services/bridges/runtimeBridge";
import { ServiceLoggers } from "../services/logging/loggers";
import type { ExtensionMessage } from "../types/vscode/messages";
import { getOutlineTreeProvider } from "../extension";
import type { OutlineUpdateMessage } from "../../webview/types/messages";

/**
 * Abstract base class for document providers.
 * Handles common provider patterns including webview lifecycle, message routing, and request/response.
 *
 * @template TDocument - The document type (NotebookDocument or LexicalDocument)
 */
export abstract class BaseDocumentProvider<
  TDocument extends vscode.CustomDocument,
> implements vscode.CustomEditorProvider<TDocument>
{
  protected readonly _context: vscode.ExtensionContext;
  protected readonly _messageRouter: DocumentMessageRouter;
  protected readonly _networkBridge: NetworkBridgeService;
  protected readonly _runtimeBridge: RuntimeBridgeService;

  private _requestId = 1;
  private readonly _callbacks = new Map<
    string | number,
    (response: unknown) => void
  >();

  /**
   * Event emitter for document changes.
   * Subclasses should fire this event when documents change.
   */
  protected readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<TDocument>
  >();

  /**
   * Event for document changes (required by CustomEditorProvider interface).
   */
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  /**
   * Creates a new base document provider.
   *
   * @param context - Extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this._context = context;

    // Initialize bridge services
    this._networkBridge = new NetworkBridgeService();
    this._runtimeBridge = new RuntimeBridgeService();

    // Initialize message router
    this._messageRouter = new DocumentMessageRouter(
      ServiceLoggers.getLogger("DocumentMessageRouter"),
    );
    this._messageRouter.initialize().catch((error) => {
      console.error("Failed to initialize DocumentMessageRouter:", error);
    });

    // Register message handlers
    this.registerMessageHandlers();
  }

  /**
   * Opens a custom document.
   * Subclasses must implement document creation logic.
   *
   * @param uri - Document URI
   * @param openContext - Open context with backup information
   * @param token - Cancellation token
   * @returns Promise resolving to the document
   */
  abstract openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    token: vscode.CancellationToken,
  ): Promise<TDocument>;

  /**
   * Resolves a custom editor for a document.
   * Subclasses must implement webview setup logic.
   *
   * @param document - The document to display
   * @param webviewPanel - The webview panel to use
   * @param token - Cancellation token
   * @returns Promise that resolves when editor is ready
   */
  abstract resolveCustomEditor(
    document: TDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void>;

  /**
   * Saves the document.
   * Default implementation throws - subclasses should override if saving is supported.
   *
   * @param _document - Document to save
   * @param _cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  saveCustomDocument(
    _document: TDocument,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Save not implemented");
  }

  /**
   * Saves the document to a new location.
   * Default implementation throws - subclasses should override if needed.
   *
   * @param _document - Document to save
   * @param _destination - Destination URI
   * @param _cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  saveCustomDocumentAs(
    _document: TDocument,
    _destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Save As not implemented");
  }

  /**
   * Reverts the document to its saved state.
   * Default implementation throws - subclasses should override if needed.
   *
   * @param _document - Document to revert
   * @param _cancellation - Cancellation token
   * @returns Promise that resolves when revert is complete
   */
  revertCustomDocument(
    _document: TDocument,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Revert not implemented");
  }

  /**
   * Backs up the document.
   * Default implementation throws - subclasses should override if needed.
   *
   * @param _document - Document to backup
   * @param _context - Backup context
   * @param _cancellation - Cancellation token
   * @returns Promise resolving to backup information
   */
  backupCustomDocument(
    _document: TDocument,
    _context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    throw new Error("Backup not implemented");
  }

  /**
   * Posts a message to the webview and waits for a response.
   * Uses the request/response pattern with requestId tracking.
   *
   * @param panel - Target webview panel
   * @param type - Message type
   * @param body - Message body
   * @returns Promise resolving to the response
   */
  protected postMessageWithResponse<R = unknown>(
    panel: vscode.WebviewPanel,
    type: string,
    body: unknown,
  ): Promise<R> {
    const requestId = this._requestId++;
    const p = new Promise<R>((resolve) =>
      this._callbacks.set(requestId, resolve as (response: unknown) => void),
    );
    panel.webview.postMessage({ type, requestId, body });
    return p;
  }

  /**
   * Posts a message to the webview without expecting a response.
   *
   * @param panel - Target webview panel
   * @param type - Message type
   * @param body - Message body
   * @param id - Optional message ID
   */
  protected postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: unknown,
    id?: string,
  ): void {
    panel.webview.postMessage({ type, body, id });
  }

  /**
   * Registers all message handlers with the message router.
   * Called during constructor initialization.
   * Subclasses can override to add custom handlers.
   */
  protected registerMessageHandlers(): void {
    // Register runtime handlers (select-runtime, select-kernel, terminate-runtime, runtime-expired)
    this._runtimeBridge.registerRuntimeHandlers(this._messageRouter);

    // Register network handlers (HTTP requests and WebSocket operations)
    this._networkBridge.registerNetworkHandlers(this._messageRouter);

    // Handler for response messages (request/response pattern)
    this._messageRouter.registerHandler("response", async (message) => {
      const requestId = message.requestId;
      if (requestId !== undefined) {
        const callback = this._callbacks.get(requestId);
        if (callback) {
          callback(message.body);
          this._callbacks.delete(requestId);
        }
      }
    });

    // Handlers that are no-ops or handled elsewhere
    this._messageRouter.registerHandler("ready", async () => {
      // Handled in resolveCustomEditor
    });

    this._messageRouter.registerHandler("getFileData", async () => {
      // Handled differently via postMessageWithResponse
    });

    // Register outline-update handler
    this._messageRouter.registerHandler("outline-update", async (message) => {
      console.log("[BaseDocumentProvider] Received outline-update message", {
        type: message.type,
        hasOutlineProvider: !!getOutlineTreeProvider(),
      });

      const outlineProvider = getOutlineTreeProvider();
      if (outlineProvider && message.type === "outline-update") {
        const outlineMsg = message as unknown as OutlineUpdateMessage;
        console.log("[BaseDocumentProvider] Calling updateOutline", {
          documentUri: outlineMsg.documentUri,
          itemCount: outlineMsg.items.length,
          activeItemId: outlineMsg.activeItemId,
        });
        outlineProvider.updateOutline(
          outlineMsg.documentUri,
          outlineMsg.items,
          outlineMsg.activeItemId,
        );
      } else {
        console.warn("[BaseDocumentProvider] Skipping outline update", {
          hasProvider: !!outlineProvider,
          messageType: message.type,
        });
      }
    });
  }

  /**
   * Handles messages received from the webview.
   * Delegates to the message router for all message types.
   *
   * @param webviewPanel - The webview panel that sent the message
   * @param document - The document associated with the webview
   * @param message - The message from the webview
   */
  protected async onMessage(
    webviewPanel: vscode.WebviewPanel,
    document: TDocument,
    message: ExtensionMessage,
  ): Promise<void> {
    // Get document URI
    const documentUri = this.getDocumentUri(document);

    // Route the message
    await this._messageRouter.routeMessage(message, {
      documentUri: documentUri.toString(),
      webview: webviewPanel.webview,
      webviewPanel: webviewPanel,
      isFromDatalayer: documentUri.scheme === "datalayer",
    });
  }

  /**
   * Gets the URI for a document.
   * Subclasses must implement this to extract the URI from their document type.
   *
   * @param document - The document
   * @returns The document URI
   */
  protected abstract getDocumentUri(document: TDocument): vscode.Uri;
}
