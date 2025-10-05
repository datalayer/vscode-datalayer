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
 * @module providers/notebookProvider
 */

import * as vscode from "vscode";
import { disposeAll } from "../utils/dispose";
import { getNotebookHtml } from "../ui/templates/notebookTemplate";
import { WebviewCollection } from "../utils/webviewCollection";
import { NotebookDocument, NotebookEdit } from "../models/notebookDocument";
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import { selectDatalayerRuntime } from "../ui/dialogs/runtimeSelector";
import { BaseDocumentProvider } from "./baseDocumentProvider";

/**
 * Custom editor provider for Jupyter notebooks with dual-mode support.
 * Handles both local file-based notebooks and collaborative Datalayer notebooks
 * with runtime management, webview communication, and real-time synchronization.
 */
export class NotebookProvider extends BaseDocumentProvider<NotebookDocument> {
  private static newNotebookFileId = 1;

  /**
   * Registers the notebook editor provider and commands.
   *
   * @param context - Extension context for resource management
   * @returns Disposable for cleanup
   */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new NotebookProvider(context);

    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.commands.registerCommand("datalayer.jupyter-notebook-new", () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage(
            "Creating new Datalayer notebook files currently requires opening a workspace",
          );
          return;
        }

        const uri = vscode.Uri.joinPath(
          workspaceFolders[0].uri,
          `new-${NotebookProvider.newNotebookFileId++}.ipynb`,
        ).with({ scheme: "untitled" });

        vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          NotebookProvider.viewType,
        );
      }),
    );

    // Register callback for runtime termination notifications
    import("../commands/internal").then(({ onRuntimeTerminated }) => {
      onRuntimeTerminated(async (uri: vscode.Uri) => {
        // Send kernel-terminated message to notebook webview
        const panels = provider.webviews.get(uri);
        if (panels) {
          const panel = Array.from(panels)[0];
          if (panel) {
            await panel.webview.postMessage({
              type: "kernel-terminated",
            });
          }
        }
      });
    });

    disposables.push(
      vscode.window.registerCustomEditorProvider(
        NotebookProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
          supportsMultipleEditorsPerDocument: false,
        },
      ),
    );

    return vscode.Disposable.from(...disposables);
  }

  private static readonly viewType = "datalayer.jupyter-notebook";

  /**
   * Tracks all known webviews
   */
  private readonly webviews = new WebviewCollection();

  /**
   * Creates a new NotebookProvider.
   *
   * @param context - Extension context for resource access
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);

    // Set fallback for kernel selection failures (Datalayer runtime selector)
    this._runtimeBridge.setKernelSelectionFallback((documentUri) => {
      const document = Array.from(
        this.webviews.get(documentUri),
      )[0] as unknown as {
        document: NotebookDocument;
      };
      if (document?.document) {
        this.showDatalayerRuntimeSelector(document.document);
      }
    });
  }

  /**
   * Opens a custom document for the notebook editor.
   *
   * @param uri - Document URI to open
   * @param openContext - Context including backup information
   * @param _token - Cancellation token
   * @returns Promise resolving to the notebook document
   */
  override async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken,
  ): Promise<NotebookDocument> {
    const document: NotebookDocument = await NotebookDocument.create(
      uri,
      openContext.backupId,
      {
        getFileData: async () => {
          const webviewsForDocument = Array.from(
            this.webviews.get(document.uri),
          );
          if (!webviewsForDocument.length) {
            throw new Error("Could not find webview to save for");
          }
          const panel = webviewsForDocument[0];
          const response = await this.postMessageWithResponse<number[]>(
            panel,
            "getFileData",
            {},
          );
          return new Uint8Array(response);
        },
      },
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
        },
      ),
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
        },
      ),
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
  override async resolveCustomEditor(
    document: NotebookDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // Register webview with kernel bridge for kernel communication
    getServiceContainer().kernelBridge.registerWebview(
      document.uri,
      webviewPanel,
    );

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage((e) =>
      this.onMessage(webviewPanel, document, e),
    );

    // Listen for theme changes
    const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(
      () => {
        const theme =
          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? "dark"
            : "light";
        this.postMessage(webviewPanel, "theme-change", { theme });
      },
    );

    webviewPanel.onDidDispose(() => {
      themeChangeDisposable.dispose();
      // Unregister from kernel bridge
      getServiceContainer().kernelBridge.unregisterWebview(document.uri);
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
            document.uri.scheme,
          );

          // Check if this is a Datalayer notebook (from spaces)
          const isDatalayerNotebook = document.uri.scheme === "datalayer";

          // Setup collaboration for Datalayer notebooks
          let collaborationConfig: object | undefined;
          if (isDatalayerNotebook) {
            try {
              const { NotebookCollaborationService } = await import(
                "../services/collaboration/notebookCollaboration"
              );
              const collaborationService =
                NotebookCollaborationService.getInstance();
              collaborationConfig =
                await collaborationService.setupCollaboration(document);
            } catch (error) {
              console.error(
                "[NotebookProvider] Collaboration setup failed:",
                error,
              );
              // Don't block editor loading if collaboration fails
            }
          }

          this.postMessage(webviewPanel, "init", {
            value: document.documentData,
            editable,
            theme,
            notebookId,
            collaboration: collaborationConfig,
          });
        }
      }
    });
  }

  /**
   * Saves a custom document.
   *
   * @param document - Document to save
   * @param cancellation - Cancellation token
   * @returns Promise that resolves when save is complete
   */
  public override saveCustomDocument(
    document: NotebookDocument,
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
    document: NotebookDocument,
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
    document: NotebookDocument,
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
    document: NotebookDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
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
   * Registers notebook-specific message handlers.
   * Overrides base class to add notebook content change handler.
   */
  protected override registerMessageHandlers(): void {
    // Call base class to register common handlers
    super.registerMessageHandlers();

    // Handler for notebook content changes
    this._messageRouter.registerHandler(
      "notebook-content-changed",
      async (message, context) => {
        // Only track changes for local notebooks, not Datalayer space notebooks
        const isDatalayerNotebook = !context.isFromDatalayer;

        if (isDatalayerNotebook) {
          const messageBody = message.body as {
            content?: Uint8Array | number[];
          };
          // Ensure content is a Uint8Array
          let content: Uint8Array;
          if (messageBody.content instanceof Uint8Array) {
            content = messageBody.content;
          } else if (Array.isArray(messageBody.content)) {
            // Convert array to Uint8Array if needed
            content = new Uint8Array(messageBody.content);
          } else {
            return;
          }

          // We need the document instance - get it from webviews
          const documentUri = vscode.Uri.parse(context.documentUri);
          const webviewPanel = Array.from(this.webviews.get(documentUri))[0];
          if (webviewPanel) {
            const doc = (
              webviewPanel as unknown as { document: NotebookDocument }
            ).document;
            if (doc) {
              doc.makeEdit({
                type: "content-update",
                content: content,
              });
            }
          }
        }
      },
    );
  }

  /**
   * Gets the URI for a notebook document.
   *
   * @param document - The notebook document
   * @returns The document URI
   */
  protected override getDocumentUri(document: NotebookDocument): vscode.Uri {
    return document.uri;
  }

  /**
   * Shows the Datalayer runtime selector dialog.
   * Helper method to avoid code duplication.
   *
   * @param document - The notebook document
   */
  private showDatalayerRuntimeSelector(document: NotebookDocument): void {
    const sdk = getServiceContainer().sdk;
    const authProvider = getServiceContainer().authProvider as SDKAuthProvider;

    selectDatalayerRuntime(sdk, authProvider)
      .then(async (runtime) => {
        if (runtime) {
          // Send selected runtime to webview via kernel bridge
          await getServiceContainer().kernelBridge.connectWebviewDocument(
            document.uri,
            runtime,
          );
        }
      })
      .catch((error) => {
        vscode.window.showErrorMessage(`Failed to select runtime: ${error}`);
      });
  }
}

/**
 * Tracks all webviews.
 */
