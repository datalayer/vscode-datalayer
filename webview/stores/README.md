# webview/stores/ - Zustand State Stores

Centralized state management using Zustand, eliminating props drilling across the webview component tree. Each webview creates its own isolated store instance.

## Files

- **notebookStore.ts** - State management for notebook webview. Created via factory function `createNotebookStore()` (not a global singleton - each webview gets isolated state). Store shape:
  - **Document state**: `nbformat`, `isDatalayerNotebook`, `documentId`, `documentUri`, `notebookId`, `isInitialized`
  - **Runtime state**: `selectedRuntime` (RuntimeJSON with optional `creditsUsed`/`creditsLimit`), `serverUrl`, `token`
  - **Theme state**: `theme` ('light' | 'dark')
  - **Actions**: `setNbformat()`, `setRuntime()`, `setTheme()`, `reset()`, etc. (all synchronous via Zustand's `set()`)
  - Initial `notebookId` is `"local-notebook"`, initial `documentUri` is `""` (set from init message)
  - No computed properties - derived state calculated in components via Zustand selectors

- **lexicalStore.ts** - State management for lexical webview. Mirrors the notebookStore pattern for consistency. Manages document state (URI, content, collaboration info), runtime state (connected runtime), and theme state. Also created via factory function for isolation.
