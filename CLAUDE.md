# Datalayer VS Code Extension - Developer Context

**Last Updated**: November 2025

## Critical Recent Changes

### Auto-Connect Feature (November 2025)

**Status**: Fully implemented and working
**Location**: `src/services/autoConnect/`
**Purpose**: Automatically connects documents to runtimes when opened

**Architecture**:

- **Strategy Pattern**: Extensible design for different connection strategies
- **Configuration**: `datalayer.autoConnect.strategies` array setting
- **Default**: `["Active Runtime", "Ask"]` - tries active runtime, then asks user

**Available Strategies**:

```typescript
"Active Runtime"; // Selects runtime with MOST TIME REMAINING (sorted by expiredAt - now)
"Ask"; // Shows Quick Pick dialog (same as Select Kernel)
```

**Key Design Decisions**:

- **Smart Selection**: ActiveRuntimeStrategy sorts runtimes by remaining time (expiredAt - now) in descending order, always selecting the runtime with the most time available to maximize session duration
- **No Extra API Calls**: Uses `RuntimesTreeProvider.getCachedRuntimes()` to access already-loaded runtime data from the sidebar
- **Strategy Pattern**: Extensible design allows adding new connection strategies without modifying existing code

**Files**:

- `src/services/autoConnect/autoConnectService.ts` - Main service with fallback chain
- `src/services/autoConnect/strategies/activeRuntimeStrategy.ts` - Selects runtime with most time remaining (sorted by expiredAt)
- `src/services/autoConnect/strategies/askUserStrategy.ts` - Shows runtime picker
- `src/providers/notebookProvider.ts` - Integrated in resolveCustomEditor
- `src/providers/lexicalProvider.ts` - Integrated in resolveCustomEditor
- `src/providers/runtimesTreeProvider.ts` - Added `getCachedRuntimes()` method
- `src/extension.ts` - Added `getRuntimesTreeProvider()` export

**Configuration Examples**:

```json
["Active Runtime"]           // Auto-connect to runtime with most time remaining, silent if none
["Active Runtime", "Ask"]    // Try runtime, ask if none (DEFAULT)
["Ask"]                      // Always ask user
[]                           // Disabled
```

### Smart Controller Registration - DISABLED (January 2025)

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

# Watch for changes
npm run watch

# Sync jupyter packages from monorepo
npm run sync:jupyter

# Create patches for modified packages
npm run create:patches

# Debug
Press F5 in VS Code to launch Extension Development Host

# Build & Package
npm run compile      # Includes icon font generation
npm run vsix

# Icon font generation (runs automatically during compile)
npm run build:icons
```

## Development Scripts

### Jupyter Package Workflow

The extension depends on local `@datalayer/jupyter-lexical` and `@datalayer/jupyter-react` packages. Use these scripts to sync changes:

```bash
# Sync latest changes from jupyter-ui monorepo (one-time)
npm run sync:jupyter
# - Builds jupyter-lexical and jupyter-react (tsc)
# - Copies lib/ outputs to vscode-datalayer/node_modules

# Watch mode - auto-sync on changes
npm run sync:jupyter:watch
# - Monitors src/ folders in jupyter-ui packages
# - Automatically rebuilds and syncs on file changes
# - Requires fswatch (auto-installed via Homebrew on macOS)

# Create patches for your modifications
npm run create:patches
# - Automatically syncs first
# - Generates patch files in patches/
# - Patches applied automatically via postinstall hook

# Apply patches manually (if needed)
npm run apply:patches
# - Usually runs automatically during npm install
```

### Workflow

1. **Make changes** in `../jupyter-ui/packages/lexical` or `../jupyter-ui/packages/react`
2. **Option A - Manual**: Run `npm run sync:jupyter` after each change
3. **Option B - Watch mode**: Run `npm run sync:jupyter:watch` once, changes auto-sync
4. **Test changes**: Compile and run extension (`npm run compile` then F5)
5. **Create patches**: `npm run create:patches` (when ready to commit)

The patches in `patches/` directory ensure all contributors automatically get your modifications when they run `npm install`.

### Script Implementation

Scripts are in `scripts/` directory to keep package.json clean:

- `scripts/sync-jupyter.sh` - Build and sync jupyter packages
- `scripts/create-patches.sh` - Generate patch-package patches
- `scripts/apply-patches.sh` - Apply existing patches

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
  - Python Environments (local Python kernels via Python extension)
  - Existing Jupyter Server (connect to any running Jupyter server)
- **Kernel Bridge**: Routes connections to appropriate handlers (webview or native)
- **Runtime display**: Shows "Datalayer: {Runtime name}" in notebook toolbar
- **Zero re-render**: Runtime changes use MutableServiceManager to prevent component unmount/remount

### ⚡ Local Kernel Execution (January 2025)

- **Native ZMQ Integration**: Direct kernel communication using @nteract/messaging and zeromq
- **RawSocket Implementation**: WebSocket-like wrapper over ZMQ channels (shell, iopub, stdin, control)
- **LocalKernelClient**: Manages kernel lifecycle (start, stop, restart, interrupt)
- **LocalKernelProxy**: Simulates WebSocket connection for webview integration
- **Session ID Translation**: Maps between kernel's session ID and JupyterLab's expected session ID
- **Python Extension Integration**: Uses VS Code Python extension's environment picker
- **LocalKernelServiceManager**: ServiceManager implementation for local kernels
- **Network Proxy Routing**: Detects `local-kernel-*` URLs and routes to LocalKernelClient

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
├── services/kernel/       # Local kernel integration
│   ├── localKernelClient.ts           # Kernel lifecycle management
│   ├── rawSocket.ts                   # ZMQ socket wrapper
│   └── nativeKernelIntegration.ts     # Python extension integration
├── services/network/
│   └── localKernelProxy.ts            # WebSocket simulation for local kernels
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
├── hooks/                 # React hooks
│   └── useRuntimeManager.ts     # Runtime selection and ServiceManager lifecycle
└── services/              # Webview services
    ├── messageHandler.ts            # Extension communication
    ├── mockServiceManager.ts        # Development mock
    ├── serviceManager.ts            # JupyterLab service management
    ├── mutableServiceManager.ts     # Stable ServiceManager wrapper
    ├── localKernelConnection.ts     # Local kernel connection protocol
    └── localKernelServiceManager.ts # ServiceManager for local kernels
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

### Custom Icon Font

The extension uses a custom WOFF icon font for branded UI elements:

- **Font file**: `resources/datalayer-icons.woff` (generated)
- **Build command**: `npm run build:icons` (runs automatically in `npm run compile`)
- **Usage in code**: `$(datalayer-logo)` syntax in package.json commands
- **Adding icons**: Add SVG to `resources/icons/`, run build script, update package.json
- **Full docs**: See `dev/docs/DEVELOPMENT.md` - Custom Icon Font System section

**Toolchain**: SVG → svgicons2svgfont → svg2ttf → ttf2woff → WOFF

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
- ✅ **LLM Inline Completions** (January 2025) - Copilot-like ghost text suggestions in Lexical editor
- ✅ **Batch Block Insertion** (November 2025) - insertBlocks tool for efficient multi-block creation
- ✅ **Automatic Schema Generator** (November 2025) - TypeScript-to-JSON tool schema sync

### Batch Block Insertion (November 2025)

**Feature**: `insertBlocks` tool allows Copilot to create complex documents with one API call instead of sequential `insertBlock` calls.

**Problem Solved**: Creating a document with 10 blocks required 10 separate API calls, causing:

- Performance overhead (message serialization × 10)
- Complex state management in AI model
- Risk of partial failures leaving incomplete documents

**Solution**: Single `insertBlocks` call with array of blocks:

```typescript
// Instead of 10 calls to insertBlock:
insertBlocks({
  insert_after_block_id: "TOP",
  blocks: [
    { blockType: "heading", source: "# Title" },
    { blockType: "paragraph", source: "Intro..." },
    // ... 8 more blocks
  ],
});
```

**Implementation**:

- **Full stack architecture**: 8 layers from tool definition to webview controller
- **Sequential insertion**: Each block inserts after the previous (maintains order)
- **Error handling**: Stops on first failure with block number in error message
- **Chaining support**: Returns last inserted block ID for continuation

**Files**:

- `src/tools/definitions/tools/insertBlocks.ts` - Tool definition
- `src/tools/core/lexical/insertBlocks.ts` - Operation logic
- `src/commands/internal.ts` - Internal command with requestId
- `webview/lexical/plugins/InternalCommandsPlugin.tsx` - Message handler
- `webview/utils/LexicalDocumentController.ts` - Controller method

### Tool Schema Generator (November 2025)

**Feature**: Automatic synchronization of TypeScript tool definitions to `package.json` for GitHub Copilot.

**Architecture**:

- **Source of Truth**: TypeScript tool definitions in `src/tools/definitions/tools/*.ts`
- **Generator**: `scripts/generate-tool-schemas.js` - Parses TypeScript AST without eval()
- **Validator**: `scripts/validate-tool-schemas.js` - Checks schema completeness

**Parser Capabilities**:

- Parses TypeScript object literals (handles `as const`, single quotes, trailing commas)
- Extracts nested objects and arrays
- Preserves complex schemas (array items with properties and required fields)
- Handles string escaping and multiline descriptions
- Type-safe without using eval() or dynamic code execution

**Workflow**:

1. **Define tool in TypeScript** with full type safety:

```typescript
export const myTool: ToolDefinition = {
  name: "datalayer_myTool",
  description: "AI-readable description",
  parameters: {
    properties: { param: { type: "string" } },
    required: ["param"],
  },
} as const;
```

2. **Generate schema**:

```bash
node scripts/generate-tool-schemas.js
# Output: ✅ 12/12 tools parsed successfully
```

3. **Validate**:

```bash
node scripts/validate-tool-schemas.js
# Output: ✅ All expected Lexical tools present
```

**Benefits**:

- **Type Safety**: TypeScript catches errors at compile time
- **Single Source of Truth**: No manual duplication between TS and JSON
- **Automatic Sync**: Eliminates schema drift
- **Developer Experience**: Write once, generate everywhere

**Current Status**: 13 tools (8 notebook + 5 Lexical), 100% schema coverage

### LLM Inline Completions (January 2025)

**Feature**: Copilot-style inline code completions in Lexical editor using VS Code Language Model API.

**Implementation**:

- **DecoratorNode**: `InlineCompletionNode` renders ghost text with low opacity
- **Plugin**: `LexicalInlineCompletionPlugin` manages completion lifecycle
- **Provider**: `LexicalVSCodeLLMProvider` (webview) communicates with extension host
- **Extension Integration**: Uses `vscode.lm.selectChatModels()` API for LLM access

**Key Features**:

- **Ghost text rendering**: Low opacity, VS Code theme-aware suggestions
- **Smart triggering**: Only shows in active cell with non-empty content and current line
- **No blank line completions**: Prevents showing completions when just pressing Enter (empty line)
- **Trailing newline cleanup**: Strips extra newlines to prevent spacing issues
- **Debounced requests**: 200ms debounce to reduce API calls
- **Tab to accept**: Press Tab to insert completion
- **Escape to dismiss**: Press Escape to clear suggestion
- **NodeTransform resilience**: Automatically re-adds completion node when parent recreated

**Files Modified**:

- `jupyter-ui/packages/lexical/src/nodes/InlineCompletionNode.tsx` - DecoratorNode implementation
- `jupyter-ui/packages/lexical/src/plugins/LexicalInlineCompletionPlugin.tsx` - Plugin logic
- `vscode-datalayer/webview/services/completion/lexicalLLMProvider.ts` - Webview provider
- `vscode-datalayer/src/providers/lexicalProvider.ts` - Extension LLM integration
- `vscode-datalayer/webview/lexical/LexicalEditor.tsx` - Plugin instantiation

**Patches**: Changes maintained via patch-package in `patches/@datalayer+jupyter-lexical+1.0.6.patch`

- ✅ **Local Kernel Execution** (January 2025) - Native Python kernels with ZMQ integration
- ✅ **Python Extension Integration** - Seamless environment selection from Python extension
- ✅ **LocalKernelServiceManager** - Full ServiceManager implementation for local kernels
- ✅ **Unified Kernel Architecture** (November 2025) - Template Method pattern eliminates ~174 lines of duplicate code

### Unified Kernel Architecture (November 2025)

**Goal**: Homogenize kernel and session management across different execution environments (mock, local, remote, future Pyodide).

**Implementation**: Template Method design pattern with base manager classes.

#### Base Manager Classes

**BaseKernelManager** (`webview/services/base/baseKernelManager.ts` - 432 lines):

- Abstract base implementing `Kernel.IManager` interface
- Common methods: `shutdown()`, `dispose()`, `running()`, `requestRunning()`, `refreshRunning()`, `findById()`
- Abstract method: `startNew()` (subclasses implement)
- Type discriminator: `managerType: "mock" | "pyodide" | "local" | "remote"`
- Signal management: `runningChanged`, `disposed`
- Unified logging with type prefix

**BaseSessionManager** (`webview/services/base/baseSessionManager.ts` - 394 lines):

- Abstract base implementing `Session.IManager` interface
- Common methods: `shutdown()`, `dispose()`, `running()`, `requestRunning()`, `refreshRunning()`, `findById()`, `findByPath()`
- Abstract method: `startNew()` (subclasses implement)
- Type discriminator: `managerType: "mock" | "pyodide" | "local" | "remote"`
- Signal management: `runningChanged`, `disposed`

#### Concrete Implementations

**MockServiceManager** (`webview/services/mockServiceManager.ts`):

- **Before**: ~310 lines with inline object properties
- **After**: 284 lines extending base classes
- **Savings**: ~26 lines eliminated
- **Behavior**: Throws helpful errors on execution attempts for read-only mode
- Both `MockKernelManager` and `MockSessionManager` extend respective bases

**LocalKernelServiceManager** (`webview/services/localKernelServiceManager.ts`):

- **Before**: ~450 lines with duplicate lifecycle code
- **After**: 308 lines extending base classes
- **Savings**: ~142 lines eliminated
- **Behavior**: Creates `LocalKernelConnection` for direct ZMQ communication to VS Code Python
- Both `LocalKernelManager` and `LocalSessionManager` extend respective bases
- Only implements unique logic in `startNew()` and `connectTo()`

**ServiceManagerFactory** (`webview/services/serviceManagerFactory.ts`):

- Type-safe factory with discriminated unions
- Methods:
  - `create(options)` - Main factory with type discrimination
  - `isMock(manager)` - Type guard for mock managers
  - `getType(manager)` - Runtime type identification
- Supports: 'mock', 'local', 'remote', 'pyodide' (stub)
- Pyodide type throws "not yet implemented" error with helpful message

**MutableServiceManager** (`webview/services/mutableServiceManager.ts`):

- Currently uses old factory functions (`createMockServiceManager`, `updateServiceManager`)
- **Future**: Will be updated to use `ServiceManagerFactory.create()` for consistency
- Enables hot-swapping between kernel types without React re-renders

#### Benefits

1. **Code Reuse**: ~174 total lines eliminated across implementations
2. **Type Safety**: Discriminated unions ensure correct options per manager type
3. **Interface Compliance**: All managers correctly implement JupyterLab interfaces
4. **Consistent Behavior**: Standardized logging, validation, disposal, lifecycle
5. **Extensibility**: Adding new kernel types requires only implementing `startNew()`
6. **Debugging**: Runtime type identification via `managerType` property
7. **UX**: Stable references prevent unnecessary component re-renders

#### Technical Details

**Template Method Pattern**:

- Base classes define algorithm skeleton
- Subclasses fill in specific steps (`startNew()`, `connectTo()`)
- Common operations fully implemented in base

**Type Discrimination**:

```typescript
type KernelManagerType = "mock" | "pyodide" | "local" | "remote";
type SessionManagerType = "mock" | "pyodide" | "local" | "remote";

interface ITypedKernelManager extends Kernel.IManager {
  readonly managerType: KernelManagerType;
}
```

**Future Work** (Phases 5-13):

- [ ] Integrate factory into MutableServiceManager
- [ ] Create RuntimeProvider context for shared state
- [ ] Create useRuntimeMessages hook for centralized message handling
- [ ] Update NotebookEditor to use RuntimeProvider
- [ ] Update LexicalEditor to use shared architecture
- [ ] Comprehensive testing across all kernel types
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
2. **Jupyter Notebooks**: Edit `.ipynb` files with cloud runtimes or local Python kernels
3. **Local Kernel Execution**: Native Python kernels via ZMQ with Python extension integration
4. **Lexical Documents**: Edit `.lexical` rich text files
5. **Datalayer Spaces**: Browse and manage cloud documents in tree view
6. **Runtime Management**: Create, terminate, and monitor cloud runtimes in tree view
7. **Virtual File System**: `datalayer://` URIs for seamless document access
8. **Real-time Collaboration**: Y.js-based sync for lexical documents
9. **Theme Integration**: Complete VS Code theme matching

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
