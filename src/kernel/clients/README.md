# src/kernel/clients/ - Kernel Client Implementations

Concrete kernel client implementations for different execution backends.

## Files

- **websocketKernelClient.ts** - WebSocket-based Jupyter kernel client for native notebook execution. Implements the Jupyter messaging protocol over WebSocket, handling execute requests and streaming outputs from remote kernels.
- **pyodideKernelClient.ts** - Pyodide kernel client for native VS Code notebooks using WebAssembly-based Python runtime. Uses the bundled Pyodide npm package for offline execution with a sequential execution queue matching Jupyter semantics.
