# Datalayer MCP — Tool Reference

## Tool Catalogue (20 tools)

### Document Management

| Tool | Description |
|---|---|
| `datalayer_getActiveDocument` | **Always call first.** Returns URI, type (`notebook`/`lexical`), and kernel connection state. Also appends a ranked list of all open documents. |
| `datalayer_listOpenDocuments` | Returns all open notebooks and lexical docs sorted by most-recently-used. Use when you need to target a specific notebook by URI. |
| `datalayer_createNotebook` | Create a new `.ipynb`. Defaults to cloud when authenticated, local otherwise. |
| `datalayer_createLexical` | Create a new `.dlex` document. Same location logic. |

### Kernel & Runtime

| Tool | Description |
|---|---|
| `datalayer_listKernels` | List all available kernels: Datalayer cloud runtimes, local Python envs, Pyodide (WASM). |
| `datalayer_selectKernel` | Connect a kernel. Values: `"pyodide"` (WASM, zero-setup), `"new"` (fresh cloud runtime), `"active"` (reuse running), or a specific kernel ID from `listKernels`. |
| `datalayer_executeCode` | Execute arbitrary Python. Uses the active document's kernel; falls back to any running Datalayer runtime. Best tool for variable inspection without modifying cells. |

### Notebook Operations (`.ipynb`)

| Tool | Description |
|---|---|
| `datalayer_readAllCells` | All cells with source + outputs. Always call before editing. Accepts optional `notebook_uri`. |
| `datalayer_readCell` | Single cell by 0-based index. Accepts optional `notebook_uri`. |
| `datalayer_insertCell` | Add a code or markdown cell at a specific index. Accepts optional `notebook_uri`. |
| `datalayer_updateCell` | Overwrite a cell's source at a given index. Accepts optional `notebook_uri`. |
| `datalayer_deleteCells` | Remove one or more cells by index. Accepts optional `notebook_uri`. |
| `datalayer_runCell` | Execute a single cell and return its outputs. Accepts optional `notebook_uri`. |

### Lexical Document Operations (`.dlex`)

| Tool | Description |
|---|---|
| `datalayer_readAllBlocks` | All blocks + document structure. Always call before editing. |
| `datalayer_readBlock` | Single block by `block_id`. |
| `datalayer_insertBlock` | Add a block (`heading`, `paragraph`, `jupyter-cell`, etc.). |
| `datalayer_updateBlock` | Overwrite an existing block by `block_id`. |
| `datalayer_deleteBlocks` | Remove one or more blocks by `block_id`. |
| `datalayer_runBlock` | Execute a single `jupyter-cell` block by `block_id`. |
| `datalayer_runAllBlocks` | Execute all `jupyter-cell` blocks in sequence. |
| `datalayer_listAvailableBlocks` | Discover supported block types and their parameter schemas. |

---

## Common Workflows

### Inspect a running notebook / read variable values

```
datalayer_getActiveDocument          → confirm URI + isConnected=true
datalayer_readAllCells               → see all cell sources and current outputs
datalayer_executeCode(code="...")    → interrogate live kernel variables
```

For structured variable inspection:
```python
import json
print(json.dumps({"value": repr(my_var), "type": type(my_var).__name__, "shape": getattr(my_var, "shape", None)}))
```

### Add new analysis cells to an existing notebook

```
datalayer_getActiveDocument          → get URI, confirm kernel
datalayer_readAllCells               → understand current state and total cell count
datalayer_insertCell(index=N)        → add cell(s) at the right position
datalayer_runCell(index=N)           → execute and verify output
datalayer_readCell(index=N)          → confirm output is correct
```

### Start a new notebook on cloud

```
datalayer_createNotebook             → creates in cloud (when authenticated)
datalayer_selectKernel(type="new")   → spin up a fresh Datalayer cloud runtime
datalayer_insertCell(index=0)        → add initial code
datalayer_runCell(index=0)           → execute
```

### Zero-setup execution (no Python install required)

```
datalayer_createNotebook             → creates locally in workspace
datalayer_selectKernel(type="pyodide") → Pyodide WASM kernel, runs in browser
datalayer_executeCode(code="...")    → run Python with no local install
```

### Create a Lexical report from notebook results

```
datalayer_getActiveDocument          → confirm notebook URI
datalayer_readAllCells               → collect outputs to include
datalayer_createLexical              → new .dlex document
datalayer_listAvailableBlocks        → discover block types
datalayer_insertBlock(type="heading") → add title
datalayer_insertBlock(type="paragraph") → add narrative
datalayer_insertBlock(type="jupyter-cell") → add executable code
datalayer_runAllBlocks               → execute all cells in the report
```

---

## Kernel Selection Cheat Sheet

| Goal | `selectKernel` value | Notes |
|---|---|---|
| Reuse active cloud runtime | `"active"` | Fastest; preserves existing variable state |
| New Datalayer cloud runtime | `"new"` | Uses `datalayer.runtime.defaultMinutes` setting |
| Local Python environment | kernel ID from `listKernels` | Requires Python extension installed |
| Zero-install browser execution | `"pyodide"` | Limited package support; no GPU |
| Specific named runtime | ID string from `listKernels` | Use when multiple runtimes are running |

---

## Error Patterns & Fixes

| Error message | Root cause | Resolution |
|---|---|---|
| `"filename.ipynb" is open in the native VS Code notebook viewer, not the Datalayer editor` | File opened via native viewer, not Datalayer custom editor | A VS Code notification will appear with a one-click "Reopen in Datalayer Editor" button. Tell the user to click it, or: right-click file in Explorer → "Open With…" → "Datalayer Notebook Editor" |
| `No notebook is open in the Datalayer editor` | No `.ipynb` files open at all in Datalayer | Tell user to open the notebook via right-click → "Open With…" → "Datalayer Notebook Editor" |
| `The Datalayer notebook is still loading (webview not ready yet)` | Notebook is open in Datalayer editor but the React app hasn't finished initialising | Wait 3–5 seconds, then retry the tool call. This is transient and resolves on its own. |
| `Tool execution timeout (30s)` | Kernel busy, crashed, or disconnected | Call `datalayer_listKernels`; suggest `selectKernel(type="new")` |
| `Document ID not registered` | Native editor used instead of Datalayer | Same fix as native viewer error above |
| `No Datalayer notebook is open` (after valid `getActiveDocument`) | Notebook was closed between calls | Re-call `getActiveDocument`; confirm notebook still open |
| `Invalid response: 404 Not Found` on cloud ops | Not authenticated or token expired | Ask user: Command Palette → "Datalayer: Login" |
| `MCP server not reachable` | Extension not running or port conflict | Reload window; check Datalayer output channel for port number |
| Tools succeed but operate on the wrong notebook (different VS Code window) | MCP connected to another window's server (port collision) | On each activation the extension patches `~/.codeium/windsurf/mcp_config.json` with its port (Windsurf hot-reloads automatically). Reload the window you want Windsurf to target, then check the Datalayer output channel to confirm the port. |

---

## Key Constraints

- **Cell indices are 0-based.**
- **Block IDs are opaque strings** returned by `readAllBlocks` — always read first before any insert/update/delete.
- **One active document at a time** — tools target the best-available registered document. Pass `notebook_uri` / `documentUri` explicitly when multiple documents are open.
- **`notebook_uri` targets a specific notebook** — all cell tools accept an optional `notebook_uri` parameter. Get the URI from `datalayer_listOpenDocuments` or from the open-documents list in the `datalayer_getActiveDocument` response. When multiple notebooks are open, always pass this explicitly rather than relying on focus detection.
- **`executeCode` does not modify the notebook** — it runs code in the live kernel without inserting a cell. Use it for inspection and ad-hoc queries; use `insertCell` + `runCell` when the code should persist in the notebook.
- **Notebook ops require the Datalayer custom editor** — native VS Code `.ipynb` tabs are not supported.
- **Lexical ops require a `.dlex` file** open in the Datalayer Lexical editor.
