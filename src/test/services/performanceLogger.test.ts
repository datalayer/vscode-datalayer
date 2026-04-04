/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for PerformanceLogger and PerformanceTimer utilities.
 * Validates timing measurement, checkpoint tracking, and operation tracking.
 */

import * as assert from "assert";

import {
  PerformanceTimer,
  type PerformanceTimerLogger,
} from "../../services/logging/performanceLogger";
import { createMockLogger } from "../utils/mockFactory";

/** Creates a PerformanceTimerLogger from the mock logger. */
function createTimerLogger(): PerformanceTimerLogger {
  const mock = createMockLogger();
  return {
    trace: (msg: string, ctx?: Record<string, unknown>) => mock.trace(msg, ctx),
    debug: (msg: string, ctx?: Record<string, unknown>) => mock.debug(msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => mock.info(msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => mock.warn(msg, ctx),
    error: (msg: string, err?: Error, ctx?: Record<string, unknown>) =>
      mock.error(msg, err, ctx),
  };
}

suite("Performance Logger Tests", () => {
  suite("PerformanceTimer", () => {
    suite("start()", () => {
      test("can be called without error", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        assert.doesNotThrow(() => timer.start());
      });

      test("resets checkpoints on subsequent start calls", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        timer.checkpoint("first");
        timer.start(); // Reset
        // Should not throw, and prior checkpoints are cleared.
        assert.doesNotThrow(() => timer.checkpoint("after-reset"));
      });
    });

    suite("checkpoint()", () => {
      test("throws if timer not started", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        assert.throws(
          () => timer.checkpoint(),
          (err: Error) => {
            assert.ok(err.message.includes("Timer not started"));
            return true;
          },
        );
      });

      test("records checkpoint with custom name", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        // Should not throw with a named checkpoint.
        assert.doesNotThrow(() => timer.checkpoint("step-1"));
      });

      test("records checkpoint with auto-generated name", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        // Should not throw without a name.
        assert.doesNotThrow(() => timer.checkpoint());
      });

      test("allows multiple checkpoints", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        assert.doesNotThrow(() => {
          timer.checkpoint("first");
          timer.checkpoint("second");
          timer.checkpoint("third");
        });
      });
    });

    suite("end()", () => {
      test("throws if timer not started", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        assert.throws(
          () => timer.end(),
          (err: Error) => {
            assert.ok(err.message.includes("Timer not started"));
            return true;
          },
        );
      });

      test("completes successfully with success status", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        assert.doesNotThrow(() => timer.end("success"));
      });

      test("completes successfully with failure status", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        assert.doesNotThrow(() => timer.end("failure"));
      });

      test("completes successfully with cancelled status", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        assert.doesNotThrow(() => timer.end("cancelled"));
      });

      test("defaults to success status", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        assert.doesNotThrow(() => timer.end());
      });

      test("resets timer after end, subsequent end throws", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        timer.end();
        assert.throws(
          () => timer.end(),
          (err: Error) => {
            assert.ok(err.message.includes("Timer not started"));
            return true;
          },
        );
      });

      test("resets timer after end, subsequent checkpoint throws", () => {
        const timer = new PerformanceTimer("test-op", createTimerLogger());
        timer.start();
        timer.end();
        assert.throws(
          () => timer.checkpoint("after-end"),
          (err: Error) => {
            assert.ok(err.message.includes("Timer not started"));
            return true;
          },
        );
      });
    });

    suite("timing measurements", () => {
      test("measures non-zero elapsed time", () => {
        const logEntries: Array<{
          msg: string;
          ctx?: Record<string, unknown>;
        }> = [];
        const capturingLogger: PerformanceTimerLogger = {
          trace: () => {},
          debug: () => {},
          info: (msg: string, ctx?: Record<string, unknown>) => {
            logEntries.push({ msg, ctx });
          },
          warn: () => {},
          error: () => {},
        };

        const timer = new PerformanceTimer("timed-op", capturingLogger);
        timer.start();

        // Perform a small computation to ensure some time passes.
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
          sum += i;
        }
        // Prevent dead-code elimination.
        assert.ok(sum >= 0);

        timer.end("success");

        // The info log should contain the completion entry.
        assert.ok(
          logEntries.length > 0,
          "Expected at least one info log entry",
        );
        const completionEntry = logEntries.find((e) =>
          e.msg.includes("timed-op"),
        );
        assert.ok(completionEntry, "Expected a log entry mentioning timed-op");
        assert.ok(
          completionEntry!.ctx?.totalDuration,
          "Expected totalDuration in context",
        );
      });

      test("records checkpoint elapsed times", () => {
        const logEntries: Array<{
          msg: string;
          ctx?: Record<string, unknown>;
        }> = [];
        const capturingLogger: PerformanceTimerLogger = {
          trace: () => {},
          debug: (msg: string, ctx?: Record<string, unknown>) => {
            logEntries.push({ msg, ctx });
          },
          info: () => {},
          warn: () => {},
          error: () => {},
        };

        const timer = new PerformanceTimer("checkpoint-op", capturingLogger);
        timer.start();
        timer.checkpoint("step-a");
        timer.end("success");

        const checkpointEntry = logEntries.find((e) =>
          e.msg.includes("step-a"),
        );
        assert.ok(
          checkpointEntry,
          "Expected a debug log entry for checkpoint step-a",
        );
        assert.ok(
          checkpointEntry!.ctx?.elapsedTime,
          "Expected elapsedTime in checkpoint context",
        );
      });
    });

    suite("context passing", () => {
      test("passes context to logger on start", () => {
        const debugEntries: Array<{
          msg: string;
          ctx?: Record<string, unknown>;
        }> = [];
        const capturingLogger: PerformanceTimerLogger = {
          trace: () => {},
          debug: (msg: string, ctx?: Record<string, unknown>) => {
            debugEntries.push({ msg, ctx });
          },
          info: () => {},
          warn: () => {},
          error: () => {},
        };

        const context = { component: "test-component", step: 1 };
        const timer = new PerformanceTimer(
          "context-op",
          capturingLogger,
          context,
        );
        timer.start();
        timer.end();

        const startEntry = debugEntries.find((e) => e.msg.includes("Starting"));
        assert.ok(startEntry, "Expected a start log entry");
        assert.strictEqual(startEntry!.ctx?.component, "test-component");
        assert.strictEqual(startEntry!.ctx?.step, 1);
      });
    });

    suite("error status logging", () => {
      test("logs error level for failure status", () => {
        const errorEntries: Array<{
          msg: string;
          err?: Error;
          ctx?: Record<string, unknown>;
        }> = [];
        const capturingLogger: PerformanceTimerLogger = {
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: (msg: string, err?: Error, ctx?: Record<string, unknown>) => {
            errorEntries.push({ msg, err, ctx });
          },
        };

        const timer = new PerformanceTimer("failing-op", capturingLogger);
        timer.start();
        timer.end("failure");

        assert.ok(
          errorEntries.length > 0,
          "Expected error log on failure status",
        );
        assert.ok(errorEntries[0].msg.includes("failure"));
      });

      test("logs info level for success status", () => {
        const infoEntries: Array<{
          msg: string;
          ctx?: Record<string, unknown>;
        }> = [];
        const capturingLogger: PerformanceTimerLogger = {
          trace: () => {},
          debug: () => {},
          info: (msg: string, ctx?: Record<string, unknown>) => {
            infoEntries.push({ msg, ctx });
          },
          warn: () => {},
          error: () => {},
        };

        const timer = new PerformanceTimer("success-op", capturingLogger);
        timer.start();
        timer.end("success");

        assert.ok(
          infoEntries.length > 0,
          "Expected info log on success status",
        );
        assert.ok(infoEntries[0].msg.includes("success"));
      });
    });
  });
});
