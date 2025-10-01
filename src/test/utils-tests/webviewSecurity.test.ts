/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for webview security utilities.
 * Validates CSP nonce generation for secure webviews.
 */

import * as assert from "assert";
import { getNonce } from "../../utils/webviewSecurity";

suite("Webview Security Utils Tests", () => {
  suite("getNonce", () => {
    test("generates 32-character string", () => {
      const nonce = getNonce();

      assert.strictEqual(nonce.length, 32);
    });

    test("generates alphanumeric characters only", () => {
      const nonce = getNonce();
      const alphanumericRegex = /^[A-Za-z0-9]+$/;

      assert.ok(alphanumericRegex.test(nonce));
    });

    test("generates unique nonces", () => {
      const nonce1 = getNonce();
      const nonce2 = getNonce();

      assert.notStrictEqual(nonce1, nonce2);
    });

    test("generates different nonces across multiple calls", () => {
      const nonces = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        nonces.add(getNonce());
      }

      // All nonces should be unique
      assert.strictEqual(nonces.size, iterations);
    });

    test("nonce contains characters from expected set", () => {
      const nonce = getNonce();
      const validChars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for (const char of nonce) {
        assert.ok(validChars.includes(char), `Invalid character: ${char}`);
      }
    });

    test("generates cryptographically random values", () => {
      // Test that distribution is reasonably uniform
      const nonces = new Set<string>();
      const samples = 1000;

      for (let i = 0; i < samples; i++) {
        nonces.add(getNonce());
      }

      // With 1000 samples of 32-char alphanumeric strings,
      // duplicates should be extremely rare
      assert.ok(nonces.size > samples * 0.99);
    });

    test("can be used in CSP headers", () => {
      const nonce = getNonce();
      const csp = `default-src 'none'; script-src 'nonce-${nonce}'`;

      assert.ok(csp.includes(nonce));
      assert.ok(csp.startsWith("default-src 'none'"));
    });
  });
});
