/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { RuntimeSnapshotDTO } from "@datalayer/core/lib/models/RuntimeSnapshotDTO";
import * as assert from "assert";
import * as vscode from "vscode";

import { SnapshotTreeItem } from "../../models/snapshotTreeItem";

/**
 * Creates a mock RuntimeSnapshotDTO with the given overrides.
 */
function createSnapshotDTO(
  overrides: Record<string, unknown> = {},
): RuntimeSnapshotDTO {
  const updatedAt = new Date(
    Date.now() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const defaults = {
    uid: "snap-001",
    name: "my-snapshot",
    description: "A test snapshot",
    environment: "python-cpu-env",
    updatedAt: new Date(updatedAt),
    toJSON: () => ({
      uid: (overrides.uid as string) || "snap-001",
      name: (overrides.name as string) || "my-snapshot",
      description: (overrides.description as string) || "A test snapshot",
      environment: (overrides.environment as string) || "python-cpu-env",
      updatedAt: (overrides.updatedAtStr as string) || updatedAt,
    }),
  };

  return { ...defaults, ...overrides } as RuntimeSnapshotDTO;
}

suite("SnapshotTreeItem Tests", () => {
  test("uses snapshot name as label", () => {
    const snapshot = createSnapshotDTO({ name: "checkpoint-1" });
    const item = new SnapshotTreeItem(snapshot);

    assert.strictEqual(item.label, "checkpoint-1");
  });

  test("is not collapsible", () => {
    const snapshot = createSnapshotDTO();
    const item = new SnapshotTreeItem(snapshot);

    assert.strictEqual(
      item.collapsibleState,
      vscode.TreeItemCollapsibleState.None,
    );
  });

  test("description contains environment and time ago", () => {
    const snapshot = createSnapshotDTO({ environment: "python-gpu-env" });
    const item = new SnapshotTreeItem(snapshot);

    const desc = item.description as string;
    assert.ok(
      desc.includes("python-gpu-env"),
      `Expected "python-gpu-env" in "${desc}"`,
    );
    assert.ok(
      desc.includes("ago") || desc.includes("just now"),
      `Expected relative time in "${desc}"`,
    );
  });

  test("tooltip is a MarkdownString with snapshot details", () => {
    const snapshot = createSnapshotDTO({
      name: "backup-snap",
      environment: "python-cpu-env",
      description: "Daily backup",
    });
    const item = new SnapshotTreeItem(snapshot);

    assert.ok(item.tooltip instanceof vscode.MarkdownString);
    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("backup-snap"));
    assert.ok(md.value.includes("python-cpu-env"));
    assert.ok(md.value.includes("Daily backup"));
  });

  test("tooltip shows 'No description' when description is empty", () => {
    const snapshot = createSnapshotDTO({ description: "" });
    snapshot.toJSON = () => ({
      uid: "snap-001",
      name: "my-snapshot",
      description: "",
      environment: "python-cpu-env",
      updatedAt: new Date().toISOString(),
    });
    const item = new SnapshotTreeItem(snapshot);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("No description"));
  });

  test("contextValue is 'snapshot'", () => {
    const snapshot = createSnapshotDTO();
    const item = new SnapshotTreeItem(snapshot);

    assert.strictEqual(item.contextValue, "snapshot");
  });

  test("iconPath uses archive theme icon", () => {
    const snapshot = createSnapshotDTO();
    const item = new SnapshotTreeItem(snapshot);

    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "archive");
  });

  test("stores the snapshot reference", () => {
    const snapshot = createSnapshotDTO({ uid: "snap-unique" });
    snapshot.toJSON = () => ({
      uid: "snap-unique",
      name: "my-snapshot",
      description: "",
      environment: "env",
      updatedAt: new Date().toISOString(),
    });
    const item = new SnapshotTreeItem(snapshot);

    assert.strictEqual(item.snapshot.uid, "snap-unique");
  });
});
