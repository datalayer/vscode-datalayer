/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import { ErrorHandler } from "../../services/core/errorHandler";
import {
  AuthenticationError,
  DatalayerError,
  DocumentError,
  NetworkError,
  NotebookError,
  RuntimeError,
} from "../../types/errors";
import { createMockLogger } from "../utils/mockFactory";

suite("ErrorHandler Tests", () => {
  let errorHandler: ErrorHandler;
  let logger: ReturnType<typeof createMockLogger>;

  setup(() => {
    logger = createMockLogger();
    errorHandler = new ErrorHandler(logger);
  });

  suite("Construction", () => {
    test("can be instantiated with a logger", () => {
      assert.ok(errorHandler);
    });
  });

  suite("handle", () => {
    test("logs error by default", async () => {
      let errorLogged = false;
      logger.error = (..._args: unknown[]) => {
        errorLogged = true;
      };

      const error = new Error("test error");
      await errorHandler.handle(error, { showUser: false });

      assert.strictEqual(errorLogged, true);
    });

    test("skips logging when logError is false", async () => {
      let errorLogged = false;
      logger.error = (..._args: unknown[]) => {
        errorLogged = true;
      };

      const error = new Error("test error");
      await errorHandler.handle(error, { showUser: false, logError: false });

      assert.strictEqual(errorLogged, false);
    });

    test("logs structured info from DatalayerError", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new AuthenticationError("auth failed");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("AUTH_ERROR"));
      assert.ok(loggedMessage.includes("auth failed"));
    });

    test("logs structured info from NetworkError", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new NetworkError("connection refused");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("NETWORK_ERROR"));
    });

    test("handles generic errors with UNKNOWN_ERROR code", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new Error("something broke");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("UNKNOWN_ERROR"));
      assert.ok(loggedMessage.includes("something broke"));
    });

    test("handles error with custom context", async () => {
      let loggedContext: unknown;
      logger.error = (_msg: unknown, _err: unknown, ctx: unknown) => {
        loggedContext = ctx;
      };

      const error = new Error("test");
      await errorHandler.handle(error, {
        showUser: false,
        context: { operation: "test-op" },
      });

      assert.ok(loggedContext);
      const ctx = loggedContext as { context: Record<string, unknown> };
      assert.strictEqual(ctx.context.operation, "test-op");
    });
  });

  suite("wrap", () => {
    test("returns operation result on success", async () => {
      const result = await errorHandler.wrap(async () => 42);
      assert.strictEqual(result, 42);
    });

    test("returns undefined on error", async () => {
      const result = await errorHandler.wrap(
        async () => {
          throw new Error("fail");
        },
        { showUser: false },
      );
      assert.strictEqual(result, undefined);
    });

    test("handles error through the handler on failure", async () => {
      let errorLogged = false;
      logger.error = (..._args: unknown[]) => {
        errorLogged = true;
      };

      await errorHandler.wrap(
        async () => {
          throw new Error("fail");
        },
        { showUser: false },
      );

      assert.strictEqual(errorLogged, true);
    });

    test("returns string results", async () => {
      const result = await errorHandler.wrap(async () => "hello");
      assert.strictEqual(result, "hello");
    });

    test("returns object results", async () => {
      const obj = { key: "value" };
      const result = await errorHandler.wrap(async () => obj);
      assert.deepStrictEqual(result, obj);
    });
  });

  suite("getUserFriendlyMessage (via handle logging)", () => {
    test("AUTH_ERROR produces login message", async () => {
      const error = new AuthenticationError("expired token");
      // We test indirectly through the logged message containing the error code
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("AUTH_ERROR"));
    });

    test("NETWORK_ERROR is recognized from DatalayerError", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new NetworkError("timeout");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("NETWORK_ERROR"));
    });

    test("NOTEBOOK_ERROR is recognized", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new NotebookError("save failed");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("NOTEBOOK_ERROR"));
    });

    test("RUNTIME_ERROR is recognized", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new RuntimeError("start failed");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("RUNTIME_ERROR"));
    });

    test("DOCUMENT_ERROR is recognized", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new DocumentError("parse failed");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("DOCUMENT_ERROR"));
    });

    test("generic fetch error maps to NETWORK_ERROR", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new Error("Failed to fetch resource");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("NETWORK_ERROR"));
    });

    test("401 error maps to AUTH_ERROR", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new Error("Request failed with status 401");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("AUTH_ERROR"));
    });

    test("404 error maps to NOT_FOUND", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new Error("404 Not Found");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("NOT_FOUND"));
    });

    test("timeout error maps to TIMEOUT_ERROR", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new Error("Request timeout after 30s");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("TIMEOUT_ERROR"));
    });

    test("DatalayerError with custom code is preserved", async () => {
      let loggedMessage = "";
      logger.error = (msg: unknown, ..._args: unknown[]) => {
        loggedMessage = String(msg);
      };

      const error = new DatalayerError("custom issue", "CUSTOM_CODE");
      await errorHandler.handle(error, { showUser: false });

      assert.ok(loggedMessage.includes("CUSTOM_CODE"));
    });
  });
});
