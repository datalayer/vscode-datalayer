---
name: datalayer-mcp
description: This skill is used for working with Jupyter notebooks and Datalayer documents using the Datalayer MCP tools. This is the only correct way to interact with a jupyter notebook.
---

# Datalayer MCP — The Required Method for Jupyter Notebook Work

## When to Apply This Skill

Apply this skill whenever a task involves **any** of the following:

- Reading, inspecting, or understanding a `.ipynb` notebook's cells or outputs
- Adding, editing, or deleting cells in a notebook
- Running code or checking variable values in a live kernel
- Creating a new Jupyter notebook or Datalayer document
- Working with `.dlex` lexical documents
- Debugging, refactoring, or extending notebook code
- Analysing data that lives inside a running kernel

---

## CRITICAL: Never Use File Tools on Jupyter Notebooks

**Do NOT use `read_file`, `edit`, `write_to_file`, `grep_search`, or any other file-system tool on `.ipynb` or `.dlex` files.**

Jupyter notebooks are structured JSON documents containing embedded outputs, kernel state, cell execution counts, and cell IDs. Direct file manipulation:

- **Corrupts cell outputs** — images, widgets, and rich HTML are base64-encoded blobs that break silently on edit
- **Fabricates execution results** — reading a cell's "output" from disk gives stale or missing data; only the live kernel knows the true current state
- **Loses kernel variable bindings** — the in-memory kernel state cannot be read from or written to a file
- **Breaks cell ordering and IDs** — VS Code and Jupyter track cells by ID; file edits create ID collisions
- **Produces malformed JSON** — a single formatting mistake makes the notebook completely unreadable

The Datalayer MCP tools operate through the **live Datalayer editor and kernel**, giving Cascade the same access a human user has. This is the only correct way to interact with notebook or lexical content.

---

## Setup Requirements

1. **Datalayer VS Code extension must be active** — running in Extension Development Host or installed normally.
2. **MCP server must be listening** — logged as `MCP HTTP server listening on http://127.0.0.1:<port>/mcp` on activation (default port 3333). Configure Windsurf via `~/.codeium/windsurf/mcp_config.json`.
3. **Document must be open in the Datalayer custom editor** — not the native VS Code notebook viewer. If the user opened a `.ipynb` with the built-in viewer, ask them to right-click → "Open With…" → "Datalayer Notebook Editor".

---

## Standard Operating Procedure

### Step 1 — Always orient first

Call `datalayer_getActiveDocument` before any other tool. It returns:
- `uri` — document path (`file:///...` or `datalayer://...` for cloud)
- `type` — `"notebook"` or `"lexical"`
- `isConnected` — whether a kernel is connected

Pass the returned `uri` as `notebook_uri` / `documentUri` in subsequent calls.

**`datalayer_getActiveDocument` returns an open-documents list** appended after the active document info:

```
## Open Datalayer Documents
1. analysis.ipynb (notebook) ← most recent
   URI: `file:///path/to/analysis.ipynb`
2. model-training.ipynb (notebook)
   URI: `file:///path/to/model-training.ipynb`
```

The list is sorted by recency (most recently focused tab or last targeted by an MCP call is first). Use it to:
- **Select the correct notebook** — match the user's request against filenames/topics in the list and pass the corresponding URI as `notebook_uri` / `documentUri` in all subsequent calls
- **Detect ambiguity** — if multiple notebooks are open and the request is ambiguous, ask the user which one to target before proceeding
- **Confirm the default** — if only one notebook is open, or the most-recent one clearly matches the request, proceed without asking

If the target becomes unclear mid-task (e.g. the user mentions a different notebook), call `datalayer_getActiveDocument` again to get a refreshed list.

### Step 2 — Connect a kernel if needed

If `isConnected` is false, call `datalayer_listKernels` then `datalayer_selectKernel`. For zero-setup execution use `type="pyodide"`; for a new cloud runtime use `type="new"`; to reuse what's running use `type="active"`.

### Step 3 — Read before writing

Before modifying anything:
- Notebooks → `datalayer_readAllCells` to see current cell sources and outputs
- Lexical docs → `datalayer_readAllBlocks` to see document structure and block IDs

### Step 4 — Execute using only Datalayer MCP tools

See `tool-reference.md` for the full tool table, common workflow recipes, and error patterns.

**Targeting a specific notebook:** If the user references a notebook by name or path and multiple notebooks are open, find the matching URI from the `uri` returned by `datalayer_getActiveDocument` or from context, and pass it as `notebook_uri` in all subsequent cell/kernel calls. Do not guess — if the URI is unclear, ask.

### Step 5 — Verify after mutations

After any insert/update/delete/run, read back the affected cell or block to confirm the result before continuing.
