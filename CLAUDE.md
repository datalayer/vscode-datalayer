# Datalayer VS Code Extension - Developer Context

**Last Updated**: October 2025

## Critical Recent Changes

### Smart Controller Registration - DISABLED (October 2025)

**Status**: The `SmartDynamicControllerManager` is **intentionally disabled**
**Location**: `src/services/ui/uiSetup.ts:85`
**Reason**: Native notebook controller integration needs improvement before re-enabling

```typescript
// Disabled in uiSetup.ts
const controllerManager = null as unknown as SmartDynamicControllerManager;
```

All code properly handles the null case with optional chaining (`controllerManager?.`) or explicit null checks.

### Runtime Tree View Refresh Fix (October 2025)

**Issue**: Tree view wasn't refreshing after "terminate all runtimes"
**Fix**: Added 500ms delay before refresh to allow server-side processing
**Files**: `src/commands/runtimes.ts:601, 686`

```typescript
// Wait for server to process deletions
await new Promise((resolve) => setTimeout(resolve, 500));
runtimesTreeProvider?.refresh();
```

## Quick Start

```bash
# Setup
npm install
npm run watch

# Debug
Press F5 in VS Code to launch Extension Development Host

# Build & Package
npm run compile
npm run vsix
```

## Architecture Overview

- **Extension Context** (`src/`): Node.js 20 environment, handles auth & server communication
- **Webview** (`webview/`): React 18-based editors (Jupyter notebooks & Lexical documents)
- **Message Passing**: Structured messages with JWT tokens between extension and webview
- **SDK Integration**: Direct use of `@datalayer/core` SDK (file: dependency)
- **Two Custom Editors**: `.ipynb` (Jupyter notebooks) and `.lexical` (rich text documents)
- **Two Tree Views**: Datalayer Spaces and Datalayer Runtimes in Explorer sidebar

## Key Features

### 🎨 VS Code Theme Integration

- **Complete theme matching**: Notebook cells match VS Code colors exactly
- **Syntax highlighting**: CodeMirror uses VS Code syntax colors via post-build patching
- **Background harmony**: No visual gaps, proper color inheritance
- **Native toolbar**: VS Code-style with codicon icons

**Implementation**: Enhanced theme provider (`webview/theme/`) automatically injects CSS overrides. Post-build script (`packages/react/scripts/patch-vscode-highlighting.js`) patches NotebookAdapter with VS Code syntax highlighting.

### 🔐 Authentication System

- Token-based login with Datalayer platform
- GitHub profile enrichment for OAuth users
- Secure storage via VS Code SecretStorage API
- Status bar integration with connection state

### 📁 Spaces Tree View

- Hierarchical display of Datalayer spaces and documents
- Virtual file system for clean paths (`datalayer:/Space/doc.lexical`)
- Create, rename, delete documents with API sync
- Context menu actions for document management

### 📝 Lexical Editor

- Rich text editing for `.lexical` documents
- Full formatting support (bold, italic, lists, headings)
- Read-only mode for Datalayer documents
- VS Code theme integration

### ⚙️ Runtime Management

- Automatic runtime creation and reuse
- Credits conservation through runtime sharing
- Health verification before reuse
- Dynamic environments loaded from API and cached (uses `EnvironmentCache`)

### 🎯 Kernel Selection System

- **Unified kernel picker**: Shows all available kernel sources when clicking "Select Kernel"
- **Three kernel sources**:
  - Datalayer Platform (connects to cloud runtimes)
  - Python Environments (coming soon - local Python kernels)
  - Existing Jupyter Server (connect to any running Jupyter server)
- **Kernel Bridge**: Routes connections to appropriate handlers (webview or native)
- **Runtime display**: Shows "Datalayer: {Runtime name}" in notebook toolbar
- **Zero re-render**: Runtime changes use MutableServiceManager to prevent component unmount/remount

## Configuration (Settings)

The extension provides multiple configuration options in VS Code settings:

### Service URLs

```json
{
  "datalayer.services.iamUrl": "https://prod1.datalayer.run",
  "datalayer.services.runtimesUrl": "https://prod1.datalayer.run",
  "datalayer.services.spacerUrl": "https://prod1.datalayer.run",
  "datalayer.services.spacerWsUrl": "wss://prod1.datalayer.run"
}
```

### Runtime Configuration

```json
{
  "datalayer.runtime.defaultMinutes": 10 // Default: 10, Min: 1, Max: 1440 (24 hours)
}
```

### Logging Configuration

```json
{
  "datalayer.logging.level": "info", // trace|debug|info|warn|error
  "datalayer.logging.includeTimestamps": true,
  "datalayer.logging.includeContext": true,
  "datalayer.logging.enableSDKLogging": true,
  "datalayer.logging.enablePerformanceMonitoring": false
}
```

**Note**: Runtime environments are fetched dynamically from API and cached using `EnvironmentCache` (singleton). No hardcoded environment names.

## API Response Handling

Spacer API returns wrapped responses:

```json
{
  "success": true,
  "message": "...",
  "runtimes": [...] // or "kernel" for single runtime
}
```

Key field mappings:

- Runtime URL: Use `ingress` (not `jupyter_base_url`)
- Runtime token: Use `token` (not `jupyter_token`)
- Single runtime: Check `kernel` field (not `runtime`)

## CI/CD Workflows

Four separate GitHub Actions workflows:

1. **VSCode - Extension Build & Test**: Multi-platform builds with .vsix artifacts
2. **VSCode - Code Quality**: Linting and formatting checks (Ubuntu only)
3. **VSCode - Type Check**: TypeScript compilation verification (Ubuntu only)
4. **VSCode - Documentation**: TypeDoc HTML/Markdown generation

All trigger on `/packages/vscode/**` changes to main branch only.

## Commands

Key commands:

- `datalayer.login`: Authenticate with Datalayer
- `datalayer.logout`: Sign out
- `datalayer.showAuthStatus`: View auth status
- `datalayer.refreshSpaces`: Refresh tree view
- `datalayer.createNotebookInSpace`: Create notebook in space
- `datalayer.createLexicalInSpace`: Create lexical doc in space
- `datalayer.renameItem`: Rename document
- `datalayer.deleteItem`: Delete document

## API Endpoints

### Spacer API (Documents)

- `/api/spacer/v1/spaces/users/me` - Get user's spaces
- `/api/spacer/v1/spaces/{id}/items` - Get space items
- `/api/spacer/v1/notebooks` - Create notebooks (multipart/form-data)
- `/api/spacer/v1/lexicals` - Create lexical docs (multipart/form-data)

### Runtimes API

- `/api/runtimes/v1/runtimes` - List runtimes (GET)
- `/api/runtimes/v1/runtimes` - Create runtime (POST)

## Project Structure (October 2025)

```
src/
├── extension.ts           # Main extension entry point, activation
├── commands/              # Command handlers (thin layer, delegate to services)
│   ├── auth.ts           # Login, logout, show auth status
│   ├── documents.ts      # Document management (create, rename, delete)
│   ├── lexical.ts        # Lexical document commands
│   ├── runtimes.ts       # Runtime management (create, terminate, select)
│   ├── internal.ts       # Internal commands for inter-component communication
│   └── index.ts          # Command registration
├── tools/                 # MCP (Model Context Protocol) embedded tools (14 total)
│   ├── createLocalNotebook.ts       # Create local .ipynb files
│   ├── createRemoteNotebook.ts      # Create cloud notebooks
│   ├── startRuntime.ts              # Start Datalayer runtime
│   ├── connectRuntime.ts            # Connect runtime to notebook
│   ├── insertCell.ts                # Insert cells into notebooks
│   ├── executeCell.ts               # Execute cell and get outputs
│   ├── readAllCells.ts              # Read all cells (jupyter-mcp-server parity)
│   ├── readCell.ts                  # Read specific cell (jupyter-mcp-server parity)
│   ├── getNotebookInfo.ts           # Get notebook metadata (jupyter-mcp-server parity)
│   ├── deleteCell.ts                # Delete cell (jupyter-mcp-server parity)
│   ├── overwriteCell.ts             # Overwrite cell source (jupyter-mcp-server parity)
│   ├── appendMarkdownCell.ts        # Append markdown cell (jupyter-mcp-server parity)
│   ├── appendExecuteCodeCell.ts     # Append and execute code cell (jupyter-mcp-server parity)
│   ├── insertMarkdownCell.ts        # Insert markdown at index (jupyter-mcp-server parity)
│   └── index.ts                     # Tool registration
├── providers/             # VS Code API implementations
│   ├── baseDocumentProvider.ts           # Base class for custom editors
│   ├── notebookProvider.ts               # Jupyter .ipynb custom editor
│   ├── lexicalProvider.ts                # Lexical .lexical custom editor
│   ├── spacesTreeProvider.ts             # Datalayer Spaces tree view
│   ├── runtimesTreeProvider.ts           # Datalayer Runtimes tree view
│   ├── documentsFileSystemProvider.ts    # Virtual FS for datalayer:// URIs
│   └── smartDynamicControllerManager.ts  # (DISABLED) Native controller
├── services/
│   ├── core/              # Core infrastructure services
│   │   ├── authProvider.ts        # Authentication state (token, user)
│   │   ├── authManager.ts         # Auth operations & state sync
│   │   ├── sdkAdapter.ts          # SDK initialization with handlers
│   │   ├── serviceContainer.ts    # Dependency injection container
│   │   ├── baseService.ts         # Base service class
│   │   └── errorHandler.ts        # Centralized error handling
│   ├── bridges/           # Communication bridges
│   │   ├── documentBridge.ts      # Extension ↔ Platform (download/open docs)
│   │   ├── kernelBridge.ts        # Extension ↔ Webview (kernel routing)
│   │   └── notebookNetwork.ts     # HTTP/WebSocket for notebook communication
│   ├── collaboration/     # Real-time collaboration
│   │   ├── lexicalCollaboration.ts  # Lexical Y.js sync (singleton)
│   │   └── loroWebSocketAdapter.ts  # WebSocket adapter for Loro CRDT
│   ├── logging/           # Logging infrastructure
│   │   ├── loggerManager.ts            # Logger factory (singleton)
│   │   ├── loggers.ts                  # Static logger access (ServiceLoggers)
│   │   ├── performanceLogger.ts        # Performance monitoring
│   │   └── datalayerClientLogger.ts    # SDK logging adapter
│   ├── cache/             # Caching layer
│   │   └── environmentCache.ts    # Runtime environments cache (singleton)
│   ├── messaging/         # Message routing
│   │   └── messageRouter.ts       # (Future) Centralized message dispatcher
│   ├── network/           # Low-level network
│   │   └── networkProxy.ts        # HTTP/WebSocket proxy
│   ├── ui/                # UI management
│   │   ├── statusBar.ts           # Status bar manager (singleton)
│   │   └── uiSetup.ts             # UI initialization
│   └── interfaces/        # TypeScript interfaces for services
│       ├── IAuthProvider.ts
│       ├── IDocumentBridge.ts
│       ├── IKernelBridge.ts
│       ├── ILogger.ts
│       ├── ILoggerManager.ts
│       └── IErrorHandler.ts
├── models/                # Data models
│   ├── notebookDocument.ts      # Notebook document model
│   ├── lexicalDocument.ts       # Lexical document model
│   ├── spaceItem.ts             # Space tree item model
│   └── runtimeTreeItem.ts       # Runtime tree item model
├── ui/                    # UI components
│   ├── dialogs/
│   │   ├── authDialog.ts            # Authentication dialog
│   │   ├── kernelSelector.ts        # Kernel selection UI
│   │   ├── runtimeSelector.ts       # Runtime selection UI
│   │   └── confirmationDialog.ts    # Two-step confirmation
│   └── templates/
│       └── notebookTemplate.ts      # Notebook webview HTML template
├── kernel/                # Kernel communication
│   └── clients/
│       └── websocketKernelClient.ts # WebSocket kernel protocol client
├── utils/                 # Utility functions
│   ├── dispose.ts               # Disposable utilities
│   ├── webviewSecurity.ts       # CSP nonce generation
│   ├── webviewCollection.ts     # Webview lifecycle management
│   └── documentUtils.ts         # Document manipulation
├── types/                 # Type definitions
│   ├── errors.ts                # Custom error types
│   └── vscode/
│       └── messages.ts          # Webview message types
└── test/                  # Test suites (41 tests, 100% pass)
    ├── extension.test.ts        # Extension activation tests
    ├── services/                # Service tests (21 tests)
    ├── utils-tests/             # Utility tests (19 tests)
    └── utils/                   # Test infrastructure
        ├── mockFactory.ts       # Type-safe mock creators
        └── testHelpers.ts       # Test utilities

webview/
├── notebook/              # Jupyter notebook editor
│   ├── main.ts                  # Entry point
│   ├── NotebookEditor.tsx       # Main component
│   └── NotebookToolbar.tsx      # Toolbar
├── lexical/               # Lexical rich text editor
│   ├── lexicalWebview.tsx       # Entry point
│   ├── LexicalEditor.tsx        # Editor component
│   └── LexicalToolbar.tsx       # Toolbar
├── theme/                 # VS Code theme integration
│   ├── codemirror/              # CodeMirror themes
│   ├── components/              # Themed components
│   ├── mapping/                 # Color mappers
│   └── providers/               # Theme providers
└── services/              # Webview services
    ├── messageHandler.ts        # Extension communication
    ├── mockServiceManager.ts    # Development mock
    └── serviceManager.ts        # JupyterLab service management
```

### Service Organization Rationale

**bridges/** - All "bridge" services that connect different parts of the system:

- `documentBridge` - Extension ↔ Platform (downloads documents)
- `kernelBridge` - Extension ↔ Webview (routes kernel connections)
- `networkBridge` - Extension ↔ Webview (HTTP/WS proxy wrapper)
- `runtimeBridge` - Extension ↔ Platform (runtime lifecycle)

**messaging/** - Generic message routing infrastructure:

- `messageRouter` - Centralized dispatcher for webview messages
- `types` - Shared type definitions for messaging

**network/** - Low-level network primitives:

- `networkProxy` - Direct HTTP/WebSocket proxy implementation

This organization provides clear separation of concerns and makes it easy to understand the data flow between extension, webview, and platform.

## Development Guidelines

### Code Quality

```bash
npm run lint        # ESLint
npm run type-check  # TypeScript checking
npm run compile     # Build extension
npm run doc         # Documentation
```

### SDK Usage Pattern (October 2025)

**IMPORTANT**: The extension now uses the Datalayer SDK directly with handlers for VS Code-specific behavior.

```typescript
// In sdkAdapter.ts - SDK configured with VS Code handlers
const sdk = new DatalayerClient({
  token: authProvider.getToken(),
  handlers: {
    beforeCall: (methodName, args) => {
      console.log(`[SDK] Calling ${methodName}`, args);
    },
    onError: async (methodName, error) => {
      if (error.message.includes("Not authenticated")) {
        const action = await vscode.window.showErrorMessage(
          "Authentication required. Please login to Datalayer.",
          "Login",
        );
        if (action === "Login") {
          vscode.commands.executeCommand("datalayer.login");
        }
      }
    },
  },
});

// Usage throughout extension - no casts needed anymore
const notebooks = await sdk.listNotebooks();
const runtime = await sdk.ensureRuntime();
```

### Service Layer Removal

**Removed Services** (October 2025):

- ❌ `spacerService.ts` - Deleted, use SDK directly
- ❌ `runtimeService.ts` - Deleted, use SDK directly

These services were wrapping every SDK method 1:1 just for logging. Now handled by SDK handlers pattern.

### Important Notes

- **NO EMOJIS** in code, comments, or documentation
- Always check for existing runtimes before creating new ones
- Use actual API field names (e.g., `ingress` not `jupyter_base_url`)
- Maintain JSDoc comments for all exported functions
- Use FormData for notebook/lexical creation, JSON for other endpoints
- All cross-cutting concerns (logging, error handling) go in SDK handlers, not wrapper services
- SDK interface is now complete - no type casts needed

### Notebook Cell Management

**Adding Cells**: Use `NotebookActions` directly from `@jupyterlab/notebook`:

```typescript
import { NotebookActions } from "@jupyterlab/notebook";

// ✅ CORRECT - Use NotebookActions directly
const notebookWidget =
  notebook?.adapter?.widget || notebook?.adapter?._notebookPanel?.content;
const sessionContext =
  notebook?.adapter?.sessionContext ||
  notebook?.adapter?._notebookPanel?.context?.sessionContext;

if (notebookWidget) {
  // Add code cell
  NotebookActions.insertBelow(notebookWidget);
  NotebookActions.changeCellType(notebookWidget, "code");

  // Add markdown cell
  NotebookActions.insertBelow(notebookWidget);
  NotebookActions.changeCellType(notebookWidget, "markdown");
}

if (notebookWidget && sessionContext) {
  // Run all cells
  NotebookActions.runAll(notebookWidget, sessionContext);
}

// ❌ INCORRECT - Commands and store methods don't work in VS Code extension context
notebook.adapter.commands.execute("notebook-cells:insert-below", {
  cellType: "code",
});
notebookStore.insertBelow({ id: notebookId, source: "", cellType: "code" });
```

**Key NotebookActions Methods**:

- `NotebookActions.insertBelow(widget)` - Insert cell below current position
- `NotebookActions.insertAbove(widget)` - Insert cell above current position
- `NotebookActions.changeCellType(widget, cellType)` - Change cell type ('code' | 'markdown' | 'raw')
- `NotebookActions.runAll(widget, sessionContext)` - Run all cells in the notebook
- `NotebookActions.run(widget, sessionContext)` - Run current cell

This approach bypasses the problematic command registry and uses the same low-level actions that the working JupyterLab commands use internally.

### Kernel Selection Architecture

**KernelBridge Pattern**: Manages kernel connections for both webview and native notebooks:

```typescript
// Register webview when custom editor opens
kernelBridge.registerWebview(document.uri, webviewPanel);

// Connect notebook to runtime
await kernelBridge.connectWebviewNotebook(documentUri, runtime);

// Cleanup on close
kernelBridge.unregisterWebview(document.uri);
```

**MutableServiceManager**: Prevents React re-renders when changing runtimes:

```typescript
// Create stable wrapper that doesn't change
const mutableServiceManager = new MutableServiceManager();

// Update internal service manager without triggering re-render
mutableServiceManager.updateConnection(url, token);

// Use proxy for transparent access
const serviceManager = mutableServiceManager.createProxy();
```

**Kernel Selection Flow**:

1. User clicks "Select Kernel" in notebook toolbar
2. Webview posts `select-kernel` message to extension
3. Extension shows `kernelSelector` with three options
4. User selects kernel source (Datalayer/Python/Jupyter)
5. KernelBridge sends `kernel-selected` message to webview
6. Webview updates MutableServiceManager without re-rendering

## Troubleshooting

### Common Issues

1. **Icons not showing**: Check codicon font loading in notebookEditor.ts
2. **Theme not matching**: Verify VSCodeThemeProvider is active
3. **Syntax highlighting missing**: Check patch-vscode-highlighting.js ran during build
4. **Black backgrounds**: Enhanced theme provider should inject CSS fixes
5. **Add Cell buttons not working**: Import `NotebookActions` from `@jupyterlab/notebook` and use `NotebookActions.insertBelow()` + `NotebookActions.changeCellType()` instead of store/command methods
6. **Run All button not working**: Use `NotebookActions.runAll(widget, sessionContext)` instead of store or command methods
7. **Notebook widget not accessible**: Check `notebook?.adapter?.widget` or `notebook?.adapter?._notebookPanel?.content` for the JupyterLab widget
8. **Module specifier error for @primer/react-brand CSS**:
   - Error: `Failed to resolve module specifier "@primer/react-brand/lib/css/main.css"`
   - Fix: Run post-build script to remove problematic CSS imports from bundled JS files
   - The fix-production-bundle.js script automatically handles this during build
9. **"No webview found" error when selecting kernel**:
   - Cause: KernelBridge instance not shared between provider and selector
   - Fix: Pass existing KernelBridge instance to showKernelSelector
10. **Notebook re-renders when changing runtimes**:

- Cause: React key changes with runtime causing unmount/remount
- Fix: Remove dynamic key, use MutableServiceManager for stable reference

11. **MCP tool opens VS Code native notebook instead of Datalayer editor**:

- Cause: Using VS Code native API (`vscode.workspace.openNotebookDocument`)
- Fix: Use message-based communication via `datalayer.internal.sendToWebview`
- See: [dev/docs/MCP.md](dev/docs/MCP.md) for details

12. **Insert cell fails with "notebook widget not found"**:

- Cause: `notebookStore2.notebooks` is a Map, not an object
- Fix: Use `notebooks.get(notebookId)` instead of `notebooks[notebookId]`
- Also: Add polling logic to wait for notebook initialization (up to 10 seconds)

### Debug Commands

- View authentication status: "Datalayer: Show Authentication Status"
- Refresh spaces: "Datalayer: Refresh Spaces"
- Check console for runtime creation logs

## Recent Improvements

- ✅ Complete VS Code theme integration with syntax highlighting
- ✅ Native toolbar with codicon icons
- ✅ Background color harmony (no black gaps)
- ✅ Cell backgrounds matching VS Code notebook colors
- ✅ Comprehensive TypeDoc documentation
- ✅ Four separate CI/CD workflows for quality assurance
- ✅ Virtual file system for Datalayer documents
- ✅ Production build CSS import fix for @primer/react-brand
- ✅ Post-build script to remove problematic module specifiers
- ✅ **SDK Integration with Handlers Pattern** (October 2025) - Eliminated service wrappers
- ✅ **Clean Architecture** - Direct SDK usage with platform-specific handlers
- ✅ **Zero Code Duplication** - No more 1:1 method wrapping
- ✅ **Unified Kernel Selection** (October 2025) - Single picker for all kernel sources
- ✅ **Runtime Hot-Swapping** - Change kernels without notebook re-render
- ✅ **Kernel Bridge Architecture** - Unified routing for webview and native notebooks
- ✅ **MCP Tools Integration** (October 2025) - GitHub Copilot can create and manipulate notebooks programmatically
- ✅ **Jupyter MCP Server Parity** (October 2025) - All 14 tools mirror jupyter-mcp-server functionality
- ✅ **Lexical Creation Tools** (October 2025) - 16 total tools with local/remote lexical document creation
- ✅ **Complete CRUD Operations** - Read, create, update, delete cells via Copilot
- ✅ **Message-Based Cell Insertion** - Proper custom editor support via extension-webview messaging
- ✅ **Async Notebook Initialization Handling** - Polling mechanism for reliable cell insertion
- ✅ **Request-Response Pattern** - Webview can respond to extension requests with cell data
- ✅ **NotebookActions Integration** - Uses JupyterLab's NotebookActions for cell operations

## Current State Summary (October 2025)

### Version Information

- **Extension Version**: 0.0.3
- **VS Code**: ^1.98.0 (required)
- **Node.js**: >= 20.0.0 and < 21.0.0 (strict requirement)
- **TypeScript**: 5.8.3
- **React**: 18.3.1

### Quality Metrics

- ✅ **Tests**: 41/41 passing (100%)
- ✅ **Type Check**: 0 errors (strict mode)
- ✅ **Lint**: 0 warnings
- ✅ **Documentation**: 100% coverage (466/466 items)
- ✅ **Build**: Multi-platform (Windows, macOS, Linux)

### Key Capabilities

1. **Authentication**: Token-based login with Datalayer platform
2. **Jupyter Notebooks**: Edit `.ipynb` files with cloud runtimes
3. **Lexical Documents**: Edit `.lexical` rich text files
4. **Datalayer Spaces**: Browse and manage cloud documents in tree view
5. **Runtime Management**: Create, terminate, and monitor cloud runtimes in tree view
6. **Virtual File System**: `datalayer://` URIs for seamless document access
7. **Real-time Collaboration**: Y.js-based sync for lexical documents
8. **Theme Integration**: Complete VS Code theme matching

### Known Limitations

- **Smart Controller**: Disabled (native notebook controller needs improvement)
- **WebSocket Protocol**: Uses older Jupyter protocol due to serialization constraints
- **Snapshot Creation**: UI exists but implementation pending

### Documentation Resources

- **API Docs**: https://datalayer-desktop.netlify.app (auto-deployed)
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode
- **GitHub**: https://github.com/datalayer/vscode-datalayer

### CI/CD Workflows

All workflows run on every push to main and on PRs:

1. **Extension Build & Test**: Multi-platform .vsix generation
2. **Code Quality**: ESLint, Prettier, console.log detection
3. **Type Check**: TypeScript compilation with strict mode
4. **Documentation**: TypeDoc generation and Netlify deployment

---

_Last Updated: October 2025_
