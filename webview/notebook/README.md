# webview/notebook/ - Jupyter Notebook Editor

Jupyter notebook editor using JupyterLab widgets (Lumino) rendered inside a VS Code webview. Supports local files and collaborative Datalayer platform notebooks.

## Files

- **NotebookEditor.tsx** - Core notebook editor component (`NotebookEditorCore`). Integrates four custom hooks:
  1. `useRuntimeManager()` (lines ~100-105) - Provides stable `serviceManager` proxy reference
  2. `useNotebookModel()` (lines ~108-112) - Tracks model changes, dirty state, sends updates to extension
  3. `useNotebookResize()` (line ~132) - Watches container size for Lumino widget layout updates
  4. `useNotebookOutline()` (lines ~144-148) - Extracts notebook structure for outline tree view

  Passes to JupyterLab's `Notebook2` component: `notebookId`, `serviceManager` (stable proxy), `INotebookContent`, `vscodeApi`, `theme`, and `notebookToolOperations`.

  Uses `notebookIdRef` to detect when the webview is reused for a different document (prevents state pollution). Tracks `kernelInitializing` flag for toolbar spinner. All state comes from Zustand store (not component props) to avoid props drilling.

- **NotebookToolbar.tsx** - Toolbar for notebook operations using shared toolbar components (`BaseToolbar`, `ToolbarButton`, `KernelSelector`). Provides run cell, run all, restart kernel, and interrupt kernel actions. Styled consistently with the Lexical toolbar.

- **main.ts** - Entry point for the notebook webview. Initializes RequireJS stub (required for JupyterLab AMD modules) and sets up typestyle target element for styled-components used by JupyterLab widgets.
