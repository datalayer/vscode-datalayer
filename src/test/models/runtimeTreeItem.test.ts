/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as assert from "assert";
import * as vscode from "vscode";

import { RuntimeTreeItem } from "../../models/runtimeTreeItem";

/**
 * Creates a mock RuntimeDTO with the given overrides.
 * RuntimeDTO uses getter properties, so we create an object with matching getters.
 */
function createRuntimeDTO(overrides: Record<string, unknown> = {}): RuntimeDTO {
  const defaults = {
    uid: "mock-runtime-id",
    podName: "mock-pod-123",
    givenName: "Test Runtime",
    environmentName: "python-cpu-env",
    environmentTitle: "Python CPU",
    type: "notebook",
    burningRate: 0.5,
    ingress: "https://mock.datalayer.run/jupyter/server/pool/mock-runtime",
    token: "mock-jwt-token",
    startedAt: new Date(Date.now() - 3600000),
    expiredAt: new Date(Date.now() + 3600000),
  };

  return { ...defaults, ...overrides } as RuntimeDTO;
}

suite("RuntimeTreeItem Tests", () => {
  test("uses givenName as label when available", () => {
    const runtime = createRuntimeDTO({ givenName: "My Runtime" });
    const item = new RuntimeTreeItem(runtime);

    assert.strictEqual(item.label, "My Runtime");
  });

  test("falls back to podName when givenName is empty", () => {
    const runtime = createRuntimeDTO({ givenName: "", podName: "pod-abc-123" });
    const item = new RuntimeTreeItem(runtime);

    assert.strictEqual(item.label, "pod-abc-123");
  });

  test("is not collapsible", () => {
    const runtime = createRuntimeDTO();
    const item = new RuntimeTreeItem(runtime);

    assert.strictEqual(
      item.collapsibleState,
      vscode.TreeItemCollapsibleState.None,
    );
  });

  test("description contains environment title and time remaining", () => {
    const runtime = createRuntimeDTO({
      environmentTitle: "Python GPU",
      expiredAt: new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000),
    });
    const item = new RuntimeTreeItem(runtime);

    assert.ok(item.description);
    const desc = item.description as string;
    assert.ok(
      desc.includes("Python GPU"),
      `Expected "Python GPU" in "${desc}"`,
    );
    // The formatter floors minutes, so the moment of `Date.now()` inside
    // the formatter may be a few ms past the moment of `Date.now()` in
    // the fixture above, flipping "2h 30m" → "2h 29m". Accept either.
    // Same tolerance pattern as the "shows minutes only" test below.
    assert.ok(
      /2h (29|30)m/.test(desc),
      `Expected "2h 29m" or "2h 30m" in "${desc}"`,
    );
  });

  test("description uses environmentName when environmentTitle is empty", () => {
    const runtime = createRuntimeDTO({
      environmentTitle: "",
      environmentName: "python-cpu-env",
    });
    const item = new RuntimeTreeItem(runtime);

    const desc = item.description as string;
    assert.ok(
      desc.includes("python-cpu-env"),
      `Expected "python-cpu-env" in "${desc}"`,
    );
  });

  test("shows minutes only when less than 1 hour remaining", () => {
    const runtime = createRuntimeDTO({
      expiredAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const item = new RuntimeTreeItem(runtime);

    const desc = item.description as string;
    // Allow 14m or 15m due to time elapsed between Date.now() and rendering
    assert.ok(/1[45]m/.test(desc), `Expected "14m" or "15m" in "${desc}"`);
    assert.ok(!/\d+h/.test(desc), `Did not expect hours in "${desc}"`);
  });

  test("shows 'Expired' when expiredAt is in the past", () => {
    const runtime = createRuntimeDTO({
      expiredAt: new Date(Date.now() - 60000),
    });
    const item = new RuntimeTreeItem(runtime);

    const desc = item.description as string;
    assert.ok(desc.includes("Expired"), `Expected "Expired" in "${desc}"`);
  });

  test("tooltip is a MarkdownString with runtime details", () => {
    const started = new Date(2025, 0, 15, 10, 0, 0);
    const expired = new Date(2025, 0, 15, 12, 0, 0);
    const runtime = createRuntimeDTO({
      givenName: "Test Runtime",
      environmentTitle: "Python CPU",
      burningRate: 0.5,
      startedAt: started,
      expiredAt: expired,
    });
    const item = new RuntimeTreeItem(runtime);

    assert.ok(item.tooltip instanceof vscode.MarkdownString);
    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("Test Runtime"));
    assert.ok(md.value.includes("Python CPU"));
    assert.ok(md.value.includes("0.5"));
  });

  test("contextValue is 'runtime'", () => {
    const runtime = createRuntimeDTO();
    const item = new RuntimeTreeItem(runtime);

    assert.strictEqual(item.contextValue, "runtime");
  });

  test("iconPath uses vm-running theme icon", () => {
    const runtime = createRuntimeDTO();
    const item = new RuntimeTreeItem(runtime);

    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "vm-running");
  });

  test("stores the runtime reference", () => {
    const runtime = createRuntimeDTO({ uid: "unique-id" });
    const item = new RuntimeTreeItem(runtime);

    assert.strictEqual(item.runtime.uid, "unique-id");
  });

  test("shows 0m when about to expire", () => {
    const runtime = createRuntimeDTO({
      expiredAt: new Date(Date.now() + 30 * 1000),
    });
    const item = new RuntimeTreeItem(runtime);

    const desc = item.description as string;
    assert.ok(desc.includes("0m"), `Expected "0m" in "${desc}"`);
  });
});
