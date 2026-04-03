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
