# Testing Guide

This document describes the testing strategy and how to write tests for the Datalayer VS Code extension.

## Overview

The extension uses:

- **Mocha** for test framework (required by VS Code)
- **@vscode/test-cli** for running tests in VS Code Extension Host environment
- **Custom mocks** for VS Code APIs and SDK (no jest/sinon needed)

## Running Tests

```bash
# Run all tests (41 tests in ~60ms)
npm test

# Compile tests only
npm run compile-tests

# Watch mode for test compilation
npm run watch-tests

# Run specific test file
npm test -- --grep "authProvider"

# Run with pretest (compile + lint)
npm run pretest && npm test
```

**Note:** Code coverage is not available for VS Code extensions because tests run in a separate Extension Host process that coverage tools cannot instrument. Test quality is measured by test count and thoroughness, not coverage metrics.

## Test Structure

```
src/test/
├── utils/
│   ├── mockFactory.ts      # Mock creators for VS Code & SDK
│   └── testHelpers.ts      # Common test utilities
├── services/
│   └── authProvider.test.ts  # Service layer tests
├── providers/               # Provider tests (coming soon)
├── utils/                   # Utility function tests (coming soon)
├── fixtures/                # Test workspace files
└── extension.test.ts        # Main extension tests
```

## Type Safety in Tests

### Mock Type Interfaces

The test infrastructure uses strongly-typed mocks to ensure type safety:

- **MockSDK**: Typed interface for Datalayer SDK with 24+ spy methods
- **MockLogger**: Extends `ILogger` interface for type-safe logging mocks
- **MockSpyFunction**: Type-safe spy function with call tracking

### Using Typed Mocks

```typescript
import { createMockSDK, createMockLogger } from "../utils/mockFactory";
import type { DatalayerClient } from "../../../../core/lib/client";
import type { ILogger } from "../../services/interfaces/ILogger";

suite("My Feature Tests", () => {
  let mockSDK: ReturnType<typeof createMockSDK>;
  let mockLogger: ILogger;

  setup(() => {
    mockSDK = createMockSDK();
    mockLogger = createMockLogger();
  });

  test("should work with typed mocks", async () => {
    // Type-safe mock configuration
    mockSDK.iam.getIdentity.mockResolvedValue({ uid: "test" });

    // Pass to functions requiring specific types
    const result = await myFunction(
      mockSDK as unknown as DatalayerClient,
      mockLogger,
    );

    // Type-safe assertions
    assert.strictEqual(mockSDK.iam.getIdentity.calls.length, 1);
  });
});
```

### Type Assertions

When interfacing with VS Code APIs or SDK types:

```typescript
// Use double assertion for complex type conversions
const authProvider = new SDKAuthProvider(
  mockSDK as unknown as DatalayerClient, // Cast to expected type
  mockContext,
  mockLogger, // Already typed as ILogger
);
```

### Avoiding `any` Types

All test code uses `unknown` instead of `any`:

- ✅ `unknown` requires type narrowing - safer
- ❌ `any` bypasses type checking - dangerous
- Use `eslint-disable-next-line @typescript-eslint/no-explicit-any` only for intentional access to private/singleton members

```typescript
// ❌ Bad - bypasses type checking
let mockSDK: any = createMockSDK();

// ✅ Good - type-safe
let mockSDK: ReturnType<typeof createMockSDK> = createMockSDK();
```

## Writing Tests

### Basic Test Structure

```typescript
import * as assert from "assert";
import {
  createMockExtensionContext,
  createMockSDK,
  createMockLogger,
} from "../utils/mockFactory";
import { assertResolves, waitUntil } from "../utils/testHelpers";
import type { DatalayerClient } from "../../../../core/lib/client";

suite("My Feature Tests", () => {
  let mockContext: ReturnType<typeof createMockExtensionContext>;
  let mockSDK: ReturnType<typeof createMockSDK>;

  setup(() => {
    // Runs before each test
    mockContext = createMockExtensionContext();
    mockSDK = createMockSDK();
  });

  teardown(() => {
    // Runs after each test
    // Clean up resources
  });

  test("should do something", async () => {
    // Arrange
    const input = "test-input";

    // Act
    const result = await myFunction(input);

    // Assert
    assert.strictEqual(result, "expected-output");
  });
});
```

### Using Mock Factory

The `mockFactory.ts` provides pre-configured mocks:

```typescript
import {
  createMockExtensionContext,
  createMockSDK,
  createMockLogger,
  createMockUser,
  createMockRuntime,
  createMockOutputChannel,
  createMockSecretStorage,
  createMockStatusBarItem,
} from "../utils/mockFactory";

// Create mock VS Code extension context
const context = createMockExtensionContext();

// Create mock SDK with spy functions
const sdk = createMockSDK();
sdk.iam.getIdentity.mockResolvedValue(createMockUser());

// Create mock logger (typed as ILogger)
const logger = createMockLogger();

// Create mock runtime
const runtime = createMockRuntime({
  givenName: "Custom Runtime",
  environmentName: "ai-env",
});
```

### Using Test Helpers

The `testHelpers.ts` provides assertion and utility functions:

```typescript
import {
  assertRejects,
  assertResolves,
  waitUntil,
  EventCapture,
  generateMockJWT,
  sleep,
} from "../utils/testHelpers";

// Assert that async function rejects
await assertRejects(() => myFunction("invalid"), "Expected error message");

// Assert that async function resolves
const result = await assertResolves(() => myFunction("valid"));

// Wait for condition
await waitUntil(() => someValue === true, { timeout: 1000 });

// Capture events
const capture = new EventCapture(myEmitter.event);
// ... trigger events ...
assert.strictEqual(capture.count, 2);
assert.strictEqual(capture.last.data, "expected");
capture.dispose();

// Generate mock JWT
const token = generateMockJWT({ sub: "user-123" });
```

### Testing Authentication

Example from `authProvider.test.ts`:

```typescript
test("login() succeeds with valid code exchange", async () => {
  const mockToken = generateMockJWT();
  const mockUser = createMockUser();

  // Mock SDK response
  mockSDK.iam.exchangeCodeForToken.mockResolvedValue({
    token: mockToken,
    user: mockUser,
  });

  // Capture state change events
  const eventCapture = new EventCapture(authProvider.onAuthStateChanged);

  // Perform login
  await assertResolves(() => authProvider.login("test-code"));

  // Verify state
  const state = authProvider.getAuthState();
  assert.strictEqual(state.isAuthenticated, true);
  assert.deepStrictEqual(state.user, mockUser);

  // Verify event emitted
  assert.strictEqual(eventCapture.count, 1);
  assert.strictEqual(eventCapture.last?.isAuthenticated, true);

  eventCapture.dispose();
});
```

## Best Practices

### 1. Isolate Tests

Each test should be independent:

```typescript
setup(() => {
  // Reset state before each test
  mockContext = createMockExtensionContext();
  mockSDK = createMockSDK();
});

teardown(() => {
  // Clean up after each test
  // Dispose of resources, clear singletons
});
```

### 2. Use Descriptive Names

```typescript
// ❌ Bad
test("test1", () => {});

// ✅ Good
test("login() succeeds with valid authorization code", () => {});
test("logout() clears authentication state and token storage", () => {});
```

### 3. Follow AAA Pattern

```typescript
test("should calculate total", () => {
  // Arrange - Set up test data
  const items = [1, 2, 3];

  // Act - Perform the operation
  const result = calculateTotal(items);

  // Assert - Verify the result
  assert.strictEqual(result, 6);
});
```

### 4. Test Error Cases

```typescript
test("handles network errors gracefully", async () => {
  mockSDK.iam.getIdentity.mockRejectedValue(
    new Error("Network request failed"),
  );

  await assertRejects(
    () => authProvider.initialize(),
    "Network request failed",
  );
});
```

### 5. Use Async/Await

```typescript
// ❌ Bad
test("async test", (done) => {
  myAsyncFunction().then((result) => {
    assert.strictEqual(result, "expected");
    done();
  });
});

// ✅ Good
test("async test", async () => {
  const result = await myAsyncFunction();
  assert.strictEqual(result, "expected");
});
```

### 6. Mock External Dependencies

```typescript
test("uses SDK correctly", async () => {
  const mockUser = createMockUser();
  mockSDK.iam.getIdentity.mockResolvedValue(mockUser);

  const result = await myService.getCurrentUser();

  // Verify SDK was called correctly
  expect(mockSDK.iam.getIdentity).toHaveBeenCalledTimes(1);
  assert.deepStrictEqual(result, mockUser);
});
```

## Test Quality Metrics

**Current Status:** 41/41 tests passing (100%)

### Quality Validation

- ✅ **Type Safety**: Zero type-check errors in test code
- ✅ **Lint Compliance**: Zero ESLint warnings
- ✅ **Strong Typing**: All mocks use proper TypeScript interfaces
- ✅ **Test Success**: 100% pass rate (~60ms execution time)

### Focus Areas

- **Test coverage breadth** - Test all critical paths
- **Edge cases** - Test error handling, timeouts, empty states
- **Integration points** - Test SDK calls, VS Code API interactions
- **Type safety** - All mocks properly typed, no `any` usage
- **Maintainability** - Clear test names, well-organized suites

## Debugging Tests

### In VS Code

1. Set breakpoints in test files
2. Open "Run and Debug" panel (Cmd+Shift+D)
3. Select "Extension Tests" configuration
4. Press F5 to start debugging

### Console Logging

```typescript
test("debug test", async () => {
  console.log("Debug info:", someValue);
  const result = await myFunction();
  console.log("Result:", result);
  assert.ok(result);
});
```

## Common Patterns

### Testing Event Emissions

```typescript
test("emits event on state change", async () => {
  const capture = new EventCapture(provider.onDidChange);

  await provider.updateState("new-value");

  await waitUntil(() => capture.count > 0);
  assert.strictEqual(capture.last.value, "new-value");

  capture.dispose();
});
```

### Testing Async Operations

```typescript
test("waits for async operation", async () => {
  const promise = myAsyncOperation();

  await waitUntil(() => isComplete(), { timeout: 2000 });

  const result = await promise;
  assert.ok(result);
});
```

### Testing State Management

```typescript
test("maintains consistent state", async () => {
  const initialState = service.getState();
  assert.strictEqual(initialState.value, null);

  await service.update("new-value");

  const updatedState = service.getState();
  assert.strictEqual(updatedState.value, "new-value");
});
```

## CI/CD Integration

Tests run automatically on:

- Every push to main branch
- Every pull request
- All three platforms: Ubuntu, Windows, macOS

See `.github/workflows/test.yml` for configuration.

## Troubleshooting

### Tests Hang

- Check for missing `await` on async operations
- Ensure event listeners are disposed
- Use timeout option: `test('name', async () => { }).timeout(5000);`

### Mock Issues

- Verify mock is configured before test runs
- Reset mocks in `setup()` or `teardown()`
- Check that mock methods return promises for async operations

### VS Code API Errors

- Ensure proper VS Code types are installed
- Check that Extension Development Host is running
- Verify test workspace exists: `src/test/fixtures/`

## Next Steps

As the test suite grows, we'll add:

- Integration tests for providers
- End-to-end workflow tests
- Performance benchmarks
- Visual regression tests for webviews

## Resources

- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Mocha Documentation](https://mochajs.org/)
- [Node Assert API](https://nodejs.org/api/assert.html)
