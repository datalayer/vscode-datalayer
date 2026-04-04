# src/types/ - TypeScript Type Definitions

Type definitions, declaration files, and custom error classes.

## Files

- **errors.ts** - Custom error classes including base `DatalayerError` and specialized errors like `AuthenticationError` with code, cause, and context tracking.
- **pyodide.d.ts** - Module type declarations for Pyodide (browser-based Python runtime) including `PyodideInterface` methods like `runPythonAsync`, `loadPackage`, and utilities.
- **jupyter.api.d.ts** - Type definitions for VS Code Jupyter Extension API including Jupyter, Kernels, KernelStatus, and Output interfaces.

## Subdirectories

- **vscode/** - VS Code-specific type definitions
