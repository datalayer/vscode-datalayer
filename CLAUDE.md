# Datalayer VS Code Extension - Developer Guide

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

# Production Build (Electron Desktop App)
# From desktop directory:
npm run build
npm run dist:mac  # Builds universal macOS app
# Note: Post-build script automatically fixes CSS import issues
```

## Architecture Overview

- **Extension Context** (`src/`): Node.js environment, handles auth & server communication
- **Webview** (`webview/`): React-based notebook editor with VS Code theme integration
- **Message Passing**: JWT token injection between extension and webview
- **SDK Integration**: Direct use of `@datalayer/core` SDK with handlers pattern for VS Code-specific behavior

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

## Configuration

```json
{
  "datalayer.serverUrl": "https://prod1.datalayer.run",
  "datalayer.runtime.defaultMinutes": 10
}
```

**Note:** Runtime environments (e.g., Python CPU, AI Environment) are fetched dynamically from the Datalayer API and cached using `EnvironmentCache`. No hardcoded environment names. Credits are calculated automatically based on runtime duration and environment burning rate.

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

## Project Structure

```
src/
├── services/
│   ├── bridges/           # ✨ Extension ↔ Webview ↔ Platform bridges
│   │   ├── documentBridge.ts  # Downloads/opens documents from platform
│   │   ├── kernelBridge.ts    # Routes kernel connections to webviews
│   │   ├── networkBridge.ts   # Bridges HTTP/WebSocket for providers
│   │   └── runtimeBridge.ts   # Runtime lifecycle operations
│   ├── messaging/         # Message routing infrastructure
│   │   ├── messageRouter.ts   # Centralized message dispatcher
│   │   └── types.ts           # Messaging type definitions
│   ├── network/           # Low-level network primitives
│   │   └── networkProxy.ts    # HTTP/WebSocket proxy service
│   ├── core/              # Core services (auth, SDK, error handling)
│   ├── cache/             # Caching services (environments)
│   ├── collaboration/     # Real-time collaboration services
│   ├── logging/           # Logging infrastructure
│   └── ui/                # UI components (status bar)
├── providers/
│   ├── baseDocumentProvider.ts     # Base class for custom editors
│   ├── notebookProvider.ts         # Jupyter notebook custom editor
│   ├── lexicalProvider.ts          # Lexical document custom editor
│   ├── spacesTreeProvider.ts       # Spaces tree view provider
│   └── smartDynamicControllerManager.ts  # Notebook controller manager
├── commands/         # VS Code command implementations
├── models/           # Data models (documents, spaces)
└── ui/               # UI dialogs (kernel selector, auth, etc.)

webview/
├── theme/          # VS Code theme integration
├── notebook/       # Notebook editor components
│   ├── NotebookEditor.tsx    # Main notebook component
│   └── NotebookToolbar.tsx   # Toolbar with kernel display
├── lexical/        # Lexical editor components
│   ├── LexicalWebview.tsx    # Main lexical editor
│   └── LexicalToolbar.tsx    # Lexical toolbar
├── components/     # Shared UI components
├── stores/         # Zustand state stores
└── services/       # Webview services
    ├── serviceManager.ts         # JupyterLab ServiceManager wrapper
    └── mutableServiceManager.ts  # Hot-swappable ServiceManager
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

### SDK Usage Pattern (January 2025)

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

**Removed Services** (January 2025):

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

## Version

Current: 0.0.2
VS Code requirement: ^1.98.0
Node.js: >= 20.0.0
