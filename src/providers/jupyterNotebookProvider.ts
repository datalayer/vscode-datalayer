/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom editor provider for Jupyter notebooks with Datalayer platform integration.
 * Handles both local notebooks and collaborative Datalayer notebooks with real-time
 * synchronization, runtime management, and webview communication.
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 * @module providers/jupyterNotebookProvider
 */

import * as vscode from "vscode";
import { disposeAll } from "../utils/dispose";
import { getNotebookHtml } from "../utils/notebookTemplate";
import { WebviewCollection } from "../utils/webviewCollection";
import {
  NotebookDocument,
  NotebookDocumentDelegate,
  NotebookEdit,
} from "../models/notebookDocument";
import { NotebookNetworkService } from "../services/notebookNetwork";
import { SDKAuthProvider } from "../services/authProvider";
import { KernelBridge } from "../services/kernelBridge";
import { getSDKInstance } from "../services/sdkAdapter";
import { selectDatalayerRuntime } from "../utils/runtimeSelector";
import { showKernelSelector } from "../utils/kernelSelector";
import type { ExtensionMessage } from "../utils/messages";

/**
 * Custom editor provider for Jupyter notebooks with dual-mode support.
 * Handles both local file-based notebooks and collaborative Datalayer notebooks
 * with runtime management, webview communication, and real-time synchronization.
 */
export class JupyterNotebookProvider
  implements vscode.CustomEditorProvider<NotebookDocument>
{
  private static newNotebookFileId = 1;

  private readonly _networkService = new NotebookNetworkService();
  private readonly _kernelBridge: KernelBridge;

  /**
   * Registers the notebook editor provider and commands.
   *
   * @param context - Extension context for resource management
   * @returns Disposable for cleanup
   */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    vscode.commands.registerCommand("datalayer.jupyter-notebook-new", () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          "Creating new Datalayer notebook files currently requires opening a workspace"
        );
        return;
      }

      const uri = vscode.Uri.joinPath(
        workspaceFolders[0].uri,
        `new-${JupyterNotebookProvider.newNotebookFileId++}.ipynb`
      ).with({ scheme: "untitled" });

      vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        JupyterNotebookProvider.viewType
      );
    });

    return vscode.window.registerCustomEditorProvider(
      JupyterNotebookProvider.viewType,
      new JupyterNotebookProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  private static readonly viewType = "datalayer.jupyter-notebook";

  /**
   * Tracks all known webviews
   */
  private readonly webviews = new WebviewCollection();

  private _requestId = 1;
  private readonly _callbacks = new Map<string, (response: any) => void>();
  private readonly _context: vscode.ExtensionContext;

  /**
   * Creates a new JupyterNotebookProvider.
   *
   * @param context - Extension context for resource access
   */
  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    const sdk = getSDKInstance();
    const authProvider = SDKAuthProvider.getInstance();
    this._kernelBridge = new KernelBridge(sdk, authProvider);
  }

  /**
   * Opens a custom document for the notebook editor.
   *
   * @param uri - Document URI to open
   * @param openContext - Context including backup information
   * @param _token - Cancellation token
   * @returns Promise resolving to the notebook document
   */
  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<NotebookDocument> {
    const document: NotebookDocument = await NotebookDocument.create(
      uri,
      openContext.backupId,
      {
        getFileData: async () => {
          const webviewsForDocument = Array.from(
            this.webviews.get(document.uri)
          );
          if (!webviewsForDocument.length) {
            throw new Error("Could not find webview to save for");
          }
          const panel = webviewsForDocument[0];
          const response = await this.postMessageWithResponse<number[]>(
            panel,
            "getFileData",
            {}
          );
          return new Uint8Array(response);
        },
      }
    );

    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChange(
        (e: { readonly label: string; undo(): void; redo(): void }) => {
          // Tell VS Code that the document has been edited by the user.
          this._onDidChangeCustomDocument.fire({
            document,
            ...e,
          });
        }
      )
    );

    listeners.push(
      document.onDidChangeContent(
        (e: {
          readonly content?: Uint8Array;
          readonly edits: readonly NotebookEdit[];
        }) => {
          // Update all webviews when the document changes
          for (const webviewPanel of this.webviews.get(document.uri)) {
            this.postMessage(webviewPanel, "update", {
              edits: e.edits,
              content: e.content,
            });
          }
        }
      )
    );

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  /**
   * Resolves a custom editor by setting up the webview and initializing communication.
   *
   * @param document - The notebook document to display
   * @param webviewPanel - The webview panel for the editor
   * @param _token - Cancellation token
   * @returns Promise that resolves when editor is ready
   */
  async resolveCustomEditor(
    document: NotebookDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);
    
    // Register webview with kernel bridge for kernel communication
    this._kernelBridge.registerWebview(document.uri, webviewPanel);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage((e) =>
      this.onMessage(webviewPanel, document, e)
    );

    // Listen for theme changes
    const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(
      () => {
        const theme =
          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? "dark"
            : "light";
        this.postMessage(webviewPanel, "theme-change", { theme });
      }
    );

    webviewPanel.onDidDispose(() => {
      themeChangeDisposable.dispose();
      // Unregister from kernel bridge
      this._kernelBridge.unregisterWebview(document.uri);
      // WebviewCollection automatically removes the entry when disposed
    });

    // Wait for the webview to be properly ready before we init
    webviewPanel.webview.onDidReceiveMessage(async (e) => {
      if (e.type === "ready") {
        // Detect VS Code theme
        const theme =
          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? "dark"
            : "light";

        const notebookId = `notebook-${document.uri
          .toString()
          .replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}`;

        if (document.uri.scheme === "untitled") {
          this.postMessage(webviewPanel, "init", {
            untitled: true,
            editable: true,
            theme,
            notebookId,
          });
        } else {
          const editable = vscode.workspace.fs.isWritableFileSystem(
            document.uri.scheme
          );

          // Check if this is a Datalayer notebook (from spaces)
          const isDatalayerNotebook = document.uri.scheme === "datalayer";

          // Get document ID and server info for Datalayer notebooks
          let documentId: string | undefined;
          let serverUrl: string | undefined;
          let token: string | undefined;

          if (isDatalayerNotebook) {
            // Get the Datalayer server configuration
            const config = vscode.workspace.getConfiguration("datalayer");
            serverUrl = config.get<string>(
              "serverUrl",
              "https://prod1.datalayer.run"
            );

            // Get the authentication token
            const authService = SDKAuthProvider.getInstance();
            const authToken = authService.getToken();
            if (authToken) {
              token = authToken;
            }

            // First try to get metadata from document bridge
            const { DocumentBridge } = await import(
              "../services/documentBridge"
            );
            const documentBridge = DocumentBridge.getInstance();
            const metadata = documentBridge.getDocumentMetadata(document.uri);

            if (metadata && metadata.document.uid) {
              documentId = metadata.document.uid;
              console.log(
                "[NotebookEditor] Got document ID from metadata:",
                documentId
              );
            } else {
              // Fallback: try to extract document ID from the filename
              const filename = document.uri.path.split("/").pop() || "";
              const match = filename.match(/_([a-zA-Z0-9-]+)\.ipynb$/);
              documentId = match ? match[1] : undefined;

              if (documentId) {
                console.log(
                  "[NotebookEditor] Got document ID from filename fallback:",
                  documentId
                );
              }
            }
          }

          this.postMessage(webviewPanel, "init", {
            value: document.documentData,
            editable,
            isDatalayerNotebook,
            theme,
            documentId,
            serverUrl,
            token,
            notebookId,
          });
        }
      }
    });
  }

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<NotebookDocument>
  >();
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event;

  /**
   * Saves a custom document.
   *
   * @param document - Document to save
   * @param cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  public saveCustomDocument(
    document: NotebookDocument,
    cancellation: vscode.CancellationToken
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
  public saveCustomDocumentAs(
    document: NotebookDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
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
  public revertCustomDocument(
    document: NotebookDocument,
    cancellation: vscode.CancellationToken
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
  public backupCustomDocument(
    document: NotebookDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  /**
   * Get the static HTML used for the editor's webviews.
   *
   * @param webview - The webview instance
   * @returns HTML content for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    return getNotebookHtml(webview, this._context.extensionUri);
  }

  /**
   * Posts a message to webview and waits for response.
   *
   * @param panel - Target webview panel
   * @param type - Message type
   * @param body - Message body
   * @returns Promise resolving to the response
   */
  private postMessageWithResponse<R = unknown>(
    panel: vscode.WebviewPanel,
    type: string,
    body: any
  ): Promise<R> {
    const requestId = (this._requestId++).toString();
    const p = new Promise<R>((resolve) =>
      this._callbacks.set(requestId, resolve)
    );
    panel.webview.postMessage({ type, requestId, body });
    return p;
  }

  /**
   * Posts a message to webview without expecting response.
   *
   * @param panel - Target webview panel
   * @param type - Message type
   * @param body - Message body
   * @param id - Optional message ID
   */
  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any,
    id?: string
  ): void {
    panel.webview.postMessage({ type, body, id });
  }

  /**
   * Handles messages received from the webview.
   *
   * @param webview - Source webview panel
   * @param document - Associated document
   * @param message - Received message
   */
  private onMessage(
    webview: vscode.WebviewPanel,
    document: NotebookDocument,
    message: ExtensionMessage
  ) {
    console.log("[JupyterNotebookProvider] Received message from webview:", message.type);

    switch (message.type) {
      case "ready":
        // Handle in resolveCustomEditor
        return;
      case "select-runtime":
      case "select-kernel": {
        console.log("[JupyterNotebookProvider] Received select-kernel message from webview");

        // Show the kernel selector with available options
        const sdk = getSDKInstance();
        const authProvider = SDKAuthProvider.getInstance();

        // Pass the document URI and kernel bridge so the kernel can be connected
        showKernelSelector(sdk, authProvider, this._kernelBridge, document.uri).then(() => {
          console.log("[JupyterNotebookProvider] Kernel selection completed");
        }).catch((error) => {
          console.error("[JupyterNotebookProvider] Kernel selection failed:", error);
          // Fallback to Datalayer runtime selector
          this.showDatalayerRuntimeSelector(document);
        });

        return;
      }

      case "http-request": {
        this._networkService.forwardRequest(message, webview);
        return;
      }

      case "response": {
        const callback = this._callbacks.get(message.requestId!);
        if (callback) {
          callback(message.body);
          this._callbacks.delete(message.requestId!);
        } else {
          console.warn(
            "[NotebookEditor] No callback found for requestId:",
            message.requestId
          );
        }
        return;
      }

      case "websocket-open": {
        this._networkService.openWebsocket(message, webview);
        return;
      }

      case "websocket-message": {
        this._networkService.sendWebsocketMessage(message);
        return;
      }

      case "websocket-close": {
        this._networkService.closeWebsocket(message);
        return;
      }

      case "notebook-content-changed": {
        // Only track changes for local notebooks, not Datalayer space notebooks
        const isDatalayerNotebook = document.uri.scheme === "datalayer";
        console.log("[NotebookEditor] notebook-content-changed received", {
          isDatalayerNotebook,
          scheme: document.uri.scheme,
          hasContent: !!message.body?.content,
          contentType: message.body?.content?.constructor?.name,
          contentLength: message.body?.content?.length,
        });

        if (!isDatalayerNotebook) {
          console.log(
            "[NotebookEditor] Processing content change for local notebook"
          );

          // Ensure content is a Uint8Array
          let content: Uint8Array;
          if (message.body.content instanceof Uint8Array) {
            content = message.body.content;
          } else if (Array.isArray(message.body.content)) {
            // Convert array to Uint8Array if needed
            content = new Uint8Array(message.body.content);
          } else {
            console.error(
              "[NotebookEditor] Invalid content type:",
              typeof message.body.content
            );
            return;
          }

          console.log(
            "[NotebookEditor] Making edit with content size:",
            content.length
          );
          document.makeEdit({
            type: "content-update",
            content: content,
          });
          console.log(
            "[NotebookEditor] Edit made, document should be marked dirty"
          );
        } else {
          console.log(
            "[NotebookEditor] Skipping content change for Datalayer notebook"
          );
        }
        return;
      }

      // This case should not happen as getFileData is handled differently
      case "getFileData": {
        console.warn("[NotebookEditor] Unexpected getFileData message");
        return;
      }
    }
    console.warn(`Unknown message ${message.type}.`, message);
  }

  /**
   * Shows the Datalayer runtime selector dialog.
   * Helper method to avoid code duplication.
   *
   * @param document - The notebook document
   */
  private showDatalayerRuntimeSelector(document: NotebookDocument): void {
    const sdk = getSDKInstance();
    const authProvider = SDKAuthProvider.getInstance();

    selectDatalayerRuntime(sdk, authProvider).then(async (runtime) => {
      console.log("[JupyterNotebookProvider] selectDatalayerRuntime promise resolved with:", runtime);
      if (runtime) {
        console.log("[JupyterNotebookProvider] Runtime selected:", runtime);

        // Send selected runtime to webview via kernel bridge
        await this._kernelBridge.connectWebviewNotebook(document.uri, runtime);
      }
    }).catch((error) => {
      console.error("[JupyterNotebookProvider] Failed to select runtime:", error);
      vscode.window.showErrorMessage(`Failed to select runtime: ${error}`);
    });
  }
}

/**
 * Tracks all webviews.
 */
