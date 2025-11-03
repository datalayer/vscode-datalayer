/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module providers/DocumentOutlineProvider
 * Custom tree view provider for document outlines.
 * Displays notebook and lexical document structure in the sidebar.
 */

import * as vscode from "vscode";
import { parseMarkdownStructure, type MarkdownHeading } from "../utils/markdownParser";

/**
 * Outline item for tree view display.
 */
export class OutlineItem extends vscode.TreeItem {
  constructor(
    public override readonly label: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: string,
    public readonly documentUri?: vscode.Uri,
    public readonly children?: OutlineItem[],
  ) {
    super(label, collapsibleState);

    // Set icon based on kind
    if (kind.startsWith("heading")) {
      this.iconPath = new vscode.ThemeIcon("symbol-text");
    } else if (kind === "code") {
      this.iconPath = new vscode.ThemeIcon("symbol-method");
    }

    this.contextValue = kind;
    this.description = kind.startsWith("heading") ? kind.toUpperCase() : undefined;
  }
}

/**
 * Tree data provider for document outlines.
 * Works with both notebook and lexical documents.
 */
export class DocumentOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutlineItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentDocumentUri?: vscode.Uri;
  private outlineCache = new Map<string, OutlineItem[]>();

  /**
   * Refresh the outline view for a specific document.
   */
  refresh(documentUri?: vscode.Uri): void {
    if (documentUri) {
      this.currentDocumentUri = documentUri;
      this.outlineCache.delete(documentUri.toString());
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Update outline with data from webview (for real-time updates).
   * This bypasses file reading and uses data sent from the webview.
   */
  updateFromWebview(documentUri: vscode.Uri, headings: Array<{ text: string; level: number }>): void {
    this.currentDocumentUri = documentUri;

    // Convert heading data to OutlineItem hierarchy
    const items: OutlineItem[] = [];
    const headingStack: Array<{ level: number; item: OutlineItem }> = [];

    for (const heading of headings) {
      const item = new OutlineItem(
        heading.text,
        vscode.TreeItemCollapsibleState.Collapsed,
        `heading${heading.level}`,
        documentUri,
      );

      // Build hierarchy
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= heading.level
      ) {
        headingStack.pop();
      }

      if (headingStack.length === 0) {
        items.push(item);
      } else {
        const parent = headingStack[headingStack.length - 1].item;
        if (!parent.children) {
          (parent as any).children = [];
        }
        parent.children!.push(item);
      }

      headingStack.push({ level: heading.level, item });
    }

    this.outlineCache.set(documentUri.toString(), items);
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Clear the outline view.
   */
  clear(): void {
    this.currentDocumentUri = undefined;
    this.outlineCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: OutlineItem): Promise<OutlineItem[]> {
    if (!element) {
      // Root level - get outline for current document
      if (!this.currentDocumentUri) {
        return [];
      }

      // Check cache
      const cached = this.outlineCache.get(this.currentDocumentUri.toString());
      if (cached) {
        return cached;
      }

      // Extract outline based on file type
      const outline = await this.extractOutline(this.currentDocumentUri);
      this.outlineCache.set(this.currentDocumentUri.toString(), outline);
      return outline;
    }

    return element.children || [];
  }

  /**
   * Extract outline from document based on file extension.
   */
  private async extractOutline(uri: vscode.Uri): Promise<OutlineItem[]> {
    const fileName = uri.fsPath;

    try {
      if (fileName.endsWith(".ipynb")) {
        return await this.extractNotebookOutline(uri);
      } else if (fileName.endsWith(".lexical")) {
        return await this.extractLexicalOutline(uri);
      }
    } catch (error) {
      console.error("Failed to extract outline:", error);
    }

    return [];
  }

  /**
   * Extract outline from Jupyter notebook.
   */
  private async extractNotebookOutline(uri: vscode.Uri): Promise<OutlineItem[]> {
    const document = await vscode.workspace.openTextDocument(uri);
    const notebookJson = document.getText();

    try {
      const notebook = JSON.parse(notebookJson);
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return [];
      }

      const items: OutlineItem[] = [];
      const headingStack: Array<{ level: number; item: OutlineItem }> = [];

      for (let i = 0; i < notebook.cells.length; i++) {
        const cell = notebook.cells[i];
        const source = Array.isArray(cell.source)
          ? cell.source.join("")
          : cell.source || "";

        if (cell.cell_type === "markdown" && source.trim()) {
          const headings = parseMarkdownStructure(source);
          this.addHeadingsToOutline(headings, items, headingStack, uri);
        } else if (cell.cell_type === "code") {
          const executionCount = cell.execution_count ?? " ";
          const label = `[${executionCount}] Code Cell ${i + 1}`;
          const item = new OutlineItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            "code",
            uri,
          );

          // Code cells reset heading stack
          headingStack.length = 0;
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      console.error("Failed to parse notebook:", error);
      return [];
    }
  }

  /**
   * Extract outline from Lexical document.
   */
  private async extractLexicalOutline(uri: vscode.Uri): Promise<OutlineItem[]> {
    const document = await vscode.workspace.openTextDocument(uri);
    const lexicalJson = document.getText();

    try {
      const editorState = JSON.parse(lexicalJson);
      if (!editorState.root || !editorState.root.children) {
        return [];
      }

      const items: OutlineItem[] = [];
      const headingStack: Array<{ level: number; item: OutlineItem }> = [];

      this.extractLexicalHeadings(
        editorState.root.children,
        items,
        headingStack,
        uri,
      );

      return items;
    } catch (error) {
      console.error("Failed to parse lexical document:", error);
      return [];
    }
  }

  /**
   * Recursively extract headings from Lexical nodes.
   */
  private extractLexicalHeadings(
    nodes: any[],
    rootItems: OutlineItem[],
    headingStack: Array<{ level: number; item: OutlineItem }>,
    uri: vscode.Uri,
  ): void {
    for (const node of nodes) {
      if (node.type === "heading" && node.tag) {
        const levelMatch = node.tag.match(/^h([1-6])$/);
        if (levelMatch) {
          const level = parseInt(levelMatch[1], 10);
          const text = this.extractTextFromLexicalNode(node);

          if (text.trim()) {
            const item = new OutlineItem(
              text,
              vscode.TreeItemCollapsibleState.Collapsed,
              `heading${level}`,
              uri,
            );

            // Build hierarchy
            while (
              headingStack.length > 0 &&
              headingStack[headingStack.length - 1].level >= level
            ) {
              headingStack.pop();
            }

            if (headingStack.length === 0) {
              rootItems.push(item);
            } else {
              const parent = headingStack[headingStack.length - 1].item;
              if (!parent.children) {
                (parent as any).children = [];
              }
              parent.children!.push(item);
            }

            headingStack.push({ level, item });
          }
        }
      }

      // Recurse into children
      if (node.children && Array.isArray(node.children)) {
        this.extractLexicalHeadings(node.children, rootItems, headingStack, uri);
      }
    }
  }

  /**
   * Extract text from Lexical node.
   */
  private extractTextFromLexicalNode(node: any): string {
    if (node.text) {
      return node.text;
    }

    if (node.children && Array.isArray(node.children)) {
      return node.children
        .map((child: any) => this.extractTextFromLexicalNode(child))
        .join("");
    }

    return "";
  }

  /**
   * Add markdown headings to outline tree.
   */
  private addHeadingsToOutline(
    headings: MarkdownHeading[],
    rootItems: OutlineItem[],
    headingStack: Array<{ level: number; item: OutlineItem }>,
    uri: vscode.Uri,
  ): void {
    for (const heading of headings) {
      const item = new OutlineItem(
        heading.text,
        heading.children.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
        `heading${heading.level}`,
        uri,
      );

      // Build hierarchy
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= heading.level
      ) {
        headingStack.pop();
      }

      if (headingStack.length === 0) {
        rootItems.push(item);
      } else {
        const parent = headingStack[headingStack.length - 1].item;
        if (!parent.children) {
          (parent as any).children = [];
        }
        parent.children!.push(item);
      }

      headingStack.push({ level: heading.level, item });

      // Process children recursively
      if (heading.children.length > 0) {
        (item as any).children = [];
        this.addHeadingsToOutline(heading.children, item.children!, headingStack, uri);
      }
    }
  }
}
