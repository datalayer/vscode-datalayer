/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Bridge for handling LSP-related messages between webview and extension host.
 * Routes completion/hover requests to appropriate LSP services.
 *
 * @module services/bridges/lspBridge
 */

import * as vscode from "vscode";
import { LSPDocumentManager } from "../lsp/lspDocumentManager";
import { LSPCompletionService } from "../lsp/lspCompletionService";
import {
  LSPRequest,
  LSPResponse,
  LSPCompletionRequest,
  LSPHoverRequest,
  LSPDocumentSyncRequest,
  LSPDocumentOpenRequest,
  LSPDocumentCloseRequest,
  SerializableCompletionItem,
} from "../lsp/types";

/**
 * Bridge for handling LSP messages from webview.
 * Manages virtual documents and routes LSP requests to appropriate services.
 */
export class LSPBridge {
  private documentManager: LSPDocumentManager;
  private completionService: LSPCompletionService;

  /**
   * Create a new LSPBridge.
   */
  constructor() {
    this.documentManager = new LSPDocumentManager();
    this.completionService = new LSPCompletionService(this.documentManager);
  }

  /**
   * Handle an LSP request message from the webview.
   *
   * @param message - LSP request message
   * @param webview - Webview to send response to
   */
  public async handleMessage(
    message: LSPRequest,
    webview: vscode.Webview | null,
  ): Promise<void> {
    try {
      switch (message.type) {
        case "lsp-completion-request":
          await this.handleCompletionRequest(message, webview);
          break;

        case "lsp-hover-request":
          await this.handleHoverRequest(message, webview);
          break;

        case "lsp-document-sync":
          this.handleDocumentSync(message);
          break;

        case "lsp-document-open":
          await this.handleDocumentOpen(message);
          break;

        case "lsp-document-close":
          this.handleDocumentClose(message);
          break;

        default:
          console.warn(
            "[LSPBridge] Unknown message type:",
            (message as { type?: string }).type,
          );
          break;
      }
    } catch (error) {
      console.error("[LSPBridge] Error handling message:", error);
      // Send error response if this was a request with requestId
      if ("requestId" in message && webview) {
        const errorResponse: LSPResponse = {
          type: "lsp-error",
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error),
        };
        webview.postMessage(errorResponse);
      }
    }
  }

  /**
   * Handle completion request.
   */
  private async handleCompletionRequest(
    message: LSPCompletionRequest,
    webview: vscode.Webview | null,
  ): Promise<void> {
    if (!webview) {
      console.warn(
        "[LSPBridge] Cannot handle completion request without webview",
      );
      return;
    }
    try {
      const completions = await this.completionService.getCompletions(
        message.cellId,
        message.position,
        message.trigger,
      );

      // Convert CompletionItems to plain objects for serialization
      const plainCompletions: SerializableCompletionItem[] = completions.map(
        (item) => ({
          label: item.label,
          kind: item.kind,
          detail: item.detail,
          documentation: item.documentation,
          sortText: item.sortText,
          filterText: item.filterText,
          insertText:
            typeof item.insertText === "string"
              ? item.insertText
              : item.insertText?.value,
          range: item.range,
          command: item.command,
          commitCharacters: item.commitCharacters,
          additionalTextEdits: item.additionalTextEdits,
          tags: item.tags,
        }),
      );

      const response: LSPResponse = {
        type: "lsp-completion-response",
        requestId: message.requestId,
        completions: plainCompletions,
      };

      webview.postMessage(response);
    } catch (error) {
      console.error("[LSPBridge] Error in handleCompletionRequest:", error);
      const errorResponse: LSPResponse = {
        type: "lsp-error",
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      webview.postMessage(errorResponse);
    }
  }

  /**
   * Handle hover request.
   */
  private async handleHoverRequest(
    message: LSPHoverRequest,
    webview: vscode.Webview | null,
  ): Promise<void> {
    if (!webview) {
      console.warn("[LSPBridge] Cannot handle hover request without webview");
      return;
    }
    try {
      const hover = await this.completionService.getHover(
        message.cellId,
        message.position,
      );

      const response: LSPResponse = {
        type: "lsp-hover-response",
        requestId: message.requestId,
        hover: hover
          ? {
              contents: hover.contents,
              range: hover.range,
            }
          : null,
      };

      webview.postMessage(response);
    } catch (error) {
      const errorResponse: LSPResponse = {
        type: "lsp-error",
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      webview.postMessage(errorResponse);
    }
  }

  /**
   * Handle document sync (content update).
   */
  private handleDocumentSync(message: LSPDocumentSyncRequest): void {
    this.documentManager.updateCellContent(message.cellId, message.content);
  }

  /**
   * Handle document open (create virtual document).
   */
  private async handleDocumentOpen(
    message: LSPDocumentOpenRequest,
  ): Promise<void> {
    await this.documentManager.createCellDocument(
      message.notebookId,
      message.cellId,
      message.content,
      message.language,
      message.source || "notebook",
    );
  }

  /**
   * Handle document close (remove virtual document).
   */
  private handleDocumentClose(message: LSPDocumentCloseRequest): void {
    this.documentManager.closeCellDocument(message.cellId);
  }

  /**
   * Get the document manager instance.
   */
  public getDocumentManager(): LSPDocumentManager {
    return this.documentManager;
  }

  /**
   * Get the completion service instance.
   */
  public getCompletionService(): LSPCompletionService {
    return this.completionService;
  }

  /**
   * Dispose of the bridge and clean up resources.
   */
  public dispose(): void {
    this.documentManager.dispose();
  }
}
