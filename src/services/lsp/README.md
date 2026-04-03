# src/services/lsp/ - Language Server Protocol Integration

LSP integration for notebook cells, providing completions and hover information from language servers like Pylance.

## Files

- **lspCompletionService.ts** - Routes LSP completion requests to appropriate language servers (Pylance for Python, Markdown for markdown) based on cell language.
- **lspDocumentManager.ts** - Manages virtual TextDocuments for notebook cells using `vscode-notebook-cell://` URIs so language servers can analyze without temp files.
- **lspTextDocumentProvider.ts** - TextDocumentContentProvider for `datalayer-lsp://` URI scheme that provides content for virtual documents created by LSPDocumentManager.
- **types.ts** - Type definitions for LSP integration with Datalayer notebooks including request/response interfaces.
