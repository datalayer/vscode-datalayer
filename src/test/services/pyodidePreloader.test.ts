/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for PyodidePreloader service
 */

import * as assert from "assert";

/**
 * Helper function that replicates the _getPackagesKey logic
 * (since the actual method is private)
 */
function getPackagesKey(packages: string[]): string {
  return [...packages].sort().join(",");
}

suite("PyodidePreloader Package Key Generation", () => {
  test("should generate identical keys regardless of package order", () => {
    const packages1 = ["numpy", "pandas", "matplotlib"];
    const packages2 = ["pandas", "numpy", "matplotlib"];
    const packages3 = ["matplotlib", "pandas", "numpy"];

    const key1 = getPackagesKey(packages1);
    const key2 = getPackagesKey(packages2);
    const key3 = getPackagesKey(packages3);

    assert.strictEqual(key1, key2);
    assert.strictEqual(key2, key3);
    assert.strictEqual(key1, "matplotlib,numpy,pandas");
  });

  test("should generate different keys for different package sets", () => {
    const packages1 = ["numpy", "pandas"];
    const packages2 = ["numpy", "pandas", "matplotlib"];

    const key1 = getPackagesKey(packages1);
    const key2 = getPackagesKey(packages2);

    assert.notStrictEqual(key1, key2);
    assert.strictEqual(key1, "numpy,pandas");
    assert.strictEqual(key2, "matplotlib,numpy,pandas");
  });

  test("should handle single package", () => {
    const packages = ["numpy"];
    const key = getPackagesKey(packages);

    assert.strictEqual(key, "numpy");
  });

  test("should handle empty package list", () => {
    const packages: string[] = [];
    const key = getPackagesKey(packages);

    assert.strictEqual(key, "");
  });

  test("should handle package name variations", () => {
    const packages1 = ["numpy", "scikit-learn", "pandas"];
    const packages2 = ["pandas", "numpy", "scikit-learn"];

    const key1 = getPackagesKey(packages1);
    const key2 = getPackagesKey(packages2);

    assert.strictEqual(key1, key2);
    assert.strictEqual(key1, "numpy,pandas,scikit-learn");
  });

  test("should not mutate original array", () => {
    const packages = ["pandas", "numpy", "matplotlib"];
    const original = [...packages];

    getPackagesKey(packages);

    assert.deepStrictEqual(packages, original);
  });
});
