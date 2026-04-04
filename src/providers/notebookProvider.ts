/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom editor provider for Jupyter notebooks with Datalayer platform integration.
 * Handles both local notebooks and collaborative Datalayer notebooks with real-time
 * synchronization, runtime management, and webview communication.
 *
 * @module providers/notebookProvider
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as vscode from "vscode";

import {
  isLanguageModelAPIAvailable,
  selectBestLanguageModel,
} from "../config/llmModels";
import {
  getOutlineTreeProvider,
  getRuntimesTreeProvider,
  getServiceContainer,
} from "../extension";
import { NotebookDocument, NotebookEdit } from "../models/notebookDocument";
import { AutoConnectService } from "../services/autoConnect/autoConnectService";
import { DatalayerAuthProvider } from "../services/core/authProvider";
import { selectDatalayerRuntime } from "../ui/dialogs/runtimeSelector";
import { getNotebookHtml } from "../ui/templates/notebookTemplate";
import { disposeAll } from "../utils/dispose";
import { WebviewCollection } from "../utils/webviewCollection";
import { BaseDocumentProvider } from "./baseDocumentProvider";

/**
 * Custom editor provider for Jupyter notebooks with dual-mode support.
 * Handles both local file-based notebooks and collaborative Datalayer notebooks
 * with runtime management, webview communication, and real-time synchronization.
 *
 */
export class NotebookProvider extends BaseDocumentProvider<NotebookDocument> {
  private static newNotebookFileId = 1;

  /**
   * Registers the notebook editor provider and commands.
   *
   * @param context - Extension context for resource management.
   *
   * @returns Disposable for cleanup.
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
          workspaceFolders[0]!.uri,
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
    void import("../commands/internal").then(({ onRuntimeTerminated }) => {
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
   * Maps document URIs to NotebookDocument instances.
   * Used to retrieve documents for makeEdit calls from webview content changes.
   */
  private readonly documents = new Map<string, NotebookDocument>();

  /**
   * Creates a new NotebookProvider with runtime bridge configuration.
   *
   * @param context - Extension context for resource access.
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
   * Sends a message to a webview panel and waits for a response.
   * Uses the request/response pattern inherited from BaseDocumentProvider.
   *
   * @param panel - Webview panel to send the message to.
   * @param message - Message to send including type and requestId.
   * @param requestId - Request ID to match the response callback.
   *
   * @returns Promise resolving to the webview response.
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
   * @param uri - Document URI to open.
   * @param openContext - Context including backup information.
   * @param openContext.backupId - Optional backup identifier for restoration.
   * @param _token - Cancellation token for aborting the operation.
   *
   * @returns Promise resolving to the notebook document.
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
          const panel = webviewsForDocument[0]!;
          const response = await this.postMessageWithResponse<number[]>(
            panel,
            "getFileData",
            {},
          );
          return new Uint8Array(response);
        },
      },
    );

    // Store document in map for access from message handlers
    this.documents.set(uri.toString(), document);

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

    document.onDidDispose(() => {
      disposeAll(listeners);
      // Remove document from map on disposal
      this.documents.delete(uri.toString());
    });

    return document;
  }

  /**
   * Resolves a custom editor by setting up the webview and initializing communication.
   *
   * @param document - The notebook document to display.
   * @param webviewPanel - The webview panel for the editor.
   * @param _token - Cancellation token for aborting the operation.
   *
   * @returns Promise that resolves when the editor is ready.
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

    webviewPanel.webview.onDidReceiveMessage((e) => {
      void this.onMessage(webviewPanel, document, e);
    });

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
        this.handleResponseMessage(e);
      } else if (e.type === "llm-completion-request") {
        await this.handleLLMCompletionRequest(e, webviewPanel);
      } else if (
        e.type === "lsp-completion-request" ||
        e.type === "lsp-hover-request" ||
        e.type === "lsp-document-sync" ||
        e.type === "lsp-document-open" ||
        e.type === "lsp-document-close"
      ) {
        await this.handleLSPMessage(e, webviewPanel);
      } else if (e.type === "ready") {
        await this.handleReadyMessage(document, webviewPanel);
      }
    });
  }

  /**
   * Handles a "response" message from the webview.
   * @param e - The response message from the webview.
   * @param e.requestId - Unique identifier used to match the response to its pending callback.
   * @param e.body - The response payload returned by the webview.
   */
  private handleResponseMessage(e: {
    requestId?: string;
    body?: unknown;
  }): void {
    const { requestId, body } = e;
    if (requestId) {
      const callback = this._callbacks.get(requestId);
      if (callback) {
        this._callbacks.delete(requestId);
        callback(body);
      }
    }
  }

  /**
   * Handles an LLM completion request from the webview.
   * @param e - The completion request containing source context.
   * @param e.requestId - Unique identifier to correlate the response with the request.
   * @param e.prefix - Source text preceding the cursor position.
   * @param e.suffix - Source text following the cursor position.
   * @param e.language - Programming language of the content being completed.
   * @param webviewPanel - The webview panel to send the completion response to.
   */
  private async handleLLMCompletionRequest(
    e: { requestId: string; prefix: string; suffix: string; language: string },
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const completion = await this.getLLMCompletion(
      e.prefix,
      e.suffix,
      e.language,
    );
    webviewPanel.webview.postMessage({
      type: "llm-completion-response",
      requestId: e.requestId,
      completion,
    });
  }

  /**
   * Forwards an LSP message to the LSP bridge.
   * @param e - The LSP request message from the webview.
   * @param webviewPanel - The webview panel used to send LSP responses back.
   */
  private async handleLSPMessage(
    e: import("../services/lsp/types").LSPRequest,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const { getLSPBridge } = await import("../extension");
    const lspBrdg = getLSPBridge();
    if (lspBrdg) {
      await lspBrdg.handleMessage(e, webviewPanel.webview);
    }
  }

  /**
   * Extracts the Datalayer document ID from a URI using query params, path, or metadata lookup.
   * @param uri - The document URI to extract the ID from.
   *
   * @returns The document ID or undefined if not found.
   */
  private async extractDatalayerDocumentId(
    uri: vscode.Uri,
  ): Promise<string | undefined> {
    // Try query parameter first
    const queryParams = new URLSearchParams(uri.query);
    const docIdFromQuery = queryParams.get("docId");
    if (docIdFromQuery) {
      return docIdFromQuery;
    }

    // Try URI path: datalayer://Space/DOCUMENT_UID/Document.ipynb
    const pathParts = uri.path.split("/").filter((p) => p);
    if (pathParts.length >= 2) {
      return pathParts[pathParts.length - 2];
    }

    // Try metadata lookup as last resort
    try {
      const { DocumentBridge } =
        await import("../services/bridges/documentBridge");
      const documentBridge = await DocumentBridge.getInstanceAsync();
      const metadata = documentBridge.getDocumentMetadata(uri);
      if (metadata && metadata.document.uid) {
        return metadata.document.uid;
      }
    } catch (_error) {
      // DocumentBridge not ready or metadata not found
    }

    return undefined;
  }

  /**
   * Handles the "ready" message from the webview by initializing notebook content.
   * @param document - The notebook document to initialize.
   * @param webviewPanel - The webview panel to send init data to.
   */
  private async handleReadyMessage(
    document: NotebookDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const theme =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
        ? "dark"
        : "light";

    if (document.uri.scheme === "untitled") {
      const notebookId = document.uri.toString();
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
        documentUri: document.uri.toString(),
      });
      void this.createProactiveLSPDocuments(notebookId, value);
      return;
    }

    const editable = vscode.workspace.fs.isWritableFileSystem(
      document.uri.scheme,
    );
    const isDatalayerNotebook = document.uri.scheme === "datalayer";

    let documentId: string | undefined;
    let serverUrl: string | undefined;
    let token: string | undefined;

    if (isDatalayerNotebook) {
      const config = vscode.workspace.getConfiguration("datalayer.services");
      serverUrl = config.get<string>(
        "spacerUrl",
        "https://prod1.datalayer.run",
      );

      const authService = getServiceContainer().authProvider;
      const authToken = authService.getToken();
      if (authToken) {
        token = authToken;
      }

      documentId = await this.extractDatalayerDocumentId(document.uri);
    }

    const notebookId = documentId || document.uri.toString();

    getServiceContainer().documentRegistry.register(
      notebookId,
      document.uri.toString(),
      "notebook",
      webviewPanel,
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
      documentUri: document.uri.toString(),
    });

    void this.createProactiveLSPDocuments(notebookId, document.documentData);
    await this.tryAutoConnect(document.uri);
  }

  /**
   * Proactively creates LSP virtual documents for all Python and Markdown cells.
   * This allows Pylance to start analyzing before the webview finishes loading,
   * providing instant completions when the user presses Tab.
   *
   * Native VS Code notebooks create TextDocuments immediately when opening,
   * giving Pylance time to analyze. Datalayer notebooks now do the same.
   *
   * @param notebookId - Unique notebook identifier.
   * @param documentData - Raw .ipynb file bytes to parse.
   */
  private async createProactiveLSPDocuments(
    notebookId: string,
    documentData: Uint8Array,
  ): Promise<void> {
    try {
      // Parse .ipynb JSON
      const notebookJson = JSON.parse(new TextDecoder().decode(documentData));
      const cells = notebookJson.cells || [];

      // Get LSP bridge
      const { getLSPBridge } = await import("../extension");
      const lspBridge = getLSPBridge();

      if (!lspBridge) {
        console.warn(
          "[PROACTIVE-LSP] LSP bridge not available, skipping proactive document creation",
        );
        return;
      }

      // 🚀 PARALLEL OPTIMIZATION: Create all documents in parallel instead of sequentially!
      // Sequential: 10 cells × 50ms = 500ms
      // Parallel: 10 cells at once = 50ms
      const documentCreationPromises: Promise<void>[] = [];

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const cellType = cell.cell_type;

        // Determine language for LSP
        let language: "python" | "markdown" | null = null;

        if (cellType === "code") {
          // Code cells - check language from metadata or assume Python
          const cellLanguage =
            cell.metadata?.language_info?.name ||
            cell.metadata?.kernelspec?.language ||
            "python";

          if (
            cellLanguage === "python" ||
            cellLanguage === "py" ||
            cellLanguage === "ipython"
          ) {
            language = "python";
          }
        } else if (cellType === "markdown") {
          language = "markdown";
        }

        // Only create documents for Python and Markdown cells
        if (language) {
          // Cell ID: use cell.id if available, otherwise generate from index
          // IMPORTANT: Must match ID generation in NotebookEditor.tsx (line 244)
          const cellId = cell.id || `cell-${i}`;

          // Get cell source (can be string or array of strings)
          const source = Array.isArray(cell.source)
            ? cell.source.join("")
            : cell.source || "";

          // Queue the document creation (don't await yet!)
          const promise = lspBridge.handleMessage(
            {
              type: "lsp-document-open",
              cellId,
              notebookId,
              content: source,
              language,
              source: "notebook",
            },
            // No webview needed for document creation
            null,
          );

          documentCreationPromises.push(promise);
        }
      }

      // Wait for ALL documents to be created in parallel
      await Promise.all(documentCreationPromises);
    } catch (error) {
      console.error(
        "[PROACTIVE-LSP] Error creating proactive LSP documents:",
        error,
      );
      // Don't throw - this is a performance optimization, not critical
    }
  }

  /**
   * Gets an LLM completion from VS Code Language Model API.
   *
   * @param prefix - Code text before the cursor position.
   * @param suffix - Code text after the cursor position.
   * @param language - Programming language for context.
   *
   * @returns Completion string or null if unavailable.
   */
  private async getLLMCompletion(
    prefix: string,
    suffix: string,
    language: string,
  ): Promise<string | null> {
    try {
      // Check if Language Model API is available (VS Code 1.90+)
      if (!isLanguageModelAPIAvailable()) {
        console.warn("[NotebookProvider] Language Model API not available");
        return null;
      }

      // Use centralized model selection
      const model = await selectBestLanguageModel("NotebookProvider");

      if (!model) {
        console.warn("[NotebookProvider] No language models available");
        return null;
      }

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
   * Cleans LLM completion output by removing markdown code blocks.
   *
   * @param completion - Raw completion text from the language model.
   *
   * @returns Cleaned completion text ready for insertion.
   */
  private cleanCompletion(completion: string): string {
    completion = completion.trim();

    // Remove markdown code blocks if LLM wrapped response
    const codeBlockRegex = /^```[a-z]*\n([\s\S]*?)\n```$/;
    const match = completion.match(codeBlockRegex);
    if (match) {
      return match[1]!.trim();
    }

    return completion;
  }

  /**
   * Saves a custom document to its original location.
   *
   * @param document - Notebook document to persist.
   * @param cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when the save is complete.
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
   * @param document - Notebook document to save.
   * @param destination - Target URI for the saved copy.
   * @param cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when the save is complete.
   */
  public override saveCustomDocumentAs(
    document: NotebookDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  /**
   * Reverts a custom document to its last saved state.
   *
   * @param document - Notebook document to revert.
   * @param cancellation - Cancellation token for aborting the revert.
   *
   * @returns Promise that resolves when the revert is complete.
   */
  public override revertCustomDocument(
    document: NotebookDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.revert(cancellation);
  }

  /**
   * Creates a backup of a custom document for crash recovery.
   *
   * @param document - Notebook document to backup.
   * @param context - Backup context with destination URI.
   * @param cancellation - Cancellation token for aborting the backup.
   *
   * @returns Promise resolving to backup descriptor with cleanup function.
   */
  public override backupCustomDocument(
    document: NotebookDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  /**
   * Gets the HTML content for the editor's webview.
   *
   * @param webview - The webview instance to generate content for.
   *
   * @returns HTML content string for the webview.
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
        const isLocalNotebook = !context.isFromDatalayer;

        if (isLocalNotebook) {
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

          // Get the document instance from our documents map
          const doc = this.documents.get(context.documentUri);
          if (doc) {
            doc.makeEdit({
              type: "content-update",
              content: content,
            });
          }
        }
      },
    );
  }

  /**
   * Gets the URI for a notebook document.
   *
   * @param document - The notebook document to extract the URI from.
   *
   * @returns The document URI identifying the file location.
   */
  protected override getDocumentUri(document: NotebookDocument): vscode.Uri {
    return document.uri;
  }

  /**
   * Shows the Datalayer runtime selector dialog.
   * Helper method to avoid code duplication.
   *
   * @param document - The notebook document to connect a runtime to.
   */
  private showDatalayerRuntimeSelector(document: NotebookDocument): void {
    const datalayer = getServiceContainer().datalayer;
    const authProvider = getServiceContainer()
      .authProvider as DatalayerAuthProvider;

    selectDatalayerRuntime(datalayer, authProvider, {
      // Show spinner immediately when runtime is selected
      onRuntimeSelected: async (selectedRuntime) => {
        // Send "kernel-starting" message to show spinner in notebook
        await getServiceContainer().kernelBridge.sendKernelStartingMessage(
          document.uri,
          selectedRuntime,
        );
      },
    })
      .then(async (runtime) => {
        if (runtime) {
          // Send selected runtime to webview via kernel bridge
          await getServiceContainer().kernelBridge.connectWebviewDocument(
            document.uri,
            runtime,
          );
        } else {
          // User cancelled - clear the spinner by sending kernel-terminated message
          const webviewPanels = this.webviews.get(document.uri);
          if (webviewPanels) {
            const panel = Array.from(webviewPanels)[0];
            if (panel) {
              await panel.webview.postMessage({
                type: "kernel-terminated",
                body: {},
              });
            }
          }
        }
      })
      .catch((error) => {
        vscode.window.showErrorMessage(`Failed to select runtime: ${error}`);
      });
  }

  /**
   * Attempts to auto-connect the document to a runtime using configured strategies.
   *
   * @param documentUri - URI of the document being opened.
   */
  private async tryAutoConnect(documentUri: vscode.Uri): Promise<void> {
    try {
      const datalayer = getServiceContainer().datalayer;
      const authProvider = getServiceContainer()
        .authProvider as DatalayerAuthProvider;
      const runtimesTreeProvider = getRuntimesTreeProvider();

      // Get current runtime if any (no API for this yet, so pass undefined)
      const currentRuntime: RuntimeDTO | undefined = undefined;

      // Try auto-connect
      const result = await this.autoConnectService.connect(
        documentUri,
        currentRuntime,
        datalayer,
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
