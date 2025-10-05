/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom editor provider for Lexical document files (.lexical).
 * Handles webview lifecycle management, document editing, and collaboration features
 * for both local and Datalayer platform documents.
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
import { getServiceContainer } from "../extension";
import type { Runtime } from "../../../core/lib/client/models/Runtime";
import { BaseDocumentProvider } from "./baseDocumentProvider";
import { LoroWebSocketAdapter } from "../services/collaboration/loroWebSocketAdapter";

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
        `new-${Date.now()}.lexical`,
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

    // Register internal command for broadcasting kernel selection
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "datalayer.internal.kernelSelected",
        async (runtime: unknown) => {
          // Runtime tracking is now handled by centralized commands/internal.ts
          // via datalayer.internal.runtimeConnected command called by KernelBridge

          // Broadcast using centralized KernelBridge
          await kernelBridge.broadcastKernelSelected(runtime as Runtime);
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
   * Map of Loro WebSocket adapters keyed by adapter ID.
   */
  private readonly loroAdapters = new Map<string, LoroWebSocketAdapter>();

  /**
   * Creates a new LexicalProvider.
   *
   * @param context - Extension context for resource access
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);
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

    document.onDidDispose(() => disposeAll(listeners));

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

    // Register webview with KernelBridge for unified runtime handling
    const kernelBridge = getServiceContainer().kernelBridge;
    kernelBridge.registerWebview(document.uri, webviewPanel);

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Store a flag to track when webview is ready
    let webviewReady = false;

    webviewPanel.webview.onDidReceiveMessage((e) => {
      if (e.type === "ready" && !webviewReady) {
        webviewReady = true;
        // Send content when webview signals it's ready
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

    // Cleanup when panel is disposed
    webviewPanel.onDidDispose(() => {
      this.webviews.delete(document.uri.toString());
      kernelBridge.unregisterWebview(document.uri);

      // Clean up any Loro adapters for this document
      const docUri = document.uri.toString();
      for (const [adapterId, adapter] of this.loroAdapters.entries()) {
        if (adapterId.includes(docUri)) {
          adapter.dispose();
          this.loroAdapters.delete(adapterId);
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

      // Setup collaboration for Datalayer documents
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

      webviewPanel.webview.postMessage({
        type: "update",
        content: contentArray,
        editable: true,
        collaboration: collaborationConfig,
      });
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

        Note: 'wasm-unsafe-eval' is required for loro-crdt WASM CRDT library
        Note: 'unsafe-eval' is required for AJV (JSON schema validator used by Jupyter dependencies)
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-eval'; connect-src ${webview.cspSource} https: wss: ws: data:; worker-src ${webview.cspSource} blob:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Datalayer Lexical Editor</title>
        <script nonce="${nonce}">
          // Set webpack public path for dynamic imports and WASM loading
          window.__webpack_public_path__ = '${distUri}/';
        </script>
      </head>
      <body style="margin: 0; padding: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground);">
        <div id="root"></div>
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
      async (_message, _context) => {
        // TODO: Implement dirty state tracking for local files
        // This is a limitation of the current refactoring - we need access to the document instance
        // to call makeEdit(), but it's not available in the message context
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
      // Create a new WebSocket adapter
      if (this.loroAdapters.has(adapterId)) {
        console.warn(`[LexicalProvider] Adapter ${adapterId} already exists`);
        return;
      }

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

      console.log(
        `[LexicalProvider] Creating Loro adapter ${adapterId} for ${websocketUrl}`,
      );

      const adapter = new LoroWebSocketAdapter(
        adapterId,
        websocketUrl,
        webviewPanel.webview,
      );

      this.loroAdapters.set(adapterId, adapter);
      adapter.connect();
    } else if (type === "disconnect") {
      // Disconnect and remove adapter
      const adapter = this.loroAdapters.get(adapterId);
      if (adapter) {
        adapter.disconnect();
        this.loroAdapters.delete(adapterId);
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
      } else {
        console.warn(
          `[LexicalProvider] No adapter found for ${adapterId}, creating on demand`,
        );
      }
    }
  }
}
