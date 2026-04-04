# src/ - Extension Source Code (Node.js Context)

This is the main extension source code directory, running in the Node.js extension host context. It handles authentication, server communication, kernel management, and webview orchestration.

## Files

- **extension.ts** - Main entry point and orchestrator for the entire extension. Exports `activate()`, `deactivate()`, and accessor functions (`getServiceContainer()`, `getOutlineTreeProvider()`, `getRuntimesTreeProvider()`, `getSettingsTreeProvider()`, `getLSPBridge()`). The activation function runs a 38-step initialization sequence:
  1. Steps 1-4: Create service container with performance timer
  2. Steps 5-9: Initialize core services (logging, auth, Datalayer client)
  3. Steps 10-13: Register filesystem provider (`datalayer://` scheme) and LSP infrastructure (cell completion/hover for Python/Markdown)
  4. Steps 14-19: Setup auth state management, register all commands, store auth provider globally, register Jupyter Server Collection (adds "Datalayer" to native kernel picker)
  5. Steps 20-25: Register embedded MCP tools for Copilot, proactively activate Python extension (fire-and-forget), initialize Pyodide preloader
  6. Steps 26-33: Preload native notebook packages, register chat context providers and @datalayer chat participant
  7. Steps 34-38: Setup notebook event handlers, show onboarding welcome, notify extension ready

  Uses error handling with nested try-catch per step and performance logging at each checkpoint. Non-blocking operations (Python activation, package preload) run fire-and-forget.

- **preload.ts** - Critical pre-initialization module and the actual webpack entry point. Preloads essential Node.js modules (`os`, `prebuild-install`, `ws`) using CommonJS into the require cache before the main extension code executes. This prevents runtime errors from native modules like cmake-ts that call `os.platform()` before the module system has fully initialized.

## Subdirectories

- **commands/** - VS Code command handlers (thin layer delegating to services)
- **chat/** - Copilot Chat integration (context providers, chat participants)
- **config/** - Centralized configuration (LLM model selection strategies)
- **constants/** - Shared constants (kernel URL identifiers)
- **jupyter/** - Jupyter Extension API integration (server provider for native kernel picker)
- **kernel/** - Kernel communication clients (WebSocket for remote, Pyodide for WASM)
- **models/** - Data models for tree views and custom editor documents
- **onboarding/** - First-run welcome experience (sidebar pin, activity bar)
- **providers/** - VS Code API implementations (custom editors, tree views, filesystem, outline)
- **services/** - Core business logic organized by domain (auth, bridges, kernels, logging, etc.)
- **tools/** - MCP tool infrastructure for Copilot integration (20 tools)
- **types/** - TypeScript type definitions, declaration files, custom errors
- **ui/** - UI components (dialogs, selectors, HTML templates, theme CSS)
- **utils/** - Shared utility functions (dispose, security, document detection)
- **test/** - Test suites (34 tests, 100% pass)
