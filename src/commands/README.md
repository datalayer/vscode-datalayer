# src/commands/ - Command Handlers

VS Code command registration and handlers. Each file registers commands for a specific domain area. Commands are thin wrappers that delegate to services.

## Files

- **index.ts** - Central command registration module aggregating all command registration functions and coordinating dependency injection.
- **auth.ts** - Authentication commands: login, logout, status display, and help menu access with UI state update callbacks.
- **create.ts** - Simple document creation commands for local Datalayer notebooks and lexical documents.
- **documents.ts** - Document management: opening, creating remote documents in spaces, renaming, deleting, downloading, and uploading local files.
- **runtimes.ts** - Runtime/kernel selection, termination, status display, and snapshot creation with support for Datalayer, local Python, Jupyter, and Pyodide kernels.
- **lexical.ts** - Lexical editor commands: text formatting (bold, italic, underline), block types (headings, lists, quotes), and insertion commands sent to the webview.
- **internal.ts** - Internal cross-component communication commands for runtime tracking, cell manipulation, lexical block operations, and notebook info retrieval using request-response patterns.
- **datasources.ts** - Datasource CRUD commands for the settings tree view.
- **createDatasourceDialog.ts** - Opens webview dialogs for creating/editing datasources with theme support and message handling.
- **secrets.ts** - Secrets management: creation via multi-step input, viewing with security warnings, copying to clipboard, renaming, and deletion with confirmation.
- **snapshots.ts** - Snapshot commands: restoring runtimes, deleting snapshots, and viewing snapshot details in the runtimes tree view.
- **outline.ts** - Document outline navigation commands: navigating to items, refreshing, and collapsing the outline tree.
- **theme.ts** - Primer theme showcase webview for demonstrating themed Primer React components.
- **pyodide.ts** - Pyodide cache clearing for both native and webview notebooks.
- **projects.ts** - Projects management: refreshing, creation, renaming, agent assignment/removal (with agent spec picker and secret creation), and detail viewing. Also provides a standalone "Create Agent" command.
- **agui.ts** - Opens ag-ui demo webview with CopilotKit integration.
- **agentChat.ts** - Registers `datalayer.agentChat.focus`, which reveals the Datalayer Chat sidebar (`datalayerAgentChatView`). Wired into `editor/title` with the AI agent icon so the chat is reachable from any editor, mirroring how Claude Code and Codex surface their own chat panels.
