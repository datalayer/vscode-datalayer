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
import type { ToolDefinition } from "../datalayer-core/tools/definitions/schema";
import type {
  ToolOperation,
  ToolExecutionContext,
} from "@datalayer/jupyter-react";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";
import { getServiceContainer } from "../extension";
import { analyzeOpenDocuments } from "../utils/documentAnalysis";

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
export class VSCodeToolAdapter<TParams>
  implements vscode.LanguageModelTool<TParams>
{
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
      // Build execution context
      const context = await this.buildExecutionContext(options.input);

      // Execute the core operation (platform-agnostic)
      const result = await this.operation.execute(options.input, context);

      // Special post-execution for createNotebook: Open the created notebook
      if (this.definition.operation === "createNotebook") {
        const resultWithUri = result as { success?: boolean; uri?: string };
        if (resultWithUri.success && resultWithUri.uri) {
          await this.openNotebook(resultWithUri.uri);
        }
      }

      // Format result for VS Code
      return this.formatResult(result);
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

    // Check if this tool needs a document ID
    const needsCellDocument = this.definition.tags?.includes("cell");
    const needsBlockDocument = this.definition.tags?.includes("lexical");

    const context: ToolExecutionContext = {
      format: responseFormat,

      // Provide executor that calls VS Code internal commands
      executor: {
        execute: async (command: string, args: unknown): Promise<unknown> => {
          return this.executeVSCodeCommand(command, args);
        },
      },

      // Set notebook or lexical ID if needed
      notebookId: needsCellDocument ? await this.resolveNotebookId(params) : undefined,

      // Put platform-specific services in extras
      extras: {
        sdk: services.sdk,
        auth: services.authProvider,
        lexicalId: needsBlockDocument ? await this.resolveLexicalId(params) : undefined,
      },
    };

    // Special handling for createNotebook tool - inject VS Code-specific extras
    if (this.definition.operation === "createNotebook") {
      context.extras = this.buildCreateNotebookExtras();
    } else {
      // Default extras for other tools
      context.extras = this.buildDefaultExtras();
    }

    return context;
  }

  /**
   * Builds extras for createNotebook operation with VS Code-specific logic
   */
  private buildCreateNotebookExtras(): Record<string, unknown> {
    const services = getServiceContainer();

    // Analyze open documents (notebooks + lexicals)
    const documentAnalysis = analyzeOpenDocuments();

    console.log("[VSCodeToolAdapter] Document analysis:", {
      native: documentAnalysis.nativeNotebooks.length,
      local: documentAnalysis.localDatalayerDocuments.length,
      cloud: documentAnalysis.cloudDatalayerDocuments.length,
      majorityType: documentAnalysis.majorityType,
    });

    return {
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
    };
  }

  /**
   * Builds default extras for non-createNotebook tools
   */
  private buildDefaultExtras(): Record<string, unknown> {
    return {
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
        .get<number>("defaultMinutes", 10),
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
   */
  private async openNotebook(uriString: string): Promise<void> {
    const uri = vscode.Uri.parse(uriString);
    const notebookDoc = await vscode.workspace.openNotebookDocument(uri);
    await vscode.window.showNotebookDocument(notebookDoc);
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
      console.log(
        `[VSCodeToolAdapter] Using documentUri from params: ${uriString}`,
      );
      targetUri = vscode.Uri.parse(uriString);
    } else {
      // Lexical documents are custom editors, not text editors
      // We need to check active tab in tab groups
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

      console.log(`[VSCodeToolAdapter] Active tab: ${activeTab?.label}`);
      console.log(
        `[VSCodeToolAdapter] Tab input type: ${activeTab?.input?.constructor.name}`,
      );

      if (activeTab?.input && typeof activeTab.input === "object") {
        const tabInput = activeTab.input as {
          uri?: vscode.Uri;
          viewType?: string;
        };

        console.log(`[VSCodeToolAdapter] Tab URI: ${tabInput.uri?.toString()}`);
        console.log(`[VSCodeToolAdapter] Tab viewType: ${tabInput.viewType}`);

        // Check if it's a Lexical custom editor
        if (tabInput.uri && tabInput.viewType === "datalayer.lexical-editor") {
          targetUri = tabInput.uri;
          console.log(
            `[VSCodeToolAdapter] ✓ Found active Lexical document: ${targetUri.toString()}`,
          );
        } else {
          console.log(
            `[VSCodeToolAdapter] ✗ Active tab is not a Lexical editor (viewType: ${tabInput.viewType})`,
          );
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
            `Please open a .lexical file or use the #file:filename.lexical variable to specify which file to edit.`,
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
   * Executes a VS Code internal command with URI resolution
   * Converts notebookId/lexicalId to documentUri for VS Code commands
   */
  private async executeVSCodeCommand<T>(
    command: string,
    args: unknown,
  ): Promise<T> {
    // Map platform-agnostic command to VS Code internal command
    const vscodeCommand = `datalayer.internal.${command}`;

    // Convert notebookId/lexicalId to URI if present in args
    const argsWithUri = this.resolveUriInArgs(args);

    return vscode.commands.executeCommand<T>(vscodeCommand, argsWithUri);
  }

  /**
   * Resolves notebookId/lexicalId to documentUri in command arguments
   */
  private resolveUriInArgs(args: unknown): unknown {
    if (typeof args !== "object" || args === null) {
      return args;
    }

    const argsObj = args as Record<string, unknown>;
    const services = getServiceContainer();

    // If notebookId present, convert to uri
    if ("notebookId" in argsObj && typeof argsObj.notebookId === "string") {
      const notebookId = argsObj.notebookId;
      try {
        const uri = services.documentRegistry.getUriFromId(notebookId);
        return { ...argsObj, uri, notebookId: undefined };
      } catch {
        // If not in registry, use notebookId as uri (local notebooks)
        return { ...argsObj, uri: notebookId, notebookId: undefined };
      }
    }

    // If lexicalId present, convert to uri
    if ("lexicalId" in argsObj && typeof argsObj.lexicalId === "string") {
      const lexicalId = argsObj.lexicalId;
      try {
        const uri = services.documentRegistry.getUriFromId(lexicalId);
        return { ...argsObj, uri, lexicalId: undefined };
      } catch {
        // If not in registry, use lexicalId as uri (local documents)
        return { ...argsObj, uri: lexicalId, lexicalId: undefined };
      }
    }

    return args;
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
