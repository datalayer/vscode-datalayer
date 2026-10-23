/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A click in the Agents view: a runtime's item runs the chat's open-agent
 * command with the runtime it names, a snapshot's item runs the details
 * command with itself — and the Home page's rows, read from the same
 * items, run the same commands.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  TreeItem: class {
    label: string;
    collapsibleState: number;
    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(public readonly id: string) {}
  },
  MarkdownString: class {
    constructor(public readonly value: string) {}
  },
}));

import { OPEN_AGENT_COMMAND } from "../../src/chat/openSession";
import { RuntimeTreeItem } from "../../src/models/runtimeTreeItem";
import { SnapshotTreeItem } from "../../src/models/snapshotTreeItem";
import { nodeOf, type TreeItemLike } from "../../src/ui/home/homeSnapshot";

const runtime = {
  uid: "rt-2",
  runtimeName: "pod-2",
  givenName: "Analyst",
  environmentName: "ai-agents-env",
  environmentTitle: "AI Agents",
  startedAt: new Date("2026-10-23T08:00:00Z"),
  expiredAt: new Date(Date.now() + 60 * 60 * 1000),
  burningRate: 1,
};

const snapshot = {
  uid: "snap-1",
  name: "before-refactor",
  description: "",
  environment: "ai-agents-env",
  toJSON: () => ({
    uid: "snap-1",
    name: "before-refactor",
    environment: "ai-agents-env",
    updatedAt: "2026-10-20T08:30:00Z",
  }),
};

describe("a click in the Agents view", () => {
  it("on a runtime opens the chat with that runtime", () => {
    const item = new RuntimeTreeItem(runtime as never);
    expect(item.command).toEqual({
      command: OPEN_AGENT_COMMAND,
      title: "Open in Datalayer Chat",
      arguments: [{ uid: "rt-2", runtimeName: "pod-2", givenName: "Analyst" }],
    });
  });

  it("on a snapshot opens its details", () => {
    const item = new SnapshotTreeItem(snapshot as never);
    expect(item.command?.command).toBe("datalayer.snapshots.viewDetails");
    expect(item.command?.arguments).toEqual([item]);
  });

  it("on the Home page's rows runs the same commands", () => {
    const runtimeRow = nodeOf(
      new RuntimeTreeItem(runtime as never) as unknown as TreeItemLike,
      "r",
    );
    expect(runtimeRow.node.command?.id).toBe(OPEN_AGENT_COMMAND);
    expect(runtimeRow.command?.arguments).toEqual([
      { uid: "rt-2", runtimeName: "pod-2", givenName: "Analyst" },
    ]);
    const snapshotItem = new SnapshotTreeItem(snapshot as never);
    const snapshotRow = nodeOf(snapshotItem as unknown as TreeItemLike, "s");
    expect(snapshotRow.node.command?.id).toBe(
      "datalayer.snapshots.viewDetails",
    );
    expect(snapshotRow.command?.arguments).toEqual([snapshotItem]);
  });
});
