/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Union type for items that can appear in the Projects tree view.
 *
 * @module models/projectsTreeItem
 */

import type { ProjectTreeItem } from "./projectTreeItem";
import type { SpaceItem } from "./spaceItem";

/**
 * Union type for all possible items in the Projects tree view.
 * Used by ProjectsTreeProvider.getChildren() return type.
 *
 * Items can be:
 * - ProjectTreeItem: Project nodes (expandable)
 * - SpaceItem: Notebooks and lexical documents inside projects
 */
export type ProjectsTreeItem = ProjectTreeItem | SpaceItem;
