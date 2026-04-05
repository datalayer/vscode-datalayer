/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree view item models for the Datalayer spaces explorer.
 * Defines data structures and visual representation for spaces, documents, and tree nodes.
 *
 * @module models/spaceItem
 */

import { ItemTypes } from "@datalayer/core/lib/client/constants";
import type { LexicalDTO } from "@datalayer/core/lib/models/LexicalDTO";
import type { NotebookDTO } from "@datalayer/core/lib/models/NotebookDTO";
import type { SpaceDTO } from "@datalayer/core/lib/models/SpaceDTO";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Type alias for any Datalayer document model (Notebook or Lexical).
 */
export type Document = NotebookDTO | LexicalDTO;

/**
 * Types of items that can appear in the spaces tree.
 */
export enum ItemType {
  /** Root node of the tree */
  ROOT = "root",
  /** Space container */
  SPACE = "space",
  /** Jupyter notebook document */
  NOTEBOOK = "notebook",
  /** Generic document */
  DOCUMENT = "document",
  /** Folder container */
  FOLDER = "folder",
  /** Notebook cell */
  CELL = "cell",
  /** Loading indicator */
  LOADING = "loading",
  /** Error state */
  ERROR = "error",
}

/**
 * Data associated with a space tree item.
 * Uses Datalayer model instances directly without custom interfaces.
 */
export interface SpaceItemData {
  /** Type of the tree item */
  type: ItemType;
  /** Datalayer Space model instance (for SPACE type) */
  space?: SpaceDTO;
  /** Datalayer Notebook or Lexical model instance (for NOTEBOOK/DOCUMENT types) */
  document?: Document;
  /** Error message (for ERROR type) */
  error?: string;
  /** Username of the authenticated user */
  username?: string;
  /** GitHub login of the authenticated user */
  githubLogin?: string;
  /** Name of the containing space */
  spaceName?: string;
}

/**
 * Tree item representing a space or document in the explorer.
 * Automatically configures tooltip, icon, and command based on item type.
 *
 */
export class SpaceItem extends vscode.TreeItem {
  /**
   * Creates a new SpaceItem with automatic tooltip, icon, and command configuration.
   *
   * @param label - Display label for the tree item.
   * @param collapsibleState - Whether the item can be expanded or collapsed.
   * @param data - Associated data containing the item type and model instances.
   * @param parent - Optional parent item for hierarchical navigation.
   */
  constructor(
    public override readonly label: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: SpaceItemData,
    public readonly parent?: SpaceItem,
  ) {
    super(label, collapsibleState);
    this.tooltip = this.getTooltip();
    this.contextValue = data.type;
    this.iconPath = this.getIcon();
    this.command = this.getCommand();
  }

  /**
   * Generates tooltip text based on item type and data.
   * @returns Tooltip string or undefined if no tooltip applies.
   */
  private getTooltip(): string | undefined {
    switch (this.data.type) {
      case ItemType.ROOT:
        return `Datalayer Spaces${
          this.data.username ? ` - ${this.data.username}` : ""
        }`;
      case ItemType.SPACE:
        // For spaces, we'll use the label since tooltip needs to be sync
        // The label already contains the space name
        return this.label;
      case ItemType.NOTEBOOK:
      case ItemType.DOCUMENT:
      case ItemType.CELL:
        // For documents, use label + space name
        // Since we can't call async methods in getTooltip
        if (this.data.spaceName) {
          return `${this.label}\nSpace: ${this.data.spaceName}`;
        }
        return this.label;
      case ItemType.ERROR:
        return this.data.error;
      default:
        return undefined;
    }
  }

  /**
   * Selects appropriate VS Code theme icon based on item type.
   * @returns Theme icon matching the item type or undefined.
   */
  private getIcon(): vscode.ThemeIcon | undefined {
    switch (this.data.type) {
      case ItemType.ROOT:
        return new vscode.ThemeIcon("menu");
      case ItemType.SPACE:
        if (this.data.space) {
          const variant = this.data.space.variant;
          if (variant === "default") {
            return new vscode.ThemeIcon("library");
          }
        }
        return new vscode.ThemeIcon("folder");
      case ItemType.NOTEBOOK:
        return new vscode.ThemeIcon("notebook");
      case ItemType.DOCUMENT:
        return this.getDocumentIcon();
      case ItemType.FOLDER:
        return new vscode.ThemeIcon("folder");
      case ItemType.CELL:
        return new vscode.ThemeIcon("code");
      case ItemType.LOADING:
        return new vscode.ThemeIcon("loading~spin");
      case ItemType.ERROR:
        return new vscode.ThemeIcon("error");
      default:
        return undefined;
    }
  }

  /**
   * Selects document icon based on type and file extension.
   * @returns Theme icon for the document type.
   */
  private getDocumentIcon(): vscode.ThemeIcon {
    if (!this.data.document) {
      return new vscode.ThemeIcon("file");
    }

    const type = this.data.document.type;
    const name = this.data.document.name;

    // Check if it's a lexical document
    if (type === ItemTypes.LEXICAL) {
      return new vscode.ThemeIcon("file-text");
    }

    // Check by file extension
    const ext = path.extname(name).toLowerCase();
    switch (ext) {
      case ".py":
        return new vscode.ThemeIcon("file-code");
      case ".ipynb":
        return new vscode.ThemeIcon("notebook");
      case ".md":
        return new vscode.ThemeIcon("markdown");
      case ".json":
        return new vscode.ThemeIcon("json");
      case ".csv":
        return new vscode.ThemeIcon("table");
      case ".txt":
      case ".dlex":
      case ".lexical": // Legacy support
        return new vscode.ThemeIcon("file-text");
      case ".pdf":
        return new vscode.ThemeIcon("file-pdf");
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".gif":
      case ".svg":
        return new vscode.ThemeIcon("file-media");
      default:
        return new vscode.ThemeIcon("file");
    }
  }

  /**
   * Generates VS Code command for item interaction.
   * Returns appropriate command based on item type and error state.
   * @returns Command configuration or undefined for non-interactive items.
   */
  private getCommand(): vscode.Command | undefined {
    if (this.data.type === ItemType.NOTEBOOK && this.data.document) {
      return {
        command: "datalayer.openDocument",
        title: vscode.l10n.t("Open Notebook"),
        arguments: [this.data.document, this.data.spaceName],
      };
    } else if (this.data.type === ItemType.DOCUMENT && this.data.document) {
      return {
        command: "datalayer.openDocument",
        title: vscode.l10n.t("Open"),
        arguments: [this.data.document, this.data.spaceName],
      };
    } else if (this.data.type === ItemType.CELL && this.data.document) {
      return {
        command: "datalayer.openDocument",
        title: vscode.l10n.t("Open Cell"),
        arguments: [this.data.document, this.data.spaceName],
      };
    } else if (this.data.type === ItemType.ERROR) {
      // If the error is about not being logged in, show login command
      if (this.data.error?.includes("login") || this.label.includes("login")) {
        return {
          command: "datalayer.login",
          title: vscode.l10n.t("Login"),
        };
      }
      // Otherwise show refresh command
      return {
        command: "datalayer.refreshSpaces",
        title: vscode.l10n.t("Retry"),
      };
    }
    return undefined;
  }
}
