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
 * @module providers/lexicalDocumentProvider
 */

import * as vscode from "vscode";
import { disposeAll } from "../utils/dispose";
import { getNonce } from "../utils/webviewSecurity";
import {
  LexicalDocument,
  LexicalDocumentDelegate,
} from "../models/lexicalDocument";
import {
  LexicalCollaborationService,
  LexicalCollaborationConfig,
} from "../services/lexicalCollaboration";

/**
 * Custom editor provider for Lexical documents.
 * Handles webview lifecycle management, document state synchronization,
 * and collaboration features for rich text editing.
 *
 * @example
 * ```typescript
 * const provider = new LexicalDocumentProvider(context);
 * // Provider is registered automatically via static register method
 * ```
 */
export class LexicalDocumentProvider
  implements vscode.CustomEditorProvider<LexicalDocument>
{
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
          "Creating new Datalayer Lexical documents currently requires opening a workspace"
        );
        return;
      }

      const uri = vscode.Uri.joinPath(
        workspaceFolders[0].uri,
        `new-${Date.now()}.lexical`
      ).with({ scheme: "untitled" });

      vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        LexicalDocumentProvider.viewType
      );
    });

    return vscode.window.registerCustomEditorProvider(
      LexicalDocumentProvider.viewType,
      new LexicalDocumentProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
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
   * Creates a new LexicalDocumentProvider.
   *
   * @param _context - Extension context for resource access
   */
  constructor(private readonly _context: vscode.ExtensionContext) {}

  /**
   * Opens a custom document for the lexical editor.
   *
   * @param uri - Document URI to open
   * @param openContext - Context including backup information
   * @param _token - Cancellation token
   * @returns Promise resolving to the lexical document
   */
  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<LexicalDocument> {
    const document: LexicalDocument = await LexicalDocument.create(
      uri,
      openContext.backupId,
      {
        getFileData: async () => {
          const webviewsForDocument = Array.from(this.webviews.values()).filter(
            (entry) => entry.resource === uri.toString()
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
      }
    );

    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChange((e) => {
        // Fire content change event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
      })
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
      })
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
  async resolveCustomEditor(
    document: LexicalDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.webviews.set(document.uri.toString(), {
      resource: document.uri.toString(),
      webviewPanel,
    });

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
        sendInitialContent();
      } else {
        this.onMessage(document, e);
      }
    });

    // Cleanup when panel is disposed
    webviewPanel.onDidDispose(() => {
      this.webviews.delete(document.uri.toString());
    });

    // Function to send initial content
    const sendInitialContent = async () => {
      const isFromDatalayer = document.uri.scheme === "datalayer";

      if (isFromDatalayer) {
        document.setCollaborative(true);
      }

      const contentArray = Array.from(document.documentData);

      console.log("[LexicalEditor] Sending initial content to webview");
      console.log("[LexicalEditor] Content length:", contentArray.length);

      // Setup collaboration for Datalayer documents
      let collaborationConfig: LexicalCollaborationConfig | undefined;
      if (isFromDatalayer) {
        const collaborationService = LexicalCollaborationService.getInstance();
        collaborationConfig = await collaborationService.setupCollaboration(
          document
        );
      }

      webviewPanel.webview.postMessage({
        type: "update",
        content: contentArray,
        editable: true,
        collaboration: collaborationConfig,
      });
    };
  }

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<LexicalDocument>
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
    document: LexicalDocument,
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
    document: LexicalDocument,
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
    document: LexicalDocument,
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
    document: LexicalDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
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
        "lexicalWebview.js"
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "webview",
        "LexicalEditor.css"
      )
    );
    // Get the codicon CSS file from dist folder
    const codiconCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist", "codicon.css")
    );
    // Get base URI for loading additional resources like WASM
    const distUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist")
    );
    const nonce = getNonce();

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <base href="${distUri}/">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-eval'; connect-src ${webview.cspSource} https: wss: ws: data:; worker-src ${webview.cspSource} blob:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconCssUri}" rel="stylesheet">
        <title>Datalayer Lexical Editor</title>
        <script nonce="${nonce}">
          // Set webpack public path for dynamic imports and WASM loading
          window.__webpack_public_path__ = '${distUri}/';
        </script>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private _requestId = 1;
  private readonly _callbacks = new Map<number, (response: any) => void>();

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
    const requestId = this._requestId++;
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
   */
  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any
  ): void {
    panel.webview.postMessage({ type, body });
  }

  /**
   * Handles messages received from the webview.
   *
   * @param document - Associated document
   * @param message - Received message
   */
  private onMessage(document: LexicalDocument, message: any) {
    // Check if this document is from Datalayer spaces
    const isFromDatalayer = document.uri.scheme === "datalayer";

    switch (message.type) {
      case "response": {
        const callback = this._callbacks.get(message.requestId);
        callback?.(message.body);
        return;
      }
      case "contentChanged": {
        // Mark as dirty only for local files (not Datalayer)
        if (!isFromDatalayer) {
          document.makeEdit(message);
        }
        return;
      }
      case "save": {
        // Handle save command (Cmd/Ctrl+S)
        if (!isFromDatalayer) {
          vscode.commands.executeCommand("workbench.action.files.save");
        }
        return;
      }
      case "ready": {
        // Handled in the message listener above
        return;
      }
    }
  }
}
