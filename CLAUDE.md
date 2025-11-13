# Datalayer VS Code Extension - AI Assistant Context

**Last Updated**: October 2025
**Purpose**: Concise quick-start context. For details, see `dev/docs/`

## 🚨 Critical Warnings

### 1. SmartDynamicControllerManager - DISABLED

- **Location**: `src/services/ui/uiSetup.ts:85`
- **Code**: `const controllerManager = null as unknown as SmartDynamicControllerManager;`
- **Why**: Native notebook controller needs improvement before re-enabling

### 2. Spacer API Import Pattern

❌ **NEVER**: `import { items } from '../../../api/spacer';`
✅ **ALWAYS**: `import * as spacerAPI from '../../../api/spacer';`
**Why**: Webpack bundling causes runtime errors with destructured imports

### 3. Node.js Version (STRICT)

- **Required**: Node.js 20.x (NOT 22, NOT latest)
- **Files**: `.nvmrc`, `.node-version` = `20.18.0`
- **Why**: Matches VS Code 1.98.0 runtime environment

## 📋 Recent Changes (Last 60 Days)

### Pyodide Integration (November 2025)

**What**: Browser-based Python execution (offline, zero setup)
**Status**: ✅ Production-ready - Complete with TypeScript strict mode compliance and no duplicate outputs

**Key Changes**:

- `PyodideInlineKernel`: Blob URL worker with inline asm.js loading
- Message protocol: Execute input, parent_header filtering, property setters
- Output isolation: Each cell receives only its own execution messages
- Execution counts: Proper `[1]:`, `[2]:` display via execute_input messages
- **JupyterLite callback pattern**: Eliminated duplicate outputs completely
- **Code organization**: Python module in `.py` file, reduced main file by 582 lines (41%)
- **sys.path configuration**: Added `/` to Python path for module imports

**Package Preloading**:

The extension can automatically download common Python packages on startup:

- **Configuration**: `datalayer.pyodide.preloadBehavior`
  - `ask-once` (default): Prompt once on first use
  - `ask-always`: Prompt every time packages aren't cached
  - `auto`: Download automatically without prompting
  - `disabled`: Never preload packages
- **Package List**: `datalayer.pyodide.preloadPackages` (24 packages by default)
- **Cache Management**: Command `datalayer.pyodide.clearCache` clears IndexedDB and resets prompt state

**Technical Achievements**:

- ✅ Output formatting (line breaks, streaming) working perfectly
- ✅ IAnyMessageArgs message unwrapping for TypeScript compliance
- ✅ Package preloading with flexible behavior modes
- ✅ **No duplicate outputs** - JupyterLite callback pattern implemented
- ✅ **Clean architecture** - Python in `.py`, worker in `.ts`, main kernel in `.ts`
- ✅ **Type safety** - Modern Python type hints with `from __future__ import annotations`
- ⚠️ No syntax highlighting in outputs yet (minor)

**Details**: See [`dev/docs/PYODIDE.md`](./dev/docs/PYODIDE.md)

## 🏗️ Quick Architecture

```
src/               # Extension (Node.js 20)
├── commands/      # Command handlers
├── services/      # Business logic (bridges/, core/, logging/)
└── providers/     # VS Code APIs (tree views, custom editors)

webview/           # React 18 UI
├── notebook/      # Jupyter editor
├── lexical/       # Rich text editor
├── services/      # MutableServiceManager, messageHandler
└── hooks/         # useRuntimeManager (kernel hot-swap)
```

### Key Patterns

**MutableServiceManager**: Hot-swap kernels without re-render

```typescript
await mutableServiceManager.updateToPyodide(); // Browser kernel
mutableServiceManager.updateConnection(url, token); // Remote kernel
mutableServiceManager.resetToMock(); // No execution
```

**Singleton Services**: Use `getInstance()`

- LoggerManager, EnvironmentCache, DocumentBridge
- NotebookRuntimeService, LexicalCollaborationService, StatusBar

## 🔧 Essential Commands

### Quality Checks (Run Before Commit!)

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
npm run compile
npm run vsix
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

## Project Structure (January 2025)

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

npm run format # Prettier
npm run lint # ESLint (0 warnings required)
npm run type-check # TypeScript (0 errors required)
npm run docs # TypeDoc (100% coverage required)
npm test # All 41 tests must pass

````

### Development

```bash
npm run watch       # Start watch mode
# Press F5 to launch Extension Development Host
npm run compile     # Build extension
npm run vsix        # Create .vsix package
````

## 📚 Detailed Documentation

**Core Docs** (root):

- [README.md](./README.md) - User guide
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [RELEASE.md](./RELEASE.md) - Release process

**Developer Docs** (`dev/docs/`):

- [ARCHITECTURE.md](./dev/docs/ARCHITECTURE.md) - Complete architecture patterns
- [DEVELOPMENT.md](./dev/docs/DEVELOPMENT.md) - Setup, debugging, workflows
- [TESTING.md](./dev/docs/TESTING.md) - Test infrastructure (41 tests)
- [CONTRIBUTING.md](./dev/docs/CONTRIBUTING.md) - Contribution guidelines
- [PYODIDE.md](./dev/docs/PYODIDE.md) - Pyodide integration details

## 🔥 Common Gotchas

1. **Add Cell**: Use `NotebookActions.insertBelow(widget)` NOT commands/store
2. **Icons missing**: Check codicon font loading
3. **No webview found**: Pass existing KernelBridge instance
4. **Re-renders on runtime change**: Use MutableServiceManager pattern
5. **Module specifier error**: Post-build script should fix CSS imports

## 📊 Current State

**Version**: 0.0.4
**Quality**: 41/41 tests passing, 0 lint warnings, 0 type errors, 100% doc coverage

**Known Limitations**:

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
- ✅ **SDK Integration with Handlers Pattern** (January 2025) - Eliminated service wrappers
- ✅ **Clean Architecture** - Direct SDK usage with platform-specific handlers
- ✅ **Zero Code Duplication** - No more 1:1 method wrapping
- ✅ **Unified Kernel Selection** (January 2025) - Single picker for all kernel sources
- ✅ **Runtime Hot-Swapping** - Change kernels without notebook re-render
- ✅ **Kernel Bridge Architecture** - Unified routing for webview and native notebooks
- ✅ **LLM Inline Completions** (January 2025) - Copilot-like ghost text suggestions in Lexical editor

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

## Current State Summary (January 2025)

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

- Smart Controller disabled
- WebSocket uses older Jupyter protocol
- Cloud documents read-only

---

_Keep this file under 300 lines. Archive older changes to `dev/docs/HISTORICAL_CHANGES.md`_
