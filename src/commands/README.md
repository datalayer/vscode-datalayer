# src/commands/ - Command Handlers

VS Code command registration and handlers. Each file registers commands for a specific domain area. Commands are thin wrappers that delegate to services.

## Files

- **index.ts** - Central command registration module aggregating all command registration functions and coordinating dependency injection.
- **auth.ts** - Authentication commands: login, logout, status display, and help menu access with UI state update callbacks.
- **create.ts** - Simple document creation commands for local Datalayer notebooks and lexical documents.
- **documents.ts** - Document management: opening, creating remote documents in spaces, renaming, deleting, downloading, and uploading local files.
- **sessions.ts** - The Sessions view's commands (VS-04, VS-05, VS-03): refresh, filter, open (through the chat provider's `datalayer.internal.agentChat.openSession` when registered); the seven verbs — resume, switch agent, clone from here, export, import, rename, archive, end — calling the session API (`appSessionsClient`) from the extension host on the runtime that answers for the session, every refusal the runtime's sentence in a notification; _Reveal in Explorer_ and _Open in the Studio_; the harness check (`datalayer.sessions.checkHarness`, `setup` offered in a terminal with the command shown whole) and the credential kept in the secret storage (`datalayer.sessions.setCredential`).
- **localRuntime.ts** - _Datalayer: Start the local runtime_ and _Stop the local runtime_ (VS-02); `showLocalRuntimeRefusal` (the sentence with _Copy the install line_), `startLocalRuntime` and `pickWorkspaceFolder` for other commands that need a local runtime.
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
