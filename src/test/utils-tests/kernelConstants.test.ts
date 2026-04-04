/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import {
  isLocalKernelUrl,
  LOCAL_KERNEL_URL_PREFIX,
} from "../../constants/kernelConstants";

suite("Kernel Constants Tests", () => {
  suite("LOCAL_KERNEL_URL_PREFIX", () => {
    test("has expected value", () => {
      assert.strictEqual(LOCAL_KERNEL_URL_PREFIX, "local-kernel-");
    });

    test("is a string", () => {
      assert.strictEqual(typeof LOCAL_KERNEL_URL_PREFIX, "string");
    });
  });

  suite("isLocalKernelUrl", () => {
    test("returns true for valid local kernel URL", () => {
      const url = "http://local-kernel-abc123.localhost:8888/api";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("returns true for URL with prefix and .localhost", () => {
      const url = "https://local-kernel-my-kernel.localhost/jupyter";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("returns true for URL with UUID-style kernel id", () => {
      const url =
        "http://local-kernel-550e8400-e29b-41d4-a716-446655440000.localhost:9999";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("returns false for URL without prefix", () => {
      const url = "http://remote-kernel.localhost:8888";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("returns false for URL without .localhost", () => {
      const url = "http://local-kernel-abc123.example.com:8888";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("returns false for URL with neither prefix nor .localhost", () => {
      const url = "https://api.datalayer.run/runtimes";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("returns false for empty string", () => {
      assert.strictEqual(isLocalKernelUrl(""), false);
    });

    test("returns false for prefix only without .localhost", () => {
      const url = "local-kernel-test";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("returns false for .localhost only without prefix", () => {
      const url = "http://something.localhost:8888";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("returns true when prefix and .localhost appear in path", () => {
      const url = "http://host.com/local-kernel-id.localhost/api";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("handles URL with port number", () => {
      const url = "http://local-kernel-test.localhost:3000/api/kernels";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("handles URL with query parameters", () => {
      const url = "http://local-kernel-test.localhost:8888?token=abc123";

      assert.strictEqual(isLocalKernelUrl(url), true);
    });

    test("is case-sensitive for prefix", () => {
      const url = "http://LOCAL-KERNEL-abc.localhost:8888";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });

    test("is case-sensitive for .localhost", () => {
      const url = "http://local-kernel-abc.LOCALHOST:8888";

      assert.strictEqual(isLocalKernelUrl(url), false);
    });
  });
});
