/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import * as assert from "assert";

import { DocumentBridge } from "../../services/bridges/documentBridge";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockDatalayer,
  createMockExtensionContext,
} from "../utils/mockFactory";

suite("DocumentBridge Tests", () => {
  let mockDatalayer: ReturnType<typeof createMockDatalayer>;

  suiteSetup(() => {
    const context = createMockExtensionContext();
    if (!ServiceLoggers.isInitialized()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (LoggerManager as any).instance = undefined;
      const loggerManager = LoggerManager.getInstance(context);
      ServiceLoggers.initialize(loggerManager);
    }
  });

  setup(() => {
    mockDatalayer = createMockDatalayer();
    // Reset the singleton between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DocumentBridge as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DocumentBridge as any).datalayer = undefined;
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DocumentBridge as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DocumentBridge as any).datalayer = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("getInstance", () => {
    test("creates singleton instance with datalayer", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      assert.ok(bridge);
    });

    test("returns same instance on subsequent calls", () => {
      const context = createMockExtensionContext();
      const bridge1 = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      const bridge2 = DocumentBridge.getInstance();
      assert.strictEqual(bridge1, bridge2);
    });

    test("throws when no datalayer provided on first call", () => {
      assert.throws(() => {
        DocumentBridge.getInstance(createMockExtensionContext());
      }, /Datalayer is required/);
    });
  });

  suite("getMetadataById", () => {
    test("returns undefined for unknown document ID", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      const result = bridge.getMetadataById("unknown-id");
      assert.strictEqual(result, undefined);
    });
  });

  suite("getMetadataByPath", () => {
    test("returns undefined for unknown path", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      const result = bridge.getMetadataByPath("/nonexistent/path.ipynb");
      assert.strictEqual(result, undefined);
    });
  });

  suite("getActiveRuntimes", () => {
    test("returns empty array initially", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      const runtimes = bridge.getActiveRuntimes();
      assert.ok(Array.isArray(runtimes));
      assert.strictEqual(runtimes.length, 0);
    });
  });

  suite("clearDocument", () => {
    test("does not throw for unknown document ID", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      assert.doesNotThrow(() => bridge.clearDocument("unknown-id"));
    });
  });

  suite("dispose", () => {
    test("clears metadata and active runtimes", () => {
      const context = createMockExtensionContext();
      const bridge = DocumentBridge.getInstance(
        context,
        mockDatalayer as unknown as DatalayerClient,
      );
      bridge.dispose();
      assert.strictEqual(bridge.getActiveRuntimes().length, 0);
    });
  });
});
