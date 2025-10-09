# Pyodide Integration - Offline Python Execution

**Status**: Phase 1 Complete (January 2025)
**Goal**: Enable browser-based Python execution without server/local Python installation

## Overview

Pyodide is Python compiled to WebAssembly, allowing Python code to run entirely in the browser. This integration enables:

- **Offline execution**: No internet connection required after initial load
- **Zero setup**: No Python installation needed
- **Cross-platform**: Works on Windows, macOS, Linux (any platform with VS Code)
- **Sandboxed**: Runs in browser security sandbox

## Implementation Phases

### Phase 1: Webview Integration ✅ COMPLETE

**Files Modified**:
1. `webview/services/mutableServiceManager.ts`
2. `webview/types/messages.ts`
3. `webview/hooks/useRuntimeManager.ts`
4. `webview/notebook/NotebookEditor.tsx`
5. `webview/lexical/LexicalWebview.tsx`
6. `src/services/bridges/kernelBridge.ts`

**What Works**:
- Custom editor notebooks (.ipynb) can switch to Pyodide kernel
- Lexical documents (.lexical) with embedded code cells can use Pyodide
- Zero re-renders when switching between kernels
- No new dependencies (uses `@datalayer/jupyter-react@1.1.7`)

### Phase 2: Native Notebook Integration ⏳ TODO

**Goal**: Support Pyodide in VS Code's native notebook editor

**Files to Create**:
- `src/kernel/providers/pyodide/PyodideExecutor.ts`
- `src/kernel/providers/pyodide/types.ts`

**Files to Modify**:
- `src/providers/smartDynamicControllerManager.ts`

**What Will Work**:
- Native VS Code notebooks (.ipynb opened with default handler) can use Pyodide
- Pyodide controller appears in kernel picker alongside Datalayer runtimes

### Phase 3: Kernel Picker UI ⏳ TODO

**Goal**: Add Pyodide option to kernel selection UI

**Files to Modify**:
- `src/ui/dialogs/kernelSelector.ts`

**What Will Work**:
- "Pyodide (Offline Python)" appears in kernel picker
- User can select Pyodide from unified kernel selection dialog

### Phase 4: Configuration & Polish ⏳ TODO

**Goal**: Add settings and documentation

**Files to Modify**:
- `package.json` - Add configuration settings
- `README.md` - Document Pyodide feature

**What Will Work**:
- User can configure Pyodide settings in VS Code preferences

## Architecture

### MutableServiceManager Pattern

The key to zero-rerender kernel switching:

```typescript
class MutableServiceManager {
  private _serviceManager: ServiceManager;

  // Three kernel types supported
  async updateToPyodide() {
    this._serviceManager = await createLiteServiceManager(); // Pyodide
  }

  updateConnection(url: string, token: string) {
    this._serviceManager = new ServiceManager({ /* remote */}); // Jupyter server
  }

  resetToMock() {
    this._serviceManager = createMockServiceManager(); // No execution
  }

  // Proxy keeps reference stable
  createProxy() {
    return new Proxy({}, {
      get: (_, prop) => this._serviceManager[prop]
    });
  }
}
```

### Message Protocol

Extension ↔ Webview communication:

```typescript
// Extension sends to webview
{
  type: "kernel-selected",
  body: {
    kernelType: "pyodide"  // or "remote"
    runtime?: RuntimeJSON  // Only for remote kernels
  }
}

// Webview handles message
if (body?.kernelType === "pyodide") {
  await selectPyodideRuntime();
} else if (body?.runtime) {
  selectRuntime(body.runtime);
}
```

### Flow Diagram

```
User Selects Pyodide
        ↓
Extension: kernelBridge.connectWebviewWithPyodide(uri)
        ↓
Message Posted: { type: "kernel-selected", body: { kernelType: "pyodide" } }
        ↓
Webview Receives Message
        ↓
useRuntimeManager.selectPyodideRuntime()
        ↓
mutableServiceManager.updateToPyodide()
        ↓
createLiteServiceManager() from @datalayer/jupyter-react
        ↓
Pyodide ServiceManager Created
        ↓
Notebook2 Component Continues (NO re-render!)
        ↓
User Can Execute Python Code Offline
```

## Technical Details

### Dependencies

**Zero New Dependencies!**

Uses existing `@datalayer/jupyter-react@1.1.7`:
```typescript
import { createLiteServiceManager } from "@datalayer/jupyter-react";
```

This package already includes:
- `@jupyterlite/pyolite-kernel-extension`
- `@jupyterlite/server`
- All Pyodide dependencies

### createLiteServiceManager

From `@datalayer/jupyter-react`:

```typescript
export async function createLiteServiceManager(): Promise<ServiceManager.IManager> {
  // Initialize JupyterLite server
  const liteServer = new JupyterLiteServer();
  await liteServer.ready;

  // Create service manager pointing to in-browser server
  const serviceManager = new ServiceManager({
    serverSettings: liteServer.settings,
  });

  await serviceManager.ready;
  return serviceManager;
}
```

### Pyodide Kernel Lifecycle

1. **Initialization**: First cell execution loads Pyodide (~30MB download, cached)
2. **Package Loading**: `micropip.install()` downloads packages as needed
3. **Execution**: Python code runs in WebAssembly
4. **Output**: Results streamed back via Jupyter protocol

### Limitations

**What Works**:
- Pure Python code
- NumPy, Pandas, Matplotlib (via Pyodide packages)
- Standard library modules
- File I/O (virtual filesystem)

**What Doesn't Work**:
- C extensions not compiled for WebAssembly
- Some native packages (depends on Pyodide support)
- Large datasets (browser memory limits)
- Network access (CORS restrictions)

## Testing

### Manual Testing (Phase 1)

1. Open custom editor notebook or lexical document
2. Open browser DevTools (Developer: Open Webview Developer Tools)
3. In extension console, run:
   ```javascript
   // This would normally come from kernel picker UI
   kernelBridge.connectWebviewWithPyodide(documentUri);
   ```
4. Check browser console for:
   ```
   [MutableServiceManager] Switching to Pyodide service manager
   [MutableServiceManager] Switched to Pyodide kernel successfully
   ```
5. Execute Python cell - should run in browser

### Automated Testing (TODO - Phase 2+)

Will add tests for:
- MutableServiceManager.updateToPyodide()
- Kernel message routing
- PyodideExecutor lifecycle

## Performance

**Initial Load** (~30MB, one-time):
- Pyodide runtime: ~10MB
- Standard library: ~15MB
- NumPy: ~5MB
- Total: Cached in browser after first load

**Execution**:
- Simple code: Near-instant
- NumPy operations: 2-5x slower than native
- Pandas operations: 3-10x slower than native

Still very usable for learning, prototyping, demos!

## Future Enhancements

**Planned**:
- Pre-warm Pyodide on extension activation (faster first run)
- Package caching strategies
- Progress indicator during Pyodide load
- Custom package CDN configuration

**Possible**:
- WebAssembly SIMD optimization
- Multi-threading with SharedArrayBuffer
- IndexedDB for large datasets

## References

- [Pyodide Documentation](https://pyodide.org/)
- [JupyterLite Documentation](https://jupyterlite.readthedocs.io/)
- [@datalayer/jupyter-react Source](https://github.com/datalayer/jupyter-ui/tree/main/packages/react)
- [Implementation Plan](../../VSCODE_EXTENSION_PYODIDE_PLAN.md)

---

*Last Updated: January 2025 - Phase 1 Complete*
