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
import {
  getServiceContainer,
  getOutlineTreeProvider,
  getRuntimesTreeProvider,
} from "../extension";
import { selectDatalayerRuntime } from "../ui/dialogs/runtimeSelector";
import { BaseDocumentProvider } from "./baseDocumentProvider";
import { AutoConnectService } from "../services/autoConnect/autoConnectService";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";

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

    // Register internal command to send messages to webview
    // This command routes to both Notebook and Lexical webviews
    disposables.push(
      vscode.commands.registerCommand(
        "datalayer.internal.document.sendToWebview",
        async (uriString: string, message: unknown) => {
          const uri = vscode.Uri.parse(uriString);

          // Try notebook webviews first
          const webviewPanels = provider.webviews.get(uri);
          if (webviewPanels) {
            for (const panel of webviewPanels) {
              await panel.webview.postMessage(message);
            }
            return;
          }

          // Try Lexical webviews
          const { LexicalProvider } = await import("./lexicalProvider");
          const lexicalProvider = LexicalProvider.getInstance();
          if (lexicalProvider) {
            await lexicalProvider.sendToWebview(uri, message);
          } else {
            console.warn(
              `[NotebookProvider] No webview found for URI: ${uri.toString()}`,
            );
          }
        },
      ),
    );

    // Register internal command to send messages to webview WITH response
    // This command routes to both Notebook and Lexical webviews and waits for response
    disposables.push(
      vscode.commands.registerCommand(
        "datalayer.internal.document.sendToWebviewWithResponse",
        async (
          uriString: string,
          message: unknown,
          requestId: string,
        ): Promise<unknown> => {
          const uri = vscode.Uri.parse(uriString);

          // Try notebook webviews first
          const webviewPanels = provider.webviews.get(uri);
          if (webviewPanels) {
            const panel = Array.from(webviewPanels)[0];
            if (panel) {
              return provider.sendToWebviewWithResponse(
                panel,
                message,
                requestId,
              );
            }
          }

          // Try Lexical webviews
          const { LexicalProvider } = await import("./lexicalProvider");
          const lexicalProvider = LexicalProvider.getInstance();
          if (lexicalProvider) {
            return lexicalProvider.sendToWebviewWithResponse(
              uri,
              message,
              requestId,
            );
          }

          throw new Error(`No webview found for URI: ${uri.toString()}`);
        },
      ),
    );

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
            // Retain context when hidden for better UX (no reload on tab switch)
            // We handle JupyterConfig singleton reset via resetJupyterConfigPatch() in webview
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
   * Auto-connect service for automatically connecting to runtimes
   */
  private readonly autoConnectService = new AutoConnectService();

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
   * Send a message to a webview panel and wait for a response.
   * Uses the request/response pattern inherited from BaseDocumentProvider.
   *
   * @param panel - Webview panel to send message to
   * @param message - Message to send (should include type and requestId)
   * @param requestId - Request ID to match response
   * @returns Promise resolving to the response
   */
  public async sendToWebviewWithResponse(
    panel: vscode.WebviewPanel,
    message: unknown,
    requestId: string,
  ): Promise<unknown> {
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
      panel.webview.postMessage(message).then(
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
    // Check authentication for Datalayer documents
    if (uri.scheme === "datalayer") {
      const authProvider = getServiceContainer().authProvider;
      const authState = authProvider.getAuthState();

      if (!authState.isAuthenticated) {
        // Show login prompt
        const choice = await vscode.window.showWarningMessage(
          "You must be logged in to Datalayer to open remote notebooks. Would you like to log in now?",
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
              "Authentication required to open Datalayer notebooks",
            );
          }
        } else {
          // User cancelled
          throw new Error(
            "Authentication required to open Datalayer notebooks",
          );
        }
      }
    }

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

    // Register webview with outline provider for outline navigation
    const outlineProvider = getOutlineTreeProvider();
    if (outlineProvider) {
      outlineProvider.registerWebviewPanel(
        document.uri.toString(),
        webviewPanel,
      );
    }

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
        console.log("[NotebookProvider] LLM completion request received", {
          requestId: e.requestId,
          prefixLength: e.prefix?.length,
          suffixLength: e.suffix?.length,
          language: e.language,
        });

        // Handle LLM completion request from webview
        const completion = await this.getLLMCompletion(
          e.prefix,
          e.suffix,
          e.language,
        );

        console.log("[NotebookProvider] Sending LLM completion response", {
          requestId: e.requestId,
          completionLength: completion?.length,
        });

        webviewPanel.webview.postMessage({
          type: "llm-completion-response",
          requestId: e.requestId,
          completion,
        });
      } else if (e.type === "ready") {
        // Detect VS Code theme
        const theme =
          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? "dark"
            : "light";

        if (document.uri.scheme === "untitled") {
          // Use URI as the unique ID for untitled notebooks
          const notebookId = document.uri.toString();

          // For untitled notebooks, send empty notebook structure if document has no data
          const value =
            document.documentData.length > 0
              ? document.documentData
              : new TextEncoder().encode(
                  JSON.stringify({
                    cells: [],
                    metadata: {},
                    nbformat: 4,
                    nbformat_minor: 5,
                  }),
                );

          this.postMessage(webviewPanel, "init", {
            value,
            untitled: true,
            editable: true,
            theme,
            notebookId,
            documentUri: document.uri.toString(), // For logging
          });
        } else {
          const editable = vscode.workspace.fs.isWritableFileSystem(
            document.uri.scheme,
          );

          // Check if this is a Datalayer notebook (from spaces)
          const isDatalayerNotebook = document.uri.scheme === "datalayer";

          // Get document ID, server URL, and token for Datalayer notebooks
          let documentId: string | undefined;
          let serverUrl: string | undefined;
          let token: string | undefined;

          if (isDatalayerNotebook) {
            // Get the Datalayer server configuration
            const config =
              vscode.workspace.getConfiguration("datalayer.services");
            serverUrl = config.get<string>(
              "spacerUrl",
              "https://prod1.datalayer.run",
            );

            // Get the authentication token
            const authService = getServiceContainer().authProvider;
            const authToken = authService.getToken();
            if (authToken) {
              token = authToken;
            }

            // Extract document ID from URI query parameter (embedded by DocumentBridge)
            const queryParams = new URLSearchParams(document.uri.query);
            const docIdFromQuery = queryParams.get("docId");

            if (docIdFromQuery) {
              documentId = docIdFromQuery;
            } else {
              // Try to extract from URI path: datalayer://Space/DOCUMENT_UID/Document.ipynb
              const pathParts = document.uri.path.split("/").filter((p) => p);
              if (pathParts.length >= 2) {
                // Second to last part is the document UID
                documentId = pathParts[pathParts.length - 2];
              }

              // If still no document ID, try metadata lookup as last resort
              if (!documentId) {
                try {
                  const { DocumentBridge } = await import(
                    "../services/bridges/documentBridge"
                  );
                  const documentBridge =
                    await DocumentBridge.getInstanceAsync();
                  const metadata = documentBridge.getDocumentMetadata(
                    document.uri,
                  );

                  if (metadata && metadata.document.uid) {
                    documentId = metadata.document.uid;
                  }
                } catch (error) {
                  // DocumentBridge not ready or metadata not found
                }
              }
            }
          }

          // Use actual document ID for Datalayer notebooks, URI for local files
          const notebookId = documentId || document.uri.toString();

          // Register the notebook in the adapter registry for tool operations
          getServiceContainer().documentRegistry.register(
            notebookId,
            document.uri.toString(),
            "notebook",
            webviewPanel, // Register webview panel for tool execution messaging
          );

          this.postMessage(webviewPanel, "init", {
            value: document.documentData,
            editable,
            isDatalayerNotebook,
            theme,
            documentId,
            serverUrl,
            token,
            notebookId,
            documentUri: document.uri.toString(), // For logging
          });

          // Try auto-connect after init
          await this.tryAutoConnect(document.uri);
        }
      }
    });
  }

  /**
   * Get LLM completion from VS Code Language Model API.
   *
   * @param prefix - Code before cursor
   * @param suffix - Code after cursor
   * @param language - Programming language
   * @returns Completion string or null
   */
  private async getLLMCompletion(
    prefix: string,
    suffix: string,
    language: string,
  ): Promise<string | null> {
    try {
      // Check if Language Model API is available (VS Code 1.90+)
      if (!vscode.lm) {
        console.warn("[NotebookProvider] Language Model API not available");
        return null;
      }

      // Select available chat models (prefer Copilot)
      let models = await vscode.lm.selectChatModels({ vendor: "copilot" });

      // Fallback to any available model
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels();
      }

      if (models.length === 0) {
        console.warn("[NotebookProvider] No language models available");
        return null;
      }

      const model = models[0];

      // Build prompt
      const prompt = `Complete the following ${language} code. Only return the completion, no explanations or markdown.

\`\`\`${language}
${prefix}<CURSOR>${suffix}
\`\`\`

Complete the code at <CURSOR>:`;

      // Send request to LLM
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const response = await model.sendRequest(messages, {
        justification: "Code completion for Jupyter notebook cell",
      });

      // Collect streamed response
      let completion = "";
      for await (const chunk of response.text) {
        completion += chunk;
      }

      // Clean up (remove markdown blocks if present)
      return this.cleanCompletion(completion);
    } catch (error) {
      console.error("[NotebookProvider] LLM completion error:", error);
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
    completion = completion.trim();

    // Remove markdown code blocks if LLM wrapped response
    const codeBlockRegex = /^```[a-z]*\n([\s\S]*?)\n```$/;
    const match = completion.match(codeBlockRegex);
    if (match) {
      return match[1].trim();
    }

    return completion;
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
    // Read Pyodide version from configuration
    const pyodideVersion = vscode.workspace
      .getConfiguration("datalayer.pyodide")
      .get<string>("version", "0.27.3");
    return getNotebookHtml(webview, this._context.extensionUri, pyodideVersion);
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
          `[NotebookProvider] Auto-connect successful using "${result.strategyName}" for ${documentUri.fsPath}`,
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
            `[NotebookProvider] Strategy "${result.strategyName}" succeeded but provided no runtime`,
          );
        }
      } else {
        console.log(
          `[NotebookProvider] Auto-connect skipped or failed for ${documentUri.fsPath}`,
        );
      }
    } catch (error) {
      console.error(
        `[NotebookProvider] Auto-connect error for ${documentUri.fsPath}:`,
        error,
      );
      // Don't show error to user - auto-connect is optional
    }
  }
}

/**
 * Tracks all webviews.
 */
