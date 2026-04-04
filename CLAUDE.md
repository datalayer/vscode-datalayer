# Datalayer VS Code Extension - Developer Context

**Last Updated**: April 2026

## Quick Start

```bash
npm install              # Auto-downloads zeromq binaries
npm run watch            # Watch mode for development
# Press F5 in VS Code to launch Extension Development Host

npm run compile          # Build (includes icon font generation)
npm run check            # Full suite: format + lint + type-check + README check
npm run docs             # Generate TypeDoc (0 warnings required)
npm run docs:coverage    # TypeDoc with strict validation
npm run check:spelling   # Spell check via cspell
npm run check:dead-code  # Dead code detection via knip
npm run vsix             # Create universal .vsix package
```

## Architecture Overview

- **Extension Context** (`src/`): Node.js 22 environment, handles auth, server communication, kernel management
- **Webview** (`webview/`): React 18 editors (Jupyter notebooks and Lexical documents) running in browser sandbox
- **Message Passing**: Structured messages via `postMessage` between extension and webview
- **Two Custom Editors**: `.ipynb` (Jupyter notebooks) and `.dlex` (Lexical rich text)
- **Three Kernel Types**: Remote (Datalayer platform), Local (ZMQ via Python extension), Pyodide (WebAssembly)

Every directory has a `README.md` documenting its files, exports, and patterns.

## Critical Rules

- **Node.js 22** required (matches VS Code 1.107+ Electron runtime). Use conda env `datalayer`.
- **No emojis** in code, comments, or documentation.
- **API field names**: Use `ingress` (not `jupyter_base_url`), `token` (not `jupyter_token`).
- **SmartDynamicControllerManager** is intentionally DISABLED (`null as unknown` in `uiSetup.ts`).
- **FormData** for notebook/lexical creation, JSON for other API endpoints.
- **NotebookActions** from `@jupyterlab/notebook` for cell manipulation (not commands or store methods).
- Use Datalayer client directly with handlers pattern (no wrapper services).

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
- 69 directories covered

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
