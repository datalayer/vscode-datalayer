/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as assert from "assert";
import * as vscode from "vscode";

import type { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import type { AutoConnectContext } from "../../services/autoConnect/autoConnectService";
import { ActiveRuntimeStrategy } from "../../services/autoConnect/strategies/activeRuntimeStrategy";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockDatalayer,
  createMockExtensionContext,
} from "../utils/mockFactory";

/**
 * Creates a mock RuntimeDTO with expiredAt as a Date object.
 */
function createMockRuntimeDTO(
  overrides: Record<string, unknown> = {},
): RuntimeDTO {
  return {
    uid: "runtime-001",
    podName: "pod-123",
    givenName: "Test Runtime",
    environmentName: "python-cpu",
    environmentTitle: "Python CPU",
    type: "notebook",
    burningRate: 0.5,
    ingress: "https://mock.datalayer.run/runtime",
    token: "mock-token",
    startedAt: new Date(Date.now() - 3600000),
    expiredAt: new Date(Date.now() + 3600000),
    ...overrides,
  } as RuntimeDTO;
}

/**
 * Creates a mock auth provider.
 */
function createMockAuthProvider(): IAuthProvider {
  return {
    isAuthenticated: () => true,
    getToken: () => "mock-token",
    getAuthState: () => ({
      isAuthenticated: true,
      user: null,
      error: null,
    }),
  } as unknown as IAuthProvider;
}

/**
 * Helper to create AutoConnectContext with given runtimes.
 */
function createContext(runtimes: RuntimeDTO[]): AutoConnectContext {
  return {
    documentUri: vscode.Uri.file("/test/notebook.ipynb"),
    datalayer: createMockDatalayer() as unknown as DatalayerClient,
    authProvider: createMockAuthProvider(),
    runtimesTreeProvider: {
      getCachedRuntimes: () => runtimes,
    } as unknown as RuntimesTreeProvider,
  };
}

suite("ActiveRuntimeStrategy Extended Tests", () => {
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

  suite("edge cases for runtime selection", () => {
    test("handles runtimes with identical expiration times", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();
      const sameTime = new Date(now + 60 * 60 * 1000);

      const runtime1 = createMockRuntimeDTO({
        uid: "runtime-a",
        expiredAt: sameTime,
      });
      const runtime2 = createMockRuntimeDTO({
        uid: "runtime-b",
        expiredAt: sameTime,
      });

      const context = createContext([runtime1, runtime2]);
      const result = await strategy.tryConnect(context);

      assert.ok(result);
      // With identical times, sort is stable so first element wins
      assert.ok(
        result!.uid === "runtime-a" || result!.uid === "runtime-b",
        "Should return one of the two runtimes",
      );
    });

    test("handles single runtime that is about to expire (1 second left)", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const runtime = createMockRuntimeDTO({
        uid: "almost-expired",
        expiredAt: new Date(Date.now() + 1000), // 1 second from now
      });

      const context = createContext([runtime]);
      const result = await strategy.tryConnect(context);

      assert.ok(result);
      assert.strictEqual(result!.uid, "almost-expired");
    });

    test("handles mix of many expired and one valid runtime", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();

      const runtimes = [
        createMockRuntimeDTO({
          uid: "expired-1",
          expiredAt: new Date(now - 1000),
        }),
        createMockRuntimeDTO({
          uid: "expired-2",
          expiredAt: new Date(now - 2000),
        }),
        createMockRuntimeDTO({
          uid: "expired-3",
          expiredAt: new Date(now - 3000),
        }),
        createMockRuntimeDTO({
          uid: "the-valid-one",
          expiredAt: new Date(now + 3600000),
        }),
        createMockRuntimeDTO({
          uid: "expired-4",
          expiredAt: new Date(now - 4000),
        }),
      ];

      const context = createContext(runtimes);
      const result = await strategy.tryConnect(context);

      assert.ok(result);
      assert.strictEqual(result!.uid, "the-valid-one");
    });

    test("prefers runtime with 2 hours over runtime with 30 minutes", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();

      const shortRuntime = createMockRuntimeDTO({
        uid: "short",
        expiredAt: new Date(now + 30 * 60 * 1000), // 30 min
      });
      const longRuntime = createMockRuntimeDTO({
        uid: "long",
        expiredAt: new Date(now + 2 * 60 * 60 * 1000), // 2 hours
      });

      // Provide in reverse order to verify sorting
      const context = createContext([shortRuntime, longRuntime]);
      const result = await strategy.tryConnect(context);

      assert.ok(result);
      assert.strictEqual(result!.uid, "long");
    });

    test("handles runtimesTreeProvider returning null-ish via optional chaining", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: undefined,
      } as AutoConnectContext;

      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });

    test("handles runtimesTreeProvider with getCachedRuntimes returning empty", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const context = createContext([]);
      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });
  });

  suite("strategy name", () => {
    test("name property is 'Active Runtime'", () => {
      const strategy = new ActiveRuntimeStrategy();
      assert.strictEqual(strategy.name, "Active Runtime");
    });
  });
});
