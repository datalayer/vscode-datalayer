/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
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
 * @module providers/lexicalProvider
 *
 * @see https://code.visualstudio.com/api/extension-guides/custom-editors
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type {
  InlineCompletionConfig,
  TriggerMode,
} from "@datalayer/jupyter-lexical";
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
import { LexicalDocument } from "../models/lexicalDocument";
import { AutoConnectService } from "../services/autoConnect/autoConnectService";
import {
  LexicalCollaborationConfig,
  LexicalCollaborationService,
} from "../services/collaboration/lexicalCollaboration";
import { LoroWebSocketAdapter } from "../services/collaboration/loroWebSocketAdapter";
import { DatalayerAuthProvider } from "../services/core/authProvider";
import { disposeAll } from "../utils/dispose";
import { getNonce } from "../utils/webviewSecurity";
import { BaseDocumentProvider } from "./baseDocumentProvider";
import { getPromptForContentType } from "./completionPrompts";

/**
 * Extracts text content from a code block node's children, concatenating text from
 * code-highlight and direct text nodes.
 * @param children - Array of child nodes of a code block.
 *
 * @returns Concatenated text content.
 */
function extractCodeBlockText(children: unknown[]): string {
  let content = "";
  for (const textNode of children) {
    const textNodeObj = textNode as Record<string, unknown>;
    if (
      textNodeObj.type === "code-highlight" &&
      textNodeObj.children &&
      Array.isArray(textNodeObj.children)
    ) {
      for (const highlight of textNodeObj.children) {
        const highlightObj = highlight as Record<string, unknown>;
        if (highlightObj.text) {
          content += highlightObj.text as string;
        }
      }
    } else if (textNodeObj.text) {
      content += textNodeObj.text as string;
    }
  }
  return content;
}

/**
 * Extracts a JupyterInputNode's UUID, language, and content from the serialized JSON node.
 * @param nodeObj - Object representing a jupyter-input node.
 *
 * @returns Extracted node info or null if language is unsupported or uuid is missing.
 */
function extractJupyterInputNode(
  nodeObj: Record<string, unknown>,
): { uuid: string; language: string; content: string } | null {
  const uuid =
    (nodeObj.jupyterInputNodeUuid as string) ||
    (nodeObj.uuid as string) ||
    (nodeObj.__uuid as string);
  const language = (nodeObj.language as string) || "python";

  let content = "";
  if (nodeObj.children && Array.isArray(nodeObj.children)) {
    for (const child of nodeObj.children) {
      const childObj = child as Record<string, unknown>;
      if (
        childObj.type === "code" &&
        childObj.children &&
        Array.isArray(childObj.children)
      ) {
        content += extractCodeBlockText(childObj.children);
      } else if (childObj.text) {
        content += childObj.text as string;
      }
    }
  }

  let lspLanguage: "python" | "markdown" | null = null;
  if (language === "python" || language === "py") {
    lspLanguage = "python";
  } else if (language === "markdown" || language === "md") {
    lspLanguage = "markdown";
  }

  if (lspLanguage && uuid) {
    return { uuid, language: lspLanguage, content };
  }
  return null;
}

/**
 * Custom editor provider for Lexical documents.
 * Handles webview lifecycle management, document state synchronization,
 * and collaboration features for rich text editing.
 *
 */
export class LexicalProvider extends BaseDocumentProvider<LexicalDocument> {
  /**
   * Registers the Lexical editor provider and commands with VS Code.
   *
   * @param context - Extension context for resource management.
   *
   * @returns Disposable for cleanup.
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
    void import("../commands/internal").then(({ onRuntimeTerminated }) => {
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

    // Register test completion command for debugging
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "datalayer.internal.testCompletion",
        async () => {
          // Lexical documents are custom editors (webviews), not text editors
          // Send test message to all active lexical webviews
          if (provider.webviews.size === 0) {
            vscode.window.showErrorMessage("No lexical documents open");
            return;
          }

          // eslint-disable-next-line no-console
          console.log(
            "[LexicalProvider] Available lexical webviews:",
            Array.from(provider.webviews.keys()),
          );
          // eslint-disable-next-line no-console
          console.log(
            "[LexicalProvider] Sending test message to all lexical webviews",
          );

          let sentCount = 0;
          for (const [uri, entry] of provider.webviews.entries()) {
            // eslint-disable-next-line no-console
            console.log("[LexicalProvider] Sending to:", uri);
            await entry.webviewPanel.webview.postMessage({
              type: "test-completion-trigger",
              body: {
                message: "Test completion from command palette",
              },
            });
            sentCount++;
          }

          vscode.window.showInformationMessage(
            `Test message sent to ${sentCount} lexical document(s)! Check Developer Console (Help > Toggle Developer Tools) for webview logs.`,
          );
        },
      ),
    );

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
   * Gets the singleton instance of LexicalProvider for message routing.
   * @returns The LexicalProvider instance or undefined if not created.
   */
  public static getInstance(): LexicalProvider | undefined {
    return LexicalProvider._instance;
  }

  /**
   * Sends a message to a specific Lexical webview identified by document URI.
   * @param uri - Document URI identifying the target webview.
   * @param message - Message object to post to the webview.
   */
  public async sendToWebview(uri: vscode.Uri, message: unknown): Promise<void> {
    const entry = this.webviews.get(uri.toString());
    if (entry) {
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
   * Sends a message to a specific Lexical webview and waits for a response.
   * @param uri - Document URI identifying the target webview.
   * @param message - Message object to post to the webview.
   * @param requestId - Unique ID to correlate the response with this request.
   *
   * @returns Promise resolving to the webview's response.
   */
  public async sendToWebviewWithResponse(
    uri: vscode.Uri,
    message: unknown,
    requestId: string,
  ): Promise<unknown> {
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
   * Creates a new LexicalProvider with collaboration and completion support.
   *
   * @param context - Extension context for resource access.
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  /**
   * Initializes auth listener for userInfo updates.
   * Called after extension activation, passing authProvider directly to avoid circular dependency.
   * @param authProvider - Auth provider instance to listen for state changes.
   */
  initializeAuthListener(
    authProvider: import("../services/core/authProvider").DatalayerAuthProvider,
  ): void {
    authProvider.onAuthStateChanged(() => {
      this.updateUserInfoInAllWebviews(authProvider);
    });
  }

  /**
   * Updates userInfo in all open lexical webviews when auth state changes.
   * @param authProvider - Auth provider to read current user info from.
   */
  private updateUserInfoInAllWebviews(
    authProvider: import("../services/core/authProvider").DatalayerAuthProvider,
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
   * Finds the document URI for a given webview panel.
   * @param panel - Webview panel to find the associated document URI for.
   *
   * @returns Document URI string or undefined if not found.
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
   * @param uri - Document URI to open.
   * @param openContext - Context including backup information.
   * @param openContext.backupId - Optional backup identifier for restoration.
   * @param _token - Cancellation token for aborting the operation.
   *
   * @returns Promise resolving to the lexical document.
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
   * @param document - The lexical document to display.
   * @param webviewPanel - The webview panel for the editor.
   * @param _token - Cancellation token for aborting the operation.
   *
   * @returns Promise that resolves when the editor is ready.
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

    // NOTE: Initial theme is now sent in the "update" message (in sendInitialContent)
    // to ensure it arrives after the webview's message handler is set up

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
        void this.onMessage(webviewPanel, document, e);
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
    const sendInitialContent = async (): Promise<void> => {
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

      // Get current theme
      const currentTheme =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
          ? "dark"
          : "light";

      // Get completion configuration from VS Code settings
      const completionConfig = this.getCompletionConfig();

      webviewPanel.webview.postMessage({
        type: "update",
        content: contentArray,
        editable: true,
        collaboration: collaborationConfig,
        userInfo, // Always send if logged in, even for local files
        theme: currentTheme, // Include initial theme in update message
        documentUri: document.uri.toString(), // Still include for logging
        documentId: uniqueDocId, // Unique ID for validation
        lexicalId: lexicalId, // Pass lexicalId for tool execution context
        completionConfig: completionConfig, // Pass completion configuration
      });

      // 🚀 PROACTIVE LSP: Create virtual documents IMMEDIATELY for fast completions
      // Fire-and-forget: Don't block lexical opening waiting for documents
      // Pylance will analyze in the background while webview loads
      void this.createProactiveLSPDocuments(lexicalId, document.documentData);

      // Try auto-connect after sending initial content
      await this.tryAutoConnect(document.uri);
    };
  }

  /**
   * Proactively create LSP virtual documents for all Python and Markdown JupyterInputNodes.
   * Parses the Lexical editor state JSON and extracts code blocks.
   * This allows Pylance to start analyzing BEFORE the webview finishes loading,
   * providing instant completions when the user presses Tab.
   *
   * @param lexicalId - Unique lexical document identifier.
   * @param documentData - Raw .dlex file bytes containing Lexical editor state JSON.
   */
  private async createProactiveLSPDocuments(
    lexicalId: string,
    documentData: Uint8Array,
  ): Promise<void> {
    try {
      // Parse Lexical editor state JSON
      const stateJson = JSON.parse(new TextDecoder().decode(documentData));

      // Lexical state structure can be:
      // 1. { root: { children: [...] } } - Direct root
      // 2. { editorState: { root: { children: [...] } } } - Wrapped in editorState
      let rootNode = stateJson?.root || stateJson?.editorState?.root;

      if (!rootNode || !rootNode.children) {
        return;
      }

      // Get LSP bridge
      const { getLSPBridge } = await import("../extension");
      const lspBridge = getLSPBridge();

      if (!lspBridge) {
        console.warn(
          "[LexicalProvider] LSP bridge not available, skipping proactive document creation",
        );
        return;
      }

      // Recursively find all JupyterInputNodes
      const jupyterInputNodes: Array<{
        uuid: string;
        language: string;
        content: string;
      }> = [];

      const traverse = (node: unknown, depth: number = 0): void => {
        if (typeof node !== "object" || node === null) {
          return;
        }
        const nodeObj = node as Record<string, unknown>;
        if (nodeObj.type === "jupyter-input") {
          const inputNode = extractJupyterInputNode(nodeObj);
          if (inputNode) {
            jupyterInputNodes.push(inputNode);
          }
        }

        // Recursively traverse children
        if (nodeObj.children && Array.isArray(nodeObj.children)) {
          for (const child of nodeObj.children) {
            traverse(child, depth + 1);
          }
        }
      };

      // Start traversal from root
      for (const child of rootNode.children) {
        traverse(child, 0);
      }

      // Create virtual documents in parallel for all Python and Markdown cells
      const documentCreationPromises: Promise<void>[] = [];

      for (const node of jupyterInputNodes) {
        // Queue the document creation (don't await yet!)
        const promise = lspBridge.handleMessage(
          {
            type: "lsp-document-open",
            cellId: node.uuid,
            notebookId: lexicalId,
            content: node.content,
            language: node.language as "python" | "markdown",
            source: "lexical",
          },
          // No webview needed for document creation
          null,
        );

        documentCreationPromises.push(promise);
      }

      // Wait for ALL documents to be created in parallel
      await Promise.all(documentCreationPromises);
    } catch (error) {
      console.error(
        "[LexicalProvider] Error creating proactive LSP documents:",
        error,
      );
      // Don't throw - this is a performance optimization, not critical
    }
  }

  /**
   * Saves a custom document to its original location.
   *
   * @param document - Lexical document to persist.
   * @param cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when the save is complete.
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
   * @param document - Lexical document to save.
   * @param destination - Target URI for the saved copy.
   * @param cancellation - Cancellation token for aborting the save.
   *
   * @returns Promise that resolves when the save is complete.
   */
  public override saveCustomDocumentAs(
    document: LexicalDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  /**
   * Reverts a custom document to its last saved state.
   *
   * @param document - Lexical document to revert.
   * @param cancellation - Cancellation token for aborting the revert.
   *
   * @returns Promise that resolves when the revert is complete.
   */
  public override revertCustomDocument(
    document: LexicalDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.revert(cancellation);
  }

  /**
   * Creates a backup of a custom document for crash recovery.
   *
   * @param document - Lexical document to backup.
   * @param context - Backup context with destination URI.
   * @param cancellation - Cancellation token for aborting the backup.
   *
   * @returns Promise resolving to backup descriptor with cleanup function.
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
   * @param webview - The webview instance to generate content for.
   *
   * @returns HTML content string for the webview.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Runtime chunk (required for WASM async loading)
    const runtimeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "dist",
        "lexical-runtime.lexical.js",
      ),
    );
    // Main bundle
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

    // Add cache busting to force fresh load
    const cacheBust = `?v=${Date.now()}`;

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!--
        Content Security Policy for Lexical Editor:
        - default-src 'none': Deny all by default for security
        - img-src: Allow images from extension and blob URLs
        - style-src: Allow styles from extension and inline styles (required for Lexical editor)
        - font-src: Allow fonts from extension and external sources (Excalidraw)
        - script-src: Require nonce for scripts, allow WASM execution (loro-crdt CRDT library)
        - connect-src: Allow secure connections for collaboration (WebSocket) and API calls
        - worker-src: Allow web workers from extension and blob URLs (required for Y.js collaboration)
        - frame-src: Allow YouTube embeds (required for YouTubeNode)

        Note: 'wasm-unsafe-eval' is required for loro-crdt WASM CRDT library
        Note: 'unsafe-eval' is required for AJV (JSON schema validator used by Jupyter dependencies)
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-eval'; connect-src ${webview.cspSource} https: wss: ws: data:; worker-src ${webview.cspSource} blob:; frame-src https://www.youtube.com/">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Datalayer Lexical Editor</title>
        <script nonce="${nonce}">
          // Set webpack public path for dynamic imports and WASM loading
          window.__webpack_public_path__ = '${distUri}/';
          // Set webpack nonce for CSP compliance on dynamically created script tags
          window.__webpack_nonce__ = '${nonce}';
        </script>
      </head>
      <body style="margin: 0; padding: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground);">
        <div id="root"></div>
        <!-- Set Pyodide base URI for browser-based Python -->
        <script nonce="${nonce}">
          window.__PYODIDE_BASE_URI__ = "https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full";
        </script>
        <!-- Load runtime chunk FIRST (required for WASM async loading) -->
        <script nonce="${nonce}" src="${runtimeUri}${cacheBust}"></script>
        <!-- Then load main bundle -->
        <script nonce="${nonce}" src="${scriptUri}${cacheBust}"></script>
      </body>
      </html>`;
  }

  /**
   * Gets completion configuration from VS Code settings.
   * Reads user preferences for inline completions including code and prose.
   *
   * @returns Inline completion config with user settings or defaults.
   */
  private getCompletionConfig(): InlineCompletionConfig {
    const config = vscode.workspace.getConfiguration("datalayer.completion");

    const completionConfig: InlineCompletionConfig = {
      code: {
        triggerMode: (config.get("inlinellm.enabled", true)
          ? config.get("inlinellm.triggerMode", "auto")
          : "disabled") as TriggerMode,
        contextBefore: config.get("inlinellm.contextBlocks", -1),
        contextAfter: config.get("inlinellm.contextBlocks", -1),
        language: "python",
      },
      prose: {
        triggerMode: (config.get("prosellm.enabled", true)
          ? config.get("prosellm.triggerMode", "manual")
          : "disabled") as TriggerMode,
        contextBefore: config.get("prosellm.contextBlocks", -1),
        contextAfter: config.get("prosellm.contextBlocks", -1),
      },
      debounceMs: config.get("prosellm.debounceMs", 500),
      manualTriggerKey: config.get("prosellm.triggerKey", "Cmd+Shift+,"),
    };

    // eslint-disable-next-line no-console
    console.log(
      "[LexicalProvider] Completion config created:",
      JSON.stringify(completionConfig, null, 2),
    );

    return completionConfig;
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

    // Handler for opening external URLs (e.g., YouTube videos)
    this._messageRouter.registerHandler(
      "open-external-url",
      async (message) => {
        const payload = message as unknown as {
          url: string;
          useSimpleBrowser?: boolean;
        };
        try {
          const uri = vscode.Uri.parse(payload.url);

          if (payload.useSimpleBrowser) {
            // Use VS Code's Simple Browser - stays within VS Code UI
            await vscode.commands.executeCommand(
              "simpleBrowser.show",
              payload.url,
            );
          } else {
            // Open in external default browser
            await vscode.env.openExternal(uri);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open URL: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }

  /**
   * Gets the URI for a lexical document.
   *
   * @param document - The lexical document to extract the URI from.
   *
   * @returns The document URI identifying the file location.
   */
  protected override getDocumentUri(document: LexicalDocument): vscode.Uri {
    return document.uri;
  }

  /**
   * Handles Loro collaboration messages from the webview.
   * Creates and manages WebSocket adapters and forwards messages.
   *
   * @param message - Message from webview containing type, adapterId, and data.
   * @param message.type - The Loro message type such as connect or disconnect.
   * @param message.adapterId - Unique identifier for the collaboration adapter.
   * @param message.data - Optional payload with connection details.
   * @param message.data.websocketUrl - WebSocket URL for Loro CRDT sync.
   * @param webviewPanel - The webview panel to send status messages to.
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
   * Handles a "response" message from the webview for request-response patterns.
   * @param e - The response message containing requestId and body.
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
   * Handles an LLM completion request by generating and sending a completion response.
   * @param e - The completion request message.
   * @param e.requestId - Unique identifier to correlate the response with the request.
   * @param e.prefix - Source text preceding the cursor position.
   * @param e.suffix - Source text following the cursor position.
   * @param e.language - Programming language of the content being completed.
   * @param e.contentType - Whether the completion context is code or prose.
   * @param e.trigger - Event that triggered the completion request.
   * @param webviewPanel - The webview panel to send the completion response to.
   */
  private async handleLLMCompletionRequest(
    e: {
      requestId: string;
      prefix: string;
      suffix: string;
      language: string;
      contentType?: "code" | "prose";
      trigger?: string;
    },
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const contentType = e.contentType || "code";

    console.log("[LexicalProvider] Received llm-completion-request:", {
      requestId: e.requestId,
      prefix: e.prefix?.substring(0, 50) + "...",
      suffix: e.suffix?.substring(0, 50) + "...",
      language: e.language,
      contentType,
      trigger: e.trigger || "auto",
    });

    const completion = await this.getLLMCompletion(
      e.prefix,
      e.suffix,
      e.language,
      contentType,
    );

    console.log("[LexicalProvider] Sending llm-completion-response:", {
      requestId: e.requestId,
      hasCompletion: !!completion,
      completionLength: completion?.length || 0,
      contentType,
    });

    webviewPanel.webview.postMessage({
      type: "llm-completion-response",
      requestId: e.requestId,
      completion,
      contentType,
    });
  }

  /**
   * Forwards an LSP message to the LSP bridge for processing.
   * @param e - The LSP message (completion, hover, or document sync).
   * @param webviewPanel - The webview panel for sending responses.
   */
  private async handleLSPMessage(
    e: import("../services/lsp/types").LSPRequest,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const { getLSPBridge } = await import("../extension");
    const lspBrdg = getLSPBridge();

    if (lspBrdg) {
      await lspBrdg.handleMessage(e, webviewPanel.webview);
    } else {
      console.warn(
        "[LexicalProvider] LSP bridge not available, ignoring message",
      );
    }
  }

  /**
   * Requests completion from VS Code's Language Model API.
   * Uses GitHub Copilot if available, falls back to other models.
   * Supports both code and prose completions with appropriate prompts.
   *
   * @param prefix - Text before the cursor position.
   * @param suffix - Text after the cursor position.
   * @param language - Programming language such as python or javascript.
   * @param contentType - Content type for prompt selection, either code or prose.
   *
   * @returns Completion text or null if unavailable.
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
      if (!isLanguageModelAPIAvailable()) {
        // eslint-disable-next-line no-console
        console.log("[LexicalProvider] Language Model API not available");
        return null;
      }

      // Use centralized model selection
      const model = await selectBestLanguageModel("LexicalProvider");

      if (!model) {
        console.warn("[LexicalProvider] ⚠️ No chat models available");
        return null;
      }

      // Build prompt using content-type-aware prompts
      const prompt = getPromptForContentType(contentType, {
        language,
        prefix,
        suffix,
      });

      // eslint-disable-next-line no-console
      console.log(
        `[LexicalProvider] Sending ${contentType} completion request to model "${model.id}"...`,
      );

      // Send request to LLM
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const justification =
        contentType === "code"
          ? "Code completion for Lexical Jupyter cell"
          : "Prose completion for Lexical document";

      const response = await model.sendRequest(messages, {
        justification,
      });

      // eslint-disable-next-line no-console
      console.log("[LexicalProvider] Receiving response...");

      // Collect streamed response
      let completion = "";
      for await (const chunk of response.text) {
        completion += chunk;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[LexicalProvider] Got completion (${completion.length} chars)`,
      );

      // Clean up (remove markdown blocks if present)
      return this.cleanCompletion(completion);
    } catch (error) {
      console.error("[LexicalProvider] ❌ LLM completion error:", error);
      console.error("[LexicalProvider] Error details:", {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      return null;
    }
  }

  /**
   * Cleans LLM completion output by removing markdown code blocks and trailing whitespace.
   *
   * @param completion - Raw completion text from the language model.
   *
   * @returns Cleaned completion text ready for insertion.
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
