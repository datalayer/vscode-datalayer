# src/test/ - Test Suites

Extension test suites running in the VS Code Extension Development Host.

## Files

- **setup.ts** - Configures test environment to handle CSS imports from ES modules like @primer/react by intercepting `require()` calls.
- **extension.test.ts** - Minimal test verifying VS Code test framework is working with basic infrastructure validation.

## Subdirectories

- **fixtures/** - Test fixture files (workspace data)
- **utils/** - Test infrastructure (mock factories, test helpers)
- **utils-tests/** - Tests for utility modules (dispose, webview security)
- **services/** - Tests for service modules (loggers, environment cache)
- **sessions/** - _Start a coding agent here_ (VS-06) against the stub `loop` (`fixtures/stub-loop`), CI only
- **apps/** - _Try this application_ (VS-11) against the stub `loop`, CI only
- **vitest/** - The pure modules (`src/chat/*.ts`, `src/services/localRuntime/*.ts`) under vitest's `pure` project: the local check
