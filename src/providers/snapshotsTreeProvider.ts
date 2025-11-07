/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree data provider for the Datalayer Snapshots view.
 * Displays runtime snapshots with auto-refresh capabilities.
 *
 * @see https://code.visualstudio.com/api/extension-guides/tree-view
 * @module providers/snapshotsTreeProvider
 */

import * as vscode from "vscode";
import { SnapshotTreeItem } from "../models/snapshotTreeItem";
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import type { RuntimeSnapshotDTO } from "@datalayer/core/lib/models/RuntimeSnapshotDTO";

/**
 * Tree data provider for the Datalayer Snapshots view.
 * Implements VS Code's TreeDataProvider interface to display runtime snapshots.
 *
 * @example
 * ```typescript
 * const provider = new SnapshotsTreeProvider(authProvider);
 * provider.refresh(); // Refresh entire tree
 * ```
 */
export class SnapshotsTreeProvider
  implements vscode.TreeDataProvider<SnapshotTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SnapshotTreeItem | undefined | void
  > = new vscode.EventEmitter<SnapshotTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SnapshotTreeItem | undefined | void
  > = this._onDidChangeTreeData.event;

  private authService: SDKAuthProvider;
  private snapshotsCache: RuntimeSnapshotDTO[] = [];

  /**
   * Creates a new SnapshotsTreeProvider.
   *
   * @param authProvider - Authentication provider for user state management
   */
  constructor(authProvider: SDKAuthProvider) {
    this.authService = authProvider;

    // Listen to auth changes to refresh when user logs in/out
    authProvider.onAuthStateChanged(() => this.refresh());
  }

  /**
   * Refreshes the entire tree view by clearing cache and firing change event.
   */
  refresh(): void {
    this.snapshotsCache = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The tree item to convert
   * @returns The tree item for VS Code to display
   */
  getTreeItem(element: SnapshotTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root
   * @returns Array of snapshot tree items
   */
  async getChildren(element?: SnapshotTreeItem): Promise<SnapshotTreeItem[]> {
    const authState = this.authService.getAuthState();

    // Check authentication
    if (!authState.isAuthenticated) {
      return [];
    }

    // Root level - return snapshot items
    if (!element) {
      await this.loadSnapshots();
      if (this.snapshotsCache.length === 0) {
        return [];
      }
      return this.snapshotsCache.map(
        (snapshot) => new SnapshotTreeItem(snapshot),
      );
    }

    // No children for snapshot items
    return [];
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
   * Disposes resources.
   */
  dispose(): void {
    // No timers or resources to dispose
  }
}
