# src/services/interfaces/ - Service Contracts

TypeScript interfaces defining contracts for all services, enabling dependency injection and testability.

## Files

- **IAuthProvider.ts** - Contract for authentication state management and operations for Datalayer platform integration.
- **IDocumentBridge.ts** - Contract for managing document lifecycle including downloading, caching, and runtime association.
- **IKernelBridge.ts** - Contract for routing kernel connections that detects notebook type and connects kernels accordingly.
- **IErrorHandler.ts** - Contract for centralized error management with notifications and logging.
- **ILogger.ts** - Logger interface for structured logging throughout the extension.
- **ILoggerManager.ts** - Logger manager interface for centralized logging management and logger creation/configuration.
