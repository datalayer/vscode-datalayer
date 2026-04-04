/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for datalayerAdapter service.
 * Validates DatalayerClient creation, WebSocket URL resolution, and global instance management.
 */

import * as assert from "assert";

import {
  getDatalayerInstance,
  getWebSocketUrl,
  setDatalayerInstance,
} from "../../services/core/datalayerAdapter";

suite("DatalayerAdapter Tests", () => {
  suite("getWebSocketUrl", () => {
    test("returns a string", () => {
      const url = getWebSocketUrl();
      assert.strictEqual(typeof url, "string");
    });

    test("returns a websocket URL starting with wss://", () => {
      const url = getWebSocketUrl();
      assert.ok(
        url.startsWith("wss://"),
        `Expected URL to start with wss://, got: ${url}`,
      );
    });

    test("returns fallback production URL when no config is set", () => {
      const url = getWebSocketUrl();
      // Default fallback is wss://prod1.datalayer.run
      assert.strictEqual(url, "wss://prod1.datalayer.run");
    });
  });

  suite("Global Instance Management", () => {
    // Save and restore original state
    let originalInstance: unknown;

    setup(() => {
      try {
        originalInstance = getDatalayerInstance();
      } catch {
        originalInstance = undefined;
      }
    });

    teardown(() => {
      // Restore original if it existed
      if (originalInstance) {
        setDatalayerInstance(originalInstance as never);
      }
    });

    test("setDatalayerInstance and getDatalayerInstance round-trip", () => {
      const mockDatalayer = { mock: true } as never;
      setDatalayerInstance(mockDatalayer);

      const result = getDatalayerInstance();
      assert.strictEqual(result, mockDatalayer);
    });

    test("setDatalayerInstance overwrites previous instance", () => {
      const first = { id: 1 } as never;
      const second = { id: 2 } as never;

      setDatalayerInstance(first);
      setDatalayerInstance(second);

      const result = getDatalayerInstance();
      assert.strictEqual(result, second);
    });
  });
});
