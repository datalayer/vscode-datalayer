# src/test/services/ - Service Module Tests

Tests for core services.

## Files

- **loggers.test.ts** - Tests ServiceLoggers initialization, access patterns, lazy initialization error handling, and logger state management.
- **environmentCache.test.ts** - Tests EnvironmentCache singleton pattern, caching behavior, force-refresh, and error handling for environment data retrieval.
- **datalayerClientLogger.test.ts** - Tests DatalayerClientOperationTracker static utility methods including sanitizeArgs, summarizeResult, and error classification.
- **datalayerClientLogger.extended.test.ts** - Extended tests for handler lifecycle (beforeCall/afterCall/onError), operation tracking, and stats management.
