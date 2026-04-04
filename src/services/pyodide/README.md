# src/services/pyodide/ - Pyodide Management

Pyodide (WebAssembly Python) package preloading and cache management for both native and webview notebooks.

## Files

- **pyodidePreloader.ts** - Preloads Pyodide packages on extension startup by downloading them in background so they're ready when user selects Pyodide kernel. Handles both native (filesystem cache) and webview (CDN) notebooks.
- **nativeNotebookPreloader.ts** - Downloads Python packages on extension activation for native VS Code notebook Pyodide so they're cached when user runs cells.
- **pyodideCacheManager.ts** - Manages local filesystem cache for Pyodide by downloading core files and packages to global storage.
