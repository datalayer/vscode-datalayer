/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The extension's activation time (VS-14): measured by its own
 * `activationTimer`, answered on `extension.exports`, said in the run's log
 * and held under a budget, so a service made eager again shows in CI.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import type { DatalayerExtensionApi } from "../../extension";

/**
 * The activation's budget, in milliseconds, on CI's runners (the three
 * OSes): the sessions' services are lazy, so activation does not wait on a
 * runtime, a socket or the network.
 */
const ACTIVATION_BUDGET_MS = 15_000;

suite("The extension's activation time (VS-14)", () => {
  test("is measured, said and under its budget", async () => {
    const extension = vscode.extensions.getExtension<DatalayerExtensionApi>(
      "Datalayer.datalayer-vscode",
    );
    assert.ok(extension, "the extension is not installed in this host");
    const api = await extension.activate();
    const measured = api?.activationMs;
    assert.strictEqual(
      typeof measured,
      "number",
      "the activation did not complete, so it measured nothing",
    );
    console.log(
      `[VS-14] Activation took ${Math.round(measured as number)} ms (budget ${ACTIVATION_BUDGET_MS} ms) on ${process.platform}.`,
    );
    assert.ok(
      (measured as number) < ACTIVATION_BUDGET_MS,
      `activation took ${Math.round(measured as number)} ms, over its ${ACTIVATION_BUDGET_MS} ms budget`,
    );
  });
});
