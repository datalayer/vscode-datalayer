# src/services/kernel/ - Local Kernel Management

Direct kernel communication using ZMQ for local Python kernel execution, bypassing Jupyter server entirely.

## Files

- **localKernelClient.ts** - Local kernel client (`LocalKernelClient` class) that spawns `python -m ipykernel_launcher -f <connectionFile>` as a child process and communicates via 5 ZMQ channels (shell, iopub, stdin, control, heartbeat). Key details:
  - Creates connection file in temp directory (`/tmp/datalayer-kernel-{uuid}/kernel.json`) with IP (127.0.0.1), 5 ports (all port 0 = OS picks available), HMAC-SHA256 key, and transport (tcp)
  - Working directory: parent directory for file URIs, first workspace folder for `datalayer://` URIs
  - `start()` spawns process and creates ZMQ connection via @jupyterlab/services RawKernel
  - `executeCode(code)` sends execute request, waits for completion
  - `interrupt()` sends SIGINT to kernel process
  - `restart()` kills process, cleans connection file, starts fresh
  - `dispose()` kills process, removes temp directory
  - Process stdout/stderr logged to console for debugging

- **nativeKernelIntegration.ts** - Provides access to VS Code's standard kernel selection dialogs via the Python and Jupyter extension APIs. Uses `vscode.extensions.getExtension()` to access the Python extension's environment picker and the Jupyter extension's kernel selector. Falls back gracefully if extensions are not installed.

- **rawSocket.ts** - Raw ZMQ socket wrapper (`RawSocket` class) creating a WebSocket-like interface over ZMQ channels. Used by `localKernelProxy.ts` in the network layer to simulate WebSocket connections for the webview. Translates between the webview's WebSocket message format and ZMQ's multi-part message format with HMAC-SHA256 signing.
