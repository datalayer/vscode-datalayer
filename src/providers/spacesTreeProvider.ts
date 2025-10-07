/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree data provider for the Datalayer spaces view.
 * Displays user's spaces and documents in a hierarchical tree structure with caching.
 *
 * @see https://code.visualstudio.com/api/extension-guides/tree-view
 * @module providers/spacesTreeProvider
 */

import * as vscode from "vscode";
import { SpaceItem, ItemType } from "../models/spaceItem";
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import { ItemTypes } from "@datalayer/core/lib/client/constants";
import type { Space } from "@datalayer/core/lib/client/models/Space";
import type { Notebook } from "@datalayer/core/lib/client/models/Notebook";
import type { Lexical } from "@datalayer/core/lib/client/models/Lexical";

/**
 * Tree data provider for the Datalayer Spaces view.
 * Implements VS Code's TreeDataProvider interface to display spaces and documents
 * with caching for improved performance.
 *
 * @example
 * ```typescript
 * const provider = new SpacesTreeProvider(authProvider);
 * provider.refresh(); // Refresh entire tree
 * provider.refreshSpace(spaceId); // Refresh specific space
 * ```
 */
export class SpacesTreeProvider implements vscode.TreeDataProvider<SpaceItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SpaceItem | undefined | null | void
  > = new vscode.EventEmitter<SpaceItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SpaceItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private authService: SDKAuthProvider;
  private spacesCache: Map<string, Space[]> = new Map();
  private itemsCache: Map<string, (Notebook | Lexical)[]> = new Map();

  /**
   * Creates a new SpacesTreeProvider.
   *
   * @param authProvider - Authentication provider for user state management
   */
  constructor(authProvider: SDKAuthProvider) {
    this.authService = authProvider;
  }

  /**
   * Refreshes the entire tree view by clearing caches and firing change event.
   */
  refresh(): void {
    this.spacesCache.clear();
    this.itemsCache.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refreshes a specific space in the tree.
   *
   * @param spaceId - ID of the space to refresh
   */
  refreshSpace(spaceId: string): void {
    // Clear both the items cache and spaces cache to ensure fresh data
    this.itemsCache.delete(spaceId);
    this.spacesCache.clear(); // Clear spaces cache to get fresh items data
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The SpaceItem to convert
   * @returns The tree item for VS Code to display
   */
  getTreeItem(element: SpaceItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root
   * @returns Array of child SpaceItems
   */
  async getChildren(element?: SpaceItem): Promise<SpaceItem[]> {
    const authState = this.authService.getAuthState();

    // Root level - check authentication
    if (!element) {
      if (!authState.isAuthenticated) {
        return [
          new SpaceItem(
            "Not logged in - Click to login",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "Click to login to Datalayer",
            },
          ),
        ];
      }

      // Get username or GitHub login for display
      const user = authState.user;
      if (!user) {
        return [
          new SpaceItem(
            "Authentication error - please try again",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "User information not available",
            },
          ),
        ];
      }

      const displayName = user.displayName || user.email;

      return [
        new SpaceItem(
          `Datalayer (${displayName})`,
          vscode.TreeItemCollapsibleState.Expanded,
          {
            type: ItemType.ROOT,
            username: displayName,
          },
        ),
      ];
    }

    // Handle different node types
    switch (element.data.type) {
      case ItemType.ROOT:
        return this.getSpaces();
      case ItemType.SPACE:
        if (element.data.space) {
          return this.getSpaceItems(element.data.space);
        }
        break;
      case ItemType.FOLDER:
        // For folders, we could implement subfolder logic here
        break;
    }

    return [];
  }

  /**
   * Fetches and returns user's spaces as tree items.
   *
   * @returns Array of SpaceItems representing user's spaces
   */
  private async getSpaces(): Promise<SpaceItem[]> {
    try {
      // Check cache first
      let spaces: Space[];
      if (this.spacesCache.has("user")) {
        spaces = this.spacesCache.get("user")!;
      } else {
        // Show loading state
        this._onDidChangeTreeData.fire();

        const sdk = getServiceContainer().sdk;
        spaces = (await sdk.getMySpaces()) ?? [];
        this.spacesCache.set("user", spaces);
      }

      if (spaces.length === 0) {
        return [
          new SpaceItem(
            "No spaces found",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "No spaces available",
            },
          ),
        ];
      }

      // Sort spaces: default space first, then alphabetically
      spaces.sort((a, b) => {
        if (a.variant === "default") {
          return -1;
        }
        if (b.variant === "default") {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Create tree items
      return spaces.map((space) => {
        const name = space.name;
        const variant = space.variant;
        const label = variant === "default" ? `${name} (Default)` : name;
        return new SpaceItem(label, vscode.TreeItemCollapsibleState.Collapsed, {
          type: ItemType.SPACE,
          space: space,
        });
      });
    } catch (error) {
      return [
        new SpaceItem(
          "Failed to load spaces",
          vscode.TreeItemCollapsibleState.None,
          {
            type: ItemType.ERROR,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ),
      ];
    }
  }

  /**
   * Fetches and returns items within a specific space.
   *
   * @param space - The space object containing space metadata
   * @returns Array of SpaceItems representing documents in the space
   */
  private async getSpaceItems(space: unknown): Promise<SpaceItem[]> {
    try {
      const spaceObj = space as Space;
      const spaceId = spaceObj.uid;

      if (!spaceId) {
        return [
          new SpaceItem(
            "Unable to load items - invalid space ID",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "Space ID is missing",
            },
          ),
        ];
      }

      let items: (Notebook | Lexical)[] = [];

      if (this.itemsCache.has(spaceId)) {
        items = this.itemsCache.get(spaceId)!;
      } else {
        const sdk = getServiceContainer().sdk;

        // Get the space to access its items
        const spaces = await sdk.getMySpaces();
        const targetSpace = spaces.find((s: Space) => s.uid === spaceId);

        if (targetSpace) {
          // Get items from the space - returns Notebook, Lexical, and Cell model instances
          const allItems = (await targetSpace.getItems()) ?? [];
          // Filter to only notebooks and lexicals
          items = allItems.filter(
            (item): item is Notebook | Lexical =>
              item.type === ItemTypes.NOTEBOOK ||
              item.type === ItemTypes.LEXICAL,
          );
        } else {
          items = [];
        }

        this.itemsCache.set(spaceId, items);
      }

      if (items.length === 0) {
        return [
          new SpaceItem(
            "No items found",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "This space is empty",
            },
          ),
        ];
      }

      const spaceName = spaceObj.name;
      const result: SpaceItem[] = [];

      for (const item of items) {
        const itemType = item.type;
        let itemName = item.name || "";

        // Only show notebooks and lexicals
        if (itemType === ItemTypes.NOTEBOOK) {
          // Use the model's extension getter
          const extension = item.extension || "";
          if (!itemName.endsWith(extension)) {
            itemName = `${itemName}${extension}`;
          }
          result.push(
            new SpaceItem(itemName, vscode.TreeItemCollapsibleState.None, {
              type: ItemType.NOTEBOOK,
              document: item, // The Notebook instance itself is the document
              spaceName: spaceName,
            }),
          );
        } else if (itemType === ItemTypes.LEXICAL) {
          // Use the model's extension getter
          const extension = item.extension || "";
          if (!itemName.endsWith(extension)) {
            itemName = `${itemName}${extension}`;
          }
          result.push(
            new SpaceItem(itemName, vscode.TreeItemCollapsibleState.None, {
              type: ItemType.DOCUMENT,
              document: item, // The Lexical instance itself is the document
              spaceName: spaceName,
            }),
          );
        }
        // Skip cells and other types - don't add them to the tree
      }

      if (result.length === 0 && items.length > 0) {
        return [
          new SpaceItem(
            "No notebooks or lexical documents found",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "This space may contain other document types",
            },
          ),
        ];
      }

      return result;
    } catch (error) {
      return [
        new SpaceItem(
          "Failed to load documents",
          vscode.TreeItemCollapsibleState.None,
          {
            type: ItemType.ERROR,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ),
      ];
    }
  }

  /**
   * Gets the parent of a tree item.
   *
   * @param element - The child element
   * @returns The parent SpaceItem or undefined
   */
  getParent(element: SpaceItem): vscode.ProviderResult<SpaceItem> {
    return element.parent;
  }
}
