# scripts/ - Build and Maintenance Scripts

Node.js scripts for building, packaging, validating, and syncing the extension. Run via npm scripts defined in package.json.

## Files

- **build-icons.js** - Converts SVG icons from `resources/icons/` into a WOFF font file with deterministic timestamps. Generates unicode mappings and JSON metadata for custom icon fonts. Runs automatically during `npm run compile`. Toolchain: SVG -> svgicons2svgfont -> svg2ttf -> ttf2woff -> WOFF.
- **copy-pyodide.js** - Copies 14 essential Pyodide runtime files (WASM, JavaScript, stdlib) to `dist/node_modules/` for VSIX packaging. Excludes `.whl` Python packages (~63MB saved) which are downloaded on-demand at runtime.
- **copy-external-deps.js** - Copies external npm dependencies (React, Lexical, `@github/keytar`, etc.) from `node_modules/` to `dist/node_modules/` for VSIX packaging. Extensively filters out unnecessary files (tests, examples, source maps) to reduce bundle size. `@github/keytar` ships its own multi-platform prebuilds in the npm tarball, so the entire package is copied as-is for cross-platform VSIX support.
- **copyZmqBinaries.js** - Copies ZeroMQ native module binaries and related dependencies (zeromq, cmake-ts, ws) to `dist/node_modules/` for VSIX packaging across all platforms.
- **downloadZmqBinaries.js** - Downloads platform-specific ZeroMQ native binaries using Microsoft's `@vscode/zeromq` package, avoiding the need for Node.js native compilation.
- **sync-package-json.ts** - Syncs 20 tool definitions from TypeScript sources (`@datalayer/jupyter-react`, `@datalayer/jupyter-lexical`, and VS Code-specific tools) into `package.json`'s `languageModelTools` contributions field. Source of truth for Copilot tool registration.
- **validate-pyodide-version.js** - Auto-syncs Pyodide version strings across multiple TypeScript files and package.json config. Ensures the installed npm package version stays consistent with hardcoded version references throughout the codebase.
- **validate-tool-schemas.js** - Validation script that reads `languageModelTools` from package.json and checks for missing expected tool definitions. Used in CI to catch schema drift.
- **optimize-primer.js** - Removes duplicate build artifacts (`lib-esm/` and `dist/` directories) from `@primer/react` after copying, keeping only the CommonJS `lib/` version needed by webpack.
- **ignore-css.js** - Node.js module hook that stubs out CSS imports and browser-only APIs (via jsdom) to allow tool schema extraction scripts to run in pure Node.js environments.
- **test-vsix-activation.js** - Automated test that installs a VSIX into VS Code and verifies the extension activates without errors by launching the Extension Development Host.
