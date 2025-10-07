/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Simple tests for SDKAuthProvider to validate test infrastructure.
 * Tests basic authentication state management and initialization.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { SDKAuthProvider } from "../../services/core/authProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import {
  createMockExtensionContext,
  createMockSDK,
  createMockLogger,
} from "../utils/mockFactory";

suite("SDKAuthProvider Simple Tests", () => {
  let mockContext: vscode.ExtensionContext;
  let mockSDK: ReturnType<typeof createMockSDK>;
  let originalShowInformationMessage: typeof vscode.window.showInformationMessage;

  setup(() => {
    mockContext = createMockExtensionContext();
    mockSDK = createMockSDK();

    // Initialize ServiceLoggers
    const loggerManager = LoggerManager.getInstance(mockContext);
    ServiceLoggers.initialize(loggerManager);

    // Reset singleton for each test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SDKAuthProvider as any).instance = undefined;

    // Mock vscode.window.showInformationMessage to prevent UI dialogs in tests
    originalShowInformationMessage = vscode.window.showInformationMessage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).showInformationMessage = () => Promise.resolve();
  });

  teardown(() => {
    // Clean up singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SDKAuthProvider as any).instance = undefined;

    // Restore original vscode.window.showInformationMessage
    if (originalShowInformationMessage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).showInformationMessage =
        originalShowInformationMessage;
    }
  });

  suite("Basic Initialization", () => {
    test("creates instance with dependency injection", () => {
      const mockLogger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        timeAsync: async <T>(_op: string, fn: () => Promise<T>) => fn(),
      };

      const instance1 = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );
      const instance2 = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      assert.notStrictEqual(
        instance1,
        instance2,
        "Should create separate instances",
      );
    });

    test("getAuthState returns initial unauthenticated state", () => {
      const mockLogger = createMockLogger();

      const authProvider = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      const state = authProvider.getAuthState();

      assert.strictEqual(state.isAuthenticated, false);
      assert.strictEqual(state.user, null);
      assert.strictEqual(state.error, null);
    });

    test("getAuthState returns copy of state", () => {
      const mockLogger = createMockLogger();

      const authProvider = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      const state1 = authProvider.getAuthState();
      const state2 = authProvider.getAuthState();

      // Should be different objects
      assert.notStrictEqual(state1, state2);
      // But with same values
      assert.deepStrictEqual(state1, state2);
    });
  });

  suite("State with No Token", () => {
    test("initialize() without stored token returns unauthenticated", async () => {
      const mockLogger = createMockLogger();

      const authProvider = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      // Mock SDK to return no token
      mockSDK.getToken.mockReturnValue(null);

      await authProvider.initialize();

      const state = authProvider.getAuthState();
      assert.strictEqual(state.isAuthenticated, false);
      assert.strictEqual(state.user, null);
    });
  });

  suite("Logout", () => {
    test("logout() sets state to unauthenticated", async () => {
      const mockLogger = createMockLogger();

      const authProvider = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      await authProvider.logout();

      const state = authProvider.getAuthState();
      assert.strictEqual(state.isAuthenticated, false);
      assert.strictEqual(state.user, null);
    });

    test("logout() calls SDK.logout", async () => {
      const mockLogger = createMockLogger();

      const authProvider = new SDKAuthProvider(
        mockSDK as unknown as DatalayerClient,
        mockContext,
        mockLogger,
      );

      await authProvider.logout();

      // Verify SDK.logout was called
      assert.strictEqual(mockSDK.logout.calls.length, 1);
    });
  });
});
