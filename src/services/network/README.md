# src/services/network/ - Network Proxying

Low-level network primitives for proxying HTTP, WebSocket, and local kernel connections.

## Files

- **networkProxy.ts** - Network proxy service handling WebSocket and HTTP request forwarding between webview and Jupyter servers.
- **localKernelProxy.ts** - Proxy for local ZMQ kernels that simulates WebSocket connections by translating webview messages to @jupyterlab/services kernel methods.
