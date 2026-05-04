# Change Log

All notable changes to the Datalayer VS Code extension are documented here.

## [Unreleased]

### Added (April 2025) — `0.0.17-alpha.adp11`

- **Cross-window notebook registry via `globalState`**: New `CrossWindowRegistry` class (`src/mcp/crossWindowRegistry.ts`) uses VS Code's `ExtensionContext.globalState` (shared across all windows) to broadcast each window's open notebooks and MCP port. Every 15 seconds the registry writes a heartbeat + current notebook list; entries older than 45 seconds are treated as stale (window closed). When an MCP tool call fails to find a notebook locally, it now checks `globalState` for other active windows and returns an informative error listing exactly which notebooks are open in other windows and on which port, guiding the user to switch to the correct Cascade session or reopen the notebook in the current window.

### Fixed (April 2025) — `0.0.17-alpha.adp11`

- **MathJax stretchy brackets now render in markdown**: LaTeX commands like `\underbrace`, `\overbrace`, and `\underbracket` now render correctly in notebook markdown cells. Previously these stretchy delimiters appeared blank because the MathJax Size fonts (`MJXTEX-S1..S4`) were never loaded. Fixed by importing `@jupyterlab/mathjax-extension/style/base.css` in the webview entry point, which webpack processes to emit the 22 MathJax WOFF font files and inject the required `@font-face` declarations at runtime.

### Fixed (April 2025) — `0.0.17-alpha.adp10`

- **Multi-window MCP config now writes to the correct file**: `0.0.16-alpha.9` wrote a workspace-level `.windsurf/mcp.json`, but Windsurf **only** reads `~/.codeium/windsurf/mcp_config.json` — there is no workspace-level config override. The extension now updates the global `mcp_config.json` directly: it reads the existing file, patches only the `datalayer` entry with the claimed port, and writes it back, preserving all other servers. Windsurf hot-reloads the affected server automatically when the file changes (no manual refresh required). The workspace-level `.windsurf/mcp.json` is still written as a transparency artifact.

### Added (April 2025) — `0.0.17-alpha.adp2`

- **Intelligent multi-notebook selection for MCP**: When multiple Datalayer notebooks are open, MCP tool calls now target the correct notebook intelligently rather than defaulting to insertion order.
  - `DocumentRegistryEntry` gains a `lastUsed: number` timestamp (set on registration, updated on every MCP tool call and on VS Code tab focus).
  - `DocumentRegistry.touch(documentId)` — new method that refreshes `lastUsed` for a given entry.
  - `DocumentRegistry.getByType()` — now returns entries sorted by `lastUsed` descending so all callers automatically prefer the most-recently-used document.
  - `DocumentRegistry.startTabWatcher()` — new method that subscribes to `vscode.window.tabGroups.onDidChangeTabs`. Manually clicking a Datalayer notebook or lexical tab in VS Code now updates `lastUsed` for that document, keeping selection intent consistent whether the user interacts through the editor or through Cascade.
  - Wired up in `extension.ts` alongside the MCP server startup so the watcher's lifecycle is tied to the extension.
  - `resolveNotebookId` / `resolveLexicalId` in the MCP path call `touch()` after resolving the target document.
  - `buildOpenDocumentsContext()` — appended to `datalayer_getActiveDocument` responses only. Returns a ranked list of all open documents (URI, type, recency order) so Cascade can make an informed document choice based on the user's request without polluting every other tool's output.

- **Windsurf Skill**: Added `.windsurf/skills/datalayer-mcp/` to the repository with `SKILL.md` and `tool-reference.md`. These teach Cascade how to use the MCP server as the authoritative, required interface for all Jupyter notebook and Datalayer document work — replacing any direct file-system access to `.ipynb` / `.dlex` files.

### Added (April 2025) — `0.0.17-alpha.adp1`

- **Windsurf / Cascade MCP Integration**: All 22 Datalayer tools are now accessible to Windsurf/Cascade via a local HTTP MCP (Model Context Protocol) server
  - New file: `src/mcp/mcpServer.ts` — starts a stateless `StreamableHTTPServerTransport` server on `http://localhost:3333/mcp` (auto-scans 3333–3340 for a free port)
  - Reuses the same `getCombinedOperations()` and `getAllToolDefinitionsAsync()` registry as the existing GitHub Copilot integration — no duplication
  - `createNotebook` / `createLexical` default to cloud when authenticated, local otherwise (no VS Code Quick Pick prompts)
  - Server startup failure is non-fatal: logged as a warning so extension activation is never blocked
  - Configure Windsurf via `~/.codeium/windsurf/mcp_config.json` — see `src/mcp/README.md`
  - New npm dependency: `@modelcontextprotocol/sdk@1.29.0` (externalized in webpack, whitelisted in `.vscodeignore`)

### Fixed (April 2025) — `0.0.16-alpha.9`

- **Multi-window MCP port collision**: When multiple VS Code windows are open, each window's Datalayer extension claims a different port (3333–3340). Previously only the window on port 3333 was reachable. Fixed by writing `.windsurf/mcp.json` on startup (superseded by alpha.10 which correctly targets the global config).

### Fixed (April 2025) — `0.0.16-alpha.8`

- **Webview-not-ready race condition**: Even after the early `register()` fix in alpha.7, tool calls made while the Datalayer React app was still initialising would time out after 30 seconds (the webview panel existed in the registry but couldn't handle messages yet). Fixed by:
  1. Adding `isWebviewReady: boolean` to `DocumentRegistryEntry` — set `false` on early registration, `true` when `handleReadyMessage` fires (i.e. the webview has sent its `"ready"` handshake).
  2. Adding `markWebviewReady(documentUri)` to `DocumentRegistry`, called from `handleReadyMessage` in `notebookProvider.ts`.
  3. Replacing `getBestWebviewPanel()` in the MCP executor with `getBestWebviewPanelWithStatus()`, which now throws a precise `"notebook still loading, please wait and retry"` error instead of hitting the 30-second timeout.
  4. `getBestWebviewPanel()` now prefers ready panels over not-yet-ready panels.

### Fixed (April 2025) — `0.0.16-alpha.7`

- **Race condition: registry empty when webview hasn't loaded yet** (root cause of most "no notebook found" errors): The `documentRegistry.register()` call in `notebookProvider.ts` was inside `handleReadyMessage()`, which is only triggered after the Datalayer webview React app finishes loading and sends a `"ready"` message. This takes several seconds. Any MCP tool call made before that point found an empty registry and failed — even though the notebook was visibly open in the Datalayer editor. Fixed by adding an early `register()` call directly in `resolveCustomEditor()` (immediately after the webview HTML is set), before any async work or message-handler setup.

### Fixed (April 2025) — `0.0.16-alpha.6`

- **Native VS Code notebook viewer detection**: When an `.ipynb` file is open in the native VS Code notebook viewer instead of the Datalayer custom editor, MCP tools previously returned a generic "No Datalayer notebook is open" error. The server now scans all open tabs, detects notebooks in the native viewer, fires a VS Code warning notification with a **"Reopen in Datalayer Editor"** action button, and throws a precise, actionable error message. Clicking the notification button automatically reopens the file in the correct editor.

### Fixed (April 2025) — `0.0.16-alpha.5`

- **`datalayer_listKernels`, `datalayer_selectKernel`, and `datalayer_executeCode` incorrectly required a lexical document**: `buildMcpExecutionContext` used `tags.includes("lexical")` as the discriminator for `needsBlockDocument`, causing these cross-domain tools to fail with `"No Lexical document is open"` when no `.dlex` file was open. Fixed by switching to `tags.includes("block") || tags.includes("blocks")`. Every actual block operation tool carries one of these tags; no cross-domain tool does.

### Added (April 2025) — `0.0.16-alpha.4`

- **`datalayer_listOpenDocuments` tool**: New VS Code-specific tool that returns every Jupyter notebook and Datalayer lexical document currently open in the Datalayer editor, sorted by most-recently-used first. Returns `uri`, `filename`, `type`, `rank`, and `mostRecent` for each document.

- **`notebook_uri` parameter on all notebook cell tools**: All six notebook cell tools (`readAllCells`, `readCell`, `insertCell`, `updateCell`, `deleteCells`, `runCell`) now expose `notebook_uri` as an optional input parameter in their MCP schema. Cascade can now target any open notebook by URI rather than relying on whichever notebook happens to be focused in VS Code.

### Fixed (April 2025) — `0.0.16-alpha.3`

- **`datalayer_getActiveDocument` required a lexical document**: The tool has `"lexical"` in its tags (correctly describing that it supports lexical documents), but `buildMcpExecutionContext` was reading that as "this tool needs a lexical document ID resolved" — calling `resolveLexicalId()` on every invocation and failing with `"No Lexical document is open"` when working on a plain `.ipynb` notebook. Fixed by adding an `isPrerequisiteTool` guard: tools tagged `"prerequisite"` now skip document ID resolution entirely, since they are orientation/discovery tools that should work regardless of what document type is open.

### Fixed (April 2025) — `0.0.16-alpha.2`

- **Multi-notebook ambiguity**: Previously, when no Datalayer editor tab was focused (e.g. Cascade panel was active) and multiple notebooks were open, the MCP path always picked the first registered notebook regardless of what the user was working on. The new `lastUsed`-sorted `getByType()` and `startTabWatcher()` ensure the most recently focused or most recently used notebook is selected by default.

### Fixed (April 2025) — `0.0.16-alpha.1`

- **MCP tool execution when Cascade panel is focused**: `DocumentRegistry.getBestWebviewPanel()` added as a fallback to `getActiveWebviewPanel()`. Previously, notebook/lexical tool operations failed when VS Code focus was on the Cascade chat panel because the active-tab check returned nothing. The new method walks all registered webview panels and returns the first available one.
- `resolveNotebookId` and `resolveLexicalId` in the MCP path similarly fall back to the document registry when the active-tab check returns no result.

### Fixed (January 2025)


## [0.0.16] - 2026-04-29

### Added

- **Agent Chat Sidebar**: AI chat sidebar with agent-runtimes integration ([#349](https://github.com/datalayer/vscode-datalayer/pull/349))

### Fixed

- **OAuth Windsurf/Cursor Compatibility**: Use `vscode.env.uriScheme` for OAuth callback URIs instead of hardcoded `vscode://`, enabling OAuth login in Windsurf, Cursor, and other VS Code forks ([#369](https://github.com/datalayer/vscode-datalayer/pull/369))

## [0.0.15] - 2026-04-08

### Added

- **Projects View**: Projects tree view in sidebar with nested notebooks/documents ([#337](https://github.com/datalayer/vscode-datalayer/pull/337))
- **TypeScript Strictness**: Enabled `noUncheckedIndexedAccess` for safer array/object access ([#335](https://github.com/datalayer/vscode-datalayer/pull/335))
- **Webpack Bundle Analyzer**: `npm run analyze` for interactive bundle size reports ([#335](https://github.com/datalayer/vscode-datalayer/pull/335))
- **Settings Validation**: Centralized Zod validation for all VS Code settings ([#335](https://github.com/datalayer/vscode-datalayer/pull/335))
- **Code Quality Tooling**: Strict JSDoc enforcement, pre-commit hooks (Husky + lint-staged), commitlint, cspell, README-per-directory checks ([#332](https://github.com/datalayer/vscode-datalayer/pull/332), [#333](https://github.com/datalayer/vscode-datalayer/pull/333))
- **Extended Test Coverage**: 1,300+ tests across extension and webview suites ([#334](https://github.com/datalayer/vscode-datalayer/pull/334))

### Changed

- **Dependencies**: Updated all dependencies ([#331](https://github.com/datalayer/vscode-datalayer/pull/331))

### Fixed

- **Keytar Rebuild**: Removed unnecessary keytar native rebuild step ([#325](https://github.com/datalayer/vscode-datalayer/pull/325))
- **Bundle Size**: Optimized bundle size and renamed SDK to datalayer ([#313](https://github.com/datalayer/vscode-datalayer/pull/313))

## [0.0.13] - 2026-02-05

### Fixed

- **Release Workflow**: Updated release workflow and cleaned up formatting

## [0.0.12] - 2026-02-05

### Added

- **Excalidraw, Collapsibles, Tables**: Rich block support in lexical editor ([#250](https://github.com/datalayer/vscode-datalayer/pull/250))
- **Commenting**: Commenting capabilities in lexical editor ([#213](https://github.com/datalayer/vscode-datalayer/pull/213))
- **Copy/Download from Space**: Context menu actions for space items ([#239](https://github.com/datalayer/vscode-datalayer/pull/239))
- **Datasource Management**: Secret handling and datasource CRUD ([#238](https://github.com/datalayer/vscode-datalayer/pull/238))
- **Autoindent**: Automatic indentation support ([#194](https://github.com/datalayer/vscode-datalayer/pull/194))

### Changed

- **Lexical File Extension**: Changed from `.lexical` to `.dlex` ([#174](https://github.com/datalayer/vscode-datalayer/pull/174))
- **VSIX Bundle**: Audited and optimized bundle size ([#257](https://github.com/datalayer/vscode-datalayer/pull/257))

### Fixed

- **Toolbar Actions**: Fixed toolbar actions for lexicals ([#270](https://github.com/datalayer/vscode-datalayer/pull/270))
- **Running Kernels**: Fixed kernel execution issues ([#212](https://github.com/datalayer/vscode-datalayer/pull/212))
- **Pyodide**: Fixed pyodide and datalayer runtimes for native notebooks ([#201](https://github.com/datalayer/vscode-datalayer/pull/201))
- **Run Cell Block**: Fixed toolbar action for running cell blocks ([#200](https://github.com/datalayer/vscode-datalayer/pull/200))
- **Tab Completions**: Fixed tab for inline completions ([#199](https://github.com/datalayer/vscode-datalayer/pull/199))
- **Cell/Document Actions**: Fixed run/cell and other actions on documents ([#192](https://github.com/datalayer/vscode-datalayer/pull/192))
- **Notebook Sidebar**: Updated docs and fixed notebook sidebar ([#289](https://github.com/datalayer/vscode-datalayer/pull/289))

## [0.0.9] - 2025-12

### Added

- **Pyodide Package Cache**: Fixed pyodide package caching for native notebooks ([#145](https://github.com/datalayer/vscode-datalayer/pull/145))
- **Icon Font**: Datalayer icon font and native notebook datalayer button ([#155](https://github.com/datalayer/vscode-datalayer/pull/155))

### Fixed

- **Kernel Switching**: Fixed kernel switching and selection ([#166](https://github.com/datalayer/vscode-datalayer/pull/166))
- **Pyodide on Lexicals**: Fixed pyodide execution on lexical documents ([#175](https://github.com/datalayer/vscode-datalayer/pull/175))

## [0.0.8] - 2025-11

### Added

- **Unified Login**: Unified login handling with TypeScript SDK ([#140](https://github.com/datalayer/vscode-datalayer/pull/140))
- **Pyodide Kernel**: Pyodide (WebAssembly) kernel integration ([#139](https://github.com/datalayer/vscode-datalayer/pull/139))
- **Embed Tools**: VS Code embed tools and generalized tool operations for notebooks and lexicals ([#41](https://github.com/datalayer/vscode-datalayer/pull/41))

## [0.0.7] - 2025-10

### Added

- **Autoconnect Strategies**: Configurable autoconnect strategies ([#116](https://github.com/datalayer/vscode-datalayer/pull/116))
- **Sidebar**: Unified sidebar to group all datalayer views, with outline plugin ([#113](https://github.com/datalayer/vscode-datalayer/pull/113))
- **Local Kernels**: Local kernel handling for datalayer documents ([#82](https://github.com/datalayer/vscode-datalayer/pull/82))
- **Snapshots**: Snapshot support ([#104](https://github.com/datalayer/vscode-datalayer/pull/104))
- **LLM Completions**: Inline LLM completions for lexical ([#103](https://github.com/datalayer/vscode-datalayer/pull/103)) and notebooks ([#100](https://github.com/datalayer/vscode-datalayer/pull/100))
- **Undo/Redo**: Undo/redo support for notebooks ([#45](https://github.com/datalayer/vscode-datalayer/pull/45)) and lexical ([#102](https://github.com/datalayer/vscode-datalayer/pull/102))
- **Walkthrough**: Datalayer starter walkthrough ([#85](https://github.com/datalayer/vscode-datalayer/pull/85))
- **Prefilled Runtime Names**: Default names for runtimes ([#84](https://github.com/datalayer/vscode-datalayer/pull/84))
- **Document Icons**: Icons for creation of datalayer documents ([#71](https://github.com/datalayer/vscode-datalayer/pull/71))
- **Kernel Management Menu**: Kernel management options in lexical toolbar ([#64](https://github.com/datalayer/vscode-datalayer/pull/64))

### Fixed

- **Primer Theme**: Created primer VS Code theme ([#106](https://github.com/datalayer/vscode-datalayer/pull/106))
- **Remote Document Reload**: Correctly support reloading remote documents on restart ([#105](https://github.com/datalayer/vscode-datalayer/pull/105))
- **Completion Theming**: Fixed completion theming when connected to kernel ([#108](https://github.com/datalayer/vscode-datalayer/pull/108))
- **Cell Selection**: Fixed VS Code selection inside cells ([#98](https://github.com/datalayer/vscode-datalayer/pull/98))
- **Styles**: Fixed checkbox styles ([#97](https://github.com/datalayer/vscode-datalayer/pull/97)), sidepanel background ([#95](https://github.com/datalayer/vscode-datalayer/pull/95)), font changes ([#63](https://github.com/datalayer/vscode-datalayer/pull/63)), error messages ([#67](https://github.com/datalayer/vscode-datalayer/pull/67)), theme handling ([#66](https://github.com/datalayer/vscode-datalayer/pull/66))
- **Race Conditions**: Fixed race conditions and document uniqueness ([#68](https://github.com/datalayer/vscode-datalayer/pull/68))
- **Empty Files**: Graceful handling of empty files ([#48](https://github.com/datalayer/vscode-datalayer/pull/48))
- **Lexical Rich Blocks**: Fixed missing rich blocks and toolbar ([#49](https://github.com/datalayer/vscode-datalayer/pull/49))

## [0.0.4] - 2025-10-07

### Added

- Initial public release
- Jupyter notebook custom editor (`.ipynb`)
- Lexical document custom editor
- Datalayer Spaces tree view
- Datalayer Runtimes tree view
- Token-based authentication
- Status bar integration
- Three-tier logging system
