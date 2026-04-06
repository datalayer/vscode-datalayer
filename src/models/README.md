# src/models/ - Data Models

Data models for tree views, documents, and UI elements.

## Files

- **notebookDocument.ts** - Notebook document model for the custom editor. Handles document lifecycle, content state, and persistence for both collaborative Datalayer notebooks and local file-based notebooks with edit tracking.
- **lexicalDocument.ts** - Lexical document model for the custom editor. Manages document lifecycle, content state, and persistence for rich text editing with backup restoration support.
- **spaceItem.ts** - Tree item for spaces/documents in the explorer. Auto-configures tooltip, icon, and command based on item type with support for nested hierarchies.
- **runtimeTreeItem.ts** - Tree item for a runtime in the Runtimes tree view. Displays runtime name, environment, time remaining, and expiration details.
- **runtimesTreeItem.ts** - Union type for all possible items in the Runtimes tree view (section headers, runtimes, snapshots) for type-safe tree operations.
- **snapshotTreeItem.ts** - Tree item for a snapshot in the Runtimes tree view. Displays snapshot name, environment, and relative creation date.
- **treeSectionItem.ts** - Tree item for section headers (e.g., "Runtimes", "Snapshots") creating collapsible visual separation between item groups.
- **settingsTreeItem.ts** - Union type for all possible items in the Settings tree view (section headers, secrets, datasources).
- **secretTreeItem.ts** - Tree item for secrets in the Settings tree view with masked value display for security.
- **datasourceTreeItem.ts** - Tree item for datasources in the Settings tree view with type, description, and database information. Includes edit command.
- **projectTreeItem.ts** - Tree item for projects in the Projects tree view with visibility status, agent info, and dynamic context value for conditional menus.
- **projectsTreeItem.ts** - Union type for all possible items in the Projects tree view.
