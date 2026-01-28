/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code Tool Adapter - Bridges LanguageModelTool to core operations
 *
 * @module tools/vscode/VSCodeToolAdapter
 */

import * as vscode from "vscode";
import type {
  ToolDefinition,
  ToolOperation,
  ToolExecutionContext,
} from "@datalayer/jupyter-react";
import { formatResponse } from "@datalayer/jupyter-react";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../../utils/notebookValidation";
import { getServiceContainer } from "../../extension";
import { analyzeOpenDocuments } from "../../utils/documentAnalysis";
import { getAllOpenedDocuments } from "../../utils/getAllOpenedDocuments";
import type { Document } from "../../models/spaceItem";

/**
 * VS Code Tool Adapter
 *
 * This adapter bridges VS Code's LanguageModelTool interface to our
 * platform-agnostic core operations. It handles:
 * - Document resolution from parameters or active editor
 * - Context building (document handle, SDK, auth)
 * - Confirmation dialog generation
 * - Result formatting for VS Code
 */
export class VSCodeToolAdapter<
  TParams,
> implements vscode.LanguageModelTool<TParams> {
  constructor(
    private readonly definition: ToolDefinition,
    private readonly operation: ToolOperation<TParams, unknown>,
  ) {}

  /**
   * Prepares the tool invocation with user-facing messages
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<TParams>,
    _token: vscode.CancellationToken,
  ) {
    const config = this.definition.config;

    // Generate invocation message - call function or use string
    const invocationMessage = this.resolveMessage(
      config?.invocationMessage,
      options.input,
      `Executing ${this.definition.displayName}`,
    );

    // Generate confirmation message - call function or use string
    const confirmationMessage = this.resolveMessage(
      config?.confirmationMessage,
      options.input,
      this.definition.description,
    );

    return {
      invocationMessage,
      confirmationMessages: {
        title: this.definition.displayName,
        message: new vscode.MarkdownString(confirmationMessage),
      },
    };
  }

  /**
   * Executes the tool by delegating to the core operation
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<TParams>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Build execution context (includes format from VS Code config)
      const context = await this.buildExecutionContext(options.input);

      // Step 1: Execute the core operation (returns pure typed data)
      const result = await this.operation.execute(options.input, context);

      // Step 2: Apply formatting (TOON or JSON) based on context.format
      // This matches the WebviewRunner pattern
      // Format response using bundled formatResponse from @datalayer/jupyter-react
      const formattedResult = formatResponse(result, context.format || "toon");

      // Special post-execution for create operations: Open the created document
      // Local documents: auto-open here
      // Cloud documents: already opened via openCloudDocument callback
      if (
        this.definition.operation === "createNotebook" ||
        this.definition.operation === "createLexical"
      ) {
        const resultWithUri = result as { success?: boolean; uri?: string };
        if (resultWithUri.success && resultWithUri.uri) {
          const uri = vscode.Uri.parse(resultWithUri.uri);
          if (uri.scheme === "file") {
            // Only auto-open local documents here
            // Cloud documents are already opened by openCloudDocument callback
            if (this.definition.operation === "createNotebook") {
              await this.openNotebook(resultWithUri.uri);
            } else {
              // For lexical, use vscode.open
              await vscode.commands.executeCommand(
                "vscode.openWith",
                uri,
                "datalayer.lexical-editor",
              );
            }
          }
        }
      }

      // Step 3: Format for VS Code UI (convert to LanguageModelToolResult)
      return this.formatResult(formattedResult);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`${this.definition.displayName} failed: ${errorMessage}`);
    }
  }

  /**
   * Builds the execution context for the operation
   */
  private async buildExecutionContext(
    params: TParams,
  ): Promise<ToolExecutionContext> {
    const services = getServiceContainer();

    // Read response format from VS Code configuration
    const responseFormat = vscode.workspace
      .getConfiguration("datalayer.tools")
      .get<string>("responseFormat", "toon") as "json" | "toon";

    // ALWAYS get all opened documents - provides complete context to ALL tools
    const documentsContext = getAllOpenedDocuments();

    // Check if this tool needs a document ID
    const needsCellDocument = this.definition.tags?.includes("cell");
    const needsBlockDocument = this.definition.tags?.includes("lexical");
    const isCreateOperation = this.definition.tags?.includes("create");

    const context: ToolExecutionContext = {
      format: responseFormat,

      // Provide executor that calls VS Code internal commands
      executor: {
        execute: async (command: string, args: unknown): Promise<unknown> => {
          return this.executeVSCodeCommand(command, args);
        },
      },

      // Universal documentId for both notebooks and lexicals
      // Skip document ID resolution for create operations (they don't need an active document)
      documentId:
        !isCreateOperation && needsCellDocument
          ? await this.resolveNotebookId(params)
          : !isCreateOperation && needsBlockDocument
            ? await this.resolveLexicalId(params)
            : undefined,

      // Put platform-specific services in extras
      extras: {
        sdk: services.sdk,
        auth: services.authProvider,
        // ALWAYS provide complete document context to ALL tools
        documentsContext,
      },
    };

    // Special handling for create operations (createNotebook, createLexical)
    // Use the same extras with SDK, auth, and document creation callbacks
    if (isCreateOperation) {
      context.extras = this.buildCreateDocumentExtras();
    } else {
      // Default extras for other tools
      context.extras = this.buildDefaultExtras();
    }

    // ENSURE documentsContext is ALWAYS present in extras
    // (in case buildCreateNotebookExtras or buildDefaultExtras overwrites extras)
    context.extras.documentsContext = documentsContext;

    return context;
  }

  /**
   * Builds extras for create operations (createNotebook, createLexical) with VS Code-specific logic
   */
  private buildCreateDocumentExtras(): Record<string, unknown> {
    const services = getServiceContainer();

    // Analyze open documents (notebooks + lexicals)
    const documentAnalysis = analyzeOpenDocuments();

    return {
      // SDK and auth for cloud notebook creation
      sdk: services.sdk,
      auth: services.authProvider,

      // Environment signals
      hasWorkspace: !!vscode.workspace.workspaceFolders,
      isAuthenticated: services.authProvider.isAuthenticated(),

      // Document context analysis (VS Code-specific)
      notebookAnalysis: {
        nativeCount: documentAnalysis.nativeNotebooks.length,
        localDatalayerCount: documentAnalysis.localDatalayerDocuments.length,
        cloudDatalayerCount: documentAnalysis.cloudDatalayerDocuments.length,
        totalCount: documentAnalysis.total,
        majorityType: documentAnalysis.majorityType,
      },

      // Active notebook context
      activeNotebookUri:
        vscode.window.activeNotebookEditor?.notebook.uri.toString(),
      openNotebookUris: vscode.workspace.notebookDocuments.map((nb) =>
        nb.uri.toString(),
      ),

      // Callback for prompting user when intent is ambiguous
      promptForLocation: async (spaceName?: string) => {
        return this.promptForLocation(spaceName);
      },

      // Callback for creating local notebook file
      createLocalFile: async (filename: string, content: unknown) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          throw new Error("No workspace folder open");
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filename);
        const contentStr = JSON.stringify(content, null, 2);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(contentStr, "utf-8"),
        );

        return uri.toString();
      },

      // Callback for opening cloud document (notebook or lexical) after creation
      // Uses the same logic as the space tree command
      openCloudDocument: async (
        document: Document,
        spaceName: string,
        documentType: "notebook" | "lexical",
      ) => {
        // Use documentBridge to download and open (same as space tree)
        const uri = await services.documentBridge.openDocument(
          document,
          undefined,
          spaceName,
        );

        // Open with appropriate editor
        const editorId =
          documentType === "notebook"
            ? "datalayer.jupyter-notebook"
            : "datalayer.lexical-editor";

        await vscode.commands.executeCommand("vscode.openWith", uri, editorId);

        // Refresh spaces tree so the new document shows up
        await vscode.commands.executeCommand("datalayer.refreshSpaces");
      },
    };
  }

  /**
   * Builds default extras for non-createNotebook tools
   */
  private buildDefaultExtras(): Record<string, unknown> {
    const services = getServiceContainer();

    return {
      // SDK and auth for listKernels, selectKernel, etc.
      sdk: services.sdk,
      auth: services.authProvider,

      // Kernel bridge for selectKernel operation
      kernelBridge: services.kernelBridge,

      // Runtime connection callback
      connectRuntimeCallback: async (
        runtimeName?: string,
        notebookUri?: string,
      ) => {
        // Use VS Code command for runtime connection
        await vscode.commands.executeCommand(
          "datalayer.connectRuntime",
          runtimeName,
          notebookUri,
        );

        // Return runtime info from services
        // This would need to be enhanced to return actual runtime data
        return { podName: runtimeName || "default-runtime" };
      },

      // Default runtime duration from settings
      defaultRuntimeDuration: vscode.workspace
        .getConfiguration("datalayer.runtime")
        .get<number>("defaultMinutes", 3),

      // Default runtime type from settings
      defaultRuntimeType: vscode.workspace
        .getConfiguration("datalayer.runtime")
        .get<string>("defaultType", "CPU"),
    };
  }

  /**
   * Prompts user to choose notebook location when intent is ambiguous
   * (VS Code-specific UI)
   */
  private async promptForLocation(
    spaceName?: string,
  ): Promise<"local" | "cloud" | undefined> {
    const services = getServiceContainer();
    const hasWorkspace = !!vscode.workspace.workspaceFolders;
    const isAuthenticated = services.authProvider.isAuthenticated();

    const choices: Array<{
      label: string;
      description?: string;
      location: "local" | "cloud";
    }> = [];

    if (hasWorkspace) {
      choices.push({
        label: "$(folder) Local Notebook",
        description: "Create in workspace",
        location: "local",
      });
    }

    if (isAuthenticated) {
      choices.push({
        label: "$(cloud) Cloud Notebook",
        description: `Create in Datalayer space "${spaceName || "Library space"}"`,
        location: "cloud",
      });
    }

    if (choices.length === 0) {
      throw new Error(
        "Cannot create notebook: No workspace open and not authenticated to Datalayer",
      );
    }

    if (choices.length === 1) {
      return choices[0].location;
    }

    const selected = await vscode.window.showQuickPick(choices, {
      title: "Where should I create the notebook?",
      placeHolder: "Choose location",
    });

    return selected?.location;
  }

  /**
   * Opens a created notebook in the editor (VS Code-specific post-execution)
   */
  /**
   * Open a notebook document in the editor
   * Handles both local (file://) and cloud (datalayer://) schemes
   * Always uses the Datalayer notebook editor
   */
  private async openNotebook(uriString: string): Promise<void> {
    const uri = vscode.Uri.parse(uriString);
    // Use vscode.openWith to explicitly open with Datalayer notebook editor
    // This prevents VS Code from using the native notebook editor for local files
    await vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      "datalayer.jupyter-notebook",
    );
  }

  /**
   * Resolves notebook ID from parameters or active editor
   */
  private async resolveNotebookId(params: TParams): Promise<string> {
    // Try to get URI from parameters (with retry logic for async notebook initialization)
    const paramsWithUri = params as { notebook_uri?: string };
    const uriString = paramsWithUri.notebook_uri;
    let targetUri: vscode.Uri | undefined;

    if (uriString) {
      targetUri = vscode.Uri.parse(uriString);
      validateDatalayerNotebook(targetUri);
    } else {
      // Try to find active Datalayer notebook with retry
      const maxRetries = 10;
      let retryCount = 0;

      while (!targetUri && retryCount < maxRetries) {
        targetUri = getActiveDatalayerNotebook();
        if (targetUri) {
          break;
        }

        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (!targetUri) {
      throw new Error(
        "No active Datalayer notebook found. Please ensure a Datalayer notebook is open and try again.",
      );
    }

    // Return the notebookId (URI string for local, or documentId for remote)
    const uriStr = targetUri.toString();

    // Try to get the ID from the registry (if it's already registered)
    const services = getServiceContainer();
    try {
      return services.documentRegistry.getIdFromUri(uriStr);
    } catch {
      // Not registered yet, use URI as ID (this is fine for local notebooks)
      return uriStr;
    }
  }

  /**
   * Resolves Lexical document ID from parameters or active editor
   */
  private async resolveLexicalId(params: TParams): Promise<string> {
    // Try to get URI from parameters
    const paramsWithUri = params as { documentUri?: string };
    const uriString = paramsWithUri.documentUri;
    let targetUri: vscode.Uri | undefined;

    if (uriString) {
      targetUri = vscode.Uri.parse(uriString);
    } else {
      // Lexical documents are custom editors, not text editors
      // We need to check active tab in tab groups
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

      if (activeTab?.input && typeof activeTab.input === "object") {
        const tabInput = activeTab.input as {
          uri?: vscode.Uri;
          viewType?: string;
        };

        // Check if it's a Lexical custom editor
        if (tabInput.uri && tabInput.viewType === "datalayer.lexical-editor") {
          targetUri = tabInput.uri;
        }
      }

      if (!targetUri) {
        // Provide helpful error with context about what's actually open
        const activeEditor = vscode.window.activeTextEditor;
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        const activeFileName =
          activeEditor?.document.fileName || activeTab?.label || "nothing";

        throw new Error(
          `No active Lexical document found. ` +
            `Currently active: "${activeFileName}". ` +
            `Please open a .dlex file or use the #file:filename.dlex variable to specify which file to edit.`,
        );
      }
    }

    // Return the lexicalId (URI string for local, or documentId for remote)
    const uriStr = targetUri.toString();

    // Try to get the ID from the registry (if it's already registered)
    const services = getServiceContainer();
    try {
      return services.documentRegistry.getIdFromUri(uriStr);
    } catch {
      // Not registered yet, use URI as ID (this is fine for local lexicals)
      return uriStr;
    }
  }

  /**
   * Formats operation result for VS Code
   */
  private formatResult(result: unknown): vscode.LanguageModelToolResult {
    // Convert result to user-friendly string
    let message: string;

    if (typeof result === "object" && result !== null) {
      const resultObj = result as {
        message?: string;
        success?: boolean;
        error?: string;
      };

      // Check for success message
      if (resultObj.message) {
        message = resultObj.message;
      } else if (resultObj.success === false && resultObj.error) {
        message = `❌ Error: ${resultObj.error}`;
      } else {
        // Format as JSON for complex results
        message = JSON.stringify(result, null, 2);
      }
    } else {
      message = String(result);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message),
    ]);
  }

  /**
   * Executes operation by sending message to active webview
   * Uses the Runner pattern: extension → webview message → DefaultExecutor
   */
  private async executeVSCodeCommand<T>(
    operationName: string,
    args: unknown,
  ): Promise<T> {
    const services = getServiceContainer();

    // Get the active webview panel from the document registry
    const webviewPanel = services.documentRegistry.getActiveWebviewPanel();

    if (!webviewPanel) {
      throw new Error(
        `No active webview found for operation: ${operationName}. ` +
          `Ensure a Datalayer notebook or lexical document is open.`,
      );
    }

    // Generate unique request ID
    const requestId = `${Date.now()}-${Math.random()}`;

    return new Promise((resolve, reject) => {
      // Set up timeout (30 seconds)
      const timeoutId = setTimeout(() => {
        listener.dispose();
        reject(new Error(`Tool execution timeout (30s): ${operationName}`));
      }, 30000);

      // Listen for response from webview
      const listener = webviewPanel.webview.onDidReceiveMessage((message) => {
        if (
          message.type === "tool-execution-response" &&
          message.requestId === requestId
        ) {
          // Clean up
          clearTimeout(timeoutId);
          listener.dispose();

          // Handle response
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.result as T);
          }
        }
      });

      // ALWAYS request raw JSON data from webview executor
      // Formatting happens at the final boundary (invoke() method) after all operations complete
      // This ensures internal operation calls (like deleteBlock → readAllBlocks) get raw arrays
      const format = "json";

      // Send execution request to webview
      webviewPanel.webview
        .postMessage({
          type: "tool-execution",
          requestId,
          operationName,
          args,
          format, // Always "json" for raw data - TOON formatting happens in invoke()
        })
        .then(
          () => {
            // Message sent successfully
          },
          (error) => {
            // Failed to send message
            clearTimeout(timeoutId);
            listener.dispose();
            reject(
              new Error(
                `Failed to send tool-execution message: ${error.message}`,
              ),
            );
          },
        );
    });
  }

  /**
   * Resolves a message by calling the message function with params
   */
  private resolveMessage(
    messageFn: ((params: TParams) => string) | undefined,
    params: TParams,
    fallback: string,
  ): string {
    return messageFn ? messageFn(params) : fallback;
  }
}
