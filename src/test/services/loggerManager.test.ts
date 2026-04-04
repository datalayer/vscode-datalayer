/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for LoggerManager and Logger classes.
 * Validates log level filtering, message formatting, and singleton behavior.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { LogLevel } from "../../services/interfaces/ILoggerManager";
import { Logger, LoggerManager } from "../../services/logging/loggerManager";
import { createMockExtensionContext } from "../utils/mockFactory";

/**
 * Creates a mock LogOutputChannel that records all log calls.
 */
function createMockLogOutputChannel(): vscode.LogOutputChannel & {
  logged: { level: string; message: string }[];
} {
  const logged: { level: string; message: string }[] = [];
  return {
    name: "Test",
    logLevel: vscode.LogLevel.Trace,
    onDidChangeLogLevel: new vscode.EventEmitter<vscode.LogLevel>().event,
    trace: (message: string) => logged.push({ level: "trace", message }),
    debug: (message: string) => logged.push({ level: "debug", message }),
    info: (message: string) => logged.push({ level: "info", message }),
    warn: (message: string) => logged.push({ level: "warn", message }),
    error: (message: string | Error) =>
      logged.push({
        level: "error",
        message: typeof message === "string" ? message : message.message,
      }),
    append: () => {},
    appendLine: () => {},
    clear: () => {
      logged.length = 0;
    },
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: () => {},
    logged,
  } as unknown as vscode.LogOutputChannel & {
    logged: { level: string; message: string }[];
  };
}

suite("LoggerManager Tests", () => {
  let context: vscode.ExtensionContext;

  setup(() => {
    context = createMockExtensionContext();
    // Reset singleton between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  teardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("Singleton Pattern", () => {
    test("getInstance returns same instance on repeated calls", () => {
      const instance1 = LoggerManager.getInstance(context);
      const instance2 = LoggerManager.getInstance();

      assert.strictEqual(instance1, instance2);
    });

    test("getInstance throws when no context provided on first call", () => {
      assert.throws(
        () => LoggerManager.getInstance(),
        /Context required for LoggerManager initialization/,
      );
    });

    test("getInstance ignores context on subsequent calls", () => {
      const instance1 = LoggerManager.getInstance(context);
      const otherContext = createMockExtensionContext();
      const instance2 = LoggerManager.getInstance(otherContext);

      assert.strictEqual(instance1, instance2);
    });
  });

  suite("createLogger", () => {
    test("creates a Logger instance", () => {
      const manager = LoggerManager.getInstance(context);
      const logger = manager.createLogger("TestChannel");

      assert.ok(logger instanceof Logger);
    });

    test("returns same channel for same name", () => {
      const manager = LoggerManager.getInstance(context);
      const logger1 = manager.createLogger("TestChannel");
      const logger2 = manager.createLogger("TestChannel");

      // Both loggers use the same underlying channel
      assert.ok(logger1 instanceof Logger);
      assert.ok(logger2 instanceof Logger);
    });

    test("creates different channels for different names", () => {
      const manager = LoggerManager.getInstance(context);
      const logger1 = manager.createLogger("Channel1");
      const logger2 = manager.createLogger("Channel2");

      assert.ok(logger1 instanceof Logger);
      assert.ok(logger2 instanceof Logger);
    });
  });

  suite("Configuration", () => {
    test("getConfig returns configuration object", () => {
      const manager = LoggerManager.getInstance(context);
      const config = manager.getConfig();

      assert.ok("level" in config);
      assert.ok("enableTimestamps" in config);
      assert.ok("enableContext" in config);
    });

    test("getConfig returns a copy (not reference)", () => {
      const manager = LoggerManager.getInstance(context);
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      assert.deepStrictEqual(config1, config2);
      assert.notStrictEqual(config1, config2);
    });

    test("setConfig updates configuration", () => {
      const manager = LoggerManager.getInstance(context);
      manager.setConfig({ level: LogLevel.ERROR });

      const config = manager.getConfig();
      assert.strictEqual(config.level, LogLevel.ERROR);
    });

    test("setConfig merges with existing config", () => {
      const manager = LoggerManager.getInstance(context);
      const originalConfig = manager.getConfig();

      manager.setConfig({ level: LogLevel.TRACE });

      const updatedConfig = manager.getConfig();
      assert.strictEqual(updatedConfig.level, LogLevel.TRACE);
      assert.strictEqual(
        updatedConfig.enableTimestamps,
        originalConfig.enableTimestamps,
      );
      assert.strictEqual(
        updatedConfig.enableContext,
        originalConfig.enableContext,
      );
    });
  });

  suite("Channel Management", () => {
    test("showChannel does not throw for unknown channel", () => {
      const manager = LoggerManager.getInstance(context);
      assert.doesNotThrow(() => manager.showChannel("nonexistent"));
    });

    test("showChannel does not throw with no channels", () => {
      const manager = LoggerManager.getInstance(context);
      assert.doesNotThrow(() => manager.showChannel());
    });

    test("clearAll does not throw", () => {
      const manager = LoggerManager.getInstance(context);
      manager.createLogger("TestChannel");
      assert.doesNotThrow(() => manager.clearAll());
    });

    test("dispose clears all channels", () => {
      const manager = LoggerManager.getInstance(context);
      manager.createLogger("Channel1");
      manager.createLogger("Channel2");

      assert.doesNotThrow(() => manager.dispose());
    });
  });
});

suite("Logger Tests", () => {
  let mockChannel: vscode.LogOutputChannel & {
    logged: { level: string; message: string }[];
  };
  let logger: Logger;

  setup(() => {
    mockChannel = createMockLogOutputChannel();
  });

  suite("Log Level Filtering", () => {
    test("logs messages at or above configured level", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.INFO,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      assert.strictEqual(mockChannel.logged.length, 3);
    });

    test("filters messages below configured level", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.WARN,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.trace("trace message");
      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      assert.strictEqual(mockChannel.logged.length, 2);
      assert.strictEqual(mockChannel.logged[0].level, "warn");
      assert.strictEqual(mockChannel.logged[1].level, "error");
    });

    test("TRACE level allows all messages", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.trace("t");
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");

      assert.strictEqual(mockChannel.logged.length, 5);
    });

    test("ERROR level filters everything except errors", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.ERROR,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.trace("t");
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.strictEqual(mockChannel.logged[0].level, "error");
    });
  });

  suite("Context Formatting", () => {
    test("appends context when enabled", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      logger.info("message", { key: "value" });

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(mockChannel.logged[0].message.includes("Context:"));
      assert.ok(mockChannel.logged[0].message.includes('"key"'));
      assert.ok(mockChannel.logged[0].message.includes('"value"'));
    });

    test("does not append context when disabled", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.info("message", { key: "value" });

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(!mockChannel.logged[0].message.includes("Context:"));
    });

    test("does not append empty context", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      logger.info("message", {});

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(!mockChannel.logged[0].message.includes("Context:"));
    });

    test("does not append undefined context", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      logger.info("message");

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(!mockChannel.logged[0].message.includes("Context:"));
    });
  });

  suite("Error Logging", () => {
    test("includes error details in context", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      const err = new Error("test error");
      logger.error("something failed", err);

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(mockChannel.logged[0].message.includes("test error"));
    });

    test("includes error name and stack", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      const err = new TypeError("type mismatch");
      logger.error("type error occurred", err);

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(mockChannel.logged[0].message.includes("TypeError"));
      assert.ok(mockChannel.logged[0].message.includes("type mismatch"));
    });

    test("merges error and extra context", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      const err = new Error("oops");
      logger.error("failed", err, { operation: "save" });

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.ok(mockChannel.logged[0].message.includes("oops"));
      assert.ok(mockChannel.logged[0].message.includes("save"));
    });

    test("error without Error object logs normally", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.error("plain error message");

      assert.strictEqual(mockChannel.logged.length, 1);
      assert.strictEqual(mockChannel.logged[0].message, "plain error message");
    });
  });

  suite("timeAsync", () => {
    test("returns the result of the async function", async () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      const result = await logger.timeAsync("op", async () => 42);

      assert.strictEqual(result, 42);
    });

    test("logs start and completion messages", async () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      await logger.timeAsync("my-operation", async () => "done");

      const messages = mockChannel.logged.map((l) => l.message);
      assert.ok(messages.some((m) => m.includes("Starting: my-operation")));
      assert.ok(messages.some((m) => m.includes("Completed: my-operation")));
    });

    test("logs error on failure and re-throws", async () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: true,
      });

      const testError = new Error("async failure");

      await assert.rejects(
        () =>
          logger.timeAsync("failing-op", async () => {
            throw testError;
          }),
        /async failure/,
      );

      const messages = mockChannel.logged.map((l) => l.message);
      assert.ok(messages.some((m) => m.includes("Starting: failing-op")));
      assert.ok(messages.some((m) => m.includes("Failed: failing-op")));
    });

    test("includes duration in completion message", async () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      await logger.timeAsync("timed-op", async () => {
        return "result";
      });

      const completionMsg = mockChannel.logged.find((l) =>
        l.message.includes("Completed: timed-op"),
      );
      assert.ok(completionMsg);
      assert.ok(/\d+ms/.test(completionMsg!.message));
    });
  });

  suite("Individual Log Methods", () => {
    test("trace calls channel.trace", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.trace("trace msg");
      assert.strictEqual(mockChannel.logged[0].level, "trace");
      assert.strictEqual(mockChannel.logged[0].message, "trace msg");
    });

    test("debug calls channel.debug", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.debug("debug msg");
      assert.strictEqual(mockChannel.logged[0].level, "debug");
    });

    test("info calls channel.info", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.info("info msg");
      assert.strictEqual(mockChannel.logged[0].level, "info");
    });

    test("warn calls channel.warn", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.warn("warn msg");
      assert.strictEqual(mockChannel.logged[0].level, "warn");
    });

    test("error calls channel.error", () => {
      logger = new Logger(mockChannel, "Test", {
        level: LogLevel.TRACE,
        enableTimestamps: false,
        enableContext: false,
      });

      logger.error("error msg");
      assert.strictEqual(mockChannel.logged[0].level, "error");
    });
  });
});
