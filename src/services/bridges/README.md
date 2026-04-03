# src/services/bridges/ - Communication Bridges

Bridge services connecting different parts of the system: extension host, webview, and Datalayer platform. These handle the message translation and routing between contexts.

## Files

- **kernelBridge.ts** - Routes kernel connections to the appropriate handler based on kernel type (`KernelBridge` class). Maintains internal maps:
  - `_webviews`: uri string -> WebviewPanel (registered webviews)
  - `_localKernels`: kernelId -> LocalKernelClient (spawned ZMQ kernels)
  - `_documentKernels`: documentUri -> kernelId (document-to-kernel mapping)
  - `_pendingPyodideRuntimes`: documentUri -> runtime (for kernel-ready handler)

  Key methods: `connectWebviewDocument()` (remote), `connectWebviewDocumentToLocalKernel()` (spawns ZMQ client), `connectWebviewDocumentToPyodide()` (pseudo-runtime with `ingress="http://pyodide-local"`), `broadcastKernelSelected()` (all webviews).

  Message flow: kernel-starting (shows spinner) -> kernel-selected (webview creates ServiceManager) -> kernel-ready (Pyodide ready callback).

- **documentBridge.ts** - Manages document lifecycle between Datalayer platform and VS Code. Downloads remote documents, caches them locally, and manages runtime association. Handles the extension initialization synchronization (waits for services before processing documents).

- **networkBridge.ts** - Bridges network communication between webviews and the extension host. Encapsulates all HTTP request forwarding and WebSocket connection management. Intercepts `local-kernel-*` URLs and routes them to LocalKernelClient instead of making network calls.

- **runtimeBridge.ts** - Manages runtime and kernel lifecycle operations across document providers. Handles runtime selection (showing picker), termination (with confirmation), and expiration monitoring. Shared by both NotebookProvider and LexicalProvider.

- **lspBridge.ts** - Bridges LSP-related messages between the webview and extension host. Routes completion requests to Pylance (Python) or Markdown language server based on cell language. Routes hover requests similarly. Translates between webview message format and VS Code's LSP client format.
