/* Copyright (c) 2021-2025 Datalayer, Inc. MIT License */

import * as assert from "assert";

import { generateRuntimeName } from "../../utils/runtimeNameGenerator";

suite("Runtime Name Generator Tests", () => {
  suite("generateRuntimeName", () => {
    test("returns a string", () => {
      const name = generateRuntimeName();

      assert.strictEqual(typeof name, "string");
    });

    test("returns a non-empty string", () => {
      const name = generateRuntimeName();

      assert.ok(name.length > 0, "Generated name should not be empty");
    });

    test("follows Adjective-Animal format with hyphen separator", () => {
      const name = generateRuntimeName();
      const parts = name.split("-");

      assert.strictEqual(
        parts.length,
        2,
        `Expected exactly 2 parts separated by hyphen, got ${parts.length} in "${name}"`,
      );
    });

    test("uses capitalized style for each word", () => {
      const name = generateRuntimeName();
      const parts = name.split("-");

      for (const part of parts) {
        assert.ok(
          part.length > 0,
          `Part should not be empty in name "${name}"`,
        );
        assert.strictEqual(
          part[0]!,
          part[0]!.toUpperCase(),
          `Expected first character of "${part}" to be uppercase in name "${name}"`,
        );
      }
    });

    test("each part contains only alphabetic characters", () => {
      const name = generateRuntimeName();
      const parts = name.split("-");

      for (const part of parts) {
        assert.ok(
          /^[A-Za-z]+$/.test(part),
          `Part "${part}" should only contain alphabetic characters`,
        );
      }
    });

    test("generates unique names across multiple calls", () => {
      const names = new Set<string>();
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        names.add(generateRuntimeName());
      }

      // With a large dictionary, most names should be unique
      // Allow some tolerance for rare collisions
      assert.ok(
        names.size > iterations * 0.8,
        `Expected at least ${Math.floor(iterations * 0.8)} unique names out of ${iterations}, got ${names.size}`,
      );
    });

    test("generates different names (not deterministic)", () => {
      const name1 = generateRuntimeName();
      const name2 = generateRuntimeName();
      const name3 = generateRuntimeName();

      // At least two of three names should differ
      const allSame = name1 === name2 && name2 === name3;
      assert.ok(
        !allSame,
        `Expected at least some variation, but got "${name1}" three times`,
      );
    });

    test("name has reasonable length", () => {
      const name = generateRuntimeName();

      // Adjective-Animal: shortest plausible ~5 chars, longest ~30 chars
      assert.ok(
        name.length >= 3,
        `Name "${name}" is too short (${name.length} chars)`,
      );
      assert.ok(
        name.length <= 50,
        `Name "${name}" is too long (${name.length} chars)`,
      );
    });

    test("consistently produces two-part names across many calls", () => {
      for (let i = 0; i < 20; i++) {
        const name = generateRuntimeName();
        const parts = name.split("-");

        assert.strictEqual(
          parts.length,
          2,
          `Iteration ${i}: Expected 2 parts in "${name}", got ${parts.length}`,
        );
      }
    });

    test("name does not contain whitespace", () => {
      for (let i = 0; i < 10; i++) {
        const name = generateRuntimeName();

        assert.ok(
          !/\s/.test(name),
          `Name "${name}" should not contain whitespace`,
        );
      }
    });

    test("name does not start or end with hyphen", () => {
      for (let i = 0; i < 10; i++) {
        const name = generateRuntimeName();

        assert.ok(
          !name.startsWith("-"),
          `Name "${name}" should not start with hyphen`,
        );
        assert.ok(
          !name.endsWith("-"),
          `Name "${name}" should not end with hyphen`,
        );
      }
    });

    test("name contains exactly one hyphen", () => {
      for (let i = 0; i < 10; i++) {
        const name = generateRuntimeName();
        const hyphenCount = (name.match(/-/g) || []).length;

        assert.strictEqual(
          hyphenCount,
          1,
          `Expected exactly 1 hyphen in "${name}", got ${hyphenCount}`,
        );
      }
    });
  });
});
