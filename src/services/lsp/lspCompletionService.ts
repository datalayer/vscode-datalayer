/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Service for requesting LSP completions from Python (Pylance) and Markdown language servers.
 * Routes requests to the appropriate language server based on cell language.
 *
 * @module services/lsp/lspCompletionService
 */

import * as vscode from "vscode";
import { LSPDocumentManager } from "./lspDocumentManager";

/**
 * Service for handling LSP completion requests.
 * Coordinates with LSPDocumentManager and VS Code's LSP infrastructure.
 */
export class LSPCompletionService {
  private documentManager: LSPDocumentManager;

  /**
   * Create a new LSPCompletionService.
   *
   * @param documentManager - Document manager for accessing virtual documents
   */
  constructor(documentManager: LSPDocumentManager) {
    this.documentManager = documentManager;
  }

  /**
   * Get completions for a cell at a specific position.
   *
   * @param cellId - Cell identifier
   * @param position - Position in the cell (line and character)
   * @param trigger - Optional trigger character
   * @returns Promise that resolves to array of completion items
   */
  public async getCompletions(
    cellId: string,
    position: { line: number; character: number },
    trigger?: string,
  ): Promise<vscode.CompletionItem[]> {
    // Get virtual document
    const virtualDoc = this.documentManager.getCellDocument(cellId);
    if (!virtualDoc) {
      return [];
    }

    // Get TextDocument
    const document = await this.documentManager.getTextDocument(cellId);
    if (!document) {
      return [];
    }

    const vsPosition = new vscode.Position(position.line, position.character);

    try {
      // Language-specific setup
      if (virtualDoc.language === "python") {
        await this.ensurePythonExtensionActive(document.uri);
      }
      // For markdown: No special setup needed, built-in LSP activates automatically

      // Request completions from appropriate LSP server
      // VS Code routes to correct server based on document URI extension (.py or .md)
      const completions = await vscode.commands.executeCommand<
        vscode.CompletionList | undefined
      >(
        "vscode.executeCompletionItemProvider",
        document.uri,
        vsPosition,
        trigger,
      );

      if (!completions) {
        return [];
      }

      return completions.items;
    } catch (error) {
      console.error("[LSPCompletionService] Error getting completions:", error);
      return [];
    }
  }

  /**
   * Resolve additional details for a completion item.
   *
   * @param item - Completion item to resolve
   * @returns Promise that resolves to resolved completion item
   */
  public async resolveCompletion(
    item: vscode.CompletionItem,
  ): Promise<vscode.CompletionItem> {
    try {
      const resolved = await vscode.commands.executeCommand<
        vscode.CompletionItem | undefined
      >("vscode.executeCompletionItemResolveProvider", item);

      return resolved || item;
    } catch (error) {
      return item;
    }
  }

  /**
   * Get hover information for a cell at a specific position.
   *
   * @param cellId - Cell identifier
   * @param position - Position in the cell (line and character)
   * @returns Promise that resolves to hover information or null
   */
  public async getHover(
    cellId: string,
    position: { line: number; character: number },
  ): Promise<vscode.Hover | null> {
    // Get virtual document
    const virtualDoc = this.documentManager.getCellDocument(cellId);
    if (!virtualDoc) {
      return null;
    }

    // Get TextDocument
    const document = await this.documentManager.getTextDocument(cellId);
    if (!document) {
      return null;
    }

    const vsPosition = new vscode.Position(position.line, position.character);

    try {
      // Language-specific setup
      if (virtualDoc.language === "python") {
        await this.ensurePythonExtensionActive(document.uri);
      }

      // Request hover from appropriate LSP server
      const hovers = await vscode.commands.executeCommand<
        vscode.Hover[] | undefined
      >("vscode.executeHoverProvider", document.uri, vsPosition);

      if (!hovers || hovers.length === 0) {
        return null;
      }

      return hovers[0];
    } catch (error) {
      return null;
    }
  }

  /**
   * Ensure Python extension is active and configured for a document.
   *
   * @param documentUri - Document URI
   */
  private async ensurePythonExtensionActive(
    documentUri: vscode.Uri,
  ): Promise<void> {
    try {
      // Get Python extension
      const pythonExtension =
        vscode.extensions.getExtension("ms-python.python");
      if (!pythonExtension) {
        return;
      }

      // Activate if not already active
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }

      // Get Python extension API
      const pythonAPI = pythonExtension.exports;
      if (!pythonAPI || !pythonAPI.environments) {
        return;
      }

      // Wait for API to be ready
      if (pythonAPI.ready) {
        await pythonAPI.ready;
      }

      // Get active interpreter for document
      // This configures Pylance with the correct interpreter
      pythonAPI.environments.getActiveEnvironmentPath(documentUri);
    } catch (error) {
      // Silent fail
    }
  }
}
