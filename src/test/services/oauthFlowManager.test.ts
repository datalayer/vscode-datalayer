/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { ServiceState } from "../../services/core/baseService";
import { OAuthFlowManager } from "../../services/core/oauthFlowManager";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockExtensionContext,
  createMockLogger,
} from "../utils/mockFactory";

suite("OAuthFlowManager Tests", () => {
  let context: vscode.ExtensionContext;

  suiteSetup(() => {
    context = createMockExtensionContext();
    // Provide a real extension id
    (context.extension as unknown as { id: string }).id =
      "datalayer.datalayer-jupyter-vscode";
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
    test("creates instance with context and logger", () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      assert.ok(manager);
      assert.strictEqual(manager.state, ServiceState.Uninitialized);
    });
  });

  suite("getPendingFlowCount", () => {
    test("returns 0 when no flows pending", () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      assert.strictEqual(manager.getPendingFlowCount(), 0);
    });
  });

  suite("dispose", () => {
    test("transitions to Disposed state without initialize", async () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      await manager.dispose();
      assert.strictEqual(manager.state, ServiceState.Disposed);
    });

    test("rejects pending flows on dispose", async () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      // Access internal pendingFlows to simulate a pending flow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingFlows = (manager as any).pendingFlows as Map<
        string,
        unknown
      >;
      let rejectedError: Error | undefined;
      pendingFlows.set("test-state", {
        provider: "github",
        resolve: () => {},
        reject: (err: Error) => {
          rejectedError = err;
        },
        timestamp: Date.now(),
      });
      assert.strictEqual(manager.getPendingFlowCount(), 1);

      await manager.dispose();

      assert.strictEqual(manager.getPendingFlowCount(), 0);
      assert.ok(rejectedError);
      assert.ok(rejectedError!.message.includes("disposed"));
    });

    test("dispose is idempotent", async () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      await manager.dispose();
      assert.strictEqual(manager.state, ServiceState.Disposed);
      // Second dispose should be a no-op
      await manager.dispose();
      assert.strictEqual(manager.state, ServiceState.Disposed);
    });
  });

  suite("validateAndConsume (via internal access)", () => {
    test("returns null for unknown state", () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).validateAndConsume("unknown-state");
      assert.strictEqual(result, null);
    });

    test("returns flow and removes it for valid state", () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingFlows = (manager as any).pendingFlows as Map<
        string,
        unknown
      >;
      const mockFlow = {
        provider: "github",
        resolve: () => {},
        reject: () => {},
        timestamp: Date.now(),
      };
      pendingFlows.set("valid-state", mockFlow);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).validateAndConsume("valid-state");
      assert.ok(result);
      assert.strictEqual(result.provider, "github");
      // Flow should be consumed (removed)
      assert.strictEqual(manager.getPendingFlowCount(), 0);
    });

    test("returns null for expired flow", () => {
      const logger = createMockLogger();
      const manager = new OAuthFlowManager(context, logger);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingFlows = (manager as any).pendingFlows as Map<
        string,
        unknown
      >;
      const expiredFlow = {
        provider: "github",
        resolve: () => {},
        reject: () => {},
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago (exceeds 5 min timeout)
      };
      pendingFlows.set("expired-state", expiredFlow);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).validateAndConsume("expired-state");
      assert.strictEqual(result, null);
      // Expired flow should be removed
      assert.strictEqual(manager.getPendingFlowCount(), 0);
    });
  });
});
