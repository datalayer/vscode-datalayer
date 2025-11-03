/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module providers/LexicalSymbolProvider
 * Provides document symbols for Lexical documents (.lexical files) to populate VS Code's Outline view.
 * Extracts heading nodes from Lexical editor state JSON structure.
 */

import * as vscode from "vscode";
import { headingLevelToString } from "../utils/markdownParser";

/**
 * Lexical node structure (simplified).
 */
interface LexicalNode {
  type: string;
  tag?: string; // For heading nodes: "h1", "h2", etc.
  text?: string; // For text nodes
  children?: LexicalNode[];
  version?: number;
  [key: string]: unknown;
}

/**
 * Lexical editor state structure.
 */
interface LexicalEditorState {
  root: {
    children: LexicalNode[];
    direction: string | null;
    format: string;
    indent: number;
    type: string;
    version: number;
  };
}

/**
 * Document symbol provider for Lexical rich text documents.
 * Parses .lexical files and extracts heading nodes for the Outline view.
 *
 * @example
 * ```typescript
 * const provider = new LexicalSymbolProvider();
 * context.subscriptions.push(
 *   vscode.languages.registerDocumentSymbolProvider(
 *     { pattern: "** /*.lexical" },
 *     provider
 *   )
 * );
 * ```
 */
export class LexicalSymbolProvider implements vscode.DocumentSymbolProvider {
  /**
   * Provides document symbols for a Lexical document file.
   *
   * @param document - The lexical document (as TextDocument containing JSON)
   * @param token - Cancellation token
   * @returns Array of document symbols representing document structure
   */
  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentSymbol[]> {
    // Only process .lexical files
    if (!document.fileName.endsWith(".lexical")) {
      return [];
    }

    try {
      // Parse Lexical JSON
      const lexicalJson = document.getText();
      const editorState: LexicalEditorState = JSON.parse(lexicalJson);

      if (!editorState.root || !editorState.root.children) {
        return [];
      }

      const symbols: vscode.DocumentSymbol[] = [];
      const headingStack: vscode.DocumentSymbol[] = [];

      // Process all nodes in the document
      this.processNodes(
        editorState.root.children,
        document,
        symbols,
        headingStack,
        token,
      );

      return symbols;
    } catch (error) {
      // If JSON parsing fails or any other error, return empty symbols
      console.error("Failed to parse Lexical document for outline:", error);
      return [];
    }
  }

  /**
   * Recursively processes Lexical nodes to extract headings.
   */
  private processNodes(
    nodes: LexicalNode[],
    document: vscode.TextDocument,
    rootSymbols: vscode.DocumentSymbol[],
    headingStack: vscode.DocumentSymbol[],
    token: vscode.CancellationToken,
  ): void {
    for (const node of nodes) {
      if (token.isCancellationRequested) {
        return;
      }

      // Check if this is a heading node
      if (node.type === "heading" && node.tag) {
        const level = this.extractHeadingLevel(node.tag);
        if (level !== null) {
          const text = this.extractTextFromNode(node);
          if (text.trim()) {
            const symbol = this.createHeadingSymbol(node, text, level, document);

            // Build hierarchy based on heading levels
            while (
              headingStack.length > 0 &&
              this.getHeadingLevel(headingStack[headingStack.length - 1]) >=
                level
            ) {
              headingStack.pop();
            }

            if (headingStack.length === 0) {
              // Root level heading
              rootSymbols.push(symbol);
            } else {
              // Child of previous heading
              const parent = headingStack[headingStack.length - 1];
              parent.children.push(symbol);
            }

            headingStack.push(symbol);
          }
        }
      }

      // Recursively process children
      if (node.children && Array.isArray(node.children)) {
        this.processNodes(
          node.children,
          document,
          rootSymbols,
          headingStack,
          token,
        );
      }
    }
  }

  /**
   * Extracts heading level from tag (e.g., "h1" -> 1, "h2" -> 2).
   */
  private extractHeadingLevel(tag: string): number | null {
    const match = tag.match(/^h([1-6])$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extracts text content from a Lexical node and its children.
   */
  private extractTextFromNode(node: LexicalNode): string {
    if (node.text) {
      return node.text;
    }

    if (node.children && Array.isArray(node.children)) {
      return node.children
        .map((child) => this.extractTextFromNode(child))
        .join("");
    }

    return "";
  }

  /**
   * Creates a DocumentSymbol for a heading node.
   */
  private createHeadingSymbol(
    _node: LexicalNode,
    text: string,
    level: number,
    document: vscode.TextDocument,
  ): vscode.DocumentSymbol {
    // Since we can't easily map to exact byte positions in the formatted JSON,
    // we use a general range covering the document
    // In practice, clicking will open the document and the webview can handle navigation
    const range = new vscode.Range(0, 0, document.lineCount - 1, 0);
    const selectionRange = range;

    const symbol = new vscode.DocumentSymbol(
      text,
      headingLevelToString(level),
      level === 1 ? vscode.SymbolKind.Module : vscode.SymbolKind.Class,
      range,
      selectionRange,
    );

    symbol.children = [];
    return symbol;
  }

  /**
   * Extracts heading level from a DocumentSymbol.
   */
  private getHeadingLevel(symbol: vscode.DocumentSymbol): number {
    // Extract level from detail string (e.g., "H2" -> 2)
    const match = symbol.detail.match(/^H(\d)$/);
    return match ? parseInt(match[1], 10) : 999;
  }
}
