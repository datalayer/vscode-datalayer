# src/services/autoConnect/strategies/ - Auto-Connect Strategies

Individual strategy implementations for the auto-connect service.

## Files

- **activeRuntimeStrategy.ts** - Returns the runtime with the most remaining time from cached runtimes, filtering expired ones to maximize session duration.
- **askUserStrategy.ts** - Shows a Quick Pick dialog for users to manually select a runtime when auto-connect is configured to ask.
- **pyodideStrategy.ts** - Returns null to indicate browser-based Pyodide Python kernel should be used. Always available, requires no external dependencies.
