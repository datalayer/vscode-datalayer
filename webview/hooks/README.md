# webview/hooks/ - React Hooks

Custom React hooks providing reusable state management and side effects for webview editors.

## Files

- **useRuntimeManager.ts** - Manages the complete runtime selection and ServiceManager lifecycle. Returns `{ selectedRuntime, serviceManager, selectRuntime, mutableServiceManager }`.

  **Initialization**: Creates `MutableServiceManager` in `useRef` (never recreated). If `initialRuntime` provided, auto-detects type and initializes:
  - Local kernels: extracts kernel ID from URL, calls `updateToLocal()`, then **calls `startNew()`** (required to create `_activeKernel` for tool execution)
  - Remote runtimes: calls `updateToRemote()`, does NOT call `startNew()` (kernel already running server-side, and CORS blocks cross-origin requests from webview)
  - Pyodide: calls `updateToPyodide()`

  **Type detection**: Pyodide check (`ingress === "http://pyodide-local"`), local kernel check (`isLocalKernelUrl()`), everything else is remote.

  **Cleanup**: When `selectRuntime(undefined)` called, uses `forceClose=true` for remote runtimes (avoids CORS errors from dead servers), normal dispose for local/Pyodide.

  **Why stable reference matters**: `serviceManagerProxy` created once via `createProxy()` and cached in `useRef`. Notebook2 component only re-renders if this reference changes (it doesn't). Prevents cell flickering, scroll position loss, and widget state reset when switching runtimes.

- **useNotebookModel.ts** - Manages notebook model state and change tracking. Connects to JupyterLab signals for content change notifications on local notebooks. Tracks dirty state and sends model updates to the extension host. Uses `useRef` for signal connections to avoid stale closures.

- **useNotebookOutline.ts** - Extracts live notebook outline by scanning all cells for markdown headings (parsed from source) and code cells. Builds hierarchical tree structure based on heading levels. Sends outline data to the extension via postMessage for display in the outline tree view. Debounced to avoid excessive updates during rapid editing.

- **useNotebookResize.ts** - Sets up `ResizeObserver` on the notebook container DOM element. Triggers Lumino widget `update()` and `fit()` calls when the container resizes, preventing layout issues where JupyterLab widgets don't know their container changed size (common in VS Code split editors).

- **useLexicalOutline.ts** - Extracts and sends outline data from the Lexical editor. Monitors heading nodes and code block nodes. Debounces outline updates with a 300ms delay to avoid sending too many messages during rapid typing.
