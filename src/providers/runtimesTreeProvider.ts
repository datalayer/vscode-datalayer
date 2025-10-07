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
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import type { Runtime } from "@datalayer/core/lib/client/models/Runtime";

/**
 * Tree data provider for the Datalayer Runtimes view.
 * Implements VS Code's TreeDataProvider interface to display running runtimes
 * with automatic refresh for time remaining updates.
 *
 * @example
 * ```typescript
 * const provider = new RuntimesTreeProvider(authProvider);
 * provider.refresh(); // Refresh entire tree
 * ```
 */
export class RuntimesTreeProvider
  implements vscode.TreeDataProvider<RuntimeTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    RuntimeTreeItem | undefined | void
  > = new vscode.EventEmitter<RuntimeTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    RuntimeTreeItem | undefined | void
  > = this._onDidChangeTreeData.event;

  private authService: SDKAuthProvider;
  private runtimesCache: Runtime[] = [];
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
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The RuntimeTreeItem to convert
   * @returns The tree item for VS Code to display
   */
  getTreeItem(element: RuntimeTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root
   * @returns Array of RuntimeTreeItems
   */
  async getChildren(element?: RuntimeTreeItem): Promise<RuntimeTreeItem[]> {
    // Only root level - no nested items
    if (element) {
      return [];
    }

    const authState = this.authService.getAuthState();

    // Check authentication
    if (!authState.isAuthenticated) {
      return [];
    }

    // Load runtimes
    await this.loadRuntimes();

    if (this.runtimesCache.length === 0) {
      return [];
    }

    // Create tree items from cached runtimes
    return this.runtimesCache.map((runtime) => new RuntimeTreeItem(runtime));
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
