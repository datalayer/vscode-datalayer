# Datalayer VS Code Extension - Developer Context

**Last Updated**: April 2026

## Quick Start

```bash
npm install              # Auto-downloads zeromq binaries
npm run watch            # Watch mode for development
# Press F5 in VS Code to launch Extension Development Host

npm run compile          # Build (includes icon font generation)
npm run check            # Full suite: format + lint + type-check + docs (READMEs + TypeDoc) + spelling
npm run check:dead-code  # Dead code detection via knip (not in check due to pre-existing issues)
npm run vsix             # Create universal .vsix package
```

## Architecture Overview

- **Extension Context** (`src/`): Node.js 22 environment, handles auth, server communication, kernel management
- **Webview** (`webview/`): React 18 editors (Jupyter notebooks and Lexical documents) running in browser sandbox
- **Message Passing**: Structured messages via `postMessage` between extension and webview
- **Two Custom Editors**: `.ipynb` (Jupyter notebooks) and `.dlex` (Lexical rich text)
- **Three Kernel Types**: Remote (Datalayer platform), Local (ZMQ via Python extension), Pyodide (WebAssembly)
- **Sidebar Views** (registered in this order): Outline, Projects, Spaces, Runtimes, Settings

Every directory has a `README.md` documenting its files, exports, and patterns.

## Critical Rules

- **Node.js 22** required (matches VS Code 1.107+ Electron runtime). Use conda env `datalayer`.
- **No emojis** in code, comments, or documentation.
- **API field names**: Use `ingress` (not `jupyter_base_url`), `token` (not `jupyter_token`).
- **SmartDynamicControllerManager** is intentionally DISABLED (`null as unknown` in `uiSetup.ts`).
- **FormData** for notebook/lexical creation, JSON for other API endpoints.
- **NotebookActions** from `@jupyterlab/notebook` for cell manipulation (not commands or store methods).
- Use Datalayer client directly with handlers pattern (no wrapper services).

## TypeScript Strictness

- **`noUncheckedIndexedAccess: true`** - Array/object index access returns `T | undefined`. Use `!` assertion only when bounds are guaranteed (e.g., inside length-checked blocks or bounded loops). Prefer `?? defaultValue` or `if (x !== undefined)` checks.

## Settings Validation

- **`src/services/config/settingsValidator.ts`** - Centralized Zod validation for all VS Code settings. Validates URLs, numbers, enums with safe defaults on invalid input.
- Individual field errors are logged as warnings; valid fields in the same group are preserved.

## Bundle Analysis

- Run `npm run analyze` to generate interactive treemap reports in `dist/bundle-report-*.html`.
- Uses `webpack-bundle-analyzer` (only when `ANALYZE=true` env var is set).

## Code Quality Enforcement

All enforced at `error` level, blocking CI and pre-commit hooks.

### ESLint Rules (beyond JSDoc)

- **`@typescript-eslint/no-floating-promises`** (error) - Catches unhandled async calls.
- **`@typescript-eslint/no-unused-vars`** (error) - Dead vars with `_` prefix pattern for intentional ignores.
- **`@typescript-eslint/explicit-function-return-type`** (warn) - Missing return types on exports.
- **`simple-import-sort/imports`** + **`exports`** (error) - Auto-sorted imports.
- **`no-console`** (warn) - Use `ServiceLoggers` instead of `console.log` in `src/`. Webview files use `eslint-disable` where logger is unavailable.
- **`complexity`** (warn, max 20) - Flags overly complex functions.
- **`max-depth`** (warn, max 5) - Flags deep nesting.
- **`header/header`** (error) - MIT license header required on all source files.

### JSDoc Rules (`eslint-plugin-jsdoc`)

**Structure**: `require-jsdoc` (on exports, interfaces, types), `require-description`, `require-param`, `require-param-description`, `require-returns`, `require-returns-description`, `require-throws`.

**Validation**: `check-param-names`, `check-tag-names`, `no-types` (TypeScript handles types), `no-blank-blocks`, `informative-docs` (rejects name restating).

**Formatting**: `match-description` (uppercase start, period end), `sort-tags` (param -> returns -> throws -> see), `require-hyphen-before-param-description`.

**Disabled**: `require-example` (internal extension, not public API).

**Test exemptions**: `require-jsdoc`, `require-param`, `require-returns`, `require-throws`, `informative-docs`, `match-description` all off in test files.

Constructor `@param` for private params uses `checkConstructors: false` to avoid TypeDoc conflicts.

### JSDoc Style

```typescript
/**
 * Connects the webview document to a remote Datalayer runtime kernel.
 *
 * @param uri - The document URI identifying which webview to target.
 * @param runtime - The runtime configuration with ingress URL and auth token.
 * @returns The kernel connection ID for tracking.
 * @throws When no webview is registered for the given URI.
 */
```

### TypeDoc (`typedoc.json`)

- `treatWarningsAsErrors: true`
- `notDocumented: true`, `invalidLink: true`
- `requiredToBeDocumented`: Class, Function, Enum, Interface, TypeAlias, Variable, Method
- `excludePrivate: true`

### README.md per Directory

- Every directory under `src/`, `webview/`, `scripts/` must have a `README.md`
- Enforced by `scripts/check-readmes.sh` in `npm run check`
- 75 directories covered

### Pre-commit Hooks (Husky + lint-staged)

Runs automatically on `git commit`:

- `src/**/*.{ts,tsx}`, `webview/**/*.{ts,tsx}`: ESLint fix + Prettier
- `*.{json,css,md,yml}`: Prettier

### Commit Message Convention (commitlint)

Conventional commits encouraged (warns but does not block):

- Format: `type: subject` (e.g., `feat: add kernel selector`, `fix: resolve CORS error`)
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `bump`

### Spell Checking (cspell)

- Config: `cspell.json` with domain-specific dictionary (100+ words)
- Run: `npm run check:spelling`
- CI: Runs in Code Quality workflow

### Dead Code Detection (knip)

- Config: `knip.json`
- Run: `npm run check:dead-code`
- Finds unused exports, files, dependencies, and types

## Testing

### Test Suites

- **1,300+ total tests**: extension tests + webview tests
- **Extension tests**: Mocha TDD UI via `@vscode/test-cli`, running in VS Code Extension Host
- **Webview tests**: Vitest with jsdom environment
- **ESLint**: 0 errors, warnings are `no-console` only

### Commands

```bash
npm test                 # Run extension tests (extension tests)
npm run test:webview     # Run webview tests (webview tests)
npm run test:coverage    # Extension tests with coverage
```

### Coverage

- ~43% statements, ~89% branches, ~36% functions (extension only)
- Tracked via Codecov with dual flags (`extension` and `webview`)
- **Coverage exclusions**: `kernel/`, `pyodide/`, `commands/`, `ui/templates/`, `jupyter/`, `notebookProvider.js`, `lexicalProvider.js`

### Test Module Interception

`src/test/setup.js` stubs `@datalayer/core` and browser-only packages for the Node.js test runner. This is required because extension tests run in Node.js but some dependencies expect a browser environment.

### ESM Compatibility Fixes

- **`scripts/fix-css-imports.js`**: Strips CSS imports from `@primer/react` and fixes directory imports in `@datalayer/icons-react`. Runs automatically in `pretest`.
- **`sync:tools`**: Uses `node --import ./scripts/ignore-css-preload.mjs --import tsx` for Node 22 compatibility when running sync scripts.
- **`@datalayer/core` Node entry point**: `src/node.ts` provides a Node.js-safe entry point (no React components) for use in the extension host context.

## CI/CD Workflows (`.github/workflows/`)

1. **Code Quality**: Format, lint, type-check, README check, TypeDoc validation, spell check
2. **Extension Build & Test**: Multi-platform .vsix generation
3. **Documentation**: TypeDoc generation + coverage validation + Netlify deployment

## Key Patterns

### MutableServiceManager (Runtime Hot-Swapping)

Wraps JupyterLab ServiceManager with a Proxy so the reference stays stable across runtime switches. React components never re-render when switching kernels. See `webview/services/mutableServiceManager.ts`.

### KernelBridge (Kernel Routing)

Routes kernel connections by type: remote (sends URL to webview), local (spawns ZMQ client), Pyodide (pseudo-runtime `http://pyodide-local`). Message flow: `kernel-starting` (spinner) -> `kernel-selected` (connect).

### ServiceManagerFactory

Discriminated union factory: `mock` | `local` | `remote` | `pyodide`. Type-safe creation with `ServiceManagerFactory.create({ type: 'remote', url, token })`.

### BaseKernelManager / BaseSessionManager

Template Method pattern eliminating duplicate code across mock/local/remote/pyodide implementations. Subclasses only implement `startNew()`.

## Authentication & Credential Storage

Credentials live in the OS keyring (macOS Keychain / Windows Credential Vault / Linux libsecret), keyed by the IAM service URL. This is the same place the Datalayer CLI writes them, so `dla login` and an in-extension login share state.

- Implementation: `@datalayer/core`'s `NodeStorage` loads `@github/keytar` via `module.createRequire(__filename)` and writes `access_token` under `serviceUrl`.
- Why `@github/keytar` (not upstream `keytar`): its npm tarball ships **prebuilt native bindings for every platform**, so a single multi-platform VSIX works everywhere with no per-OS rebuild step.
- Webpack must keep `__filename` real: `webpack.config.js` sets `node: { __filename: false, __dirname: false }`. Without that, `createRequire(__filename)` would resolve relative to webpack's mock `/index.js` and fail to find `node_modules/@github/keytar`.
- Distribution: `scripts/copy-external-deps.js` copies the package (with all `prebuilds/`) into `dist/node_modules/`, and `.vscodeignore` allow-lists `!node_modules/@github/keytar/**`.
- **Do not** pass a custom `storage` option to `DatalayerClient` in extension code (e.g. `vscode.SecretStorage`). It would scope credentials to the extension and break CLI/extension credential sharing.

## Agent Chat Sidebar

The Agent Chat webview (`webview/agentChat/`) is a sidebar `WebviewView` that renders `@datalayer/agent-runtimes`'s `<Chat>` component against a Datalayer SAAS runtime.

### Editor-title focus icon

The `editor/title` toolbar icon (`datalayer.agentChat.focus` in [src/commands/agentChat.ts](src/commands/agentChat.ts)) reveals the chat panel using the same two-step pattern as the OpenAI Codex extension: first execute `workbench.view.extension.<containerId>` to open the activity-bar container, then `<viewId>.focus` to reveal the inner view. Calling only the container command "succeeds" but does not visibly focus a webview when the inner view is collapsed. The package.json menu entry uses bare `"group": "navigation"` (no order suffix, no `when`) so the icon clusters next to other AI-chat icons (Codex, Claude).

### Two-layer bridge architecture

The webview cannot reach `r1.datalayer.run` directly (CORS from `vscode-webview://`) and does not hold the user's auth token. Two separate bridges route traffic through the extension host:

1. **Typed SDK bridge** ([src/bridges/agentChatBridge.ts](src/bridges/agentChatBridge.ts)) - `BridgeAgentRuntimesClient` in the webview implements the 22-method `IAgentRuntimesClient` interface by posting typed `request` envelopes. `AgentChatBridgeHandler` in the extension host dispatches them to `SdkAgentRuntimesClient` using the shared `DatalayerClient` + `AgentsMixin` (keyring auth). Used for control-plane operations: `listRunningAgents`, `createAgentRuntime`, `listNotifications`, `listEvents`, `getAgentOutputs`, `runEvals`, `getContextUsage`, `getCostUsage`, etc. Chat/runtime endpoints (config, sandbox status, context snapshot, skills, MCP status, history, tool approvals) are intentionally NOT on the typed bridge — they are tunneled through the raw network bridge instead.
2. **Raw network bridge** ([src/bridges/agentChatNetworkBridge.ts](src/bridges/agentChatNetworkBridge.ts)) - [webview/agentChat/networkBridge.ts](webview/agentChat/networkBridge.ts) installs global `window.fetch` and `window.WebSocket` overrides BEFORE any other webview code loads. Every direct HTTP/WS call made by `agent-runtimes` internals (VercelAIAdapter chat streaming, protocol adapters, hooks) is transparently tunneled through `postMessage`. The extension host (Node 22 `fetch` + `ws`) opens the real connection and relays SSE chunks / WebSocket frames back to the webview. Supports streaming (Response body is a live `ReadableStream`).

### Runtime ingress rewriting

The platform's `listRuntimes()` returns an ingress URL like `https://r1.datalayer.run/jupyter/server/ai-agents-pool/{pod}` that points at the Jupyter server on that pod. The agent-runtimes REST API and vercel-ai streaming endpoints actually live on a sibling path: `https://r1.datalayer.run/agent-runtimes/ai-agents-pool/{pod}`. `AgentChatViewProvider.refreshAgents()` rewrites `/jupyter/server/` → `/agent-runtimes/` before handing the handle to the webview. Without this rewrite every API call returns the Jupyter server's 404 HTML page and the SDK fails to parse it as JSON.

### Agent ID vs pod name

For the `vercel-ai` protocol, `<Chat>` builds `POST {ingress}/api/v1/vercel-ai/{agentId}`. The correct `agentId` is the agent name within the pod (typically `"default"`), not the Kubernetes pod name. `App.tsx` passes `agentId="default"` and routes the pod name through `runtimeId` for tracking. Default `datalayer.agentChat.protocol` setting is `vercel-ai`.

### Primer `ThemeProvider` is required

`<Chat>` includes `ActionMenu` dropdowns that render into portals and read theme tokens from React context. The webview must wrap the tree with `<ThemeProvider colorMode={...}>` + `<BaseStyles>` or clicking the Model/Tools buttons throws "Cannot read properties of undefined (reading 'theme')". See `App` → `AppInner` split in [webview/agentChat/App.tsx](webview/agentChat/App.tsx).

### Build gotchas

- `webpack.config.js` for `agentChatWebviewConfig` MUST keep `splitChunks: { chunks: "async" }` so the main `agentChat.js` entry bundle is emitted. Setting `splitChunks: false` makes webpack emit only the async chunks, which looks OK on `ls` but leaves the entry bundle missing → VS Code 404s on webview load.
- `npm run watch` intentionally does not run `clean:dist` first — clean-then-watch produces a several-second window where `dist/agentChat.js` does not exist, during which F5 fails with ENOENT in the webview.

## Projects Feature

### Sidebar View

- `ProjectsTreeProvider` (`src/providers/projectsTreeProvider.ts`) - Tree data provider for the `datalayerProjects` view
- `ProjectTreeItem` (`src/models/projectTreeItem.ts`) - Tree item representing a project with nested notebooks/documents
- `ProjectsTreeItem` (`src/models/projectsTreeItem.ts`) - Root-level tree item

### Commands (`src/commands/projects.ts`)

- `datalayer.projects.refresh` - Refresh the projects tree
- `datalayer.projects.create` - Create a new project
- `datalayer.projects.rename` - Rename a project
- `datalayer.projects.assignAgent` / `unassignAgent` - Manage AI agent assignments
- `datalayer.projects.viewDetails` - View project details

### Context Values

- `project-{id}-noAgent` / `project-{id}-withAgent` - Controls context menu visibility for agent assign/unassign
- `notebook` / `document` - Child items within projects (open/rename actions)

## API Endpoints

- **Spacer**: `/api/spacer/v1/spaces/users/me`, `/api/spacer/v1/notebooks`, `/api/spacer/v1/lexicals`
- **Runtimes**: `/api/runtimes/v1/runtimes` (GET list, POST create)
- Runtime URL field: `ingress`. Token field: `token`. Single runtime: `kernel` field.

## Troubleshooting

- **Icons not showing**: Check codicon font loading
- **Theme mismatch**: Verify VSCodeThemeProvider is active
- **Kernel not connecting**: Check KernelBridge webview registration
- **Notebook re-renders on runtime switch**: Use MutableServiceManager (don't change React keys)
- **Cell operations failing**: Use `NotebookActions` from `@jupyterlab/notebook`, not commands/store

## Known Limitations

- Smart Controller: Disabled (native notebook controller needs improvement)
- WebSocket Protocol: Uses older Jupyter protocol due to serialization constraints

<!-- Last Updated: April 2026 -->
