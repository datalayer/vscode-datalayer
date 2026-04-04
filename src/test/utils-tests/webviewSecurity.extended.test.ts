/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for webview security utilities.
 * Covers additional edge cases and statistical properties of nonce generation.
 */

import * as assert from "assert";

import { getNonce } from "../../utils/webviewSecurity";

suite("Webview Security Extended Tests", () => {
  suite("getNonce character distribution", () => {
    test("generates nonces containing both uppercase and lowercase letters", () => {
      // With 32 chars from a 62-char alphabet, the probability of missing
      // all uppercase or all lowercase in a single nonce is astronomically small
      // across 100 samples
      let hasUpper = false;
      let hasLower = false;
      let hasDigit = false;

      for (let i = 0; i < 100; i++) {
        const nonce = getNonce();
        if (/[A-Z]/.test(nonce)) {
          hasUpper = true;
        }
        if (/[a-z]/.test(nonce)) {
          hasLower = true;
        }
        if (/[0-9]/.test(nonce)) {
          hasDigit = true;
        }
      }

      assert.ok(hasUpper, "Should contain uppercase letters across 100 nonces");
      assert.ok(hasLower, "Should contain lowercase letters across 100 nonces");
      assert.ok(hasDigit, "Should contain digits across 100 nonces");
    });

    test("does not contain special characters", () => {
      for (let i = 0; i < 50; i++) {
        const nonce = getNonce();
        assert.ok(
          !/[^A-Za-z0-9]/.test(nonce),
          `Nonce should not contain special characters: ${nonce}`,
        );
      }
    });

    test("does not contain whitespace", () => {
      for (let i = 0; i < 50; i++) {
        const nonce = getNonce();
        assert.ok(
          !/\s/.test(nonce),
          `Nonce should not contain whitespace: ${nonce}`,
        );
      }
    });
  });

  suite("getNonce consistency", () => {
    test("always returns exactly 32 characters", () => {
      for (let i = 0; i < 200; i++) {
        const nonce = getNonce();
        assert.strictEqual(
          nonce.length,
          32,
          `Nonce ${i} should be 32 chars but was ${nonce.length}`,
        );
      }
    });

    test("returns a string type", () => {
      const nonce = getNonce();
      assert.strictEqual(typeof nonce, "string");
    });

    test("is suitable for embedding in HTML attributes", () => {
      const nonce = getNonce();
      // Nonce should not break HTML attribute quotes
      assert.ok(!nonce.includes('"'), "Should not contain double quotes");
      assert.ok(!nonce.includes("'"), "Should not contain single quotes");
      assert.ok(!nonce.includes("<"), "Should not contain angle brackets");
      assert.ok(!nonce.includes(">"), "Should not contain angle brackets");
      assert.ok(!nonce.includes("&"), "Should not contain ampersand");
    });

    test("is safe for use in CSP script-src directive", () => {
      const nonce = getNonce();
      const cspHeader = `script-src 'nonce-${nonce}'`;
      // CSP nonce values must be base64 or alphanumeric
      assert.ok(
        /^script-src 'nonce-[A-Za-z0-9]+'$/.test(cspHeader),
        `CSP header should be well-formed: ${cspHeader}`,
      );
    });
  });

  suite("getNonce uniqueness", () => {
    test("generates highly unique nonces across 500 samples", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 500; i++) {
        nonces.add(getNonce());
      }
      assert.ok(
        nonces.size >= 499,
        `Expected at least 499 unique nonces out of 500 samples, but got ${nonces.size}`,
      );
    });

    test("successive calls produce different values", () => {
      const nonce1 = getNonce();
      const nonce2 = getNonce();
      const nonce3 = getNonce();

      assert.notStrictEqual(nonce1, nonce2);
      assert.notStrictEqual(nonce2, nonce3);
      assert.notStrictEqual(nonce1, nonce3);
    });
  });
});
