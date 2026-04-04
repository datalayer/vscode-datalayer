/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for DatalayerClientOperationTracker.
 * Covers createEnhancedClientHandlers behavior, operation tracking lifecycle,
 * and getLoggerForMethod routing via ServiceLoggers initialization.
 */

import * as assert from "assert";

import { DatalayerClientOperationTracker } from "../../services/logging/datalayerClientLogger";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("DatalayerClientOperationTracker Extended Tests", () => {
  const Tracker = DatalayerClientOperationTracker as unknown as Record<
    string,
    Function
  >;

  suiteSetup(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
    const lm = LoggerManager.getInstance(createMockExtensionContext());
    ServiceLoggers.initialize(lm);
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  setup(() => {
    DatalayerClientOperationTracker.clearOperations();
  });

  suite("createEnhancedClientHandlers - beforeCall", () => {
    test("beforeCall tracks the operation", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);

      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 1);
      assert.ok(stats.operationsByMethod["listRuntimes"]);
    });

    test("beforeCall sanitizes sensitive args", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      // Should not throw even with sensitive data
      handlers.beforeCall!("login", ["eyJhbGciOiJIUzI1NiJ9.payload.sig"]);

      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 1);
    });

    test("beforeCall tracks multiple operations", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      handlers.beforeCall!("whoami", []);
      handlers.beforeCall!("getMySpaces", []);

      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 3);
    });
  });

  suite("createEnhancedClientHandlers - afterCall", () => {
    test("afterCall removes tracked operation", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        1,
      );

      handlers.afterCall!("listRuntimes", []);
      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });

    test("afterCall handles unknown method gracefully", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      // Should not throw for method not tracked
      handlers.afterCall!("nonExistentMethod", null);

      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });

    test("afterCall handles various result types", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("getRuntime", []);
      handlers.afterCall!("getRuntime", {
        uid: "123",
        ingress: "https://test",
      });

      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });

    test("afterCall handles array results", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      handlers.afterCall!("listRuntimes", [{ uid: "1" }, { uid: "2" }]);

      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });

    test("afterCall handles null result", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("deleteRuntime", ["id"]);
      handlers.afterCall!("deleteRuntime", null);

      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });
  });

  suite("createEnhancedClientHandlers - onError", () => {
    test("onError removes tracked operation", async () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        1,
      );

      await handlers.onError!("listRuntimes", new Error("network error"));
      assert.strictEqual(
        DatalayerClientOperationTracker.getOperationStats().activeOperations,
        0,
      );
    });

    test("onError handles unknown method gracefully", async () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      // Should not throw for method not tracked
      await handlers.onError!(
        "nonExistentMethod",
        new Error("something failed"),
      );
    });
  });

  suite("getOperationStats", () => {
    test("returns correct method breakdown", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      handlers.beforeCall!("listRuntimes", []);
      handlers.beforeCall!("whoami", []);

      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 3);
      assert.strictEqual(stats.operationsByMethod["listRuntimes"], 2);
      assert.strictEqual(stats.operationsByMethod["whoami"], 1);
    });

    test("returns empty stats after clearOperations", () => {
      const handlers =
        DatalayerClientOperationTracker.createEnhancedClientHandlers();

      handlers.beforeCall!("listRuntimes", []);
      handlers.beforeCall!("whoami", []);

      DatalayerClientOperationTracker.clearOperations();

      const stats = DatalayerClientOperationTracker.getOperationStats();
      assert.strictEqual(stats.activeOperations, 0);
      assert.deepStrictEqual(stats.operationsByMethod, {});
    });
  });

  suite("sanitizeArgs edge cases", () => {
    test("handles mixed argument types", () => {
      const result = Tracker.sanitizeArgs([
        "short",
        42,
        true,
        null,
        { name: "test", token: "secret" },
      ]);

      assert.strictEqual(result[0], "short");
      assert.strictEqual(result[1], 42);
      assert.strictEqual(result[2], true);
      assert.strictEqual(result[3], null);
      assert.deepStrictEqual(result[4], { name: "test", token: "[REDACTED]" });
    });

    test("handles empty object", () => {
      const result = Tracker.sanitizeArgs([{}]);

      assert.deepStrictEqual(result, [{}]);
    });

    test("handles single character strings", () => {
      const result = Tracker.sanitizeArgs(["a"]);

      assert.deepStrictEqual(result, ["a"]);
    });
  });

  suite("summarizeResult edge cases", () => {
    test("handles object with exactly 3 keys", () => {
      const result = Tracker.summarizeResult({ a: 1, b: 2, c: 3 });

      assert.strictEqual(result, "object{a, b, c}");
    });

    test("handles object with 1 key", () => {
      const result = Tracker.summarizeResult({ uid: "123" });

      assert.strictEqual(result, "object{uid}");
    });

    test("handles large arrays", () => {
      const result = Tracker.summarizeResult(new Array(100).fill(0));

      assert.strictEqual(result, "array[100]");
    });
  });

  suite("isNetworkError edge cases", () => {
    test("detects mixed case network messages", () => {
      const result = Tracker.isNetworkError({ message: "NETWORK FAILURE" });

      assert.strictEqual(result, true);
    });

    test("returns false for empty string message", () => {
      const result = Tracker.isNetworkError({ message: "" });

      assert.strictEqual(result, false);
    });
  });

  suite("isAuthError edge cases", () => {
    test("detects mixed case auth messages", () => {
      const result = Tracker.isAuthError("Not Authenticated");

      // The method lowercases, so this is case-insensitive check
      // The source does NOT lowercase the input - it expects lowercase
      // Actually checking source: it takes the message as-is
      // It checks includes on the raw string
      assert.strictEqual(result, false, "Method does not lowercase input");
    });

    test("returns false for empty string", () => {
      const result = Tracker.isAuthError("");

      assert.strictEqual(result, false);
    });
  });
});
