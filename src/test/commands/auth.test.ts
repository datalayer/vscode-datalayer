/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for authentication command registration.
 * Validates that login, logout, showAuthStatus, and help commands are registered.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { registerAuthCommands } from "../../commands/auth";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

/**
 * Creates a minimal mock auth provider for testing command registration.
 */
function createMockAuthProvider(): {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  showAuthStatus: () => Promise<void>;
  loginCalled: boolean;
  logoutCalled: boolean;
  showAuthStatusCalled: boolean;
} {
  return {
    loginCalled: false,
    logoutCalled: false,
    showAuthStatusCalled: false,
    login: async function () {
      this.loginCalled = true;
    },
    logout: async function () {
      this.logoutCalled = true;
    },
    showAuthStatus: async function () {
      this.showAuthStatusCalled = true;
    },
  };
}

suite("Auth Commands Tests", () => {
  let context: vscode.ExtensionContext;

  suiteSetup(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
    const lm = LoggerManager.getInstance(createMockExtensionContext());
    ServiceLoggers.initialize(lm);
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).initialized = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  setup(() => {
    context = createMockExtensionContext();
  });

  test("registers four commands in context subscriptions", () => {
    const mockAuth = createMockAuthProvider();
    const updateAuthState = () => {};

    registerAuthCommands(
      context,
      mockAuth as unknown as Parameters<typeof registerAuthCommands>[1],
      updateAuthState,
    );

    assert.strictEqual(
      context.subscriptions.length,
      4,
      "Should register 4 commands: login, logout, showAuthStatus, help",
    );
  });

  test("all subscriptions are disposable", () => {
    const mockAuth = createMockAuthProvider();
    const updateAuthState = () => {};

    registerAuthCommands(
      context,
      mockAuth as unknown as Parameters<typeof registerAuthCommands>[1],
      updateAuthState,
    );

    for (const sub of context.subscriptions) {
      assert.ok(
        sub && typeof (sub as vscode.Disposable).dispose === "function",
        "Each subscription should be a disposable",
      );
    }
  });

  test("registers commands with correct command IDs", async () => {
    const mockAuth = createMockAuthProvider();
    const updateAuthState = () => {};

    registerAuthCommands(
      context,
      mockAuth as unknown as Parameters<typeof registerAuthCommands>[1],
      updateAuthState,
    );

    // Verify the registered commands are available through VS Code API
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("datalayer.login"),
      "Should register datalayer.login command",
    );
    assert.ok(
      commands.includes("datalayer.logout"),
      "Should register datalayer.logout command",
    );
    assert.ok(
      commands.includes("datalayer.showAuthStatus"),
      "Should register datalayer.showAuthStatus command",
    );
    assert.ok(
      commands.includes("datalayer.help"),
      "Should register datalayer.help command",
    );
  });
});
