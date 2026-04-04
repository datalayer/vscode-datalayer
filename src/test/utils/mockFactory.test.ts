/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for the mock factory utilities used across the test suite.
 * Validates that mock objects have the correct structure and behavior.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import {
  createMockDatalayer,
  createMockExtensionContext,
  createMockLogger,
  createMockOutputChannel,
  createMockRuntime,
  createMockSecretStorage,
  createMockStatusBarItem,
  createMockUser,
  createSpy,
  SpyFunction,
  waitFor,
} from "../../test/utils/mockFactory";

suite("MockFactory Tests", () => {
  suite("createMockExtensionContext", () => {
    test("returns an object with required fields", () => {
      const ctx = createMockExtensionContext();
      assert.ok(ctx.subscriptions);
      assert.ok(ctx.extensionUri);
      assert.ok(ctx.extensionPath);
      assert.ok(ctx.globalState);
      assert.ok(ctx.workspaceState);
      assert.ok(ctx.secrets);
    });

    test("extensionMode is Test", () => {
      const ctx = createMockExtensionContext();
      assert.strictEqual(ctx.extensionMode, vscode.ExtensionMode.Test);
    });

    test("globalState get/update works", async () => {
      const ctx = createMockExtensionContext();
      await ctx.globalState.update("testKey", "testValue");
      assert.strictEqual(ctx.globalState.get("testKey"), "testValue");
    });

    test("globalState returns default value for missing key", () => {
      const ctx = createMockExtensionContext();
      assert.strictEqual(
        ctx.globalState.get("missingKey", "default"),
        "default",
      );
    });

    test("workspaceState get/update works", async () => {
      const ctx = createMockExtensionContext();
      await ctx.workspaceState.update("wsKey", 42);
      assert.strictEqual(ctx.workspaceState.get("wsKey"), 42);
    });

    test("secrets store/get/delete works", async () => {
      const ctx = createMockExtensionContext();
      await ctx.secrets.store("secretKey", "secretValue");
      const value = await ctx.secrets.get("secretKey");
      assert.strictEqual(value, "secretValue");

      await ctx.secrets.delete("secretKey");
      const deleted = await ctx.secrets.get("secretKey");
      assert.strictEqual(deleted, undefined);
    });

    test("asAbsolutePath returns full path", () => {
      const ctx = createMockExtensionContext();
      const result = ctx.asAbsolutePath("resources/icon.png");
      assert.ok(result.includes("resources/icon.png"));
    });

    test("subscriptions starts as empty array", () => {
      const ctx = createMockExtensionContext();
      assert.strictEqual(ctx.subscriptions.length, 0);
    });
  });

  suite("createMockUser", () => {
    test("returns user with default fields", () => {
      const user = createMockUser() as Record<string, unknown>;
      assert.strictEqual(user.uid, "mock-user-id");
      assert.strictEqual(user.email, "test@example.com");
      assert.strictEqual(user.firstName, "Test");
      assert.strictEqual(user.lastName, "User");
      assert.strictEqual(user.displayName, "Test User");
    });

    test("applies overrides", () => {
      const user = createMockUser({
        email: "custom@example.com",
        firstName: "Custom",
      }) as Record<string, unknown>;
      assert.strictEqual(user.email, "custom@example.com");
      assert.strictEqual(user.firstName, "Custom");
      assert.strictEqual(user.lastName, "User"); // unchanged
    });
  });

  suite("createMockRuntime", () => {
    test("returns runtime with default fields", () => {
      const runtime = createMockRuntime() as Record<string, unknown>;
      assert.strictEqual(runtime.uid, "mock-runtime-id");
      assert.strictEqual(runtime.givenName, "Test Runtime");
      assert.strictEqual(runtime.environmentName, "python-cpu-env");
      assert.strictEqual(runtime.burningRate, 0.5);
    });

    test("applies overrides", () => {
      const runtime = createMockRuntime({
        uid: "custom-id",
        givenName: "Custom Runtime",
      }) as Record<string, unknown>;
      assert.strictEqual(runtime.uid, "custom-id");
      assert.strictEqual(runtime.givenName, "Custom Runtime");
    });
  });

  suite("SpyFunction", () => {
    test("tracks calls", () => {
      const spy = new SpyFunction();
      spy.call("arg1", "arg2");
      spy.call("arg3");

      assert.strictEqual(spy.calls.length, 2);
      assert.deepStrictEqual(spy.calls[0], ["arg1", "arg2"]);
      assert.deepStrictEqual(spy.calls[1], ["arg3"]);
    });

    test("returns configured return value", () => {
      const spy = new SpyFunction<string>();
      spy.mockReturnValue("hello");

      const result = spy.call();
      assert.strictEqual(result, "hello");
    });

    test("returns configured resolved value", async () => {
      const spy = new SpyFunction<number>();
      spy.mockResolvedValue(42);

      const result = await spy.call();
      assert.strictEqual(result, 42);
    });

    test("returns configured rejected value", async () => {
      const spy = new SpyFunction<string>();
      spy.mockRejectedValue(new Error("test error"));

      await assert.rejects(async () => {
        await spy.call();
      }, /test error/);
    });

    test("reset clears calls and return values", () => {
      const spy = new SpyFunction<string>();
      spy.mockReturnValue("hello");
      spy.call();

      spy.reset();

      assert.strictEqual(spy.calls.length, 0);
      assert.strictEqual(spy.returnValue, undefined);
      assert.strictEqual(spy.resolveValue, undefined);
      assert.strictEqual(spy.rejectValue, undefined);
    });

    test("mockReturnValue returns this for chaining", () => {
      const spy = new SpyFunction<string>();
      const result = spy.mockReturnValue("test");
      assert.strictEqual(result, spy);
    });

    test("mockResolvedValue returns this for chaining", () => {
      const spy = new SpyFunction<string>();
      const result = spy.mockResolvedValue("test");
      assert.strictEqual(result, spy);
    });

    test("mockRejectedValue returns this for chaining", () => {
      const spy = new SpyFunction<string>();
      const result = spy.mockRejectedValue(new Error("test"));
      assert.strictEqual(result, spy);
    });
  });

  suite("createMockLogger", () => {
    test("returns logger with all required methods", () => {
      const logger = createMockLogger();
      assert.ok(typeof logger.trace === "function");
      assert.ok(typeof logger.debug === "function");
      assert.ok(typeof logger.info === "function");
      assert.ok(typeof logger.warn === "function");
      assert.ok(typeof logger.error === "function");
      assert.ok(typeof logger.timeAsync === "function");
    });

    test("all logging methods are no-ops (do not throw)", () => {
      const logger = createMockLogger();
      assert.doesNotThrow(() => logger.trace("msg"));
      assert.doesNotThrow(() => logger.debug("msg"));
      assert.doesNotThrow(() => logger.info("msg"));
      assert.doesNotThrow(() => logger.warn("msg"));
      assert.doesNotThrow(() => logger.error("msg", new Error("test")));
    });

    test("timeAsync executes the function and returns result", async () => {
      const logger = createMockLogger();
      const result = await logger.timeAsync("op", async () => 42);
      assert.strictEqual(result, 42);
    });
  });

  suite("createMockDatalayer", () => {
    test("returns object with auth methods", () => {
      const datalayer = createMockDatalayer();
      assert.ok(typeof datalayer.auth.isAuthenticated === "function");
      assert.ok(typeof datalayer.auth.getCurrentUser === "function");
      assert.ok(typeof datalayer.auth.storeToken === "function");
      assert.ok(typeof datalayer.auth.clearToken === "function");
    });

    test("returns object with flat DatalayerClient methods", () => {
      const datalayer = createMockDatalayer();
      assert.ok(typeof datalayer.whoami === "function");
      assert.ok(typeof datalayer.login === "function");
      assert.ok(typeof datalayer.logout === "function");
      assert.ok(typeof datalayer.listRuntimes === "function");
      assert.ok(typeof datalayer.createRuntime === "function");
      assert.ok(typeof datalayer.getMySpaces === "function");
      assert.ok(typeof datalayer.createNotebook === "function");
      assert.ok(typeof datalayer.createLexical === "function");
    });

    test("auth.isAuthenticated defaults to false", () => {
      const datalayer = createMockDatalayer();
      assert.strictEqual(datalayer.auth.isAuthenticated(), false);
    });

    test("auth.getCurrentUser defaults to null", () => {
      const datalayer = createMockDatalayer();
      assert.strictEqual(datalayer.auth.getCurrentUser(), null);
    });

    test("spy tracks calls correctly", () => {
      const datalayer = createMockDatalayer();
      datalayer.whoami("arg1");
      datalayer.whoami("arg2");
      assert.strictEqual(datalayer.whoami.calls.length, 2);
    });

    test("spy mockResolvedValue works", async () => {
      const datalayer = createMockDatalayer();
      datalayer.listRuntimes.mockResolvedValue([{ uid: "rt-1" }]);
      const result = await datalayer.listRuntimes();
      assert.deepStrictEqual(result, [{ uid: "rt-1" }]);
    });

    test("spy reset clears calls", () => {
      const datalayer = createMockDatalayer();
      datalayer.whoami();
      assert.strictEqual(datalayer.whoami.calls.length, 1);
      datalayer.whoami.reset();
      assert.strictEqual(datalayer.whoami.calls.length, 0);
    });
  });

  suite("createMockOutputChannel", () => {
    test("returns channel with default name", () => {
      const channel = createMockOutputChannel();
      assert.strictEqual(channel.name, "Test");
    });

    test("returns channel with custom name", () => {
      const channel = createMockOutputChannel("Custom");
      assert.strictEqual(channel.name, "Custom");
    });

    test("append and appendLine do not throw", () => {
      const channel = createMockOutputChannel();
      assert.doesNotThrow(() => channel.append("text"));
      assert.doesNotThrow(() => channel.appendLine("line"));
    });

    test("clear does not throw", () => {
      const channel = createMockOutputChannel();
      channel.appendLine("test");
      assert.doesNotThrow(() => channel.clear());
    });

    test("show and hide do not throw", () => {
      const channel = createMockOutputChannel();
      assert.doesNotThrow(() => channel.show());
      assert.doesNotThrow(() => channel.hide());
    });

    test("dispose does not throw", () => {
      const channel = createMockOutputChannel();
      assert.doesNotThrow(() => channel.dispose());
    });
  });

  suite("createMockSecretStorage", () => {
    test("stores and retrieves secrets", async () => {
      const storage = createMockSecretStorage();
      await storage.store("key1", "value1");
      const result = await storage.get("key1");
      assert.strictEqual(result, "value1");
    });

    test("returns undefined for missing key", async () => {
      const storage = createMockSecretStorage();
      const result = await storage.get("nonexistent");
      assert.strictEqual(result, undefined);
    });

    test("deletes secrets", async () => {
      const storage = createMockSecretStorage();
      await storage.store("key1", "value1");
      await storage.delete("key1");
      const result = await storage.get("key1");
      assert.strictEqual(result, undefined);
    });
  });

  suite("createMockStatusBarItem", () => {
    test("returns item with empty text", () => {
      const item = createMockStatusBarItem();
      assert.strictEqual(item.text, "");
    });

    test("text is writable", () => {
      const item = createMockStatusBarItem();
      item.text = "$(sync~spin) Connecting...";
      assert.strictEqual(item.text, "$(sync~spin) Connecting...");
    });

    test("show and hide do not throw", () => {
      const item = createMockStatusBarItem();
      assert.doesNotThrow(() => item.show());
      assert.doesNotThrow(() => item.hide());
    });
  });

  suite("waitFor", () => {
    test("resolves when function returns truthy value", async () => {
      let count = 0;
      const result = await waitFor(() => {
        count++;
        return count >= 3 ? "found" : null;
      });
      assert.strictEqual(result, "found");
    });

    test("throws on timeout", async () => {
      await assert.rejects(async () => {
        await waitFor(() => false, { timeout: 100, interval: 20 });
      }, /waitFor timeout/);
    });

    test("works with async functions", async () => {
      let count = 0;
      const result = await waitFor(async () => {
        count++;
        return count >= 2 ? 42 : undefined;
      });
      assert.strictEqual(result, 42);
    });
  });

  suite("createSpy", () => {
    test("creates a new SpyFunction instance", () => {
      const spy = createSpy();
      assert.ok(spy instanceof SpyFunction);
      assert.strictEqual(spy.calls.length, 0);
    });
  });
});
