# webview/services/ - Webview Service Layer

Service managers, message handling, and kernel connection implementations running inside the webview context. These wrap JupyterLab's service interfaces to work within VS Code's webview sandbox where direct network access is restricted.

## Files

- **mutableServiceManager.ts** - Stable wrapper (`MutableServiceManager` class) allowing the underlying ServiceManager to be swapped without causing React re-renders. Key mechanism:
  - `createProxy()` returns a JavaScript Proxy that intercepts all property access and forwards to the **current** internal service manager
  - Creates nested sub-proxies for object properties (kernels, sessions, contents) that always forward to current manager, not cached references
  - Sub-proxies are cached but **intentionally never cleared** on swap to maintain SessionContext reference identity
  - Methods: `updateToMock()`, `updateToLocal(kernelId, name, url)`, `updateToRemote(url, token)`, `updateToPyodide(url?)`
  - `forceClose` mode skips `dispose()` for terminated remote runtimes to avoid CORS errors from dead servers
  - Pyodide cleanup calls `shutdownAll()` on sessions specifically since they run in-browser
  - Disables kernel auto-reconnect (`_reconnectLimit = -1`) on all connections

- **serviceManager.ts** - JupyterLab ServiceManager proxy for remote kernels. Creates a fake ServiceManager that proxies HTTP/WebSocket requests through postMessage to the extension host, which forwards them to the Jupyter server. This is necessary because webviews cannot make direct cross-origin HTTP requests.

- **mockServiceManager.ts** - Mock ServiceManager for read-only notebook viewing before a kernel is connected. Extends `BaseKernelManager` and `BaseSessionManager`. All execution methods throw helpful error messages guiding users to connect a kernel first.

- **localKernelServiceManager.ts** - ServiceManager for local ZMQ kernels. Extends `BaseKernelManager` and `BaseSessionManager`. Returns `LocalKernelConnection` in `startNew()` for direct ZMQ communication through the extension host instead of going through a Jupyter server. Eliminated ~142 lines of duplicate code by using base classes.

- **localKernelConnection.ts** - Custom `KernelConnection` bypassing standard Jupyter server session flow. Communicates directly with LocalKernelClient in the extension host via postMessage for ZMQ kernel operations.

- **pyodideServiceManager.ts** - Minimal ServiceManager for Pyodide making zero HTTP requests. Uses `MinimalKernelManager` extending `BaseKernelManager` for WebAssembly-based Python execution entirely within the browser.

- **pyodideInlineKernel.ts** - Pyodide kernel using inline Web Worker via Blob URL to bypass webview Content Security Policy restrictions. Loads Pyodide from bundled resources in the extension's dist directory rather than from CDN.

- **serviceManagerFactory.ts** - Centralized factory (`ServiceManagerFactory` class) with discriminated union options:
  - `{ type: 'mock' }` -> `createMockServiceManager()`
  - `{ type: 'local', kernelId, kernelName, url }` -> `createLocalKernelServiceManager()`
  - `{ type: 'remote', url, token }` -> `new ServiceManager({ serverSettings })`
  - `{ type: 'pyodide', pyodideUrl? }` -> `createPyodideServiceManager()`
  - Type guards: `isMock()`, `getType()` for runtime type identification

- **messageHandler.ts** - Type-safe message handler (`MessageHandler` class, singleton). Provides:
  - `send<T>(message)` - Fire and forget
  - `request<TReq, TRes>(message, timeout?)` - Async/await with 30-second default timeout. Generates requestId, stores promise resolver in `_pendingRequests` Map, resolves when response with matching requestId arrives
  - `on(handler)` / `onMessage(handler)` - Register message listeners, returns Disposable for cleanup
  - Timeout does NOT cancel server-side processing, just stops waiting

- **lexicalCommands.ts** - Event emitter for Lexical formatting commands. Allows the extension toolbar to trigger format commands (bold, italic, heading changes, etc.) in the webview editor via event dispatch.

- **runnerSetup.ts** - WebviewRunner for MCP tool execution in webview context. Maps operation names to their implementations and executes them directly within the webview (no bridging needed since we're already in the webview).

## Subdirectories

- **base/** - Abstract base classes for kernel/session managers (Template Method pattern, ~200+ lines of dedup)
- **completion/** - Inline completion providers (LLM ghost text, LSP completions, Tab completions)
- **loro/** - Loro CRDT collaboration adapters (WebSocket via postMessage, awareness/presence)
- **pyodide/** - Pyodide Web Worker scripts and Python kernel implementation
