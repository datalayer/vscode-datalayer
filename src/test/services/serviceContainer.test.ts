/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import { ServiceContainer } from "../../services/core/serviceContainer";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("ServiceContainer Tests", () => {
  let context: ReturnType<typeof createMockExtensionContext>;

  suiteSetup(() => {
    context = createMockExtensionContext();
    if (!ServiceLoggers.isInitialized()) {
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
    test("creates instance with extension context", () => {
      const container = new ServiceContainer(context);
      assert.ok(container);
      assert.strictEqual(container.context, context);
    });
  });

  suite("lazy initialization of services", () => {
    test("loggerManager is lazily created and cached", () => {
      const container = new ServiceContainer(context);
      const manager1 = container.loggerManager;
      const manager2 = container.loggerManager;
      assert.ok(manager1);
      assert.strictEqual(manager1, manager2, "Should return same instance");
    });

    test("logger is lazily created and cached", () => {
      const container = new ServiceContainer(context);
      const logger1 = container.logger;
      const logger2 = container.logger;
      assert.ok(logger1);
      assert.strictEqual(logger1, logger2, "Should return same instance");
    });

    test("errorHandler is lazily created and cached", () => {
      const container = new ServiceContainer(context);
      const handler1 = container.errorHandler;
      const handler2 = container.errorHandler;
      assert.ok(handler1);
      assert.strictEqual(handler1, handler2, "Should return same instance");
    });

    test("documentRegistry is lazily created and cached", () => {
      const container = new ServiceContainer(context);
      const registry1 = container.documentRegistry;
      const registry2 = container.documentRegistry;
      assert.ok(registry1);
      assert.strictEqual(registry1, registry2, "Should return same instance");
    });

    test("datalayer is lazily created and cached", () => {
      const container = new ServiceContainer(context);
      const client1 = container.datalayer;
      const client2 = container.datalayer;
      assert.ok(client1);
      assert.strictEqual(client1, client2, "Should return same instance");
    });
  });

  suite("dispose", () => {
    test("dispose completes without error", async () => {
      const container = new ServiceContainer(context);
      // Access logger so it exists for dispose logging
      void container.logger;
      await assert.doesNotReject(() => container.dispose());
    });

    test("dispose handles case when documentBridge was never created", async () => {
      const container = new ServiceContainer(context);
      void container.logger;
      // Never access documentBridge - dispose should still work
      await assert.doesNotReject(() => container.dispose());
    });
  });
});
