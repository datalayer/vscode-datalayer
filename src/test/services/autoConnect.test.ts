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
import {
  type AutoConnectContext,
  AutoConnectService,
} from "../../services/autoConnect/autoConnectService";
import { ActiveRuntimeStrategy } from "../../services/autoConnect/strategies/activeRuntimeStrategy";
import { PyodideStrategy } from "../../services/autoConnect/strategies/pyodideStrategy";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockDatalayer,
  createMockExtensionContext,
} from "../utils/mockFactory";

/**
 * Creates a mock RuntimeDTO for auto-connect testing.
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
 * Creates a mock auth provider for auto-connect.
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

suite("AutoConnect Tests", () => {
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

  suite("AutoConnectService", () => {
    test("constructor creates service with registered strategies", () => {
      const service = new AutoConnectService();
      assert.ok(service);
    });
  });

  suite("ActiveRuntimeStrategy", () => {
    test("has name 'Active Runtime'", () => {
      const strategy = new ActiveRuntimeStrategy();
      assert.strictEqual(strategy.name, "Active Runtime");
    });

    test("returns null when no runtimes available", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: {
          getCachedRuntimes: () => [],
        } as unknown as RuntimesTreeProvider,
      };

      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });

    test("returns null when runtimesTreeProvider is undefined", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
      } as AutoConnectContext;

      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });

    test("returns runtime with most time remaining", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();

      const runtime1 = createMockRuntimeDTO({
        uid: "short-lived",
        expiredAt: new Date(now + 30 * 60 * 1000),
      });
      const runtime2 = createMockRuntimeDTO({
        uid: "long-lived",
        expiredAt: new Date(now + 120 * 60 * 1000),
      });
      const runtime3 = createMockRuntimeDTO({
        uid: "medium-lived",
        expiredAt: new Date(now + 60 * 60 * 1000),
      });

      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: {
          getCachedRuntimes: () => [runtime1, runtime2, runtime3],
        } as unknown as RuntimesTreeProvider,
      };

      const result = await strategy.tryConnect(context);
      assert.ok(result);
      assert.strictEqual(result!.uid, "long-lived");
    });

    test("filters out expired runtimes", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();

      const expiredRuntime = createMockRuntimeDTO({
        uid: "expired",
        expiredAt: new Date(now - 60000),
      });
      const activeRuntime = createMockRuntimeDTO({
        uid: "active",
        expiredAt: new Date(now + 3600000),
      });

      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: {
          getCachedRuntimes: () => [expiredRuntime, activeRuntime],
        } as unknown as RuntimesTreeProvider,
      };

      const result = await strategy.tryConnect(context);
      assert.ok(result);
      assert.strictEqual(result!.uid, "active");
    });

    test("returns null when all runtimes are expired", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const now = Date.now();

      const expired1 = createMockRuntimeDTO({
        uid: "expired1",
        expiredAt: new Date(now - 60000),
      });
      const expired2 = createMockRuntimeDTO({
        uid: "expired2",
        expiredAt: new Date(now - 120000),
      });

      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: {
          getCachedRuntimes: () => [expired1, expired2],
        } as unknown as RuntimesTreeProvider,
      };

      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });

    test("returns the single available runtime", async () => {
      const strategy = new ActiveRuntimeStrategy();
      const runtime = createMockRuntimeDTO({
        uid: "only-one",
        expiredAt: new Date(Date.now() + 3600000),
      });

      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
        runtimesTreeProvider: {
          getCachedRuntimes: () => [runtime],
        } as unknown as RuntimesTreeProvider,
      };

      const result = await strategy.tryConnect(context);
      assert.ok(result);
      assert.strictEqual(result!.uid, "only-one");
    });
  });

  suite("PyodideStrategy", () => {
    test("has name 'Pyodide'", () => {
      const strategy = new PyodideStrategy();
      assert.strictEqual(strategy.name, "Pyodide");
    });

    test("tryConnect returns null (Pyodide is not a cloud runtime)", async () => {
      const strategy = new PyodideStrategy();
      const context = {
        documentUri: vscode.Uri.file("/test/notebook.ipynb"),
        datalayer: createMockDatalayer() as unknown as DatalayerClient,
        authProvider: createMockAuthProvider(),
      } as AutoConnectContext;

      const result = await strategy.tryConnect(context);
      assert.strictEqual(result, null);
    });

    test("isPyodideStrategy returns true for 'Pyodide'", () => {
      assert.strictEqual(PyodideStrategy.isPyodideStrategy("Pyodide"), true);
    });

    test("isPyodideStrategy returns false for other names", () => {
      assert.strictEqual(
        PyodideStrategy.isPyodideStrategy("Active Runtime"),
        false,
      );
      assert.strictEqual(PyodideStrategy.isPyodideStrategy("Ask"), false);
      assert.strictEqual(PyodideStrategy.isPyodideStrategy(""), false);
    });
  });
});
