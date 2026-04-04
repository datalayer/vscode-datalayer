# src/tools/ - MCP Tool Infrastructure

Tool infrastructure for GitHub Copilot integration via VS Code's Language Model Tools API. Provides 20 tools for programmatic notebook and lexical document manipulation.

## Subdirectories

- **core/** - Tool registration, execution routing, and VS Code adapter
- **definitions/** - Tool definition objects (name, description, parameters)
- **schemas/** - Zod validation schemas for tool parameters
- **operations/** - Tool operation implementations (business logic)
- **utils/** - Shared utilities (Python detection, runtime execution, document creation helpers)
