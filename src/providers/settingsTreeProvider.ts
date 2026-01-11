/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree data provider for the Datalayer Settings view.
 * Displays secrets and datasources in separate collapsible sections.
 *
 * @see https://code.visualstudio.com/api/extension-guides/tree-view
 * @module providers/settingsTreeProvider
 */

import * as vscode from "vscode";
import { SecretTreeItem } from "../models/secretTreeItem";
import { DatasourceTreeItem } from "../models/datasourceTreeItem";
import { TreeSectionItem } from "../models/treeSectionItem";
import type { SettingsTreeItem } from "../models/settingsTreeItem";
import { SDKAuthProvider } from "../services/core/authProvider";
import { getServiceContainer } from "../extension";
import type { SecretDTO } from "@datalayer/core/lib/models/Secret";
import type { DatasourceDTO } from "@datalayer/core/lib/models/Datasource";

/**
 * Tree data provider for the Datalayer Settings view.
 * Implements VS Code's TreeDataProvider interface to display secrets
 * and datasources in separate collapsible sections.
 *
 * @example
 * ```typescript
 * const provider = new SettingsTreeProvider(authProvider);
 * provider.refresh(); // Refresh entire tree
 * ```
 */
export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingsTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SettingsTreeItem | undefined | void
  > = new vscode.EventEmitter<SettingsTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SettingsTreeItem | undefined | void
  > = this._onDidChangeTreeData.event;

  private authService: SDKAuthProvider;
  private secretsCache: SecretDTO[] = [];
  private datasourcesCache: DatasourceDTO[] = [];

  /**
   * Creates a new SettingsTreeProvider.
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
    this.secretsCache = [];
    this.datasourcesCache = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The tree item to convert
   * @returns The tree item for VS Code to display
   */
  getTreeItem(element: SettingsTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root
   * @returns Array of secret, datasource, or section tree items
   */
  async getChildren(element?: SettingsTreeItem): Promise<SettingsTreeItem[]> {
    const authState = this.authService.getAuthState();

    // Check authentication
    if (!authState.isAuthenticated) {
      return [];
    }

    // Root level - return two section headers
    if (!element) {
      return [
        new TreeSectionItem("Secrets", "secrets-section", "key"),
        new TreeSectionItem("Datasources", "datasources-section", "database"),
      ];
    }

    // Section level - return items for that section
    if (element instanceof TreeSectionItem) {
      if (element.sectionType === "secrets-section") {
        await this.loadSecrets();
        return this.secretsCache.map((secret) => new SecretTreeItem(secret));
      } else if (element.sectionType === "datasources-section") {
        await this.loadDatasources();
        return this.datasourcesCache.map(
          (datasource) => new DatasourceTreeItem(datasource),
        );
      }
    }

    // No children for secret/datasource items
    return [];
  }

  /**
   * Loads secrets from the SDK.
   * Updates the cache with fresh secret data.
   */
  private async loadSecrets(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.secretsCache = [];
      return;
    }

    try {
      const sdk = getServiceContainer().sdk;
      this.secretsCache = (await sdk.listSecrets()) ?? [];
    } catch (error) {
      // Silently fail - tree will be empty
      this.secretsCache = [];
    }
  }

  /**
   * Loads datasources from the SDK.
   * Updates the cache with fresh datasource data.
   */
  private async loadDatasources(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.datasourcesCache = [];
      return;
    }

    try {
      const sdk = getServiceContainer().sdk;
      // SDK returns DatasourceDTO[] directly
      this.datasourcesCache = (await sdk.listDatasources()) ?? [];

      // Debug: Log datasources to see what we're receiving
      console.log(
        "[Settings] Loaded datasources:",
        this.datasourcesCache.length,
      );
      if (this.datasourcesCache.length > 0) {
        console.log("[Settings] First datasource:", {
          name: this.datasourcesCache[0].name,
          type: this.datasourcesCache[0].type,
          raw: this.datasourcesCache[0],
        });
      }
    } catch (error) {
      console.error("[Settings] Failed to load datasources:", error);
      // Silently fail - tree will be empty
      this.datasourcesCache = [];
    }
  }

  /**
   * Disposes resources.
   */
  dispose(): void {
    // No timers or resources to dispose
  }
}
