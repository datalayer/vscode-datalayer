# src/services/ - Core Business Logic

All services organized by domain. Services contain the core business logic of the extension, separated from VS Code API concerns in providers/.

## Subdirectories

- **core/** - Core infrastructure: authentication, Datalayer adapter, service container, error handling
- **autoConnect/** - Automatic notebook-to-runtime connection using strategy pattern
- **bridges/** - Communication bridges between extension, webview, and platform
- **cache/** - Caching layer for runtime environments
- **collaboration/** - Real-time collaborative editing (Y.js, Loro CRDT)
- **copilot/** - Copilot context provider for file-based editor context
- **documents/** - Document registry for ID-URI mapping
- **interfaces/** - TypeScript interfaces for service contracts
- **kernel/** - Local kernel management (ZMQ, Python extension integration)
- **logging/** - Hierarchical logging with VS Code LogOutputChannel
- **lsp/** - Language Server Protocol integration for notebook cells
- **messaging/** - Centralized message routing for document providers
- **network/** - Network proxying (HTTP, WebSocket, local kernel)
- **pyodide/** - Pyodide package preloading and cache management
- **ui/** - UI initialization (status bar, tree views)
