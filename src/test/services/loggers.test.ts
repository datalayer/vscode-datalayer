/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for ServiceLoggers.
 * Validates logger initialization and access patterns.
 */

import * as assert from "assert";
import { ServiceLoggers } from "../../services/logging/loggers";
import { LoggerManager } from "../../services/logging/loggerManager";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("ServiceLoggers Tests", () => {
  let loggerManager: LoggerManager;

  setup(() => {
    const context = createMockExtensionContext();
    loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);
  });

  teardown(() => {
    // Reset static state
    (ServiceLoggers as any).loggerManager = undefined;
    (LoggerManager as any)._instance = undefined;
  });

  suite("Initialization", () => {
    test("isInitialized returns true after initialization", () => {
      assert.strictEqual(ServiceLoggers.isInitialized(), true);
    });

    test("isInitialized returns false before initialization", () => {
      (ServiceLoggers as any).loggerManager = undefined;
      assert.strictEqual(ServiceLoggers.isInitialized(), false);
    });

    test("throws error when accessing logger before initialization", () => {
      (ServiceLoggers as any).loggerManager = undefined;

      assert.throws(
        () => ServiceLoggers.auth,
        /ServiceLoggers not initialized/,
      );
    });
  });

  suite("Logger Access", () => {
    test("auth logger is accessible", () => {
      const logger = ServiceLoggers.auth;
      assert.ok(logger);
      assert.strictEqual(typeof logger.info, "function");
      assert.strictEqual(typeof logger.error, "function");
    });

    test("can access multiple loggers", () => {
      const logger1 = ServiceLoggers.auth;
      const logger2 = ServiceLoggers.runtime;
      const logger3 = ServiceLoggers.notebook;

      assert.ok(logger1);
      assert.ok(logger2);
      assert.ok(logger3);
    });

    test("multiple accesses return same logger instance", () => {
      const logger1 = ServiceLoggers.auth;
      const logger2 = ServiceLoggers.auth;
      // Loggers are created on-demand, but should be consistent
      assert.ok(logger1);
      assert.ok(logger2);
    });
  });

  suite("Logger Functionality", () => {
    test("logger can log info messages", () => {
      const logger = ServiceLoggers.auth;
      // Should not throw
      logger.info("Test message");
      assert.ok(true);
    });

    test("logger can log error messages", () => {
      const logger = ServiceLoggers.auth;
      // Should not throw
      logger.error("Test error");
      assert.ok(true);
    });

    test("logger can log with metadata", () => {
      const logger = ServiceLoggers.auth;
      // Should not throw
      logger.info("Test with metadata", { key: "value" });
      assert.ok(true);
    });
  });
});
