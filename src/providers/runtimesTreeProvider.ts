/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree data provider for the Datalayer Runtimes view.
 * Displays running runtimes with auto-refresh capabilities.
 *
 * @see https://code.visualstudio.com/api/extension-guides/tree-view
 * @module providers/runtimesTreeProvider
 */

import * as vscode from "vscode";
import { RuntimeTreeItem } from "../models/runtimeTreeItem";
import { SnapshotTreeItem } from "../models/snapshotTreeItem";
import { TreeSectionItem } from "../models/treeSectionItem";
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { RuntimeSnapshotDTO } from "@datalayer/core/lib/models/RuntimeSnapshotDTO";

/**
 * Union type for all tree items in the runtimes view.
 */
type RuntimesTreeItemType =
  | RuntimeTreeItem
  | SnapshotTreeItem
  | TreeSectionItem;

/**
 * Tree data provider for the Datalayer Runtimes view.
 * Implements VS Code's TreeDataProvider interface to display running runtimes
 * and snapshots in organized sections with automatic refresh for time remaining updates.
 *
 * @example
 * ```typescript
 * const provider = new RuntimesTreeProvider(authProvider);
 * provider.refresh(); // Refresh entire tree
 * ```
 */
export class RuntimesTreeProvider
  implements vscode.TreeDataProvider<RuntimesTreeItemType>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    RuntimesTreeItemType | undefined | void
  > = new vscode.EventEmitter<RuntimesTreeItemType | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    RuntimesTreeItemType | undefined | void
  > = this._onDidChangeTreeData.event;

  private authService: SDKAuthProvider;
  private runtimesCache: RuntimeDTO[] = [];
  private snapshotsCache: RuntimeSnapshotDTO[] = [];
  private refreshTimer?: NodeJS.Timeout;

  /**
   * Creates a new RuntimesTreeProvider.
   *
   * @param authProvider - Authentication provider for user state management
   */
  constructor(authProvider: SDKAuthProvider) {
    this.authService = authProvider;

    // Listen to auth changes to refresh when user logs in/out
    authProvider.onAuthStateChanged(() => this.refresh());

    // Auto-refresh every 30 seconds for time remaining updates
    this.startAutoRefresh();
  }

  /**
   * Refreshes the entire tree view by clearing cache and firing change event.
   */
  refresh(): void {
    this.runtimesCache = [];
    this.snapshotsCache = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The tree item to convert
   * @returns The tree item for VS Code to display
   */
  getTreeItem(element: RuntimesTreeItemType): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root
   * @returns Array of tree items
   */
  async getChildren(
    element?: RuntimesTreeItemType,
  ): Promise<RuntimesTreeItemType[]> {
    const authState = this.authService.getAuthState();

    // Check authentication
    if (!authState.isAuthenticated) {
      return [];
    }

    // Root level - return section headers
    if (!element) {
      return [
        new TreeSectionItem("Runtimes", "runtimes-section", "vm"),
        new TreeSectionItem("Snapshots", "snapshots-section", "archive"),
      ];
    }

    // Runtimes section - return runtime items
    if (
      element instanceof TreeSectionItem &&
      element.sectionType === "runtimes-section"
    ) {
      await this.loadRuntimes();
      if (this.runtimesCache.length === 0) {
        return [];
      }
      return this.runtimesCache.map((runtime) => new RuntimeTreeItem(runtime));
    }

    // Snapshots section - return snapshot items
    if (
      element instanceof TreeSectionItem &&
      element.sectionType === "snapshots-section"
    ) {
      await this.loadSnapshots();
      if (this.snapshotsCache.length === 0) {
        return [];
      }
      return this.snapshotsCache.map(
        (snapshot) => new SnapshotTreeItem(snapshot),
      );
    }

    // No children for leaf items
    return [];
  }

  /**
   * Loads runtimes from the SDK.
   * Updates the cache with fresh runtime data.
   */
  private async loadRuntimes(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.runtimesCache = [];
      return;
    }

    try {
      const sdk = getServiceContainer().sdk;
      this.runtimesCache = (await sdk.listRuntimes()) ?? [];
    } catch (error) {
      // Silently fail - tree will be empty
      this.runtimesCache = [];
    }
  }

  /**
   * Loads snapshots from the SDK.
   * Updates the cache with fresh snapshot data, filtering out deleted snapshots.
   */
  private async loadSnapshots(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.snapshotsCache = [];
      return;
    }

    try {
      const sdk = getServiceContainer().sdk;
      const allSnapshots = (await sdk.listSnapshots()) ?? [];

      // Filter out deleted snapshots by checking raw data status
      this.snapshotsCache = allSnapshots.filter((snapshot) => {
        const rawData = snapshot.rawData();
        // Skip deleted snapshots (status might be "deleted", "DELETED", or similar)
        if (
          rawData.status &&
          rawData.status.toLowerCase().includes("deleted")
        ) {
          return false;
        }
        return true;
      });
    } catch (error) {
      // Silently fail - tree will be empty
      this.snapshotsCache = [];
    }
  }

  /**
   * Starts automatic refresh timer to update time remaining.
   * Refreshes tree every 30 seconds to show updated expiration times.
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      // Only fire event to update UI, don't clear cache
      this._onDidChangeTreeData.fire();
    }, 30000); // Every 30 seconds
  }

  /**
   * Disposes resources including the refresh timer.
   */
  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }
}
