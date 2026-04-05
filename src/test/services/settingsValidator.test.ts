/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for settings validation schemas.
 * Validates that Zod schemas accept valid settings, reject invalid ones,
 * and provide correct default values.
 */

import * as assert from "assert";

import {
  autoConnectSettingsSchema,
  inlineLlmCompletionSettingsSchema,
  loggingSettingsSchema,
  onboardingSettingsSchema,
  proseLlmCompletionSettingsSchema,
  pyodideSettingsSchema,
  runtimeSettingsSchema,
  servicesSettingsSchema,
  toolsSettingsSchema,
} from "../../services/config/settingsValidator";

suite("Settings Validator - Schemas", () => {
  suite("servicesSettingsSchema", () => {
    test("valid settings pass through unchanged", () => {
      const input = {
        iamUrl: "https://custom.example.com",
        runtimesUrl: "https://runtimes.example.com",
        spacerUrl: "https://spacer.example.com",
        spacerWsUrl: "wss://spacer.example.com",
      };
      const result = servicesSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data, input);
    });

    test("missing settings get defaults", () => {
      const result = servicesSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.iamUrl, "https://prod1.datalayer.run");
      assert.strictEqual(result.data.runtimesUrl, "https://r1.datalayer.run");
      assert.strictEqual(result.data.spacerUrl, "https://prod1.datalayer.run");
      assert.strictEqual(result.data.spacerWsUrl, "wss://prod1.datalayer.run");
    });

    test("invalid URLs fail validation", () => {
      const result = servicesSettingsSchema.safeParse({
        iamUrl: "not-a-url",
      });
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes("iamUrl")));
    });

    test("invalid WebSocket URL fails validation", () => {
      const result = servicesSettingsSchema.safeParse({
        spacerWsUrl: "https://not-ws.example.com",
      });
      assert.ok(!result.success);
      assert.ok(
        result.error.issues.some((i) => i.path.includes("spacerWsUrl")),
      );
    });
  });

  suite("runtimeSettingsSchema", () => {
    test("valid settings pass through", () => {
      const input = { defaultMinutes: 10, defaultType: "GPU" as const };
      const result = runtimeSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.strictEqual(result.data.defaultMinutes, 10);
      assert.strictEqual(result.data.defaultType, "GPU");
    });

    test("missing settings get defaults", () => {
      const result = runtimeSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.defaultMinutes, 3);
      assert.strictEqual(result.data.defaultType, "CPU");
    });

    test("invalid number gets rejected", () => {
      const result = runtimeSettingsSchema.safeParse({
        defaultMinutes: 0,
      });
      assert.ok(!result.success);
    });

    test("number above maximum gets rejected", () => {
      const result = runtimeSettingsSchema.safeParse({
        defaultMinutes: 9999,
      });
      assert.ok(!result.success);
    });

    test("invalid enum value gets rejected", () => {
      const result = runtimeSettingsSchema.safeParse({
        defaultType: "TPU",
      });
      assert.ok(!result.success);
    });
  });

  suite("loggingSettingsSchema", () => {
    test("valid settings pass through", () => {
      const input = {
        level: "debug" as const,
        includeTimestamps: false,
        includeContext: false,
        enableDatalayerLogging: false,
        enablePerformanceMonitoring: true,
      };
      const result = loggingSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data, input);
    });

    test("missing settings get defaults", () => {
      const result = loggingSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.level, "info");
      assert.strictEqual(result.data.includeTimestamps, true);
      assert.strictEqual(result.data.includeContext, true);
      assert.strictEqual(result.data.enableDatalayerLogging, true);
      assert.strictEqual(result.data.enablePerformanceMonitoring, false);
    });

    test("invalid log level gets rejected", () => {
      const result = loggingSettingsSchema.safeParse({
        level: "verbose",
      });
      assert.ok(!result.success);
    });
  });

  suite("autoConnectSettingsSchema", () => {
    test("valid strategies pass through", () => {
      const input = { strategies: ["Pyodide", "Active Runtime", "Ask"] };
      const result = autoConnectSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data.strategies, [
        "Pyodide",
        "Active Runtime",
        "Ask",
      ]);
    });

    test("empty array is valid", () => {
      const result = autoConnectSettingsSchema.safeParse({ strategies: [] });
      assert.ok(result.success);
      assert.deepStrictEqual(result.data.strategies, []);
    });

    test("missing settings get defaults", () => {
      const result = autoConnectSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.deepStrictEqual(result.data.strategies, ["Pyodide"]);
    });

    test("invalid strategy gets rejected", () => {
      const result = autoConnectSettingsSchema.safeParse({
        strategies: ["InvalidStrategy"],
      });
      assert.ok(!result.success);
    });
  });

  suite("onboardingSettingsSchema", () => {
    test("valid boolean passes through", () => {
      const result = onboardingSettingsSchema.safeParse({
        showWelcome: false,
      });
      assert.ok(result.success);
      assert.strictEqual(result.data.showWelcome, false);
    });

    test("missing settings get defaults", () => {
      const result = onboardingSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.showWelcome, true);
    });
  });

  suite("toolsSettingsSchema", () => {
    test("valid format passes through", () => {
      const result = toolsSettingsSchema.safeParse({
        responseFormat: "json",
      });
      assert.ok(result.success);
      assert.strictEqual(result.data.responseFormat, "json");
    });

    test("missing settings get defaults", () => {
      const result = toolsSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.responseFormat, "toon");
    });

    test("invalid format gets rejected", () => {
      const result = toolsSettingsSchema.safeParse({
        responseFormat: "xml",
      });
      assert.ok(!result.success);
    });
  });

  suite("pyodideSettingsSchema", () => {
    test("valid settings pass through", () => {
      const input = {
        preloadBehavior: "disabled" as const,
        version: "0.28.0",
        preloadPackages: ["numpy"],
      };
      const result = pyodideSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data, input);
    });

    test("missing settings get defaults", () => {
      const result = pyodideSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.preloadBehavior, "auto");
      assert.strictEqual(result.data.version, "0.27.3");
      assert.deepStrictEqual(result.data.preloadPackages, [
        "numpy",
        "pandas",
        "matplotlib",
        "matplotlib-inline",
        "ipython",
      ]);
    });

    test("invalid preload behavior gets rejected", () => {
      const result = pyodideSettingsSchema.safeParse({
        preloadBehavior: "never",
      });
      assert.ok(!result.success);
    });
  });

  suite("inlineLlmCompletionSettingsSchema", () => {
    test("valid settings pass through", () => {
      const input = {
        enabled: false,
        triggerMode: "manual" as const,
        debounceMs: 500,
        contextBlocks: 5,
      };
      const result = inlineLlmCompletionSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data, input);
    });

    test("missing settings get defaults", () => {
      const result = inlineLlmCompletionSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.enabled, true);
      assert.strictEqual(result.data.triggerMode, "auto");
      assert.strictEqual(result.data.debounceMs, 200);
      assert.strictEqual(result.data.contextBlocks, -1);
    });

    test("debounce above maximum gets rejected", () => {
      const result = inlineLlmCompletionSettingsSchema.safeParse({
        debounceMs: 5000,
      });
      assert.ok(!result.success);
    });

    test("negative debounce gets rejected", () => {
      const result = inlineLlmCompletionSettingsSchema.safeParse({
        debounceMs: -100,
      });
      assert.ok(!result.success);
    });
  });

  suite("proseLlmCompletionSettingsSchema", () => {
    test("valid settings pass through", () => {
      const input = {
        enabled: true,
        triggerMode: "auto" as const,
        triggerKey: "Cmd+I",
        debounceMs: 300,
        contextBlocks: 3,
      };
      const result = proseLlmCompletionSettingsSchema.safeParse(input);
      assert.ok(result.success);
      assert.deepStrictEqual(result.data, input);
    });

    test("missing settings get defaults", () => {
      const result = proseLlmCompletionSettingsSchema.safeParse({});
      assert.ok(result.success);
      assert.strictEqual(result.data.enabled, true);
      assert.strictEqual(result.data.triggerMode, "manual");
      assert.strictEqual(result.data.triggerKey, "Cmd+Shift+,");
      assert.strictEqual(result.data.debounceMs, 500);
      assert.strictEqual(result.data.contextBlocks, -1);
    });
  });
});
