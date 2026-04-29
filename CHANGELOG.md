# Change Log

All notable changes to the Datalayer VS Code extension are documented here.

## [Unreleased]

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
