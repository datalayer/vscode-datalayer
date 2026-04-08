# src/providers/ - VS Code API Implementations

Custom editor providers, tree data providers, and other VS Code API implementations forming the extension's UI backbone. These implement VS Code's extension API interfaces.

## Files

- **baseDocumentProvider.ts** - Abstract base class (`BaseDocumentProvider<TDocument>`) for custom editor providers. Provides:
  - **Message routing**: Registers handlers for runtime selection, kernel operations, HTTP/WebSocket proxying, response routing, and outline updates
  - **Request/response pattern**: `postMessageWithResponse<R>(panel, type, body)` sends a message and returns a Promise resolved when the webview responds with matching `requestId`
  - **Runner initialization**: `initializeRunnerForWebview()` creates a Runner with BridgeExecutor for MCP tool execution through the webview
  - **Bridge integration**: NetworkBridgeService (HTTP/WebSocket), RuntimeBridgeService (lifecycle), DocumentMessageRouter (dispatch)
  - Subclasses must implement `openCustomDocument()`, `resolveCustomEditor()`, and `getDocumentUri()`

- **notebookProvider.ts** - Custom editor provider for `.ipynb` files. Extends `BaseDocumentProvider<NotebookDocument>`. Supports dual-mode: local file editing and collaborative Datalayer platform notebooks. Manages webview HTML generation (via notebookTemplate), LLM inline completions (via Language Model API), proactive LSP document creation for cells, and auto-connect to runtimes. Registers with `vscode.window.registerCustomEditorProvider` for the `datalayer.jupyter-notebook` view type.

- **lexicalProvider.ts** - Custom editor provider for `.dlex` files. Extends `BaseDocumentProvider<LexicalDocument>`. Handles rich text editing with optional Loro CRDT collaboration. Manages webview lifecycle, document save/load, inline completions, and collaboration WebSocket setup. Supports both local files and Datalayer platform documents.

- **spacesTreeProvider.ts** - Tree data provider for the "Datalayer Spaces" sidebar view. Displays user's spaces and documents (notebooks, lexical) in a hierarchical tree. Uses caching and pre-fetching for immediate display on expansion. Filters to show only supported document types. Provides `getCachedRuntimes()` for auto-connect strategy.

- **runtimesTreeProvider.ts** - Tree data provider for the "Datalayer Runtimes" sidebar view. Shows running runtimes and snapshots in separate collapsible sections. Auto-refreshes every 30 seconds to update time remaining display. Provides cached runtime data for auto-connect and kernel selection.

- **projectsTreeProvider.ts** - Tree data provider for the "Datalayer Projects" sidebar view. Displays projects with agent status indicators and child documents (notebooks, lexical). Auto-refreshes every 30 seconds and cross-checks assigned agents against existing runtimes, auto-unassigning stale agents whose runtimes no longer exist.

- **settingsTreeProvider.ts** - Tree data provider for the "Datalayer Settings" sidebar view. Displays secrets and datasources in collapsible sections. Lazy-loads data from Datalayer API on expansion to minimize startup overhead.

- **outlineTreeProvider.ts** - Tree data provider for document outline/table of contents. Receives outline data from webviews (headings, code cells) and displays hierarchical structure with navigation support. Tracks the active item as user scrolls.

- **documentsFileSystemProvider.ts** - Virtual file system provider implementing `vscode.FileSystemProvider` for the `datalayer://` URI scheme. Maps remote Datalayer documents to clean URIs (`datalayer:/Space/doc.lexical`). Persists URI-to-ID mappings across restarts via VS Code globalState.

- **smartDynamicControllerManager.ts** - Manages native notebook controllers for Pyodide (offline Python) and runtime-specific kernels. **Currently DISABLED** (`null as unknown` in uiSetup.ts) because native notebook controller integration needs improvement. All code handles the null case with optional chaining.

- **completionPrompts.ts** - Generates LLM prompt templates for inline completions. Provides context-aware formatting for code completions (includes surrounding cells, language info) vs. prose completions (includes document structure). Used by both notebook and lexical providers when requesting completions from the Language Model API.
