# src/tools/utils/ - Tool Utilities

Shared utility functions used across tool operations.

## Files

- **createDocument.ts** - Unified smart document creation that detects intent for location (local/cloud) based on keywords, context, and environment signals.
- **createNotebookHelpers.ts** - Helper functions for creating cloud and local Jupyter notebooks with Datalayer integration and optional initial cells.
- **createLexicalHelpers.ts** - Helper functions for creating cloud and local Lexical documents with Datalayer integration.
- **notebookHelpers.ts** - Notebook-specific utility functions used by the unified createDocument operation.
- **ipykernelDetection.ts** - Fast ipykernel detection using filesystem checks (conda-meta or site-packages) instead of slow subprocess calls.
- **pythonExtensionActivation.ts** - Ensures the Python extension is activated before kernel discovery with timeout handling.
- **registry.ts** - ToolRegistry interface for central registration and lookup of tool definitions with filtering by operation and tag.
- **runtimeExecutor.ts** - Helpers for executing code directly on Datalayer cloud runtimes using Jupyter kernel protocol over WebSockets.
