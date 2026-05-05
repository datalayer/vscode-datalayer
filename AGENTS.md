# AGENTS.md — Datalayer VS Code Extension: Windsurf/Cascade Integration

## What This Repo Is

`vscode-datalayer` is an open-source VS Code extension (MIT License) by Datalayer, Inc.
It provides a collaborative Jupyter notebook and Lexical document editor inside VS Code,
with cloud runtime support (CPU/GPU), a `datalayer://` virtual filesystem, LSP cell
completions, and 21 AI tools registered via VS Code's Language Model Tools API.

**Upstream repo**: https://github.com/datalayer/vscode-datalayer  
**Extension publisher ID**: `datalayer.datalayer-jupyter-vscode`  
**Entry point**: `src/extension.ts` (38-step async activation sequence)

---

## The Goal of This Fork

**GitHub Copilot can use all 21 DataLayer tools** because it invokes them via VS Code's
`vscode.lm.invokeTool()` API. **Windsurf/Cascade cannot**, because Cascade uses MCP
(Model Context Protocol) over HTTP, not the VS Code LM API.

**The goal is to add an MCP HTTP server** to this extension so that Windsurf/Cascade
gains the same 21-tool access to DataLayer notebooks that Copilot currently has.

---

## Architecture Overview

### Current Tool Registration (Copilot path)

```
extension.ts  →  registerVSCodeTools(context)
                    └─ getCombinedOperations()          ← merges 3 operation registries
                    └─ vscode.lm.registerTool(name, VSCodeToolAdapter)
                                                        ↑ Copilot calls vscode.lm.invokeTool()

VSCodeToolAdapter.invoke()
    ├─ VS Code-specific ops (getActiveDocument, createNotebook, executeCode, listKernels,
    │   selectKernel, createLexical)  →  run directly in extension host
    └─ Notebook/lexical ops (insertCell, readAllCells, runCell, insertBlock, …)
           └─ BridgeExecutor  →  postMessage → webview → @datalayer/jupyter-react
```

### Desired MCP path (Windsurf/Cascade)

```
extension.ts  →  startMcpServer()   (new — runs alongside existing step)
                    └─ getCombinedOperations()          ← same registry, no duplication
                    └─ McpServer.tool(name, handler)    ← @modelcontextprotocol/sdk
                    └─ StreamableHTTPServerTransport    ← http://localhost:3333/mcp

Cascade calls tool via MCP  →  same handler → same BridgeExecutor/direct path as Copilot
```

---

## The 22 Tools

### Document Management
| Tool | Description |
|---|---|
| `datalayer_getActiveDocument` | Get URI + type of currently active doc. **Call first before any other op.** Also returns a ranked list of all open docs. |
| `datalayer_listOpenDocuments` | List all open notebooks and lexical docs sorted by most-recently-used. Returns URIs for targeting specific docs via `notebook_uri`/`documentUri`. |
| `datalayer_createNotebook` | Create a local or cloud `.ipynb` notebook |
| `datalayer_createLexical` | Create a local or cloud `.lexical` document |
| `datalayer_batch` | **Code Mode meta-tool.** Executes a JSON pipeline of `[{tool, params}]` operations in one MCP call. Eliminates LLM round-trips between mechanical steps. Pass `notebook_uri`/`documentUri` at the top level to forward to all sub-ops. |

### Kernel & Runtime
| Tool | Description |
|---|---|
| `datalayer_listKernels` | List local Jupyter, cloud Datalayer, and Pyodide (WASM) kernels |
| `datalayer_selectKernel` | Connect a kernel to the active doc (`pyodide`, `new`, `active`, `local`, or ID) |
| `datalayer_executeCode` | Execute arbitrary Python code in the connected kernel |

### Notebook-Specific (`.ipynb`)
| Tool | Description |
|---|---|
| `datalayer_insertCell` | Add a code or markdown cell. Accepts optional `notebook_uri` to target a specific notebook. |
| `datalayer_updateCell` | Modify existing cell content. Accepts optional `notebook_uri`. |
| `datalayer_deleteCell` | Remove a cell. Accepts optional `notebook_uri`. |
| `datalayer_readCell` | Read a single cell. Accepts optional `notebook_uri`. |
| `datalayer_readAllCells` | Read all cells (brief or full). Accepts optional `notebook_uri`. |
| `datalayer_runCell` | Execute a specific cell. Accepts optional `notebook_uri`. |
| `datalayer_runAllCells` | Execute all cells in sequence |

### Lexical Document (`.dlex` / `.lexical`)
| Tool | Description |
|---|---|
| `datalayer_insertBlock` | Add a block (heading, paragraph, jupyter-cell, etc.) |
| `datalayer_insertBlocks` | Add multiple blocks efficiently |
| `datalayer_updateBlock` | Modify an existing block |
| `datalayer_deleteBlock` | Remove a block |
| `datalayer_readBlock` | Read a single block |
| `datalayer_readAllBlocks` | Read all blocks and document structure |
| `datalayer_runBlock` | Execute a jupyter-cell block |
| `datalayer_runAllBlocks` | Execute all jupyter-cell blocks |
| `datalayer_listAvailableBlocks` | List supported block types and metadata formats |

---

## Key Files

| File | Role |
|---|---|
| `src/extension.ts` | 38-step activation. Add MCP server startup here (after step 22 "Registering MCP tools") |
| `src/tools/core/registration.ts` | `registerVSCodeTools()`, `getCombinedOperations()` — reuse this for MCP |
| `src/tools/core/toolAdapter.ts` | `VSCodeToolAdapter` — reference for how tools are invoked |
| `src/tools/core/BridgeExecutor.ts` | Webview postMessage bridge — notebook/lexical ops go through here |
| `src/tools/core/runnerSetup.ts` | Creates `Runner` with smart executor routing |
| `src/tools/definitions/` | Tool definition objects (name, description, inputSchema). Local VS Code-specific tools only; notebook/lexical tools come from upstream packages. |
| `src/tools/definitions/listOpenDocuments.ts` | New: lists all open documents sorted by recency |
| `src/tools/operations/listOpenDocuments.ts` | New: implementation using `DocumentRegistry.getByType()` |
| `src/tools/definitions/batch.ts` | `datalayer_batch` tool definition (Code Mode meta-tool) |
| `src/tools/operations/batch.ts` | Stub operation for VS Code/Copilot path; real logic lives in `mcpServer.ts` |
| `src/tools/schemas/` | Zod validation schemas per tool |
| `src/tools/operations/` | Business logic implementations |
| `src/mcp/mcpServer.ts` | MCP HTTP server — `buildMcpExecutionContext()` contains the tag-based routing logic |
| `src/services/documents/documentRegistry.ts` | `lastUsed` tracking, `touch()`, `startTabWatcher()`, `getBestWebviewPanel()` |
| `package.json` | `languageModelTools` contribution point — reference for MCP tool schemas (Copilot path only; MCP path loads schemas dynamically via `getAllToolDefinitionsAsync()`) |

---

## Current Architecture (as implemented)

The MCP server is **already implemented and running**. This section documents how it works.

### MCP Server startup

`extension.ts` starts the MCP server as an optional activation step after tool registration:

```typescript
await runOptionalActivationStep("Starting MCP HTTP server for Windsurf/Cascade", async () => {
  const { startMcpServer } = await import("./mcp/mcpServer");
  const mcpHttpServer = await startMcpServer(context, services!, ui!);
  context.subscriptions.push({ dispose: () => mcpHttpServer.close() });
  context.subscriptions.push(services!.documentRegistry.startTabWatcher());
});
```

### Tool routing in `buildMcpExecutionContext`

For each MCP tool call, the handler classifies the tool via its tags:

```typescript
const isPrerequisiteTool = tags.includes("prerequisite"); // skip doc resolution entirely
const needsCellDocument  = !isPrerequisiteTool && tags.includes("cell");   // → resolveNotebookId()
const needsBlockDocument = !isPrerequisiteTool &&
  (tags.includes("block") || tags.includes("blocks"));                      // → resolveLexicalId()
const isCreateOperation  = tags.includes("create");                         // → no document needed
```

**Critical:** Use `"block"`/`"blocks"` — NOT `"lexical"` — to detect block operations.
`"lexical"` is a domain descriptor shared by cross-domain tools (`listKernels`, `selectKernel`,
`executeCode`). Every actual block operation tool carries `"block"` or `"blocks"`; none of
the cross-domain tools do. Using `"lexical"` as the discriminator causes those tools to
erroneously call `resolveLexicalId()` and fail when no `.dlex` file is open.

### Configure Windsurf

The extension automatically writes a workspace-level `.windsurf/mcp.json` to the workspace root on every activation. Windsurf reads this file and overrides the global `mcp_config.json` for that workspace. **No manual configuration is needed** for new workspaces after installing the extension.

For a global fallback (e.g. opening a folder that has never had the extension run in it), you can still add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "datalayer": {
      "serverUrl": "http://localhost:3333/mcp"
    }
  }
}
```

The actual port is logged to the Datalayer output channel on activation.

---

## Caveats & Open Questions

- **Multi-window auto-config**: Each VS Code window's extension claims a port from 3333–3340. On startup, the extension writes `.windsurf/mcp.json` to the workspace root with its actual port. Windsurf reads this workspace-level config (overriding the global `mcp_config.json`) so each window's Cascade agent connects to the correct server automatically. The file is gitignored. After installing a new VSIX in a new workspace for the first time, the user may need to reload the window once for Windsurf to pick up the new workspace config.

  **How it actually works (alpha.10+):** Windsurf has NO workspace-level MCP config override — it only reads `~/.codeium/windsurf/mcp_config.json`. The extension now patches that global file directly on startup (preserving all other server entries), and Windsurf hot-reloads only the `datalayer` entry automatically. The workspace `.windsurf/mcp.json` is still written as a transparency artifact.

- **BridgeExecutor webview dependency**: Cell/block operations require an active DataLayer
  webview. If no DataLayer notebook is open, those tools will fail gracefully. Document
  this clearly in tool descriptions for Cascade.

- **Authentication**: DataLayer cloud operations require auth. The MCP server inherits
  the same auth state as the extension (already managed by `ServiceContainer`), so no
  separate auth is needed.

- **Multi-notebook targeting**: All cell tools now accept an optional `notebook_uri` parameter.
  When multiple notebooks are open, Cascade should call `datalayer_listOpenDocuments` to
  discover URIs and pass the target notebook's URI explicitly rather than relying on
  focus detection.

- **Upstream PR**: This change is a clean optional activation step and adds no breaking
  changes. It is worth submitting upstream to the DataLayer repo.

---

## Documentation Update Policy

**Every code change to the MCP server, tool definitions, or document registry MUST include updates to:**

1. **`CHANGELOG.md`** — describe the change under `[Unreleased]` with the target version tag (e.g. `0.0.16-alpha.N`)
2. **`README.md`** — update the Recent Updates section and any feature bullets affected
3. **`AGENTS.md`** (this file) — update tool tables, caveats, architecture notes, and key files as needed
4. **Windsurf skills** — if tool behaviour or schemas change, update **only** `.windsurf/skills/datalayer-mcp/` (the local workspace copy). Do **not** modify `~/.codeium/windsurf/skills/datalayer-mcp/` (the user's global skill, maintained separately outside this repo).
5. **`package.json`** — bump the version for every releasable change
6. **`.windsurf/skills/datalayer-mcp/tool-reference.md`** — update the tool reference documentation to reflect the current state of the tools
7. **`.windsurf/skills/datalayer-mcp/SKILL.md`** — update the skill documentation to reflect the current state of the tools and approach if anything has substantially changed in how the MCP server is meant to be used.

Failing to update these files leaves Cascade and future contributors with stale context, which directly causes the class of bugs seen during this development cycle.

> **Reminder to Cascade:** On every conversation turn that modifies MCP server behaviour, tool definitions, or operation logic, end by verifying that `.windsurf/skills/datalayer-mcp/tool-reference.md` reflects the change. The global skill at `~/.codeium/windsurf/skills/datalayer-mcp/` is the user's personal copy and must **not** be touched.

---

## Development Setup

```bash
cd /Users/alpenkar/Documents/Code/vscode-datalayer
npm install
npm run compile        # webpack build
# Press F5 in VS Code to launch Extension Development Host
```

Requires Node.js 22.x (see `package.json` `engines` field).
