# Change Log

All notable changes to the Datalayer VS Code extension are documented here.

## [Unreleased]

## [0.1.0] - 2026-10-21

### Added

- **A coding agent in your folder**: `Datalayer: Start a coding agent here` starts Claude Code, Codex or another coding agent of the catalogue in the open folder on the local runtime, as the blank harness application or one of the folder's own Appspecs, and opens its session in the Datalayer Chat; your own `CLAUDE.md`/`AGENTS.md` is kept and said; a coding agent whose own instructions file the folder already has is refused in a sentence; the open file reaches the agent only when it asks and the application lets it
- **Try it here**: `Datalayer: Try this application` runs the Appspec or `app.py` open in the editor on your machine with hot reload (`loop apps run --web --watch`) and shows its page in a panel beside the editor; `Open this application's Validate tab` and `… Ship tab` open the application's pages in the browser
- **Tests**: the pure modules under a vitest `pure` project (`src/test/vitest`, node), beside the webview's; the extension-host suite gains the coding agent and Try against a stub `loop` (`src/test/fixtures/stub-loop`), run by CI on three OSes

### Added

- **Sessions view**: your sessions on Datalayer and on this machine in the Datalayer sidebar, grouped by place then application, each with its state, agent, turns and lineage; a Teams group with your team runs and their seats; a filter by application, state and title; refreshed on sign-in, on a local runtime's start or stop and by the title's button, never polled; an unreachable place said in one row
- **The seven verbs** on a session, from its context menu: Resume, Switch Agent…, Clone from Here…, Export…, Rename…, Archive, End, and Import a Session… in the title bar — the session API called from the extension host, every refusal the runtime's own sentence; Reveal in Explorer for a local session, Open in the Studio for one on Datalayer
- **A local runtime** per workspace folder (`loop serve`, started when asked, never at startup): `loop` found on PATH, under uv tool's and pipx's bins or at `datalayer.local.loopPath`, refused in a sentence with the install line (`uv tool install 'agent-runtimes[shield]'`) when missing or too old; listed as a place in the Agent Chat picker; its output in the _Datalayer: Local runtime_ channel; Datalayer: Start/Stop the Local Runtime
- **The coding agent checked** before it starts here: Datalayer: Check a Coding Agent on This Machine (binaries and Node's version, the adapter, the credential, the terms), `agent-shield setup` offered in a terminal with the command shown whole; Datalayer: Set a Harness Credential keeps it in VS Code's secret storage, never in settings
- **Settings** `datalayer.local.enabled`, `datalayer.local.loopPath`
- **A session's approvals, diffs, terminals and status in the editor**: an _ask me first_ request is also an editor notification naming the application, the action and its class (never its arguments) — _Approve_, _Decline_ after the chat has shown it and the approval was read again, _Show_ focusing the chat; a diff a coding agent wrote opens in the editor's diff view from its row (_Open in the editor_), the _after_ side the file on disk when it holds what was written, reviewed and never applied; what the agent ran is written to a read-only terminal per session in the Terminal panel; the status bar says _Datalayer: n waiting for you_ or _Datalayer: working…_, and a finished turn of a session the chat does not show is a notification
- **Diffs and terminals drawn in the chat** as the web draws them, from the same displays
- **The Sessions view opens a session in the chat** (its row, _Resume_): the chat set to the session's place — the local runtime of its folder, the deployment of its application — and the Sessions view read again after each answered turn; the thread's menu gains _Reveal in Explorer_ (a local session's folder) and _Open in the Studio_ (the application's Activity page)

### Changed

- **Datalayer packages**: `@datalayer/agent-runtimes` 1.5.66 (the session API, the chat's session entries, the diff and terminal displays), `@datalayer/core` 1.2.21, `@datalayer/jupyter-react` and `@datalayer/jupyter-lexical` 2.0.20, `@datalayer/primer-addons` 1.0.40, `@datalayer/reactor` 1.3.1

## [0.0.20] - 2026-10-08

### Added

- **Talk to your deployed applications** (preview, off by default): with `datalayer.agentChat.enabled` on, the Agent Chat sidebar lists your deployed applications; one kept always on is talked to over its runtime's session API, with its approvals, the tools it called and, when its Appspec lets it, the open file; any other is listed as closed, saying why ([#457](https://github.com/datalayer/vscode/pull/457))
- **Setting** `datalayer.services.aiAgentsUrl` for the ai-agents service ([#457](https://github.com/datalayer/vscode/pull/457))

## [0.0.19] - 2026-09-26

### Added

- **Home Folder file system**: the Datalayer Home Folder as a writable `datalayer-home:` workspace folder, on the same checksummed, resumable transfer contract as the web application and the CLI ([#445](https://github.com/datalayer/vscode/pull/445))

### Changed

- **Datalayer packages**: `@datalayer/core` 1.2.12, `@datalayer/agent-runtimes` 1.3.14, `@datalayer/jupyter-react` and `@datalayer/jupyter-lexical` 2.0.18, React 19 ([#445](https://github.com/datalayer/vscode/pull/445))
- **Runtime identifiers**: the extension and its webviews use the runtime's `runtimeName` everywhere the platform stopped exposing pod names ([#445](https://github.com/datalayer/vscode/pull/445))
- **Datasources**: managed as Contents sources, the model Datalayer Core 1.2 replaced the IAM datasources with; the create dialog does not attach a credential yet ([#445](https://github.com/datalayer/vscode/pull/445))
- **Panels**: reworked panels ([#412](https://github.com/datalayer/vscode/pull/412))

## [0.0.16] - 2026-04-29

### Added

- **Agent Chat Sidebar**: AI chat sidebar with agent-runtimes integration ([#349](https://github.com/datalayer/vscode/pull/349))

### Fixed

- **OAuth Windsurf/Cursor Compatibility**: Use `vscode.env.uriScheme` for OAuth callback URIs instead of hardcoded `vscode://`, enabling OAuth login in Windsurf, Cursor, and other VS Code forks ([#369](https://github.com/datalayer/vscode/pull/369))

## [0.0.15] - 2026-04-08

### Added

- **Projects View**: Projects tree view in sidebar with nested notebooks/documents ([#337](https://github.com/datalayer/vscode/pull/337))
- **TypeScript Strictness**: Enabled `noUncheckedIndexedAccess` for safer array/object access ([#335](https://github.com/datalayer/vscode/pull/335))
- **Webpack Bundle Analyzer**: `npm run analyze` for interactive bundle size reports ([#335](https://github.com/datalayer/vscode/pull/335))
- **Settings Validation**: Centralized Zod validation for all VS Code settings ([#335](https://github.com/datalayer/vscode/pull/335))
- **Code Quality Tooling**: Strict JSDoc enforcement, pre-commit hooks (Husky + lint-staged), commitlint, cspell, README-per-directory checks ([#332](https://github.com/datalayer/vscode/pull/332), [#333](https://github.com/datalayer/vscode/pull/333))
- **Extended Test Coverage**: 1,300+ tests across extension and webview suites ([#334](https://github.com/datalayer/vscode/pull/334))

### Changed

- **Dependencies**: Updated all dependencies ([#331](https://github.com/datalayer/vscode/pull/331))

### Fixed

- **Keytar Rebuild**: Removed unnecessary keytar native rebuild step ([#325](https://github.com/datalayer/vscode/pull/325))
- **Bundle Size**: Optimized bundle size and renamed SDK to datalayer ([#313](https://github.com/datalayer/vscode/pull/313))

## [0.0.13] - 2026-02-05

### Fixed

- **Release Workflow**: Updated release workflow and cleaned up formatting

## [0.0.12] - 2026-02-05

### Added

- **Excalidraw, Collapsibles, Tables**: Rich block support in lexical editor ([#250](https://github.com/datalayer/vscode/pull/250))
- **Commenting**: Commenting capabilities in lexical editor ([#213](https://github.com/datalayer/vscode/pull/213))
- **Copy/Download from Space**: Context menu actions for space items ([#239](https://github.com/datalayer/vscode/pull/239))
- **Datasource Management**: Secret handling and datasource CRUD ([#238](https://github.com/datalayer/vscode/pull/238))
- **Autoindent**: Automatic indentation support ([#194](https://github.com/datalayer/vscode/pull/194))

### Changed

- **Lexical File Extension**: Changed from `.lexical` to `.dlex` ([#174](https://github.com/datalayer/vscode/pull/174))
- **VSIX Bundle**: Audited and optimized bundle size ([#257](https://github.com/datalayer/vscode/pull/257))

### Fixed

- **Toolbar Actions**: Fixed toolbar actions for lexicals ([#270](https://github.com/datalayer/vscode/pull/270))
- **Running Kernels**: Fixed kernel execution issues ([#212](https://github.com/datalayer/vscode/pull/212))
- **Pyodide**: Fixed pyodide and datalayer runtimes for native notebooks ([#201](https://github.com/datalayer/vscode/pull/201))
- **Run Cell Block**: Fixed toolbar action for running cell blocks ([#200](https://github.com/datalayer/vscode/pull/200))
- **Tab Completions**: Fixed tab for inline completions ([#199](https://github.com/datalayer/vscode/pull/199))
- **Cell/Document Actions**: Fixed run/cell and other actions on documents ([#192](https://github.com/datalayer/vscode/pull/192))
- **Notebook Sidebar**: Updated docs and fixed notebook sidebar ([#289](https://github.com/datalayer/vscode/pull/289))

## [0.0.9] - 2025-12

### Added

- **Pyodide Package Cache**: Fixed pyodide package caching for native notebooks ([#145](https://github.com/datalayer/vscode/pull/145))
- **Icon Font**: Datalayer icon font and native notebook datalayer button ([#155](https://github.com/datalayer/vscode/pull/155))

### Fixed

- **Kernel Switching**: Fixed kernel switching and selection ([#166](https://github.com/datalayer/vscode/pull/166))
- **Pyodide on Lexicals**: Fixed pyodide execution on lexical documents ([#175](https://github.com/datalayer/vscode/pull/175))

## [0.0.8] - 2025-11

### Added

- **Unified Login**: Unified login handling with TypeScript SDK ([#140](https://github.com/datalayer/vscode/pull/140))
- **Pyodide Kernel**: Pyodide (WebAssembly) kernel integration ([#139](https://github.com/datalayer/vscode/pull/139))
- **Embed Tools**: VS Code embed tools and generalized tool operations for notebooks and lexicals ([#41](https://github.com/datalayer/vscode/pull/41))

## [0.0.7] - 2025-10

### Added

- **Autoconnect Strategies**: Configurable autoconnect strategies ([#116](https://github.com/datalayer/vscode/pull/116))
- **Sidebar**: Unified sidebar to group all datalayer views, with outline plugin ([#113](https://github.com/datalayer/vscode/pull/113))
- **Local Kernels**: Local kernel handling for datalayer documents ([#82](https://github.com/datalayer/vscode/pull/82))
- **Snapshots**: Snapshot support ([#104](https://github.com/datalayer/vscode/pull/104))
- **LLM Completions**: Inline LLM completions for lexical ([#103](https://github.com/datalayer/vscode/pull/103)) and notebooks ([#100](https://github.com/datalayer/vscode/pull/100))
- **Undo/Redo**: Undo/redo support for notebooks ([#45](https://github.com/datalayer/vscode/pull/45)) and lexical ([#102](https://github.com/datalayer/vscode/pull/102))
- **Walkthrough**: Datalayer starter walkthrough ([#85](https://github.com/datalayer/vscode/pull/85))
- **Prefilled Runtime Names**: Default names for runtimes ([#84](https://github.com/datalayer/vscode/pull/84))
- **Document Icons**: Icons for creation of datalayer documents ([#71](https://github.com/datalayer/vscode/pull/71))
- **Kernel Management Menu**: Kernel management options in lexical toolbar ([#64](https://github.com/datalayer/vscode/pull/64))

### Fixed

- **Primer Theme**: Created primer VS Code theme ([#106](https://github.com/datalayer/vscode/pull/106))
- **Remote Document Reload**: Correctly support reloading remote documents on restart ([#105](https://github.com/datalayer/vscode/pull/105))
- **Completion Theming**: Fixed completion theming when connected to kernel ([#108](https://github.com/datalayer/vscode/pull/108))
- **Cell Selection**: Fixed VS Code selection inside cells ([#98](https://github.com/datalayer/vscode/pull/98))
- **Styles**: Fixed checkbox styles ([#97](https://github.com/datalayer/vscode/pull/97)), sidepanel background ([#95](https://github.com/datalayer/vscode/pull/95)), font changes ([#63](https://github.com/datalayer/vscode/pull/63)), error messages ([#67](https://github.com/datalayer/vscode/pull/67)), theme handling ([#66](https://github.com/datalayer/vscode/pull/66))
- **Race Conditions**: Fixed race conditions and document uniqueness ([#68](https://github.com/datalayer/vscode/pull/68))
- **Empty Files**: Graceful handling of empty files ([#48](https://github.com/datalayer/vscode/pull/48))
- **Lexical Rich Blocks**: Fixed missing rich blocks and toolbar ([#49](https://github.com/datalayer/vscode/pull/49))

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
