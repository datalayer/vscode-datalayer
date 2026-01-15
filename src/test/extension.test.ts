/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * This file is intentionally left minimal.
 * Activation tests are in extension.activation.test.ts
 * External dependency tests are in extension.dependencies.test.ts
 * Preload verification tests are in extension.preload.test.ts
 * Integration tests are in integration/full-activation.integration.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("VS Code test framework is working", () => {
    // Simple test to verify test infrastructure is working
    assert.strictEqual(typeof vscode.window, "object");
    assert.strictEqual(typeof vscode.commands, "object");
  });
});
