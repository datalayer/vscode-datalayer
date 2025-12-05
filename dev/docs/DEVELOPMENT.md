# Development Guide

This document provides comprehensive information for developers who want to contribute to or modify the Datalayer VS Code extension.

## Prerequisites

- Node.js >= 20.0.0 and < 21.0.0 (use `.nvmrc` for version management)
- VS Code >= 1.98.0
- npm (not yarn)

**Important**: The extension runs in VS Code's Node.js 20 runtime. Using Node.js 20 for development ensures compatibility.

## Setup

```bash
# Install dependencies
npm install

# Watch for changes (development)
npm run watch

# Run linting
npm run lint

# Build extension
npm run compile

# Package extension
npm run package

# Create VSIX package
npm run vsix
```

## Working with Jupyter Packages

The extension depends on local `@datalayer/jupyter-lexical` and `@datalayer/jupyter-react` packages from the monorepo. During development, you may need to sync changes from the jupyter-ui repository.

### Development Scripts

```bash
# Sync latest changes from jupyter-ui packages
npm run sync:jupyter
# 1. Runs gulp resources-to-lib (copies images/examples to lib/)
# 2. Builds TypeScript (jupyter-lexical and jupyter-react)
# 3. Copies lib/, style/, and package.json to node_modules

# Watch mode - auto-sync on file changes
npm run sync:jupyter:watch
# Monitors src/ folders and automatically rebuilds/syncs when files change

# Create patches for modified packages
npm run create:patches
# Auto-syncs first, then generates patch files in patches/

# Apply patches manually (if needed)
npm run apply:patches
# Normally runs automatically via postinstall hook
```

### Workflow

1. **Make changes** in `../jupyter-ui/packages/lexical` or `../jupyter-ui/packages/react`
2. **Option A - Manual sync**: `npm run sync:jupyter` when ready to test
3. **Option B - Auto sync**: `npm run sync:jupyter:watch` in a separate terminal for live updates
4. **Test changes**: Compile and run extension (`npm run compile` then F5)
5. **Create patches**: `npm run create:patches` (when ready to commit)

The patches in `patches/` directory are automatically applied when anyone runs `npm install`, ensuring all contributors get your modifications.

### ⚠️ Important Notes

**After `npm install`, you MUST re-run `npm run sync:jupyter`**. The sync script copies packages to `node_modules/`, and `npm install` will remove these synced packages. Always sync again after installing new dependencies.

**New Dependencies** (added January 2025):

- `tailwindcss` - Required for processing Lexical's CSS
- `@tailwindcss/postcss` - PostCSS integration
- `postcss` - CSS processing
- `autoprefixer` - CSS vendor prefixing

These are needed because `@datalayer/jupyter-lexical/style/index.css` uses `@import 'tailwindcss'`.

## Custom Icon Font System

The extension uses a custom WOFF icon font for consistent Datalayer branding across the VS Code UI.

### Overview

- **Icon Font**: `resources/datalayer-icons.woff` (1KB)
- **Build Script**: `scripts/build-icons.js` (automated CLI-based generation)
- **Build Tool**: `npm run build:icons`
- **Source Icons**: `resources/icons/*.svg`
- **Integration**: Automatically built during `compile` and `vscode:prepublish`

### Toolchain

```
SVG files → svgicons2svgfont → svg2ttf → ttf2woff → WOFF font
```

### Current Icons

- `datalayer-logo` - Main Datalayer stacked blocks logo
  - **Used in**: Notebook toolbar button, Status bar
  - **Unicode**: `\ue900`
  - **Source**: `resources/icons/datalayer-logo.svg`

### Build Process

The icon font is automatically generated:

```bash
# Manual build
npm run build:icons

# Automatically runs during:
npm run compile          # Development builds
npm run vscode:prepublish # Production packaging
```

**CI Integration**: CI automatically rebuilds the icon font when:
- SVG files in `resources/icons/` are modified
- Build script `scripts/build-icons.js` is updated

### Adding New Icons

1. **Prepare SVG**:
   - Create monochrome SVG (single color)
   - Use `fill="currentColor"` for theme adaptability
   - Remove strokes (convert to fills)
   - Square aspect ratio recommended (e.g., 20x20 viewBox)

2. **Add to Project**:
   ```bash
   # Copy SVG to icons directory
   cp my-icon.svg resources/icons/
   ```

3. **Regenerate Font**:
   ```bash
   npm run build:icons
   ```
   This generates:
   - `resources/datalayer-icons.woff` - Icon font
   - `resources/datalayer-icons.json` - Unicode mapping

4. **Register in package.json**:
   Check `resources/datalayer-icons.json` for the assigned unicode, then add:
   ```json
   {
     "contributes": {
       "icons": {
         "my-icon": {
           "description": "My custom icon",
           "default": {
             "fontPath": "./resources/datalayer-icons.woff",
             "fontCharacter": "\\e901"
           }
         }
       }
     }
   }
   ```

5. **Use in Code**:
   ```typescript
   // In commands (package.json)
   "icon": "$(my-icon)"

   // In status bar (TypeScript)
   statusBarItem.text = "$(my-icon) Label";
   ```

### Icon Font Details

**Format**: WOFF (Web Open Font Format)
**Unicode Range**: Private Use Area (U+E900 - U+E9FF)
**Font Name**: `datalayer-icons`
**Dependencies**: `svgicons2svgfont`, `svg2ttf`, `ttf2woff`

### Packaging

- **Source SVGs**: Excluded from `.vsix` via `.vscodeignore`
- **Generated WOFF**: Included in `.vsix` package
- **Build**: Auto-runs before packaging

### Documentation

See `resources/icons/README.md` for complete icon font documentation.

## Code Quality & Validation

The project enforces strict quality standards with zero-tolerance for errors.

### Validation Commands

```bash
# Type checking (TypeScript compilation)
npm run type-check
# Runs: tsc --noEmit && tsc --noEmit -p tsconfig.webview.json

# Linting (ESLint)
npm run lint
# Zero warnings policy in production code

# Documentation generation
npm run doc
# Must have 100% documentation coverage

# Run all checks
npm run check
# Equivalent to: format:check + lint + type-check

# Auto-fix all issues
npm run check:fix
# Equivalent to: format + lint:fix + type-check

# Tool schema generation (Copilot tools)
node scripts/generate-tool-schemas.js
# Parses TypeScript tool definitions and syncs to package.json

# Validate tool schemas
node scripts/validate-tool-schemas.js
# Checks that package.json has all expected Copilot tools
```

### Quality Metrics (Current Status)

- ✅ **Type Check**: 0 errors (strict TypeScript)
- ✅ **Lint**: 0 warnings (ESLint with @typescript-eslint)
- ✅ **Documentation**: 100% coverage (466/466 items documented)
- ✅ **Tests**: 41/41 passing (100% success rate)
- ✅ **Format**: Prettier compliance

### Pre-Commit Checklist

Before committing any code:

1. `npm run type-check` - Must pass with zero errors
2. `npm run lint` - Must pass with zero warnings
3. `npm run doc` - Must generate without errors
4. `npm test` - All tests must pass

## Testing

```bash
# Run all tests (41 tests in ~60ms)
npm test

# Compile tests
npm run compile-tests

# Watch tests
npm run watch-tests
```

See [TESTING.md](./TESTING.md) for comprehensive testing guide.

## Test Infrastructure

### Overview

- **Framework**: Mocha (required by VS Code extension testing)
- **Assertion**: Node.js built-in `assert` module
- **Mock System**: Custom mock factory with TypeScript interfaces
- **Test Runner**: @vscode/test-cli (runs in Extension Host)

### Type-Safe Mock System

All mocks are strongly typed:

```typescript
// Mock interfaces
export interface MockSDK { ... }        // SDK with 24+ typed methods
export interface MockLogger extends ILogger { ... }
export interface MockSpyFunction { ... } // Spy with call tracking

// Factory functions
export function createMockSDK(): MockSDK;
export function createMockLogger(): ILogger;
export function createMockExtensionContext(): vscode.ExtensionContext;
```

### Writing Tests

```typescript
import { createMockSDK, createMockLogger } from "../utils/mockFactory";
import type { DatalayerClient } from "@datalayer/core/lib/client";

suite("My Feature Tests", () => {
  let mockSDK: ReturnType<typeof createMockSDK>;

  setup(() => {
    mockSDK = createMockSDK();
  });

  test("should work correctly", async () => {
    // Arrange
    mockSDK.iam.getIdentity.mockResolvedValue({ uid: "test" });

    // Act
    const result = await myFunction(mockSDK as unknown as DatalayerClient);

    // Assert
    assert.strictEqual(result, "expected");
    assert.strictEqual(mockSDK.iam.getIdentity.calls.length, 1);
  });
});
```

## Debugging

### Extension Code

1. Open the project in VS Code
2. Run `npm run watch` in terminal
3. Press `F5` to launch Extension Development Host
4. Open any `.ipynb` file to test the extension
5. Set breakpoints in `src/` files

### Webview Code

1. In Extension Development Host, open Command Palette
2. Run "Developer: Open Webview Developer Tools"
3. Use Chrome DevTools for React components
4. Set breakpoints in `webview/` code

### Tests

1. Set breakpoints in test files
2. Open Run and Debug panel (Cmd+Shift+D)
3. Select "Extension Tests" configuration
4. Press F5 to debug tests

## Development Workflow

### Daily Development

1. **Start watch mode**:

   ```bash
   npm run watch
   ```

2. **Press F5** in VS Code to launch Extension Development Host

3. **Make changes** - hot reload for most changes

4. **Test in Extension Host** - open `.ipynb` files

5. **Before committing**:

   ```bash
   npm run check         # Run all validations
   npm test              # Run all tests
   ```

### Build Commands

```bash
# Development build (with source maps)
npm run compile

# Production build (optimized)
npm run package

# Create VSIX package
npm run vsix

# Clean all artifacts
npm run clean  # Removes dist/, out/, *.vsix
```

### Common Tasks

#### Adding a New Command

1. Add command to `package.json` `contributes.commands`
2. Create handler in `src/commands/`
3. Register in `src/commands/index.ts`
4. Add tests in `src/test/commands/`

#### Adding a New Service

1. Create interface in `src/services/interfaces/`
2. Implement in `src/services/core/` or `src/services/notebook/`
3. Add to ServiceContainer if needed
4. Create mock in `src/test/utils/mockFactory.ts`
5. Write tests in `src/test/services/`

#### Adding Documentation

All exported symbols need JSDoc:

````typescript
/**
 * Brief description (required).
 * Additional details (optional).
 *
 * @param param1 Description of parameter
 * @returns Description of return value
 * @throws {ErrorType} When error occurs
 * @example
 * ```typescript
 * const result = myFunction('input');
 * ```
 */
export function myFunction(param1: string): string {
  // ...
}
````

Run `npm run doc` to verify documentation.

## Architecture Overview

The extension follows a layered architecture:

### Core Layers

1. **Extension Host** (`src/extension.ts`)
   - Entry point, activation, command registration
   - Runs in Node.js 20 environment

2. **Commands** (`src/commands/`)
   - Thin command handlers
   - Delegate to services for business logic
   - Commands: auth, documents, runtimes

3. **Providers** (`src/providers/`)
   - Implement VS Code APIs
   - TreeDataProvider, CustomTextEditorProvider, NotebookController
   - Files: spacesTreeProvider, jupyterNotebookProvider, lexicalDocumentProvider

4. **Services** (`src/services/`)
   - Business logic and state management
   - Some services use singleton pattern (see Service Architecture below)
   - Categories:
     - **Core**: authProvider, sdkAdapter, serviceContainer
     - **Notebook**: documentBridge (singleton), kernelBridge, notebookRuntime (singleton), lexicalCollaboration (singleton)
     - **Logging**: loggerManager (singleton), performanceLogger
     - **Cache**: environmentCache (singleton)
     - **UI**: statusBar (singleton), uiSetup

5. **Models** (`src/models/`)
   - Data structures: notebookDocument, lexicalDocument, spaceItem

6. **UI** (`src/ui/`)
   - Dialogs: authDialog, kernelSelector, runtimeSelector
   - Templates: notebookTemplate

7. **Webviews** (`webview/`)
   - React-based editors
   - notebook/ - Jupyter notebook UI
   - lexical/ - Rich text editor
   - Theme integration with VS Code

8. **Utils** (`src/utils/`)
   - Pure utility functions
   - dispose, webviewSecurity, documentUtils

### Service Architecture

Services are managed through dependency injection via `ServiceContainer`. Some services use singleton pattern for global state management:

```typescript
// Singleton services (use getInstance)
LoggerManager.getInstance(context);
EnvironmentCache.getInstance();
DocumentBridge.getInstance(context, sdk);
NotebookRuntimeService.getInstance();
LexicalCollaborationService.getInstance();
DatalayerStatusBar.getInstance(authProvider);

// Regular services (use new constructor)
new SDKAuthProvider(sdk, context, logger);
new KernelBridge(sdk, authProvider);

// Static class with initialization
ServiceLoggers.initialize(loggerManager);
```

#### Auto-Connect Service

The extension provides automatic runtime connection when opening notebooks and lexical documents:

**Location**: `src/services/autoConnect/`

**Strategy Pattern**:

- `AutoConnectService` - Main service that processes strategy array
- `ActiveRuntimeStrategy` - Selects runtime with most time remaining (sorted by expiredAt - now)
- `AskUserStrategy` - Shows Quick Pick dialog for runtime selection

**Configuration**: `datalayer.autoConnect.strategies` (array)

- Default: `["Active Runtime", "Ask"]`
- Empty array `[]` disables auto-connect
- Tries strategies in order until one succeeds

**Integration**:

- `NotebookProvider.tryAutoConnect()` - Called after webview initialization
- `LexicalProvider.tryAutoConnect()` - Called after webview initialization
- Both providers get `RuntimesTreeProvider` via `getRuntimesTreeProvider()` export

**Key Design Decisions**:

- **Smart Selection**: ActiveRuntimeStrategy sorts runtimes by remaining time (expiredAt - now) in descending order, always selecting the runtime with the most time available to maximize session duration
- **No Extra API Calls**: Uses `RuntimesTreeProvider.getCachedRuntimes()` to access already-loaded runtime data from the sidebar

### Logging Infrastructure

Three-tier logging system:

1. **LoggerManager**: Creates and manages output channels
2. **ServiceLoggers**: Static access to categorized loggers
3. **Individual Loggers**: auth, notebook, runtime, general

```typescript
// Access loggers
ServiceLoggers.auth.info('User logged in');
ServiceLoggers.notebook.error('Failed to save', error);
ServiceLoggers.runtime.timeAsync('createRuntime', async () => {...});
```

### Communication Flow

The editor is encapsulated within an iframe. All communications between the editor and external services involve posting messages between the extension and webview:

1. **Jupyter Service Interaction**: The webview creates a JupyterLab `ServiceManager` with mocked `fetch` and `WebSocket`
2. **Message Serialization**: Requests are serialized and posted to the extension
3. **Extension Processing**: The extension deserializes and makes actual network requests
4. **Response Handling**: Responses are serialized and posted back to the webview

## Project Structure

```bash
src/
├── extension.ts                 # Main entry point
├── commands/                    # Command handlers
│   ├── auth.ts                 # Authentication commands
│   ├── documents.ts            # Document operations
│   ├── runtimes.ts             # Runtime management
│   └── index.ts                # Command registration
├── providers/                   # VS Code API implementations
│   ├── documentsFileSystemProvider.ts    # Virtual FS for Datalayer docs
│   ├── jupyterNotebookProvider.ts        # Notebook editor provider
│   ├── lexicalDocumentProvider.ts        # Lexical editor provider
│   ├── smartDynamicControllerManager.ts  # Runtime controller manager
│   └── spacesTreeProvider.ts             # Tree view provider
├── services/                    # Business logic
│   ├── core/                   # Core services
│   │   ├── authProvider.ts    # Authentication state management
│   │   ├── authManager.ts     # Auth operations
│   │   ├── sdkAdapter.ts      # SDK communication layer
│   │   ├── serviceContainer.ts # Dependency injection
│   │   ├── baseService.ts     # Service base class
│   │   └── errorHandler.ts    # Error handling
│   ├── notebook/              # Notebook services
│   │   ├── documentBridge.ts  # Document sync with platform (singleton)
│   │   ├── kernelBridge.ts    # Kernel connection routing
│   │   ├── notebookRuntime.ts # Runtime lifecycle (singleton)
│   │   ├── notebookNetwork.ts # Network communication
│   │   └── lexicalCollaboration.ts # Real-time collaboration (singleton)
│   ├── logging/               # Logging infrastructure
│   │   ├── loggerManager.ts   # Logger factory (singleton)
│   │   ├── loggers.ts         # Static logger access
│   │   ├── performanceLogger.ts # Performance tracking
│   │   └── datalayerClientLogger.ts # SDK logging adapter
│   ├── cache/                 # Caching layer
│   │   └── environmentCache.ts # Environment list cache (singleton)
│   ├── ui/                    # UI management
│   │   ├── statusBar.ts       # Status bar updates (singleton)
│   │   └── uiSetup.ts         # UI initialization
│   └── interfaces/            # Service contracts
│       ├── IAuthProvider.ts
│       ├── IDocumentBridge.ts
│       ├── IKernelBridge.ts
│       ├── ILogger.ts
│       ├── ILoggerManager.ts
│       └── IErrorHandler.ts
├── models/                     # Data models
│   ├── notebookDocument.ts    # Notebook document model
│   ├── lexicalDocument.ts     # Lexical document model
│   └── spaceItem.ts           # Tree item model
├── ui/                        # UI components
│   ├── dialogs/               # Dialog implementations
│   │   ├── authDialog.ts     # Authentication dialog
│   │   ├── kernelSelector.ts # Kernel selection UI
│   │   ├── runtimeSelector.ts # Runtime selection UI
│   │   └── confirmationDialog.ts # Confirmation prompts
│   └── templates/             # HTML templates
│       └── notebookTemplate.ts # Notebook webview HTML
├── kernel/                    # Kernel communication
│   └── clients/
│       └── websocketKernelClient.ts # WebSocket kernel protocol
├── utils/                     # Utility functions
│   ├── dispose.ts            # Disposable pattern utilities
│   ├── webviewSecurity.ts    # CSP nonce generation
│   ├── webviewCollection.ts  # Webview management
│   └── documentUtils.ts      # Document manipulation
├── types/                     # Type definitions
│   ├── errors.ts             # Custom error types
│   └── vscode/
│       └── messages.ts       # Message types for webviews
└── test/                      # Test suites
    ├── extension.test.ts     # Extension tests (1 test)
    ├── services/             # Service tests (21 tests)
    ├── utils-tests/          # Utility tests (19 tests)
    └── utils/                # Test utilities
        ├── mockFactory.ts    # Mock creators & types
        └── testHelpers.ts    # Test helpers

webview/
├── notebook/                  # Jupyter notebook webview
│   ├── main.ts               # Entry point
│   ├── NotebookEditor.tsx    # Main component
│   └── NotebookToolbar.tsx   # Toolbar
├── lexical/                   # Lexical editor webview
│   ├── lexicalWebview.tsx    # Entry point
│   ├── LexicalEditor.tsx     # Editor component
│   └── LexicalToolbar.tsx    # Toolbar
├── theme/                     # VS Code theme integration
│   ├── codemirror/           # CodeMirror themes
│   ├── components/           # Themed components
│   ├── mapping/              # Color mappers
│   └── providers/            # Theme providers
└── services/                  # Webview services
    ├── base/                 # Base manager classes (Template Method pattern)
    │   ├── baseKernelManager.ts   # Base kernel lifecycle manager
    │   ├── baseSessionManager.ts  # Base session lifecycle manager
    │   └── index.ts               # Clean exports
    ├── messageHandler.ts          # Extension communication
    ├── mockServiceManager.ts      # Mock service manager (read-only mode)
    ├── localKernelServiceManager.ts # Local kernel manager (VS Code Python)
    ├── serviceManager.ts          # Remote service manager (Jupyter servers)
    ├── mutableServiceManager.ts   # Dynamic runtime switching
    └── serviceManagerFactory.ts   # Type-safe factory pattern
```

### Architecture Principles

1. **Separation of Concerns**:
   - **Providers** implement VS Code APIs (TreeDataProvider, CustomTextEditorProvider, etc.)
   - **Services** handle business logic and external API communication
   - **Commands** are thin handlers that delegate to services
   - **Utils** are pure utility functions with no side effects

2. **Dependency Injection**: Services are managed through `ServiceContainer` with lazy initialization. Some services (LoggerManager, EnvironmentCache, DocumentBridge, NotebookRuntimeService, LexicalCollaborationService, DatalayerStatusBar) use singleton pattern for global state management

3. **Message Passing**: Extension and webview communicate via structured messages with JWT tokens

4. **Virtual File System**: Datalayer documents are mapped to virtual URIs for seamless VS Code integration

### Unified Kernel Architecture

The extension uses a Template Method pattern for kernel management, eliminating ~174 lines of duplicate code across different kernel types.

#### Base Manager Classes

**BaseKernelManager** (`webview/services/base/baseKernelManager.ts`):
- Abstract base class implementing common `Kernel.IManager` methods
- Template Method pattern: subclasses only implement `startNew()`
- Provides: `shutdown()`, `dispose()`, `running()`, `requestRunning()`, signal management
- Type discriminator: `KernelManagerType = "mock" | "pyodide" | "local" | "remote"`

**BaseSessionManager** (`webview/services/base/baseSessionManager.ts`):
- Abstract base class implementing common `Session.IManager` methods
- Template Method pattern: subclasses only implement `startNew()`
- Provides: session lifecycle, disposal, signals, `requestRunning()`
- Type discriminator: `SessionManagerType = "mock" | "pyodide" | "local" | "remote"`

#### Service Manager Implementations

**MockServiceManager** (`webview/services/mockServiceManager.ts`):
- Extends base classes for read-only notebook viewing
- Throws helpful errors when execution is attempted
- Used when no kernel is selected

**LocalKernelServiceManager** (`webview/services/localKernelServiceManager.ts`):
- Extends base classes for direct ZMQ communication with VS Code Python environments
- Creates `LocalKernelConnection` bypassing HTTP/WebSocket flow
- Detects local kernel URLs: `http://local-kernel-<kernelId>.localhost`

**Remote ServiceManager** (`webview/services/serviceManager.ts`):
- Standard JupyterLab `ServiceManager` for remote Jupyter servers
- Unchanged from JupyterLab implementation

**ServiceManagerFactory** (`webview/services/serviceManagerFactory.ts`):
- Type-safe factory with discriminated unions
- Methods: `create(options)`, `isMock(manager)`, `getType(manager)`
- Includes 'pyodide' type that throws "not yet implemented" for future PR

**MutableServiceManager** (`webview/services/mutableServiceManager.ts`):
- Enables hot-swapping between kernel types without re-rendering `Notebook2`
- Uses Proxy pattern to forward calls to current underlying manager
- Methods: `updateConnection()`, `updateServiceManager()`, `resetToMock()`
- Prevents cell flickering and scroll position loss during runtime switches

#### Benefits

1. **Code Reuse**: ~174 lines eliminated through base classes
2. **Type Safety**: Discriminated unions ensure correct options per manager type
3. **Extensibility**: Adding new kernel types only requires implementing `startNew()`
4. **Debugging**: Runtime type identification via `managerType` property
5. **UX**: Stable references prevent unnecessary React re-renders

## Documentation

### Generate Documentation

The codebase uses TypeDoc for comprehensive API documentation:

```bash
# Generate HTML documentation
npm run doc

# Generate markdown documentation
npm run doc:markdown

# Watch mode for development (rebuilds on file changes)
npm run doc:watch

# Check documentation coverage
npm run doc:coverage
```

### Output Directories

- `docs/` - HTML documentation (TypeDoc default theme)
- `docs-markdown/` - Markdown documentation for integration with other systems

### Online Documentation

**Live Documentation**: [https://datalayer-desktop.netlify.app](https://datalayer-desktop.netlify.app)

The documentation is automatically built and deployed on every push to the main branch using Netlify. It includes:

- **API Reference**: Complete TypeScript API documentation
- **Module Documentation**: Detailed module and namespace documentation
- **Interface Documentation**: All TypeScript interfaces and types
- **Code Examples**: Usage examples and code snippets
- **Coverage Reports**: Documentation coverage metrics

## Tool Schema Generator

### Overview

The extension uses GitHub Copilot's Language Model Tools API to provide programmatic access to notebooks and lexical documents. Tool definitions are written in TypeScript and automatically synced to `package.json`.

### Architecture

**Tool Definitions** (`src/tools/definitions/tools/*.ts`):
- TypeScript interfaces with full type safety
- JSDoc descriptions for AI model understanding
- Parameter schemas with validation

**Schema Generator** (`scripts/generate-tool-schemas.js`):
- Parses TypeScript object literals without eval()
- Extracts name, description, and parameters
- Syncs to `package.json` `contributes.languageModelTools`
- Handles nested objects, arrays, and complex schemas

### Usage

```bash
# Generate schemas from TypeScript definitions
node scripts/generate-tool-schemas.js
# Output: ✅ 12/12 tools parsed successfully

# Validate schemas are in sync
node scripts/validate-tool-schemas.js
# Output: ✅ All expected tools present
```

### Adding a New Tool

1. **Create Tool Definition** (`src/tools/definitions/tools/myTool.ts`):

```typescript
import type { ToolDefinition } from '../schema';

export const myTool: ToolDefinition = {
  name: 'datalayer_myTool',
  displayName: 'My Tool',
  description: 'Description for the AI model',
  parameters: {
    properties: {
      myParam: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['myParam'],
  },
} as const;
```

2. **Export Tool** (`src/tools/definitions/tools/index.ts`):

```typescript
export * from './myTool';
import { myTool } from './myTool';
export const allToolDefinitions = [/* existing */, myTool];
```

3. **Implement Operation** (`src/tools/core/myOperation.ts`):

```typescript
export const myOperation: ToolOperation<MyParams, MyResult> = {
  execute: async (params, context) => {
    // Implementation
  },
};
```

4. **Register Operation** (`src/tools/core/index.ts`):

```typescript
import { myOperation } from './myOperation';
export const allOperations = { /* existing */, myTool: myOperation };
```

5. **Generate Schema**:

```bash
node scripts/generate-tool-schemas.js
```

The schema is automatically added to `package.json` with correct structure.

### Schema Generator Implementation

**Parser Features**:
- Handles TypeScript syntax (as const, single quotes, trailing commas)
- Parses nested objects and arrays
- Extracts string literals with proper escaping
- Type-safe without using eval()
- Preserves complex schemas (array items with properties)

**Example Parsing**:

```typescript
// TypeScript tool definition
export const insertBlocksTool: ToolDefinition = {
  name: 'datalayer_insertBlocks',
  parameters: {
    properties: {
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            blockType: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['blockType', 'source'],
        },
      },
    },
    required: ['blocks'],
  },
} as const;

// Parses to package.json schema (preserving nested structure)
{
  "name": "datalayer_insertBlocks",
  "inputSchema": {
    "type": "object",
    "properties": {
      "blocks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "blockType": { "type": "string" },
            "source": { "type": "string" }
          },
          "required": ["blockType", "source"]
        }
      }
    },
    "required": ["blocks"]
  }
}
```

### Current Tools (13 total)

**Notebook Tools** (8):
- `datalayer_createNotebook` - Create new notebooks
- `datalayer_insertCell` - Insert cells at specific positions
- `datalayer_executeCell` - Execute cells and get outputs
- `datalayer_readCell` - Read cell content
- `datalayer_updateCell` - Update cell source
- `datalayer_deleteCell` - Delete cells
- `datalayer_getActiveDocument` - Get active document info

**Lexical Tools** (5):
- `datalayer_insertBlock` - Insert single block
- `datalayer_insertBlocks` - **Batch insert multiple blocks** (NEW)
- `datalayer_readBlocks` - Read blocks with formatting
- `datalayer_deleteBlock` - Delete blocks
- `datalayer_listAvailableBlocks` - List supported block types

### insertBlocks Feature (November 2025)

**Purpose**: Allows Copilot to create complex documents with a single API call instead of many sequential `insertBlock` calls.

**Benefits**:
- **Performance**: One message instead of N messages for N blocks
- **Atomicity**: All blocks inserted or none (stops on first error)
- **Simplicity**: Cleaner code for AI model

**Implementation Layers** (8 layers):
1. **Tool Definition** - `src/tools/definitions/tools/insertBlocks.ts`
2. **Operation** - `src/tools/core/lexical/insertBlocks.ts`
3. **Adapter** - `src/tools/adapters/vscode/VSCodeLexicalHandle.ts`
4. **Internal Command** - `src/commands/internal.ts` (datalayer.internal.lexical.insertBlocks)
5. **Message Handler** - `webview/lexical/plugins/InternalCommandsPlugin.tsx`
6. **Controller** - `webview/utils/LexicalDocumentController.ts` (insertBlocks method)
7. **Schema** - Auto-generated in `package.json`
8. **Registration** - `src/tools/definitions/tools/index.ts`, `src/tools/core/index.ts`

**Usage Example** (AI model prompt):

```typescript
// Single call to create multi-section document
await insertBlocks({
  insert_after_block_id: 'TOP',
  blocks: [
    { blockType: 'heading', source: '# Introduction' },
    { blockType: 'paragraph', source: 'Overview text...' },
    { blockType: 'heading', source: '## Section 1' },
    { blockType: 'code', source: 'console.log("example");' },
  ]
});
```

**Error Handling**:
- Validates each block has required fields (blockType, source)
- Stops on first failure with descriptive error
- Returns success with last inserted block ID for chaining

## Configuration

The extension provides comprehensive configuration in VS Code settings (`Cmd+,` → "Datalayer"):

### Service URLs

- `datalayer.services.iamUrl` - IAM service (default: https://prod1.datalayer.run)
- `datalayer.services.runtimesUrl` - Runtimes service (default: https://prod1.datalayer.run)
- `datalayer.services.spacerUrl` - Spacer service (default: https://prod1.datalayer.run)
- `datalayer.services.spacerWsUrl` - WebSocket URL (default: wss://prod1.datalayer.run)

### Runtime Settings

- `datalayer.runtime.defaultMinutes` - Default duration (default: 10, min: 1, max: 1440)

### Logging Settings

- `datalayer.logging.level` - Log level (default: info)
- `datalayer.logging.includeTimestamps` - Timestamps in logs (default: true)
- `datalayer.logging.includeContext` - Context in logs (default: true)
- `datalayer.logging.enableSDKLogging` - SDK logging (default: true)
- `datalayer.logging.enablePerformanceMonitoring` - Performance tracking (default: false)

**Note:** Runtime environments are fetched dynamically from API and cached using `EnvironmentCache` singleton. Credits calculated automatically based on duration and environment burning rate.

## Known Technical Limitations

- **WebSocket Binary Support**: Uses older Jupyter protocol due to serialization issues between webview and extension (cannot use v1.kernel.websocket.jupyter.org)
- **Smart Controller**: `SmartDynamicControllerManager` is intentionally disabled (null) in `uiSetup.ts:85` while native controller integration is improved
- **Runtime Tree View Refresh**: Requires 500ms delay after runtime termination to allow server-side processing before refresh
- **Snapshot Creation**: UI implemented in Runtimes tree view but backend implementation is pending

## Development Best Practices

- Always check TypeScript compilation with `npx tsc --noEmit` before committing
- Run linting with `npm run lint` to ensure code quality
- Include comprehensive JSDoc documentation for all exported functions
- Test extension functionality in the Extension Development Host before submitting PRs
- Follow existing code patterns and architectural decisions
- Use `unknown` instead of `any` for type-safe code
- All test mocks must use proper TypeScript interfaces

## Code Quality Standards

The project maintains strict code quality through:

- **TypeScript**: Strong typing and compile-time checks
- **ESLint**: Code linting and style enforcement
- **Prettier**: Automated code formatting
- **TypeDoc**: Documentation generation and coverage
- **Type Safety**: No `any` types (use `unknown` with proper type guards)
- **Test Quality**: 100% test pass rate with strongly-typed mocks

All code should include proper JSDoc comments for TypeScript interfaces, classes, and exported functions.

## Resources

### Project Documentation

- **Development Guide**: This document
- **Testing Guide**: [TESTING.md](./TESTING.md)
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Release Process**: [RELEASE.md](./RELEASE.md)
- **API Documentation**: [https://datalayer-desktop.netlify.app](https://datalayer-desktop.netlify.app)

### External Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [TypeDoc Documentation](https://typedoc.org/)
