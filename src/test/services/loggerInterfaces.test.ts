/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for logger interface types and LogLevel enum.
 * Validates the enum values and interface structure.
 */

import * as assert from "assert";

import type { LoggerConfig } from "../../services/interfaces/ILoggerManager";
import { LogLevel } from "../../services/interfaces/ILoggerManager";

suite("Logger Interfaces Tests", () => {
  suite("LogLevel enum", () => {
    test("TRACE is 0", () => {
      assert.strictEqual(LogLevel.TRACE, 0);
    });

    test("DEBUG is 1", () => {
      assert.strictEqual(LogLevel.DEBUG, 1);
    });

    test("INFO is 2", () => {
      assert.strictEqual(LogLevel.INFO, 2);
    });

    test("WARN is 3", () => {
      assert.strictEqual(LogLevel.WARN, 3);
    });

    test("ERROR is 4", () => {
      assert.strictEqual(LogLevel.ERROR, 4);
    });

    test("has exactly 5 values", () => {
      // Numeric enums in TypeScript create reverse mappings, so we count
      // only numeric keys
      const numericValues = Object.values(LogLevel).filter(
        (v) => typeof v === "number",
      );
      assert.strictEqual(numericValues.length, 5);
    });

    test("levels are ordered from least to most severe", () => {
      assert.ok(LogLevel.TRACE < LogLevel.DEBUG);
      assert.ok(LogLevel.DEBUG < LogLevel.INFO);
      assert.ok(LogLevel.INFO < LogLevel.WARN);
      assert.ok(LogLevel.WARN < LogLevel.ERROR);
    });

    test("can be used as comparison for filtering", () => {
      const minLevel = LogLevel.WARN;

      assert.ok(LogLevel.ERROR >= minLevel, "ERROR should pass WARN filter");
      assert.ok(LogLevel.WARN >= minLevel, "WARN should pass WARN filter");
      assert.ok(LogLevel.INFO < minLevel, "INFO should not pass WARN filter");
      assert.ok(LogLevel.DEBUG < minLevel, "DEBUG should not pass WARN filter");
      assert.ok(LogLevel.TRACE < minLevel, "TRACE should not pass WARN filter");
    });
  });

  suite("LoggerConfig interface", () => {
    test("can create a valid config object", () => {
      const config: LoggerConfig = {
        level: LogLevel.DEBUG,
        enableTimestamps: true,
        enableContext: false,
      };

      assert.strictEqual(config.level, LogLevel.DEBUG);
      assert.strictEqual(config.enableTimestamps, true);
      assert.strictEqual(config.enableContext, false);
    });

    test("can use all log levels in config", () => {
      const levels = [
        LogLevel.TRACE,
        LogLevel.DEBUG,
        LogLevel.INFO,
        LogLevel.WARN,
        LogLevel.ERROR,
      ];

      for (const level of levels) {
        const config: LoggerConfig = {
          level,
          enableTimestamps: true,
          enableContext: true,
        };
        assert.strictEqual(config.level, level);
      }
    });
  });
});
