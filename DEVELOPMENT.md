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
import type { DatalayerClient } from "../../../../core/lib/client";

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

```
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
    ├── messageHandler.ts     # Extension communication
    ├── mockServiceManager.ts # Development mock
    └── serviceManager.ts     # Service management
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

## Configuration

Extension settings can be configured in VS Code:

- `datalayer.serverUrl` - Datalayer server URL (default: https://prod1.datalayer.run)
- `datalayer.runtime.environment` - Default runtime environment for notebooks (`python-cpu-env` or `ai-env`, default: `python-cpu-env`)
- `datalayer.runtime.creditsLimit` - Default credits limit for new runtimes (minimum: 1, default: 10)

## Known Technical Limitations

- **Websocket binary support**: The extension currently forbids the usage of the newer protocol v1.kernel.websocket.jupyter.org due to serialization issues between the webview and extension.

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

### Documentation

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
