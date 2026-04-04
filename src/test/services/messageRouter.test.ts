/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for DocumentMessageRouter service.
 * Validates handler registration, message routing, and lifecycle management.
 */

import * as assert from "assert";

import { DocumentMessageRouter } from "../../services/messaging/messageRouter";
import type { DocumentContext } from "../../services/messaging/types";
import type { ExtensionMessage } from "../../types/vscode/messages";
import { createMockLogger } from "../utils/mockFactory";

suite("DocumentMessageRouter Tests", () => {
  let router: DocumentMessageRouter;
  const mockContext: DocumentContext = {
    documentUri: "file:///test.ipynb",
    webview: {} as never,
    isFromDatalayer: false,
  };

  setup(async () => {
    const logger = createMockLogger();
    router = new DocumentMessageRouter(logger);
    await router.initialize();
  });

  teardown(async () => {
    await router.dispose();
  });

  suite("registerHandler", () => {
    test("registers a handler for a message type", () => {
      router.registerHandler("test-message", async () => {});
      assert.strictEqual(router.hasHandler("test-message"), true);
    });

    test("overwrites existing handler without throwing", () => {
      const handler1 = async () => {};
      const handler2 = async () => {};

      router.registerHandler("test-message", handler1);
      router.registerHandler("test-message", handler2);

      assert.strictEqual(router.hasHandler("test-message"), true);
    });

    test("registers multiple handlers for different types", () => {
      router.registerHandler("type-a", async () => {});
      router.registerHandler("type-b", async () => {});
      router.registerHandler("type-c", async () => {});

      assert.strictEqual(router.hasHandler("type-a"), true);
      assert.strictEqual(router.hasHandler("type-b"), true);
      assert.strictEqual(router.hasHandler("type-c"), true);
    });
  });

  suite("hasHandler", () => {
    test("returns false for unregistered message type", () => {
      assert.strictEqual(router.hasHandler("nonexistent"), false);
    });

    test("returns true for registered message type", () => {
      router.registerHandler("registered", async () => {});
      assert.strictEqual(router.hasHandler("registered"), true);
    });

    test("returns false after unregistering", () => {
      router.registerHandler("temp", async () => {});
      router.unregisterHandler("temp");
      assert.strictEqual(router.hasHandler("temp"), false);
    });
  });

  suite("unregisterHandler", () => {
    test("returns true when handler was removed", () => {
      router.registerHandler("to-remove", async () => {});
      const result = router.unregisterHandler("to-remove");
      assert.strictEqual(result, true);
    });

    test("returns false when no handler existed", () => {
      const result = router.unregisterHandler("nonexistent");
      assert.strictEqual(result, false);
    });

    test("handler no longer routes after unregister", async () => {
      let called = false;
      router.registerHandler("action", async () => {
        called = true;
      });
      router.unregisterHandler("action");

      const message: ExtensionMessage = { type: "action" };
      await router.routeMessage(message, mockContext);

      assert.strictEqual(called, false);
    });
  });

  suite("getRegisteredTypes", () => {
    test("returns empty array when no handlers registered", () => {
      const types = router.getRegisteredTypes();
      assert.deepStrictEqual(types, []);
    });

    test("returns all registered types", () => {
      router.registerHandler("alpha", async () => {});
      router.registerHandler("beta", async () => {});
      router.registerHandler("gamma", async () => {});

      const types = router.getRegisteredTypes();
      assert.strictEqual(types.length, 3);
      assert.ok(types.includes("alpha"));
      assert.ok(types.includes("beta"));
      assert.ok(types.includes("gamma"));
    });
  });

  suite("routeMessage", () => {
    test("routes message to correct handler", async () => {
      let receivedMessage: ExtensionMessage | undefined;
      let receivedContext: DocumentContext | undefined;

      router.registerHandler(
        "test-type",
        async (msg: ExtensionMessage, ctx: DocumentContext) => {
          receivedMessage = msg;
          receivedContext = ctx;
        },
      );

      const message: ExtensionMessage = {
        type: "test-type",
        body: { data: "hello" },
      };
      await router.routeMessage(message, mockContext);

      assert.deepStrictEqual(receivedMessage, message);
      assert.strictEqual(receivedContext, mockContext);
    });

    test("does not throw for unknown message type", async () => {
      const message: ExtensionMessage = { type: "unknown-type" };
      await assert.doesNotReject(() =>
        router.routeMessage(message, mockContext),
      );
    });

    test("re-throws handler errors", async () => {
      router.registerHandler("failing", async () => {
        throw new Error("handler exploded");
      });

      const message: ExtensionMessage = { type: "failing" };
      await assert.rejects(
        () => router.routeMessage(message, mockContext),
        /handler exploded/,
      );
    });

    test("throws when router is not initialized", async () => {
      const logger = createMockLogger();
      const uninitRouter = new DocumentMessageRouter(logger);
      // Don't call initialize()

      const message: ExtensionMessage = { type: "test" };
      await assert.rejects(
        () => uninitRouter.routeMessage(message, mockContext),
        /not ready/,
      );
    });

    test("routes synchronous handlers", async () => {
      let called = false;
      router.registerHandler("sync-handler", () => {
        called = true;
      });

      const message: ExtensionMessage = { type: "sync-handler" };
      await router.routeMessage(message, mockContext);

      assert.strictEqual(called, true);
    });

    test("routes to overwritten handler", async () => {
      let handlerVersion = 0;

      router.registerHandler("overwrite-test", async () => {
        handlerVersion = 1;
      });
      router.registerHandler("overwrite-test", async () => {
        handlerVersion = 2;
      });

      const message: ExtensionMessage = { type: "overwrite-test" };
      await router.routeMessage(message, mockContext);

      assert.strictEqual(handlerVersion, 2);
    });
  });

  suite("Lifecycle", () => {
    test("dispose clears all handlers", async () => {
      router.registerHandler("handler-1", async () => {});
      router.registerHandler("handler-2", async () => {});

      await router.dispose();

      // After dispose, getRegisteredTypes should be empty
      // But routeMessage should throw because state is disposed
      const types = router.getRegisteredTypes();
      assert.strictEqual(types.length, 0);
    });

    test("double initialize does not throw", async () => {
      // Router is already initialized in setup
      await assert.doesNotReject(() => router.initialize());
    });

    test("double dispose does not throw", async () => {
      await router.dispose();
      await assert.doesNotReject(() => router.dispose());
    });
  });
});
