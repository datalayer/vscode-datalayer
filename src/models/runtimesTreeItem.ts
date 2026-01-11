/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Union type for items that can appear in the Runtimes tree view.
 *
 * @module models/runtimesTreeItem
 */

import type { TreeSectionItem } from "./treeSectionItem";
import type { RuntimeTreeItem } from "./runtimeTreeItem";
import type { SnapshotTreeItem } from "./snapshotTreeItem";

/**
 * Union type for all possible items in the Runtimes tree view.
 * Used by RuntimesTreeProvider.getChildren() return type.
 *
 * Items can be:
 * - TreeSectionItem: Section headers (e.g., "Runtimes", "Snapshots")
 * - RuntimeTreeItem: Individual runtime instances
 * - SnapshotTreeItem: Individual runtime snapshots
 */
export type RuntimesTreeItem =
  | TreeSectionItem
  | RuntimeTreeItem
  | SnapshotTreeItem;
