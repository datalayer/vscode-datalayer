# src/services/logging/ - Logging Infrastructure

Hierarchical logging with VS Code native LogOutputChannel integration.

## Files

- **loggerManager.ts** - Central logging manager providing hierarchical logging with VS Code native LogOutputChannel integration. Singleton pattern.
- **loggers.ts** - Service-specific loggers (ServiceLoggers) providing organized access to different logging channels in a hierarchical structure for easy debugging.
- **performanceLogger.ts** - Performance monitoring utilities providing automatic timing, memory tracking, and performance analysis.
- **datalayerClientLogger.ts** - Datalayer operation monitoring with correlation IDs and smart error handling for enhanced operation tracking.
