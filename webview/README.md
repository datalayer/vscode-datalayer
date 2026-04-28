# webview/ - React-Based Webview UI

React 18 application running inside VS Code webview panels. This code executes in a browser-like sandbox, NOT in the Node.js extension host. Communication with the extension happens exclusively via `postMessage`.

## Architecture

The webview hosts two main editors:

- **Jupyter Notebook Editor** (`notebook/`) - For `.ipynb` files using JupyterLab widgets
- **Lexical Rich Text Editor** (`lexical/`) - For `.dlex` files using Meta's Lexical framework

Both editors share common infrastructure: theme integration, service managers, state stores, and toolbar components.

## Key Patterns

- **MutableServiceManager**: Wraps JupyterLab's ServiceManager to allow runtime hot-swapping without React re-renders
- **Zustand Stores**: Centralized state management eliminating props drilling
- **postMessage Protocol**: Type-safe message passing between webview and extension (see `types/messages.ts`)
- **BaseKernelManager / BaseSessionManager**: Template Method pattern base classes eliminating duplicate code across mock/local/remote/pyodide implementations

## Subdirectories

- **agentChat/** - Datalayer Agent Chat sidebar webview with theme + auth state wiring, a typed bridge client and a raw network bridge for extension-host communication, and the integrated `<Chat>` UI from `@datalayer/agent-runtimes`.
- **components/** - Shared React components (toolbar, progress bar, dialogs)
- **contexts/** - React context providers (theme)
- **datasource/** - Datasource creation/edit dialog webviews
- **hooks/** - React hooks for runtime management, notebook model, outline, resize
- **lexical/** - Lexical editor and its plugins
- **notebook/** - Jupyter notebook editor
- **services/** - Service managers, message handling, kernel connections
- **showcase/** - Primer theme showcase for development
- **stores/** - Zustand state stores
- **styles/** - CSS files for VS Code theme integration
- **theme/** - VS Code-to-Primer theme mapping
- **types/** - Message protocol type definitions
- **utils/** - Webview utility functions
