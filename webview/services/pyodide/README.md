# webview/services/pyodide/ - Pyodide Worker Scripts

Web Worker scripts and Python kernel code for running Pyodide (WebAssembly Python) inside the webview.

## Files

- **pyodideWorker.worker.js** - Web Worker script that loads and runs Pyodide. Executes Python code in a separate thread to avoid blocking the UI. Communicates results back to the main thread via postMessage.
- **pyodide_kernel.py** - Python kernel implementation running inside Pyodide. Provides Jupyter-compatible execution semantics (input/output capture, display hooks) within the WebAssembly Python runtime.
