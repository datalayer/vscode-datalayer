/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Union type for items that can appear in the Settings tree view.
 *
 * @module models/settingsTreeItem
 */

import type { TreeSectionItem } from "./treeSectionItem";
import type { SecretTreeItem } from "./secretTreeItem";
import type { DatasourceTreeItem } from "./datasourceTreeItem";

/**
 * Union type for all possible items in the Settings tree view.
 * Used by SettingsTreeProvider.getChildren() return type.
 *
 * Items can be:
 * - TreeSectionItem: Section headers (e.g., "Secrets", "Datasources")
 * - SecretTreeItem: Individual secrets
 * - DatasourceTreeItem: Individual datasources
 */
export type SettingsTreeItem =
  | TreeSectionItem
  | SecretTreeItem
  | DatasourceTreeItem;
