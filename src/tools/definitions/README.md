# src/tools/definitions/ - Tool Definitions

Tool definition objects containing name, description, and parameter schemas for each MCP tool. These are the source of truth synced to package.json by `scripts/sync-package-json.ts`.

## Files

- **index.ts** - Central export with `getAllToolDefinitionsAsync()` that loads tools from packages while avoiding React imports at module load time.
- **getActiveDocument.ts** - Tool to return the currently active document's URI and filename.
- **createNotebook.ts** - Tool to create Jupyter notebooks with smart local/cloud location detection.
- **createLexical.ts** - Tool to create Lexical documents with smart local/cloud location detection.
- **executeCode.ts** - Unified tool that auto-detects document type and routes code execution to the appropriate kernel.
- **listKernels.ts** - Tool to list available kernels (local Jupyter, cloud Datalayer, Pyodide) with optional filtering.
- **selectKernel.ts** - Tool to connect a kernel to the active document, supporting natural language aliases like 'pyodide', 'new', 'active', 'local'.
- **manageRuntime.ts** - Tools for starting cloud compute runtimes and connecting existing runtimes to notebooks.
