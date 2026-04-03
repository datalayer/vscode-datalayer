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
import { Runner, createExtensionRunner } from "../tools/core/runnerSetup";

/**
 * Abstract base class for document providers.
 * Handles common provider patterns including webview lifecycle, message routing, and request/response.
 *
 * @template TDocument - The document type (NotebookDocument or LexicalDocument).
 */
export abstract class BaseDocumentProvider<
  TDocument extends vscode.CustomDocument,
> implements vscode.CustomEditorProvider<TDocument> {
  /**
   * VS Code extension context providing access to storage, subscriptions, etc.
   */
  protected readonly _context: vscode.ExtensionContext;

  /**
   * Message router for handling webview messages and routing to appropriate handlers.
   */
  protected readonly _messageRouter: DocumentMessageRouter;

  /**
   * Network bridge service for HTTP/WebSocket communication between extension and webview.
   */
  protected readonly _networkBridge: NetworkBridgeService;

  /**
   * Runtime bridge service for managing runtime lifecycle and selection.
   */
  protected readonly _runtimeBridge: RuntimeBridgeService;

  /**
   * Map of webview panels to their Runner instances.
   * Runners handle tool execution via the BridgeExecutor pattern.
   */
  protected readonly _runners = new Map<vscode.WebviewPanel, Runner>();

  /**
   * Counter for generating unique request IDs in request/response pattern.
   */
  private _requestId = 1;

  /**
   * Map of request ID to response callbacks for request/response message pattern.
   */
  protected readonly _callbacks = new Map<
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
   * Creates a new base document provider with message routing and bridge services.
   *
   * @param context - VS Code extension context providing access to storage and subscriptions.
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
   * Opens a custom document from the given URI.
   * Subclasses must implement document creation logic.
   *
   * @param uri - File URI to open as a custom document.
   * @param openContext - Context containing optional backup ID for restoration.
   * @param token - Cancellation token for aborting the operation.
   *
   * @returns Promise resolving to the created document instance.
   */
  abstract openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    token: vscode.CancellationToken,
  ): Promise<TDocument>;

  /**
   * Resolves a custom editor by configuring the webview for a document.
   * Subclasses must implement webview setup logic.
   *
   * @param document - The document to display in the editor.
   * @param webviewPanel - The webview panel to configure and populate.
   * @param token - Cancellation token for aborting the operation.
   *
   * @returns Promise that resolves when the editor is fully initialized.
   */
  abstract resolveCustomEditor(
    document: TDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void>;

  /**
   * Saves the document to its original location.
   * Default implementation throws since subclasses should override if saving is supported.
   *
   * @param _document - The document instance to persist.
   * @param _cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when save is complete.
   *
   * @throws If save is not implemented by the subclass.
   *
   */
  saveCustomDocument(
    _document: TDocument,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Save not implemented");
  }

  /**
   * Saves the document to a new location.
   * Default implementation throws since subclasses should override if needed.
   *
   * @param _document - The document instance to save.
   * @param _destination - Target URI for the saved copy.
   * @param _cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when save is complete.
   *
   * @throws If save-as is not implemented by the subclass.
   *
   */
  saveCustomDocumentAs(
    _document: TDocument,
    _destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Save As not implemented");
  }

  /**
   * Reverts the document to its last saved state on disk.
   * Default implementation throws since subclasses should override if needed.
   *
   * @param _document - The document instance to revert.
   * @param _cancellation - Cancellation token for aborting the revert.
   *
   * @returns Promise that resolves when revert is complete.
   *
   * @throws If revert is not implemented by the subclass.
   *
   */
  revertCustomDocument(
    _document: TDocument,
    _cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    throw new Error("Revert not implemented");
  }

  /**
   * Creates a backup of the document for crash recovery.
   * Default implementation throws since subclasses should override if needed.
   *
   * @param _document - The document instance to backup.
   * @param _context - Backup context with destination URI.
   * @param _cancellation - Cancellation token for aborting the backup.
   *
   * @returns Promise resolving to backup descriptor with cleanup function.
   *
   * @throws If backup is not implemented by the subclass.
   *
   */
  backupCustomDocument(
    _document: TDocument,
    _context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    throw new Error("Backup not implemented");
  }

  /**
   * Initializes a Runner for a webview panel.
   * Subclasses should call this in their resolveCustomEditor implementation.
   *
   * The Runner uses a BridgeExecutor to send tool execution requests
   * to the webview, where they are executed by the webview's own Runner
   * with DefaultExecutor.
   *
   * @param webviewPanel - The webview panel to create a Runner for.
   *
   * @returns The created Runner instance.
   *
   */
  protected async initializeRunnerForWebview(
    webviewPanel: vscode.WebviewPanel,
  ): Promise<Runner> {
    // Create Runner with BridgeExecutor (lazy-loads operations to avoid CSS imports)
    const runner = await createExtensionRunner(webviewPanel);

    // Store in map for later access
    this._runners.set(webviewPanel, runner);

    // Clean up when webview is disposed
    webviewPanel.onDidDispose(() => {
      this._runners.delete(webviewPanel);
    });

    return runner;
  }

  /**
   * Gets the Runner for a specific webview panel.
   *
   * @param webviewPanel - The webview panel to look up the runner for.
   *
   * @returns The Runner instance, or undefined if not initialized.
   */
  protected getRunnerForWebview(
    webviewPanel: vscode.WebviewPanel,
  ): Runner | undefined {
    return this._runners.get(webviewPanel);
  }

  /**
   * Posts a message to the webview and waits for a response.
   * Uses the request/response pattern with requestId tracking.
   *
   * @param panel - Target webview panel to send the message to.
   * @param type - Message type identifier for routing.
   * @param body - Message payload data.
   *
   * @returns Promise resolving to the webview response.
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
   * @param panel - Target webview panel to send the message to.
   * @param type - Message type identifier for routing.
   * @param body - Message payload data.
   * @param id - Optional message identifier for tracking.
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

    // Handler for kernel-ready message (Pyodide/Datalayer runtimes)
    this._messageRouter.registerHandler(
      "kernel-ready",
      async (_message, context) => {
        const { getServiceContainer } = await import("../extension");
        const uri = vscode.Uri.parse(context.documentUri);
        await getServiceContainer().kernelBridge.handleKernelReady(uri);
      },
    );

    // Register outline-update handler
    this._messageRouter.registerHandler("outline-update", async (message) => {
      const outlineProvider = getOutlineTreeProvider();
      if (outlineProvider && message.type === "outline-update") {
        const outlineMsg = message as unknown as OutlineUpdateMessage;
        outlineProvider.updateOutline(
          outlineMsg.documentUri,
          outlineMsg.items,
          outlineMsg.activeItemId,
        );
      }
    });
  }

  /**
   * Handles messages received from the webview.
   * Delegates to the message router for all message types.
   *
   * @param webviewPanel - The webview panel that sent the message.
   * @param document - The document associated with the webview.
   * @param message - The structured message from the webview.
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
   * @param document - The document to extract the URI from.
   *
   * @returns The document URI identifying the file location.
   */
  protected abstract getDocumentUri(document: TDocument): vscode.Uri;
}
