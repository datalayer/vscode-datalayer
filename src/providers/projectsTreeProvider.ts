/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree data provider for the Datalayer Projects view.
 * Displays projects with their notebooks and lexical documents,
 * plus CRUD and agent management operations.
 *
 * @module providers/projectsTreeProvider
 *
 * @see https://code.visualstudio.com/api/extension-guides/tree-view
 */

import { ItemTypes } from "@datalayer/core/lib/client/constants";
import type { LexicalDTO } from "@datalayer/core/lib/models/LexicalDTO";
import type { NotebookDTO } from "@datalayer/core/lib/models/NotebookDTO";
import type { ProjectDTO } from "@datalayer/core/lib/models/ProjectDTO";
import type { SpaceDTO } from "@datalayer/core/lib/models/SpaceDTO";
import * as vscode from "vscode";

import { getServiceContainer } from "../extension";
import type { ProjectsTreeItem } from "../models/projectsTreeItem";
import { ProjectTreeItem } from "../models/projectTreeItem";
import { ItemType, SpaceItem } from "../models/spaceItem";
import { DatalayerAuthProvider } from "../services/core/authProvider";
import { ServiceLoggers } from "../services/logging/loggers";

/**
 * Tree data provider for the Datalayer Projects view.
 * Implements VS Code's TreeDataProvider interface to display projects
 * as expandable nodes containing notebooks and lexical documents.
 *
 */
export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectsTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ProjectsTreeItem | undefined | void
  > = new vscode.EventEmitter<ProjectsTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ProjectsTreeItem | undefined | void
  > = this._onDidChangeTreeData.event;

  private authService: DatalayerAuthProvider;
  private projectsCache: ProjectDTO[] = [];
  private spacesCache: Map<string, SpaceDTO> = new Map();
  private itemsCache: Map<string, (NotebookDTO | LexicalDTO)[]> = new Map();
  private runtimeNamesCache: Map<string, string> = new Map();
  private refreshTimer?: ReturnType<typeof setInterval>;
  private disposed = false;

  /**
   * Creates a new ProjectsTreeProvider with automatic refresh on auth changes.
   *
   * @param authProvider - Authentication provider for user state management.
   */
  constructor(authProvider: DatalayerAuthProvider) {
    this.authService = authProvider;

    // Listen to auth changes to refresh when user logs in/out
    authProvider.onAuthStateChanged(() => this.refresh());

    // Auto-refresh every 30 seconds to detect runtime changes and SaaS-side updates
    this.startAutoRefresh();
  }

  /**
   * Starts automatic refresh timer to sync with runtime state and SaaS changes.
   * Uses a lightweight fire (no cache clear) to avoid excessive API calls.
   * Full cache reload happens on next getChildren() call.
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      if (this.disposed) {
        return;
      }
      this.projectsCache = [];
      this._onDidChangeTreeData.fire();
    }, 30000);
  }

  /**
   * Refreshes the entire tree view by clearing cache and firing change event.
   */
  refresh(): void {
    this.projectsCache = [];
    this.spacesCache.clear();
    this.itemsCache.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item representation for display.
   *
   * @param element - The tree item to convert for display.
   *
   * @returns The tree item for VS Code to display.
   */
  getTreeItem(element: ProjectsTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a tree item.
   *
   * @param element - The parent element, or undefined for root.
   *
   * @returns Array of project or document tree items.
   */
  async getChildren(element?: ProjectsTreeItem): Promise<ProjectsTreeItem[]> {
    const authState = this.authService.getAuthState();

    // Check authentication
    if (!authState.isAuthenticated) {
      return [];
    }

    // Root level - return project items
    if (!element) {
      await this.loadProjects();
      return this.projectsCache.map(
        (project) =>
          new ProjectTreeItem(
            project,
            project.attachedAgentPodName
              ? this.runtimeNamesCache.get(project.attachedAgentPodName)
              : undefined,
          ),
      );
    }

    // Project level - return notebooks and lexical documents inside
    if (element instanceof ProjectTreeItem) {
      return this.getProjectItems(element.project);
    }

    // No children for document items
    return [];
  }

  /**
   * Loads projects from the Datalayer platform.
   * Updates the cache with fresh project data and pre-fetches items.
   */
  private async loadProjects(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.projectsCache = [];
      return;
    }

    try {
      const datalayer = getServiceContainer().datalayer;
      this.projectsCache = (await datalayer.getProjects()) ?? [];

      // Pre-fetch items for all projects using the SpaceDTO from getMySpaces
      const allSpaces = (await datalayer.getMySpaces()) ?? [];
      for (const space of allSpaces) {
        if (space.variant === "project") {
          this.spacesCache.set(space.uid, space);
        }
      }

      await Promise.all(
        this.projectsCache.map(async (project) => {
          try {
            const space = this.spacesCache.get(project.uid);
            if (space) {
              const items = await space.getItems();
              const filtered = items.filter(
                (item): item is NotebookDTO | LexicalDTO =>
                  item.type === ItemTypes.NOTEBOOK ||
                  item.type === ItemTypes.LEXICAL,
              );
              this.itemsCache.set(project.uid, filtered);
            }
          } catch (_error) {
            ServiceLoggers.main.warn(
              `[Projects] Failed to fetch items for project ${project.uid}`,
            );
            this.itemsCache.set(project.uid, []);
          }
        }),
      );

      // Cross-check assigned agents against existing runtimes
      // Unassign agents whose runtimes no longer exist
      // Also build a pod-name-to-given-name map for display
      const projectsWithAgents = this.projectsCache.filter((p) => p.hasAgent);
      if (projectsWithAgents.length > 0) {
        try {
          const runtimes = await datalayer.listRuntimes();
          const activePodNames = new Set(runtimes.map((r) => r.podName));
          this.runtimeNamesCache.clear();
          for (const r of runtimes) {
            this.runtimeNamesCache.set(r.podName, r.givenName);
          }
          for (const project of projectsWithAgents) {
            if (!activePodNames.has(project.attachedAgentPodName!)) {
              ServiceLoggers.main.info(
                `[Projects] Runtime "${project.attachedAgentPodName}" no longer exists, unassigning from project "${project.name}"`,
              );
              try {
                await datalayer.unassignAgentFromProject(project.uid);
              } catch (_unassignError) {
                ServiceLoggers.main.warn(
                  `[Projects] Failed to unassign stale agent from project "${project.name}"`,
                );
              }
            }
          }
          // Re-fetch projects if any were unassigned
          this.projectsCache = (await datalayer.getProjects()) ?? [];
        } catch (_runtimeError) {
          ServiceLoggers.main.debug(
            "[Projects] Could not verify runtime existence",
          );
        }
      }

      ServiceLoggers.main.debug(
        `[Projects] Loaded ${this.projectsCache.length} project(s)`,
      );
    } catch (error) {
      ServiceLoggers.main.error(
        "[Projects] Failed to load projects",
        error instanceof Error ? error : undefined,
      );
      this.projectsCache = [];
    }
  }

  /**
   * Gets the notebook and lexical document items inside a project.
   *
   * @param project - The project to get items for.
   *
   * @returns Array of SpaceItems representing documents in the project.
   */
  private async getProjectItems(
    project: ProjectDTO,
  ): Promise<ProjectsTreeItem[]> {
    try {
      let items: (NotebookDTO | LexicalDTO)[] = [];

      if (this.itemsCache.has(project.uid)) {
        items = this.itemsCache.get(project.uid)!;
      } else {
        // Fetch if not cached
        const space = this.spacesCache.get(project.uid);
        if (space) {
          const allItems = (await space.getItems()) ?? [];
          items = allItems.filter(
            (item): item is NotebookDTO | LexicalDTO =>
              item.type === ItemTypes.NOTEBOOK ||
              item.type === ItemTypes.LEXICAL,
          );
          this.itemsCache.set(project.uid, items);
        }
      }

      if (items.length === 0) {
        return [
          new SpaceItem(
            "No items found",
            vscode.TreeItemCollapsibleState.None,
            {
              type: ItemType.ERROR,
              error: "This project is empty",
            },
          ),
        ];
      }

      const result: ProjectsTreeItem[] = [];

      for (const item of items) {
        const itemType = item.type;
        let itemName = item.name || "";

        if (itemType === ItemTypes.NOTEBOOK) {
          const extension = item.extension || "";
          if (!itemName.endsWith(extension)) {
            itemName = `${itemName}${extension}`;
          }
          result.push(
            new SpaceItem(itemName, vscode.TreeItemCollapsibleState.None, {
              type: ItemType.NOTEBOOK,
              document: item,
              spaceName: project.name,
            }),
          );
        } else if (itemType === ItemTypes.LEXICAL) {
          itemName = itemName.replace(/\.(lexical|dlex)$/, "");
          itemName = `${itemName}.dlex`;
          result.push(
            new SpaceItem(itemName, vscode.TreeItemCollapsibleState.None, {
              type: ItemType.DOCUMENT,
              document: item,
              spaceName: project.name,
            }),
          );
        }
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
   * Disposes resources.
   */
  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}
