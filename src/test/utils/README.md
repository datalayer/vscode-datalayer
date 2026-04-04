# src/test/utils/ - Test Infrastructure

Factory functions and helpers for creating test doubles.

## Files

- **mockFactory.ts** - Factory functions for creating type-safe test doubles of VS Code APIs and Datalayer components with pre-configured sensible defaults (`createMockExtensionContext`, `createMockDatalayer`, etc.).
- **testHelpers.ts** - Common test utilities including `assertRejects()` and `assertResolves()` for promise assertion patterns with error message validation.
