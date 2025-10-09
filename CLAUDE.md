# Datalayer VS Code Extension - AI Assistant Context

**Last Updated**: January 2025
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

### Pyodide Phase 1 Complete (January 2025)

**What**: Browser-based Python execution (offline, zero setup)
**Status**: Webview integration complete

**Key Changes**:

- `MutableServiceManager`: Added `updateToPyodide()`, `isPyodide()`, `getType()`
- Message protocol: `KernelSelectedMessage` supports `kernelType: "pyodide" | "remote"`
- `useRuntimeManager`: Added `selectPyodideRuntime()` function
- `KernelBridge`: Added `connectWebviewWithPyodide()` method

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
npm run format      # Prettier
npm run lint        # ESLint (0 warnings required)
npm run type-check  # TypeScript (0 errors required)
npm run docs        # TypeDoc (100% coverage required)
npm test            # All 41 tests must pass
```

### Development

```bash
npm run watch       # Start watch mode
# Press F5 to launch Extension Development Host
npm run compile     # Build extension
npm run vsix        # Create .vsix package
```

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

- Smart Controller disabled
- WebSocket uses older Jupyter protocol
- Cloud documents read-only

---

_Keep this file under 300 lines. Archive older changes to `dev/docs/HISTORICAL_CHANGES.md`_
