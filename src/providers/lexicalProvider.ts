/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom editor provider for Lexical document files (.dlex).
 * Handles webview lifecycle management, document editing, and collaboration features
 * for both local and Datalayer platform documents.
 *
 * Supports both .dlex (new) and .lexical (legacy) file extensions for backward compatibility.
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 * @module providers/lexicalProvider
 */

import * as vscode from "vscode";
import { disposeAll } from "../utils/dispose";
import { getNonce } from "../utils/webviewSecurity";
import { LexicalDocument } from "../models/lexicalDocument";
import {
  LexicalCollaborationService,
  LexicalCollaborationConfig,
} from "../services/collaboration/lexicalCollaboration";
import {
  getServiceContainer,
  getOutlineTreeProvider,
  getRuntimesTreeProvider,
} from "../extension";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import { BaseDocumentProvider } from "./baseDocumentProvider";
import { LoroWebSocketAdapter } from "../services/collaboration/loroWebSocketAdapter";
import { AutoConnectService } from "../services/autoConnect/autoConnectService";
import { SDKAuthProvider } from "../services/core/authProvider";

/**
 * Custom editor provider for Lexical documents.
 * Handles webview lifecycle management, document state synchronization,
 * and collaboration features for rich text editing.
 *
 * @example
 * ```typescript
 * const provider = new LexicalProvider(context);
 * // Provider is registered automatically via static register method
 * ```
 */
export class LexicalProvider extends BaseDocumentProvider<LexicalDocument> {
  /**
   * Registers the Lexical editor provider and commands with VS Code.
   *
   * @param context - Extension context for resource management
   * @returns Disposable for cleanup
   */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    vscode.commands.registerCommand("datalayer.lexical-editor-new", () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          "Creating new Datalayer Lexical documents currently requires opening a workspace",
        );
        return;
      }

      const uri = vscode.Uri.joinPath(
        workspaceFolders[0].uri,
        `new-${Date.now()}.dlex`,
      ).with({ scheme: "untitled" });

      vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        LexicalProvider.viewType,
      );
    });

    // Create provider instance
    const provider = new LexicalProvider(context);
    const kernelBridge = getServiceContainer().kernelBridge;

    // Register this provider's message handler
    // Note: The actual sendToWebview command is registered centrally in commands/internal.ts
    // We just need to expose a way to route messages to our webviews
    LexicalProvider._instance = provider;

    // Register internal command for broadcasting kernel selection
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "datalayer.internal.runtime.kernelSelected",
        async (runtime: unknown) => {
          // Runtime tracking is now handled by centralized commands/internal.ts
          // via datalayer.internal.runtimeConnected command called by KernelBridge

          // Broadcast using centralized KernelBridge
          await kernelBridge.broadcastKernelSelected(runtime as RuntimeDTO);
        },
      ),
    );

    // Register callback for runtime termination notifications
    import("../commands/internal").then(({ onRuntimeTerminated }) => {
      onRuntimeTerminated(async (uri: vscode.Uri) => {
        // Send kernel-terminated message to lexical webview
        const entry = provider.webviews.get(uri.toString());
        if (entry) {
          await entry.webviewPanel.webview.postMessage({
            type: "kernel-terminated",
          });
        }
      });
    });

    return vscode.window.registerCustomEditorProvider(
      LexicalProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  private static readonly viewType = "datalayer.lexical-editor";
  private static _instance: LexicalProvider | undefined;

  /**
   * Get the singleton instance of LexicalProvider for message routing
   */
  public static getInstance(): LexicalProvider | undefined {
    return LexicalProvider._instance;
  }

  /**
   * Send a message to a specific Lexical webview
   */
  public async sendToWebview(uri: vscode.Uri, message: unknown): Promise<void> {
    console.log(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      `[LexicalProvider] sendToWebview: uri=${uri.toString()}, message type=${(message as any)?.type}`,
    );
    const entry = this.webviews.get(uri.toString());
    if (entry) {
      console.log(`[LexicalProvider] Posting message to webview:`, message);
      await entry.webviewPanel.webview.postMessage(message);
    } else {
      console.warn(
        `[LexicalProvider] No webview found for URI: ${uri.toString()}`,
      );
      console.warn(
        `[LexicalProvider] Available webviews:`,
        Array.from(this.webviews.keys()),
      );
    }
  }

  /**
   * Refreshes collaboration config for all active webviews.
   * Called when auth state changes (login/logout) to update usernames.
   */
  public async refreshCollaborationConfigs(): Promise<void> {
    console.log(
      `[LexicalProvider] Refreshing collaboration configs for ${this.webviews.size} webview(s)`,
    );

    for (const [uriString, entry] of this.webviews.entries()) {
      try {
        const uri = vscode.Uri.parse(uriString);

        // Only refresh for Datalayer documents
        if (uri.scheme !== "datalayer") {
          continue;
        }

        // Get document from documents Map
        const document = this.documents.get(uriString);
        if (!document) {
          console.warn(
            `[LexicalProvider] No document found for ${uriString}, skipping`,
          );
          continue;
        }

        // Get updated collaboration config with new username
        const collaborationService = LexicalCollaborationService.getInstance();
        const collaborationConfig =
          await collaborationService.setupCollaboration(document);

        // Send updated config to webview
        if (collaborationConfig) {
          await entry.webviewPanel.webview.postMessage({
            type: "update",
            collaboration: collaborationConfig,
          });
          console.log(
            `[LexicalProvider] Updated collaboration config for ${uriString}`,
          );
        }
      } catch (error) {
        console.error(
          `[LexicalProvider] Failed to refresh collaboration config for ${uriString}:`,
          error,
        );
      }
    }
  }

  /**
   * Send a message to a specific Lexical webview and wait for response
   */
  public async sendToWebviewWithResponse(
    uri: vscode.Uri,
    message: unknown,
    requestId: string,
  ): Promise<unknown> {
    console.log(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      `[LexicalProvider] sendToWebviewWithResponse: uri=${uri.toString()}, message type=${(message as any)?.type}, requestId=${requestId}`,
    );
    const entry = this.webviews.get(uri.toString());
    if (!entry) {
      console.warn(
        `[LexicalProvider] No webview found for URI: ${uri.toString()}`,
      );
      console.warn(
        `[LexicalProvider] Available webviews:`,
        Array.from(this.webviews.keys()),
      );
      throw new Error(`No webview found for URI: ${uri.toString()}`);
    }

    return new Promise((resolve, reject) => {
      // Set up response handler with timeout
      const timeout = setTimeout(() => {
        this._callbacks.delete(requestId);
        reject(
          new Error(`Timeout waiting for response to request ${requestId}`),
        );
      }, 10000); // 10 second timeout

      // Store callback
      this._callbacks.set(requestId, (response: unknown) => {
        clearTimeout(timeout);
        resolve(response);
      });

      // Send message to webview
      console.log(`[LexicalProvider] Posting message to webview:`, message);
      entry.webviewPanel.webview.postMessage(message).then(
        () => {
          // Message sent successfully
        },
        (error) => {
          clearTimeout(timeout);
          this._callbacks.delete(requestId);
          reject(error);
        },
      );
    });
  }

  /**
   * Map of currently active webviews keyed by document URI.
   */
  private readonly webviews = new Map<
    string,
    {
      readonly resource: string;
      readonly webviewPanel: vscode.WebviewPanel;
    }
  >();

  /**
   * Map of document instances keyed by document URI.
   * Used for dirty state tracking and document operations.
   */
  private readonly documents = new Map<string, LexicalDocument>();

  /**
   * Map of Loro WebSocket adapters keyed by adapter ID.
   */
  private readonly loroAdapters = new Map<string, LoroWebSocketAdapter>();
  private readonly adapterCreationTimes = new Map<string, number>();
  private readonly adapterConnectionTimes = new Map<string, number>();
  private readonly adapterToWebview = new Map<string, string>(); // adapterId -> document URI

  /**
   * Auto-connect service for automatically connecting to runtimes
   */
  private readonly autoConnectService = new AutoConnectService();

  /**
   * Creates a new LexicalProvider.
   *
   * @param context - Extension context for resource access
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  /**
   * Initialize auth listener for userInfo updates.
   * Called after extension activation, passing authProvider directly to avoid circular dependency.
   */
  initializeAuthListener(
    authProvider: import("../services/core/authProvider").SDKAuthProvider,
  ): void {
    authProvider.onAuthStateChanged(() => {
      this.updateUserInfoInAllWebviews(authProvider);
    });
  }

  /**
   * Updates userInfo in all open lexical webviews when auth state changes (login/logout)
   */
  private updateUserInfoInAllWebviews(
    authProvider: import("../services/core/authProvider").SDKAuthProvider,
  ): void {
    const authState = authProvider.getAuthState();

    let userInfo: { username: string; userColor: string } | undefined;

    if (authState.isAuthenticated && authState.user) {
      const user = authState.user;
      const baseUsername =
        user?.displayName || user?.handle || user?.email || "Anonymous";
      const username = `${baseUsername} (VSCode)`;
      const userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

      userInfo = { username, userColor };
      console.log(
        "[LexicalProvider] Updating userInfo across all webviews:",
        userInfo,
      );
    } else {
      console.log("[LexicalProvider] Clearing userInfo (user logged out)");
    }

    // Send update to all open lexical webviews
    for (const [_uri, entry] of this.webviews.entries()) {
      entry.webviewPanel.webview.postMessage({
        type: "user-info-update",
        userInfo,
      });
    }
  }

  /**
   * Find document URI for a given webview panel
   */
  private getDocumentUriForPanel(
    panel: vscode.WebviewPanel,
  ): string | undefined {
    for (const [uri, entry] of this.webviews.entries()) {
      if (entry.webviewPanel === panel) {
        return uri;
      }
    }
    return undefined;
  }

  /**
   * Opens a custom document for the lexical editor.
   *
   * @param uri - Document URI to open
   * @param openContext - Context including backup information
   * @param _token - Cancellation token
   * @returns Promise resolving to the lexical document
   */
  override async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken,
  ): Promise<LexicalDocument> {
    // Check authentication for Datalayer documents
    if (uri.scheme === "datalayer") {
      const { getServiceContainer } = await import("../extension");
      const authProvider = getServiceContainer().authProvider;
      const authState = authProvider.getAuthState();

      if (!authState.isAuthenticated) {
        // Show login prompt
        const choice = await vscode.window.showWarningMessage(
          "You must be logged in to Datalayer to open remote documents. Would you like to log in now?",
          "Log In",
          "Cancel",
        );

        if (choice === "Log In") {
          // Trigger login command
          await vscode.commands.executeCommand("datalayer.login");

          // Check again after login attempt
          const newAuthState = authProvider.getAuthState();
          if (!newAuthState.isAuthenticated) {
            throw new Error(
              "Authentication required to open Datalayer documents",
            );
          }
        } else {
          // User cancelled
          throw new Error(
            "Authentication required to open Datalayer documents",
          );
        }
      }
    }

    const document: LexicalDocument = await LexicalDocument.create(
      uri,
      openContext.backupId,
      {
        getFileData: async () => {
          const webviewsForDocument = Array.from(this.webviews.values()).filter(
            (entry) => entry.resource === uri.toString(),
          );
          if (webviewsForDocument.length !== 1) {
            throw new Error("Expected exactly one webview for document");
          }
          const panel = webviewsForDocument[0].webviewPanel;
          const response = await this.postMessageWithResponse<
            number[] | undefined
          >(panel, "getFileData", {});
          return new Uint8Array(response ?? []);
        },
      },
    );

    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChange((_e) => {
        // Fire content change event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
      }),
    );

    listeners.push(
      document.onDidChangeContent((e) => {
        for (const webviewData of this.webviews.values()) {
          if (webviewData.resource === uri.toString()) {
            this.postMessage(webviewData.webviewPanel, "update", {
              content: e.content,
            });
          }
        }
      }),
    );

    // Store document instance for dirty state tracking
    this.documents.set(uri.toString(), document);

    document.onDidDispose(() => {
      disposeAll(listeners);
      this.documents.delete(uri.toString());
    });

    return document;
  }

  /**
   * Resolves a custom editor by setting up the webview and initializing collaboration.
   *
   * @param document - The lexical document to display
   * @param webviewPanel - The webview panel for the editor
   * @param _token - Cancellation token
   * @returns Promise that resolves when editor is ready
   */
  override async resolveCustomEditor(
    document: LexicalDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.webviews.set(document.uri.toString(), {
      resource: document.uri.toString(),
      webviewPanel,
    });

    // Register lexical document in the unified registry for tool operations
    // For lexicals: lexicalId = documentId (if remote) OR documentUri (if local)
    const lexicalId = document.uri.toString(); // TODO: Get actual documentId for remote lexicals
    getServiceContainer().documentRegistry.register(
      lexicalId,
      document.uri.toString(),
      "lexical",
      webviewPanel, // Register webview panel for tool execution messaging
    );

    // Register webview with KernelBridge for unified runtime handling
    const kernelBridge = getServiceContainer().kernelBridge;
    kernelBridge.registerWebview(document.uri, webviewPanel);

    // Register webview with outline provider for outline navigation
    const outlineProvider = getOutlineTreeProvider();
    if (outlineProvider) {
      outlineProvider.registerWebviewPanel(
        document.uri.toString(),
        webviewPanel,
      );
    }

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(async (e) => {
      if (e.type === "response") {
        // Handle response messages from webview (for sendToWebviewWithResponse)
        const { requestId, body } = e;
        if (requestId) {
          const callback = this._callbacks.get(requestId);
          if (callback) {
            this._callbacks.delete(requestId);
            callback(body);
          }
        }
      } else if (e.type === "llm-completion-request") {
        console.log("[LexicalProvider] LLM completion request received", {
          requestId: e.requestId,
          prefixLength: e.prefix?.length,
          suffixLength: e.suffix?.length,
          language: e.language,
          contentType: e.contentType,
        });

        // Handle LLM completion request from webview
        const completion = await this.getLLMCompletion(
          e.prefix,
          e.suffix,
          e.language,
          e.contentType || "code", // Default to 'code' for backward compatibility
        );

        console.log("[LexicalProvider] Sending LLM completion response", {
          requestId: e.requestId,
          completionLength: completion?.length,
        });

        webviewPanel.webview.postMessage({
          type: "llm-completion-response",
          requestId: e.requestId,
          completion,
        });
      } else if (e.type === "ready") {
        // Send content when webview signals it's ready
        // NOTE: This can be called multiple times if webview is reused for different documents
        // The webview will detect document URI changes and reset its store appropriately
        sendInitialContent().catch((error) => {
          console.error(
            "[LexicalProvider] Error sending initial content:",
            error,
          );
          vscode.window.showErrorMessage(
            `Failed to initialize Lexical editor: ${error.message}`,
          );
        });
      } else if (
        e.type === "connect" ||
        e.type === "disconnect" ||
        e.type === "message"
      ) {
        // Handle Loro collaboration messages
        this.handleLoroMessage(e, webviewPanel);
      } else {
        this.onMessage(webviewPanel, document, e);
      }
    });

    // Listen for theme changes
    const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(
      () => {
        const theme =
          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? "dark"
            : "light";
        webviewPanel.webview.postMessage({
          type: "theme-change",
          theme,
        });
      },
    );

    // Cleanup when panel is disposed
    webviewPanel.onDidDispose(() => {
      this.webviews.delete(document.uri.toString());
      kernelBridge.unregisterWebview(document.uri);
      themeChangeDisposable.dispose();

      // Clean up any Loro adapters for this document
      const docUri = document.uri.toString();
      for (const [
        adapterId,
        adapterDocUri,
      ] of this.adapterToWebview.entries()) {
        if (adapterDocUri === docUri) {
          const adapter = this.loroAdapters.get(adapterId);
          if (adapter) {
            adapter.dispose();
            this.loroAdapters.delete(adapterId);
            this.adapterCreationTimes.delete(adapterId);
            this.adapterConnectionTimes.delete(adapterId);
            this.adapterToWebview.delete(adapterId);
          }
        }
      }
    });

    // Function to send initial content
    const sendInitialContent = async () => {
      const isFromDatalayer = document.uri.scheme === "datalayer";

      if (isFromDatalayer) {
        document.setCollaborative(true);
      }

      const contentArray = Array.from(document.documentData);

      // Get user info from auth state (always, even for local files)
      // This allows CommentPlugin to show Datalayer username instead of random animal names
      let userInfo: { username: string; userColor: string } | undefined;
      try {
        const authService = getServiceContainer().authProvider;
        const authState = authService.getAuthState();

        if (authState.isAuthenticated && authState.user) {
          const user = authState.user;
          const baseUsername =
            user?.displayName || user?.handle || user?.email || "Anonymous";
          const username = `${baseUsername} (VSCode)`;
          const userColor =
            "#" + Math.floor(Math.random() * 16777215).toString(16);

          userInfo = { username, userColor };
          console.log("[LexicalProvider] User info for comments:", userInfo);
        }
      } catch (error) {
        console.error("[LexicalProvider] Failed to get user info:", error);
      }

      // Setup collaboration for Datalayer documents (remote only)
      let collaborationConfig: LexicalCollaborationConfig | undefined;
      if (isFromDatalayer) {
        try {
          const collaborationService =
            LexicalCollaborationService.getInstance();
          collaborationConfig =
            await collaborationService.setupCollaboration(document);
        } catch (error) {
          console.error("[LexicalProvider] Collaboration setup failed:", error);
          // Don't block editor loading if collaboration fails
        }
      }

      // Create a unique document ID that combines URI with Datalayer document ID if available
      // This ensures uniqueness even when two documents have the same name
      // Using :: separator which won't appear in file URIs
      const uniqueDocId = collaborationConfig?.documentId
        ? `${document.uri.toString()}::${collaborationConfig.documentId}`
        : document.uri.toString();

      webviewPanel.webview.postMessage({
        type: "update",
        content: contentArray,
        editable: true,
        collaboration: collaborationConfig,
        userInfo, // Always send if logged in, even for local files
        documentUri: document.uri.toString(), // Still include for logging
        documentId: uniqueDocId, // Unique ID for validation
        lexicalId: lexicalId, // Pass lexicalId for tool execution context
      });

      // Try auto-connect after sending initial content
      await this.tryAutoConnect(document.uri);
    };
  }

  /**
   * Saves a custom document.
   *
   * @param document - Document to save
   * @param cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  public override saveCustomDocument(
    document: LexicalDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.save(cancellation);
  }

  /**
   * Saves a custom document to a new location.
   *
   * @param document - Document to save
   * @param destination - Target URI for saving
   * @param cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  public override saveCustomDocumentAs(
    document: LexicalDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  /**
   * Reverts a custom document to its saved state.
   *
   * @param document - Document to revert
   * @param cancellation - Cancellation token
   * @returns Promise that resolves when revert is complete
   */
  public override revertCustomDocument(
    document: LexicalDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.revert(cancellation);
  }

  /**
   * Creates a backup of a custom document.
   *
   * @param document - Document to backup
   * @param context - Backup context with destination
   * @param cancellation - Cancellation token
   * @returns Promise resolving to backup descriptor
   */
  public override backupCustomDocument(
    document: LexicalDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  /**
   * Generates the HTML content for the Lexical editor webview.
   *
   * @param webview - The webview instance
   * @returns HTML content for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "dist",
        "lexicalWebview.js",
      ),
    );
    // Get base URI for loading additional resources like WASM
    const distUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist"),
    );
    const nonce = getNonce();

    // Read Pyodide version from configuration
    const pyodideVersion = vscode.workspace
      .getConfiguration("datalayer.pyodide")
      .get<string>("version", "0.27.3");

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <base href="${distUri}/">
        <!--
        Content Security Policy for Lexical Editor:
        - default-src 'none': Deny all by default for security
        - img-src: Allow images from extension and blob URLs
        - style-src: Allow styles from extension and inline styles (required for Lexical editor)
        - font-src: Allow fonts from extension
        - script-src: Require nonce for scripts, allow WASM execution (loro-crdt CRDT library)
        - connect-src: Allow secure connections for collaboration (WebSocket) and API calls
        - worker-src: Allow web workers from extension and blob URLs (required for Y.js collaboration)
        - frame-src: Allow YouTube embeds (required for YouTubeNode)

        Note: 'wasm-unsafe-eval' is required for loro-crdt WASM CRDT library
        Note: 'unsafe-eval' is required for AJV (JSON schema validator used by Jupyter dependencies)
        Note: sha256 hash allows specific inline script from ipywidgets manager library
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-eval' 'sha256-QUWd+IhSNNnJ1kUF1ufqJr+KJPFFB3LireYMloM7v9U=' https://cdnjs.cloudflare.com; connect-src ${webview.cspSource} https: wss: ws: data:; worker-src ${webview.cspSource} blob:; frame-src https://www.youtube.com;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Datalayer Lexical Editor</title>
        <script nonce="${nonce}">
          // Set webpack public path for dynamic imports and WASM loading
          window.__webpack_public_path__ = '${distUri}/';
        </script>
      </head>
      <body style="margin: 0; padding: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground);">
        <div id="root"></div>
        <!-- Set Pyodide base URI for browser-based Python -->
        <script nonce="${nonce}">
          window.__PYODIDE_BASE_URI__ = "https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full";
        </script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  /**
   * Registers lexical-specific message handlers.
   * Overrides base class to add lexical-specific handlers.
   */
  protected override registerMessageHandlers(): void {
    // Call base class to register common handlers
    super.registerMessageHandlers();

    // Handler for content changes
    this._messageRouter.registerHandler(
      "contentChanged",
      async (_message, context) => {
        // Update dirty state for local files (not Datalayer documents)
        if (!context.isFromDatalayer) {
          const document = this.documents.get(context.documentUri);
          if (document) {
            document.makeEdit({});
          }
        }
      },
    );

    // Handler for save command
    this._messageRouter.registerHandler("save", async (_message, context) => {
      if (!context.isFromDatalayer) {
        vscode.commands.executeCommand("workbench.action.files.save");
      }
    });
  }

  /**
   * Gets the URI for a lexical document.
   *
   * @param document - The lexical document
   * @returns The document URI
   */
  protected override getDocumentUri(document: LexicalDocument): vscode.Uri {
    return document.uri;
  }

  /**
   * Handles Loro collaboration messages from the webview.
   * Creates/manages WebSocket adapters and forwards messages.
   *
   * @param message - Message from webview
   * @param webviewPanel - The webview panel
   */
  private handleLoroMessage(
    message: {
      type: string;
      adapterId: string;
      data?: { websocketUrl?: string; [key: string]: unknown };
    },
    webviewPanel: vscode.WebviewPanel,
  ): void {
    const { type, adapterId, data } = message;

    if (!adapterId) {
      console.error("[LexicalProvider] Loro message missing adapterId");
      return;
    }

    if (type === "connect") {
      // Get WebSocket URL from data
      const websocketUrl = data?.websocketUrl;
      if (!websocketUrl) {
        console.error(
          "[LexicalProvider] Loro connect message missing websocketUrl",
        );
        webviewPanel.webview.postMessage({
          type: "error",
          adapterId,
          data: { message: "Missing websocketUrl in connect message" },
        });
        return;
      }

      // Check if adapter already exists
      const existingAdapter = this.loroAdapters.get(adapterId);
      if (existingAdapter) {
        // Adapter already exists - this happens due to React StrictMode double-mounting
        // Only send "connected" status if the adapter is actually connected
        // Otherwise the webview will try to send messages to a non-connected websocket
        if (existingAdapter.isConnected()) {
          webviewPanel.webview.postMessage({
            type: "status",
            adapterId,
            data: { status: "connected" },
          });
        } else {
          // Still connecting, send "connecting" status
          webviewPanel.webview.postMessage({
            type: "status",
            adapterId,
            data: { status: "connecting" },
          });
        }
        return;
      }

      const adapter = new LoroWebSocketAdapter(
        adapterId,
        websocketUrl,
        webviewPanel.webview,
      );

      this.loroAdapters.set(adapterId, adapter);
      this.adapterCreationTimes.set(adapterId, Date.now());

      // Track which webview owns this adapter for proper cleanup
      const documentUri = this.getDocumentUriForPanel(webviewPanel);
      if (documentUri) {
        this.adapterToWebview.set(adapterId, documentUri);
      }

      adapter.connect();
    } else if (type === "disconnect") {
      // Disconnect and remove adapter
      const adapter = this.loroAdapters.get(adapterId);
      if (adapter) {
        const creationTime = this.adapterCreationTimes.get(adapterId);
        const timeSinceCreation = creationTime
          ? Date.now() - creationTime
          : Infinity;

        // Check if this is a React StrictMode disconnect
        // These happen either:
        // 1. Before the WebSocket connects (within first few ms)
        // 2. Immediately after connection (within 100ms of creation)
        if (!adapter.isConnected() || timeSinceCreation < 1000) {
          return;
        }

        adapter.disconnect();
        this.loroAdapters.delete(adapterId);
        this.adapterCreationTimes.delete(adapterId);
        this.adapterConnectionTimes.delete(adapterId);
        this.adapterToWebview.delete(adapterId);
      }
    } else if (type === "message") {
      // Forward message to adapter
      const adapter = this.loroAdapters.get(adapterId);
      if (adapter) {
        adapter.handleMessage({
          type: "message",
          adapterId,
          data,
        });
      }
    }
  }

  /**
   * Get LLM completion for inline code completion in Lexical cells.
   *
   * @param prefix - Code before cursor
   * @param suffix - Code after cursor
   * @param language - Programming language
   * @returns Completion string or null if no models available
   */
  /**
   * Requests code completion from VS Code's Language Model API.
   * Uses GitHub Copilot if available, falls back to other models.
   *
   * @param prefix - Code before cursor position
   * @param suffix - Code after cursor position
   * @param language - Programming language (e.g., 'python')
   * @returns Completion text or null if unavailable
   *
   * @remarks
   * Requires VS Code 1.90+ with Language Model API enabled.
   * Automatically cleans markdown formatting from LLM responses.
   */
  private async getLLMCompletion(
    prefix: string,
    suffix: string,
    language: string,
    contentType: "code" | "prose" = "code",
  ): Promise<string | null> {
    try {
      // Check if Language Model API is available (VS Code 1.90+)
      if (!vscode.lm) {
        console.warn("[LexicalProvider] Language Model API not available");
        return null;
      }

      // Select available chat models (prefer Copilot)
      let models = await vscode.lm.selectChatModels({ vendor: "copilot" });

      // Fallback to any available model
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels();
      }

      if (models.length === 0) {
        console.warn("[LexicalProvider] No language models available");
        return null;
      }

      const model = models[0];

      // Build prompt based on content type
      const { getPromptForContentType } = await import("./completionPrompts");
      const prompt = getPromptForContentType(contentType, {
        language,
        prefix,
        suffix,
      });

      // Send request to LLM
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const justification =
        contentType === "code"
          ? "Code completion for Lexical Jupyter cell"
          : "Writing assistance for Lexical document";

      const response = await model.sendRequest(messages, {
        justification,
      });

      // Collect streamed response
      let completion = "";
      for await (const chunk of response.text) {
        completion += chunk;
      }

      // Clean up (remove markdown blocks if present)
      return this.cleanCompletion(completion);
    } catch (error) {
      console.error("[LexicalProvider] LLM completion error:", error);
      return null;
    }
  }

  /**
   * Clean LLM completion output by removing markdown code blocks.
   *
   * @param completion - Raw completion from LLM
   * @returns Cleaned completion
   */
  private cleanCompletion(completion: string): string {
    // Trim leading/trailing whitespace first
    completion = completion.trim();

    // Remove markdown code blocks if LLM wrapped response
    const codeBlockRegex = /^```[a-z]*\n([\s\S]*?)\n```$/;
    const match = completion.match(codeBlockRegex);
    if (match) {
      // Extract code and trim trailing newlines only (preserve meaningful spaces)
      return match[1].replace(/\n+$/, "");
    }

    // Remove trailing newlines from direct completions
    return completion.replace(/\n+$/, "");
  }

  /**
   * Attempts to auto-connect the document to a runtime using configured strategies.
   *
   * @param documentUri - URI of the document being opened
   */
  private async tryAutoConnect(documentUri: vscode.Uri): Promise<void> {
    try {
      const sdk = getServiceContainer().sdk;
      const authProvider = getServiceContainer()
        .authProvider as SDKAuthProvider;
      const runtimesTreeProvider = getRuntimesTreeProvider();

      // Get current runtime if any (no API for this yet, so pass undefined)
      const currentRuntime: RuntimeDTO | undefined = undefined;

      // Try auto-connect
      const result = await this.autoConnectService.connect(
        documentUri,
        currentRuntime,
        sdk,
        authProvider,
        runtimesTreeProvider,
      );

      if (result) {
        console.log(
          `[LexicalProvider] Auto-connect successful using "${result.strategyName}" for ${documentUri.fsPath}`,
        );

        // Connect the webview to the runtime via kernel bridge
        if (result.strategyName === "Pyodide") {
          // Use Pyodide-specific connection method
          await getServiceContainer().kernelBridge.connectWebviewDocumentToPyodide(
            documentUri,
          );
        } else if (result.runtime) {
          // Use cloud runtime connection method
          await getServiceContainer().kernelBridge.connectWebviewDocument(
            documentUri,
            result.runtime,
          );
        } else {
          console.warn(
            `[LexicalProvider] Strategy "${result.strategyName}" succeeded but provided no runtime`,
          );
        }
      }
    } catch (error) {
      console.error(
        `[LexicalProvider] Auto-connect error for ${documentUri.fsPath}:`,
        error,
      );
      // Don't show error to user - auto-connect is optional
    }
  }
}
