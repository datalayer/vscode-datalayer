# Change Log

All notable changes to the Datalayer VS Code extension are documented here.

## [0.1.4] - 2026-10-23

### Fixed

- **The chat with your own runtimes names the file a tool ran on**: each notebook or document tool's card says _on analysis.ipynb_ once the call returned, in place of its arguments' summary (with `@datalayer/agent-runtimes` 1.5.85)
- **The Datalayer: Home page is in the packaged extension**: its bundle (`dist/home.js`) was built by `make dev` but left out of the release build, so the page stayed blank in an installed extension
- **Spinners turn**: Primer's spinners stood still in the extension's views (the showcase, the chat, the Datalayer page, the dialogs), for want of Primer's motion tokens

## [0.1.3] - 2026-10-23

### Added

- **The Datalayer Chat's agents read and edit your open notebook or document**: an agent you talk to in the Datalayer Chat sidebar (one of your runtimes, a session opened from the Sessions view, a deployed application) gets the notebook and document tools GitHub Copilot has: read, insert, update and delete cells or blocks, run them, and run code in the Datalayer notebook (`.ipynb`) or document (`.dlex`) open in VS Code. The calls run in the extension through the same tools Copilot calls, and each result names the file it worked on
- **Approvals for writes**: a tool that only reads runs at once; a tool that writes (inserts, updates, deletes, runs code) is asked first in the chat's approval banner, which names the file. A deployed application's own rules for a tool, or for reads and writes, are followed: _do it_ runs, _ask first_ asks, _leave to me_ refuses. A declined call is answered _nothing was changed_

### Fixed

- **The agent acts on the file you have open, even when the chat has focus**: Datalayer notebooks and documents are custom editors, so focus in the chat sidebar or another panel could leave no target. A call now runs on the active tab when it is a Datalayer editor of the right kind, else on the one of that kind you focused last (the agent is told which file, and that it was not the active tab), else nowhere, and the agent asks you to open one. The file is located before the call runs, named in the approval banner and in the application's transcript (_App → VS Code: tool on analysis.ipynb_), and the call then runs on that file only; if you close it in the meantime, the call is refused
- **A tool's call runs in its own editor's webview**: the notebook and document tools (Copilot's too) posted their operations to whichever Datalayer editor was active, even when the call named another file; they now go to the webview of the file they work on. A closed editor is no longer kept as a target

## [0.1.2] - 2026-10-22

### Changed

- **A shorter README, about agents and sessions**: talking to your agents, picking up any session, a coding agent in your folder, then notebooks and documents; the details moved to guides under `guides/` (agents, sessions and local coding agents, notebooks and documents, commands and settings); a header image sized for the Marketplace
- **The code documentation lives in the code**: the READMEs under `src/` and `webview/` became TSDoc in their source files

## [0.1.1] - 2026-10-22

### Added

- **The Datalayer page shows one block at a time, under tabs**: Sessions, Agents, Spaces, Outline, Settings, each with its count
- **Datalayer: Home** (`datalayer.home`): the sidebar's blocks — Sessions, Agents, Spaces, Outline and Settings — as one _Datalayer_ page in an editor tab, opened from the palette or from the _Open Datalayer_ row at the top of the Datalayer sidebar, under the Datalayer mark. The page lists the items the sidebar lists, read from the same trees: a click does what the tree's click does, each block refreshes on its own and follows the sidebar's changes, and signed out the page says so with a _Sign in_ button

### Fixed

- **Every view wears the editor's theme, the chat included**: the extension's theming is now Datalayer's `vscode` theme variant (from `@datalayer/primer-addons`), whose every token reads the editor's own colour, so a webview follows the colour theme in use and changes with it; the chat no longer shows its own blue
- **A team run's seat, or a session on Datalayer on no runtime, opened from the Sessions view is readable**: instead of a dead-end sentence, the Datalayer Chat reads the session's record at ai-agents (signed in the extension host; the token never reaches the view) and shows its conversation read-only under the session's header — what you asked, what the agent answered, each tool call in one line — with why it is read-only under it: a seat links to its team run on Datalayer, where the team's verbs are; a paused or ended session says to resume it on Datalayer
- **A session opened from the Sessions view no longer shows the runtime picker**: the Datalayer Chat draws a slim header instead — _All agents_ to go back, the session's title and state — and talks to the session on its own runtime with its own agent over the session API, a session on Datalayer included while `datalayer.agentChat.enabled` is off; a session on no runtime, a team run's seat, or one on a runtime that is not yours is said in a sentence, never sent to another runtime
- **The Datalayer Chat follows your VS Code theme**: the chat's own dark theme no longer overrides the editor's colours
- **A runtime picked in the Datalayer Chat no longer answers `HTTP 404: Not Found`**: the chat reads the runtime's agents (`GET /api/v1/agents`) and talks to `default` when listed, else to the only agent on the agent's own transport; a runtime running several agents shows a second select to pick one, and one running none says so
- **An application's runtime is no longer listed among the runtimes to pick**: it answers only its application's routes, so it is talked to as that application or through one of its sessions

### Changed

- **Talking to your deployed applications is on by default**: `datalayer.agentChat.enabled` is contributed `true`, so the Agent Chat sidebar lists your deployed applications as soon as you sign in; turn the setting off to list none and ask Datalayer nothing about them
- **A session opened from the Sessions view is its own conversation** in the Datalayer Chat (agent-runtimes 1.5.68): read from its runtime by uid, with the thread's `⋯` menu — the chat's entries and the extension's _Reveal in Explorer_ and _Open in the Studio_ — drawn beside the header
- **A local session's approvals**: an _ask me first_ request of a coding agent on this machine is read over the local runtime's websocket, said as an editor notification and listed in the chat's banner; decided from either over the same websocket, the notification's decision allowed once the chat has shown it
- **The session's terminal is written as the command streams**, not when it ends; the Sessions view feeds the status bar, so a finished turn of a session the chat does not show is a notification
- The local runtime (`loop`) must be agent-runtimes 1.5.69 or later; plain `http://127.0.0.1` to a local runtime running on this machine is let through the chat's network bridge, and nothing else over plain http

## [0.1.0] - 2026-10-21

### Added

- **A coding agent in your folder**: `Datalayer: Start a coding agent here` starts Claude Code, Codex or another coding agent of the catalogue in the open folder on the local runtime, as the blank harness application or one of the folder's own Appspecs, and opens its session in the Datalayer Chat; your own `CLAUDE.md`/`AGENTS.md` is kept as it is and said — a coding agent whose own instructions file the folder already has reads yours, the application's written beside it under `.datalayer/` and handed to it with its first prompt (agent-runtimes 1.5.69); the open file reaches the agent only when it asks and the application lets it
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
