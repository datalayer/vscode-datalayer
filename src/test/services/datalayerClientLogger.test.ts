/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for DatalayerClientOperationTracker static utility methods.
 * Covers sanitizeArgs, summarizeResult, isNetworkError, isAuthError,
 * isRateLimitError, isServerError, and operation stats management.
 */

import * as assert from "assert";

import { DatalayerClientOperationTracker } from "../../services/logging/datalayerClientLogger";

suite("DatalayerClientOperationTracker Tests", () => {
  // Use type assertion to access private static methods for testing
  const Tracker = DatalayerClientOperationTracker as unknown as Record<
    string,
    Function
  >;

  setup(() => {
    DatalayerClientOperationTracker.clearOperations();
  });

  suite("sanitizeArgs", () => {
    test("returns empty array for empty input", () => {
      const result = Tracker.sanitizeArgs([]);
      assert.deepStrictEqual(result, []);
    });

    test("passes through numbers unchanged", () => {
      const result = Tracker.sanitizeArgs([42, 3.14]);
      assert.deepStrictEqual(result, [42, 3.14]);
    });

    test("passes through short strings unchanged", () => {
      const result = Tracker.sanitizeArgs(["hello", "world"]);
      assert.deepStrictEqual(result, ["hello", "world"]);
    });

    test("redacts JWT-like strings starting with eyJ", () => {
      const result = Tracker.sanitizeArgs(["eyJhbGciOiJSUzI1NiJ9.payload"]);
      assert.deepStrictEqual(result, ["[TOKEN_REDACTED]"]);
    });

    test("redacts strings containing Bearer", () => {
      const result = Tracker.sanitizeArgs(["Bearer eyJtoken123"]);
      assert.deepStrictEqual(result, ["[TOKEN_REDACTED]"]);
    });

    test("redacts strings longer than 50 characters", () => {
      const longString = "a".repeat(51);
      const result = Tracker.sanitizeArgs([longString]);
      assert.deepStrictEqual(result, ["[TOKEN_REDACTED]"]);
    });

    test("does not redact strings of exactly 50 characters", () => {
      const exactString = "a".repeat(50);
      const result = Tracker.sanitizeArgs([exactString]);
      assert.deepStrictEqual(result, [exactString]);
    });

    test("redacts token field in objects", () => {
      const result = Tracker.sanitizeArgs([{ token: "secret-token-value" }]);
      assert.deepStrictEqual(result, [{ token: "[REDACTED]" }]);
    });

    test("redacts password field in objects", () => {
      const result = Tracker.sanitizeArgs([{ password: "secret123" }]);
      assert.deepStrictEqual(result, [{ password: "[REDACTED]" }]);
    });

    test("redacts secret field in objects", () => {
      const result = Tracker.sanitizeArgs([{ secret: "my-secret" }]);
      assert.deepStrictEqual(result, [{ secret: "[REDACTED]" }]);
    });

    test("redacts key field in objects", () => {
      const result = Tracker.sanitizeArgs([{ key: "api-key-123" }]);
      assert.deepStrictEqual(result, [{ key: "[REDACTED]" }]);
    });

    test("redacts authorization field in objects", () => {
      const result = Tracker.sanitizeArgs([
        { authorization: "Bearer token123" },
      ]);
      assert.deepStrictEqual(result, [{ authorization: "[REDACTED]" }]);
    });

    test("preserves non-sensitive fields in objects", () => {
      const result = Tracker.sanitizeArgs([
        { name: "test", id: 123, token: "secret" },
      ]);
      const sanitized = result[0] as Record<string, unknown>;
      assert.strictEqual(sanitized.name, "test");
      assert.strictEqual(sanitized.id, 123);
      assert.strictEqual(sanitized.token, "[REDACTED]");
    });

    test("passes through booleans unchanged", () => {
      const result = Tracker.sanitizeArgs([true, false]);
      assert.deepStrictEqual(result, [true, false]);
    });

    test("passes through null and undefined", () => {
      const result = Tracker.sanitizeArgs([null, undefined]);
      assert.deepStrictEqual(result, [null, undefined]);
    });
  });

  suite("summarizeResult", () => {
    test("returns 'null/undefined' for null", () => {
      const result = Tracker.summarizeResult(null);
      assert.strictEqual(result, "null/undefined");
    });

    test("returns 'null/undefined' for undefined", () => {
      const result = Tracker.summarizeResult(undefined);
      assert.strictEqual(result, "null/undefined");
    });

    test("returns array length for arrays", () => {
      const result = Tracker.summarizeResult([1, 2, 3]);
      assert.strictEqual(result, "array[3]");
    });

    test("returns array[0] for empty arrays", () => {
      const result = Tracker.summarizeResult([]);
      assert.strictEqual(result, "array[0]");
    });

    test("returns object keys for objects with 3 or fewer keys", () => {
      const result = Tracker.summarizeResult({ a: 1, b: 2 });
      assert.strictEqual(result, "object{a, b}");
    });

    test("returns truncated keys for objects with more than 3 keys", () => {
      const result = Tracker.summarizeResult({ a: 1, b: 2, c: 3, d: 4 });
      assert.strictEqual(result, "object{a, b, c...}");
    });

    test("returns typeof for primitives", () => {
      assert.strictEqual(Tracker.summarizeResult(42), "number");
      assert.strictEqual(Tracker.summarizeResult("hello"), "string");
      assert.strictEqual(Tracker.summarizeResult(true), "boolean");
    });
  });

  suite("isNetworkError", () => {
    test("returns false for null", () => {
      const result = Tracker.isNetworkError(null);
      assert.strictEqual(result, false);
    });

    test("returns false for undefined", () => {
      const result = Tracker.isNetworkError(undefined);
      assert.strictEqual(result, false);
    });

    test("detects fetch errors", () => {
      const result = Tracker.isNetworkError({ message: "Failed to fetch" });
      assert.strictEqual(result, true);
    });

    test("detects network errors", () => {
      const result = Tracker.isNetworkError({ message: "network error" });
      assert.strictEqual(result, true);
    });

    test("detects timeout errors", () => {
      const result = Tracker.isNetworkError({ message: "Request timeout" });
      assert.strictEqual(result, true);
    });

    test("detects connection errors", () => {
      const result = Tracker.isNetworkError({ message: "connection refused" });
      assert.strictEqual(result, true);
    });

    test("detects ENOTFOUND errors", () => {
      const result = Tracker.isNetworkError({
        message: "getaddrinfo ENOTFOUND api.datalayer.io",
      });
      assert.strictEqual(result, true);
    });

    test("detects ECONNREFUSED errors", () => {
      const result = Tracker.isNetworkError({
        message: "connect ECONNREFUSED 127.0.0.1:8080",
      });
      assert.strictEqual(result, true);
    });

    test("detects NETWORK_ERROR code", () => {
      const result = Tracker.isNetworkError({
        code: "NETWORK_ERROR",
        message: "",
      });
      assert.strictEqual(result, true);
    });

    test("returns false for non-network errors", () => {
      const result = Tracker.isNetworkError({
        message: "Something else went wrong",
      });
      assert.strictEqual(result, false);
    });

    test("returns false for errors without message", () => {
      const result = Tracker.isNetworkError({});
      assert.strictEqual(result, false);
    });
  });

  suite("isAuthError", () => {
    test("detects 'not authenticated' message", () => {
      const result = Tracker.isAuthError("not authenticated");
      assert.strictEqual(result, true);
    });

    test("detects '401' message", () => {
      const result = Tracker.isAuthError("http 401 unauthorized");
      assert.strictEqual(result, true);
    });

    test("detects 'unauthorized' message", () => {
      const result = Tracker.isAuthError("unauthorized access");
      assert.strictEqual(result, true);
    });

    test("detects 'invalid token' message", () => {
      const result = Tracker.isAuthError("invalid token provided");
      assert.strictEqual(result, true);
    });

    test("returns false for non-auth errors", () => {
      const result = Tracker.isAuthError("something else failed");
      assert.strictEqual(result, false);
    });
  });

  suite("isRateLimitError", () => {
    test("detects HTTP 429 status", () => {
      const result = Tracker.isRateLimitError({ status: 429 }, "");
      assert.strictEqual(result, true);
    });

    test("detects 'rate limit' message", () => {
      const result = Tracker.isRateLimitError({}, "rate limit exceeded");
      assert.strictEqual(result, true);
    });

    test("detects 'too many requests' message", () => {
      const result = Tracker.isRateLimitError({}, "too many requests");
      assert.strictEqual(result, true);
    });

    test("returns false for non-rate-limit errors", () => {
      const result = Tracker.isRateLimitError({ status: 500 }, "server error");
      assert.strictEqual(result, false);
    });
  });

  suite("isServerError", () => {
    test("detects HTTP 500 status", () => {
      const result = Tracker.isServerError({ status: 500 }, "");
      assert.strictEqual(result, true);
    });

    test("detects HTTP 503 status", () => {
      const result = Tracker.isServerError({ status: 503 }, "");
      assert.strictEqual(result, true);
    });

    test("detects 'service unavailable' message", () => {
      const result = Tracker.isServerError({}, "service unavailable");
      assert.strictEqual(result, true);
    });

    test("detects 'internal server error' message", () => {
      const result = Tracker.isServerError({}, "internal server error");
      assert.strictEqual(result, true);
    });

    test("returns false for client errors", () => {
      const result = Tracker.isServerError({ status: 400 }, "bad request");
      assert.strictEqual(result, false);
    });

    test("returns false for HTTP 499", () => {
      const result = Tracker.isServerError({ status: 499 }, "");
      assert.strictEqual(result, false);
    });
  });

  suite("getOperationStats", () => {
    test("returns zero active operations initially", () => {
      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 0);
      assert.deepStrictEqual(stats.operationsByMethod, {});
    });
  });

  suite("clearOperations", () => {
    test("clears all tracked operations", () => {
      // Verify it runs without error after clearing
      DatalayerClientOperationTracker.clearOperations();
      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 0);
    });
  });

  suite("createEnhancedClientHandlers", () => {
    test("returns object with beforeCall, afterCall, and onError", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();
      assert.ok(typeof handlers.beforeCall === "function");
      assert.ok(typeof handlers.afterCall === "function");
      assert.ok(typeof handlers.onError === "function");
    });
  });
});
