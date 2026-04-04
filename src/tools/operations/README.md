# src/tools/operations/ - Tool Operation Implementations

Business logic implementations for VS Code-specific tool operations. Package-level operations (cell manipulation, block operations) live in their respective packages.

## Files

- **getActiveDocument.ts** - Detects the active custom editor (notebook or lexical) and returns its URI, filename, and type.
- **createNotebook.ts** - Thin wrapper delegating to the unified createDocumentOperation with `documentType: 'notebook'`.
- **createLexical.ts** - Thin wrapper delegating to the unified createDocumentOperation with `documentType: 'lexical'`.
- **executeCode.ts** - Routes code execution to the correct document type's kernel or falls back to active Datalayer runtime if no document is open.
- **listKernels.ts** - Lists available kernels including Pyodide, local Jupyter kernels, and cloud Datalayer runtimes with filtering support.
- **selectKernel.ts** - Connects a kernel to the active document, supporting natural language aliases and automatic runtime creation.
- **manageRuntime.ts** - Defines runtime information structures and result types for runtime creation and connection.
