/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for PyodideStrategy auto-connect strategy.
 * Validates the strategy behavior and static helper methods.
 */

import * as assert from "assert";

import { PyodideStrategy } from "../../services/autoConnect/strategies/pyodideStrategy";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("PyodideStrategy Tests", () => {
  suiteSetup(() => {
    if (!ServiceLoggers.isInitialized()) {
      const context = createMockExtensionContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (LoggerManager as any).instance = undefined;
      const loggerManager = LoggerManager.getInstance(context);
      ServiceLoggers.initialize(loggerManager);
    }
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("constructor", () => {
    test("creates instance with name 'Pyodide'", () => {
      const strategy = new PyodideStrategy();
      assert.strictEqual(strategy.name, "Pyodide");
    });
  });

  suite("tryConnect", () => {
    test("returns null since Pyodide is not a cloud runtime", async () => {
      const strategy = new PyodideStrategy();
      // Create minimal context - the strategy ignores it
      const context = {} as Parameters<typeof strategy.tryConnect>[0];
      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });
  });

  suite("isPyodideStrategy (static)", () => {
    test("returns true for 'Pyodide' string", () => {
      assert.strictEqual(PyodideStrategy.isPyodideStrategy("Pyodide"), true);
    });

    test("returns false for 'pyodide' (case-sensitive)", () => {
      assert.strictEqual(PyodideStrategy.isPyodideStrategy("pyodide"), false);
    });

    test("returns false for 'Active Runtime'", () => {
      assert.strictEqual(
        PyodideStrategy.isPyodideStrategy("Active Runtime"),
        false,
      );
    });

    test("returns false for 'Ask'", () => {
      assert.strictEqual(PyodideStrategy.isPyodideStrategy("Ask"), false);
    });

    test("returns false for empty string", () => {
      assert.strictEqual(PyodideStrategy.isPyodideStrategy(""), false);
    });

    test("returns false for 'PyodideStrategy'", () => {
      assert.strictEqual(
        PyodideStrategy.isPyodideStrategy("PyodideStrategy"),
        false,
      );
    });
  });
});
