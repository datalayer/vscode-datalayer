/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree provider for document outline (table of contents).
 * Displays hierarchical structure of headings and code cells from active documents.
 *
 * @module providers/outlineTreeProvider
 */

import * as vscode from "vscode";
import type { OutlineItem } from "../../webview/types/messages";

/**
 * Tree provider for document outline view.
 * Manages outline data from multiple documents and handles navigation.
 */
export class OutlineTreeProvider
  implements vscode.TreeDataProvider<OutlineTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    OutlineTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Store outline data per document URI
  private outlineData = new Map<string, OutlineItem[]>();

  // Track active document and item
  private activeDocumentUri: string | undefined;
  private activeItemId: string | undefined;

  // Track webview panels for navigation
  private webviewPanels = new Map<string, vscode.WebviewPanel>();

  /**
   * Register a webview panel for a document.
   * Required for navigation functionality.
   */
  public registerWebviewPanel(
    documentUri: string,
    panel: vscode.WebviewPanel,
  ): void {
    this.webviewPanels.set(documentUri, panel);

    // Set as active document when panel becomes visible
    if (panel.visible) {
      this.setActiveDocument(documentUri);
    }

    // Update active document when panel becomes visible
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        this.setActiveDocument(documentUri);
      }
    });

    // Clean up when panel is disposed
    panel.onDidDispose(() => {
      this.webviewPanels.delete(documentUri);
      this.outlineData.delete(documentUri);

      // If this was the active document, clear it
      if (this.activeDocumentUri === documentUri) {
        // Check if there are any other panels still open
        const remainingPanels = Array.from(this.webviewPanels.values());
        const visiblePanel = remainingPanels.find((p) => p.visible);

        if (visiblePanel) {
          // Set the first visible panel as active
          const visiblePanelUri = Array.from(this.webviewPanels.entries()).find(
            ([_, p]) => p.visible,
          )?.[0];
          this.activeDocumentUri = visiblePanelUri;
        } else {
          // No more panels, clear everything
          this.activeDocumentUri = undefined;
          this.activeItemId = undefined;
        }

        // Always fire refresh when active document changes
        this._onDidChangeTreeData.fire();
      }
    });
  }

  /**
   * Update outline for a document.
   * Called when webview sends outline-update message.
   */
  public updateOutline(
    documentUri: string,
    items: OutlineItem[],
    activeItemId?: string,
  ): void {
    console.log("[OutlineTreeProvider] updateOutline called", {
      documentUri,
      itemCount: items.length,
      activeItemId,
      activeDocumentUri: this.activeDocumentUri,
      items: items
        .slice(0, 3)
        .map((i) => ({ id: i.id, label: i.label, type: i.type })),
    });

    this.outlineData.set(documentUri, items);
    this.activeItemId = activeItemId;

    // CRITICAL: When receiving outline update, set this document as active
    // This handles the case where VS Code reuses the same webview panel for different documents
    if (this.activeDocumentUri !== documentUri) {
      console.log(
        "[OutlineTreeProvider] Outline update for different document, updating active document",
      );
      this.activeDocumentUri = documentUri;
    }

    // Always refresh when outline data changes
    console.log("[OutlineTreeProvider] Firing tree refresh event");
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set the active document.
   * Called when user switches between editors.
   */
  public setActiveDocument(uri: string | undefined): void {
    console.log("[OutlineTreeProvider] setActiveDocument called", {
      oldUri: this.activeDocumentUri,
      newUri: uri,
    });

    if (this.activeDocumentUri !== uri) {
      this.activeDocumentUri = uri;
      this.activeItemId = undefined;
      console.log(
        "[OutlineTreeProvider] Active document changed, refreshing tree",
      );
      this._onDidChangeTreeData.fire();
    } else {
      console.log("[OutlineTreeProvider] Active document unchanged");
    }
  }

  /**
   * Navigate to an outline item.
   * Sends message to webview to scroll to the item.
   */
  public async navigateToItem(item: OutlineTreeItem): Promise<void> {
    if (!this.activeDocumentUri) {
      return;
    }

    const panel = this.webviewPanels.get(this.activeDocumentUri);
    if (!panel) {
      vscode.window.showWarningMessage("Document webview not found");
      return;
    }

    // Send navigation message to webview
    await panel.webview.postMessage({
      type: "outline-navigate",
      itemId: item.item.id,
    });

    // Focus the webview panel
    panel.reveal(vscode.ViewColumn.One, false);
  }

  /**
   * Refresh the outline view.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for display.
   */
  getTreeItem(element: OutlineTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for tree hierarchy.
   */
  getChildren(element?: OutlineTreeItem): OutlineTreeItem[] {
    console.log("[OutlineTreeProvider] getChildren called", {
      hasElement: !!element,
      elementLabel: element?.item.label,
      activeDocumentUri: this.activeDocumentUri,
      hasOutlineData: this.outlineData.size > 0,
      outlineDataKeys: Array.from(this.outlineData.keys()),
    });

    if (!this.activeDocumentUri) {
      console.log("[OutlineTreeProvider] No active document, returning empty");
      return [];
    }

    const items = this.outlineData.get(this.activeDocumentUri);
    console.log("[OutlineTreeProvider] Retrieved items for active document", {
      itemCount: items?.length || 0,
      items: items?.slice(0, 3).map((i) => ({ id: i.id, label: i.label })),
    });

    if (!items) {
      console.log("[OutlineTreeProvider] No items found for active document");
      return [];
    }

    if (!element) {
      // Root level
      const rootItems = items.map(
        (item) => new OutlineTreeItem(item, item.id === this.activeItemId),
      );
      console.log("[OutlineTreeProvider] Returning root items", {
        count: rootItems.length,
      });
      return rootItems;
    }

    // Children of an element
    if (element.item.children && element.item.children.length > 0) {
      return element.item.children.map(
        (child) => new OutlineTreeItem(child, child.id === this.activeItemId),
      );
    }

    return [];
  }

  /**
   * Dispose resources.
   */
  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.webviewPanels.clear();
    this.outlineData.clear();
  }
}

/**
 * Tree item representing an outline entry.
 */
export class OutlineTreeItem extends vscode.TreeItem {
  constructor(
    public readonly item: OutlineItem,
    public readonly isActive: boolean,
  ) {
    super(
      item.label,
      item.children && item.children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );

    // Set description for active item
    if (isActive) {
      this.description = "← current";
    }

    // Set icon only for code cells
    if (item.type === "code-cell" || item.type === "code") {
      this.iconPath = new vscode.ThemeIcon("play");
    }

    // Set tooltip
    this.tooltip = this.getTooltip();

    // Make clickable
    this.command = {
      command: "datalayer.outline.navigate",
      title: "Navigate to",
      arguments: [this],
    };

    // Set context value for menu contributions
    this.contextValue = item.type;
  }

  /**
   * Get tooltip text.
   */
  private getTooltip(): string {
    let type: string;

    if (
      this.item.type === "h1" ||
      this.item.type === "h2" ||
      this.item.type === "h3" ||
      this.item.type === "h4" ||
      this.item.type === "h5" ||
      this.item.type === "h6"
    ) {
      type = `Heading ${this.item.type.substring(1)}`;
    } else if (this.item.type === "heading") {
      type = `Heading ${this.item.level || ""}`;
    } else if (this.item.type === "code" || this.item.type === "code-cell") {
      type = "Code";
    } else if (this.item.type === "markdown-cell") {
      type = "Markdown Cell";
    } else {
      type = this.item.type;
    }

    const location =
      this.item.cellIndex !== undefined
        ? ` (Cell ${this.item.cellIndex + 1})`
        : this.item.line !== undefined
          ? ` (Line ${this.item.line + 1})`
          : "";

    return `${type}${location}: ${this.item.label}`;
  }
}
