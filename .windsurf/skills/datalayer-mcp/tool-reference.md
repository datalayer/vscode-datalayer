# Datalayer MCP — Tool Reference

## Tool Catalogue (21 tools)

### Document Management

| Tool | Description |
|---|---|
| `datalayer_getActiveDocument` | **Always call first.** Returns URI, type (`notebook`/`lexical`), and kernel connection state. Also appends a ranked list of all open documents. |
| `datalayer_listOpenDocuments` | Returns all open notebooks and lexical docs sorted by most-recently-used. Use when you need to target a specific notebook by URI. |
| `datalayer_createNotebook` | Create a new `.ipynb`. Defaults to cloud when authenticated, local otherwise. |
| `datalayer_createLexical` | Create a new `.dlex` document. Same location logic. |
| `datalayer_batch` | **Code Mode meta-tool.** Execute a JSON pipeline of `[{tool, params}]` operations in one MCP call — no LLM round-trips between steps. Pass `notebook_uri`/`documentUri` at top level to forward to all sub-ops. Set `stopOnError: false` to collect partial results. |

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

## Batch Decision Guide

**Default: use `datalayer_batch` for ALL writes after the initial read.**

| Situation | Use |
|---|---|
| Insert cell(s) + run + verify | ✅ `datalayer_batch` |
| Update cell(s) + run + verify | ✅ `datalayer_batch` |
| Delete cells + read state | ✅ `datalayer_batch` |
| Multiple sequential inserts at known indices | ✅ `datalayer_batch` |
| Insert/update block(s) + run + verify | ✅ `datalayer_batch` |
| Outcome of step N determines params of step N+1 | ❌ individual calls |
| Exploratory debugging where each result changes the plan | ❌ individual calls |
| Pure read (no mutations) | ❌ individual call |

**The three-call pattern is the standard workflow:**
```
(1) datalayer_getActiveDocument   → orient, get URI
(2) datalayer_readAllCells        → read state, get cell count N
(3) datalayer_batch(notebook_uri, operations=[insert, run, read])
```

---

## Common Workflows

### Inspect a running notebook / read variable values
*(reads only — no batching needed)*

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

### Add cells to an existing notebook ✅ BATCH

```
(1) datalayer_getActiveDocument      → get URI
(2) datalayer_readAllCells           → learn current cell count N
(3) datalayer_batch({
      notebook_uri: "...",
      operations: [
        { tool: "datalayer_insertCell", params: { type: "code", source: "...", index: N } },
        { tool: "datalayer_runCell",    params: { index: N } },
        { tool: "datalayer_readCell",   params: { index: N } }
      ]
    })
```
3 MCP calls instead of 5.

### Add multiple cells at once ✅ BATCH

```
(1) datalayer_getActiveDocument
(2) datalayer_readAllCells           → N = current cell count
(3) datalayer_batch({
      notebook_uri: "...",
      operations: [
        { tool: "datalayer_insertCell", params: { type: "code", source: "import pandas as pd", index: N   } },
        { tool: "datalayer_insertCell", params: { type: "code", source: "df = pd.read_csv('data.csv')", index: N+1 } },
        { tool: "datalayer_insertCell", params: { type: "code", source: "df.head()", index: N+2 } },
        { tool: "datalayer_runCell",    params: { index: N   } },
        { tool: "datalayer_runCell",    params: { index: N+1 } },
        { tool: "datalayer_runCell",    params: { index: N+2 } },
        { tool: "datalayer_readCell",   params: { index: N+2 } }
      ]
    })
```

### Update an existing cell ✅ BATCH

```
(1) datalayer_getActiveDocument
(2) datalayer_readAllCells           → find target cell index K
(3) datalayer_batch({
      notebook_uri: "...",
      operations: [
        { tool: "datalayer_updateCell", params: { index: K, source: "new code here" } },
        { tool: "datalayer_runCell",    params: { index: K } },
        { tool: "datalayer_readCell",   params: { index: K } }
      ]
    })
```

### Edit a lexical document ✅ BATCH

```
(1) datalayer_getActiveDocument
(2) datalayer_readAllBlocks          → get block IDs and structure
(3) datalayer_batch({
      documentUri: "...",
      operations: [
        { tool: "datalayer_insertBlock",  params: { type: "paragraph", source: "...", afterId: "BOTTOM" } },
        { tool: "datalayer_insertBlock",  params: { type: "jupyter-cell", source: "print('hello')", afterId: "BOTTOM" } },
        { tool: "datalayer_runAllBlocks", params: {} }
      ]
    })
```

### Exploratory debugging ❌ INDIVIDUAL CALLS

Use individual calls when each result informs the next step:
```
datalayer_getActiveDocument
datalayer_readAllCells
datalayer_runCell(index=K)           → inspect output; decide what to fix
datalayer_updateCell(index=K, ...)   → fix based on what you saw
datalayer_runCell(index=K)           → verify fix
```

### Start a new notebook on cloud

```
(1) datalayer_createNotebook         → creates in cloud (when authenticated)
(2) datalayer_selectKernel(type="new")
(3) datalayer_batch({
      operations: [
        { tool: "datalayer_insertCell", params: { type: "code", source: "import pandas as pd\nprint('ready')", index: 0 } },
        { tool: "datalayer_runCell",    params: { index: 0 } },
        { tool: "datalayer_readCell",   params: { index: 0 } }
      ]
    })
```

### Zero-setup execution (no Python install required)

```
(1) datalayer_createNotebook
(2) datalayer_selectKernel(type="pyodide")
(3) datalayer_executeCode(code="...")    → run Python immediately, no cell needed
```

### Create a Lexical report from notebook results

```
(1) datalayer_getActiveDocument          → confirm notebook URI
(2) datalayer_readAllCells               → collect outputs to summarise
(3) datalayer_createLexical              → new .dlex document
(4) datalayer_listAvailableBlocks        → discover block types and required params
(5) datalayer_batch({
      documentUri: "...",
      operations: [
        { tool: "datalayer_insertBlock", params: { type: "heading",      source: "Analysis Report", afterId: "BOTTOM" } },
        { tool: "datalayer_insertBlock", params: { type: "paragraph",    source: "Summary of findings...", afterId: "BOTTOM" } },
        { tool: "datalayer_insertBlock", params: { type: "jupyter-cell", source: "# key chart code", afterId: "BOTTOM" } }
      ]
    })
(6) datalayer_runAllBlocks
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
| `No Datalayer notebook is open in THIS window's editor, but notebooks are open in other VS Code windows: • Port XXXX: filename.ipynb` | The requested notebook is in a different VS Code window's MCP server | Switch to the VS Code window that has the notebook open — Cascade there will connect to that window's MCP server automatically. Or reopen the notebook in this window. |
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
