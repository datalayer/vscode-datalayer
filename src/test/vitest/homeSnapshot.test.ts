/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Datalayer: Home*, the pure part: the sidebar's tree items read as the
 * page's nodes — labels, descriptions, tooltips, icons, commands kept on the
 * host by key, nesting as deep as the snapshot goes — and the page's
 * messages checked.
 */

import { describe, expect, it } from "vitest";

import {
  iconOf,
  keyedBySection,
  labelOf,
  nodeOf,
  pageMessageOf,
  sessionStateOf,
  snapshotTree,
  tooltipOf,
  type TreeItemLike,
  type TreeProviderLike,
} from "../../ui/home/homeSnapshot";

/** A tree element: its item and its children, as a provider answers them. */
interface Element {
  item: TreeItemLike;
  children?: Element[];
}

/** A provider over fixed elements; asynchronous, as the sidebar's are. */
function providerOf(roots: Element[]): TreeProviderLike<Element> & {
  asked: (Element | undefined)[];
} {
  const asked: (Element | undefined)[] = [];
  return {
    asked,
    getChildren: async (element?: Element) => {
      asked.push(element);
      return element ? (element.children ?? []) : roots;
    },
    getTreeItem: (element: Element) => element.item,
  };
}

/** A ThemeIcon's shape. */
const themeIcon = (id: string) => ({ id });

describe("a tree item's fields", () => {
  it("reads a label given as a string or a TreeItemLabel", () => {
    expect(labelOf("Spaces")).toBe("Spaces");
    expect(labelOf({ label: "My space" })).toBe("My space");
    expect(labelOf(undefined)).toBe("");
  });

  it("reads a tooltip given as a string or a MarkdownString", () => {
    expect(tooltipOf("plain")).toBe("plain");
    expect(tooltipOf({ value: "**bold** — uid" })).toBe("**bold** — uid");
    expect(tooltipOf("")).toBeUndefined();
    expect(tooltipOf(undefined)).toBeUndefined();
  });

  it("keeps a ThemeIcon's id and drops a file icon", () => {
    expect(iconOf(themeIcon("notebook"))).toBe("notebook");
    expect(
      iconOf({ scheme: "file", path: "/icon.svg", id: "not-an-icon" }),
    ).toBeUndefined();
    expect(iconOf({ light: "/a.svg", dark: "/b.svg" })).toBeUndefined();
    expect(iconOf(undefined)).toBeUndefined();
  });

  it("keeps the command's id on the node and its arguments on the host", () => {
    const self = { opaque: true };
    const { node, command } = nodeOf(
      {
        label: "Analysis",
        description: "Open · idle",
        contextValue: "session-open-datalayer",
        iconPath: themeIcon("circle-filled"),
        command: {
          command: "datalayer.sessions.open",
          title: "Open the session",
          arguments: [self],
        },
      },
      "2.0.1",
    );
    expect(node).toEqual({
      key: "2.0.1",
      label: "Analysis",
      description: "Open · idle",
      contextValue: "session-open-datalayer",
      icon: "circle-filled",
      command: { id: "datalayer.sessions.open", title: "Open the session" },
      expanded: false,
      children: [],
      more: false,
    });
    expect(command).toEqual({
      command: "datalayer.sessions.open",
      arguments: [self],
    });
    // The node is what the page is posted: it serialises.
    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
  });

  it("drops a boolean description and keeps no command when there is none", () => {
    const { node, command } = nodeOf({ label: "x", description: true }, "0");
    expect(node.description).toBeUndefined();
    expect(node.command).toBeUndefined();
    expect(command).toBeUndefined();
  });
});

describe("snapshotTree", () => {
  const document = (label: string, uid: string): Element => ({
    item: {
      label,
      iconPath: themeIcon("notebook"),
      collapsibleState: 0,
      command: { command: "datalayer.openDocument", arguments: [{ uid }] },
    },
  });

  const spaces: Element[] = [
    {
      item: { label: "Datalayer (Ada)", collapsibleState: 2 },
      children: [
        {
          item: {
            label: "Library",
            description: "2 items",
            collapsibleState: 1,
          },
          children: [
            document("a.ipynb", "a"),
            {
              item: { label: "nested", collapsibleState: 1 },
              children: [document("deep.ipynb", "deep")],
            },
          ],
        },
      ],
    },
  ];

  it("reads labels, descriptions and nesting three levels deep", async () => {
    const { nodes } = await snapshotTree(providerOf(spaces));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("Datalayer (Ada)");
    expect(nodes[0].expanded).toBe(true);
    const library = nodes[0].children[0];
    expect(library.key).toBe("0.0");
    expect(library.description).toBe("2 items");
    expect(library.expanded).toBe(false);
    expect(library.children.map((child) => child.label)).toEqual([
      "a.ipynb",
      "nested",
    ]);
    // The third level is not read below: it says there is more.
    const nested = library.children[1];
    expect(nested.key).toBe("0.0.1");
    expect(nested.children).toEqual([]);
    expect(nested.more).toBe(true);
  });

  it("keeps each clickable item's command and arguments by key", async () => {
    const { commands } = await snapshotTree(providerOf(spaces));
    expect([...commands.keys()]).toEqual(["0.0.0"]);
    expect(commands.get("0.0.0")).toEqual({
      command: "datalayer.openDocument",
      arguments: [{ uid: "a" }],
    });
  });

  it("asks a leaf for no children and stops at the depth asked", async () => {
    const provider = providerOf(spaces);
    await snapshotTree(provider, { depth: 1, maxItems: 10 });
    expect(provider.asked).toEqual([undefined]);
    const { nodes } = await snapshotTree(providerOf(spaces), {
      depth: 1,
      maxItems: 10,
    });
    expect(nodes[0].children).toEqual([]);
    expect(nodes[0].more).toBe(true);
  });

  it("caps each level and says there is more", async () => {
    const many: Element[] = [
      {
        item: { label: "Runtimes", collapsibleState: 2 },
        children: Array.from({ length: 5 }, (_, i) =>
          document(`r${i}`, `r${i}`),
        ),
      },
    ];
    const { nodes } = await snapshotTree(providerOf(many), {
      depth: 3,
      maxItems: 3,
    });
    expect(nodes[0].children.map((child) => child.label)).toEqual([
      "r0",
      "r1",
      "r2",
    ]);
    expect(nodes[0].more).toBe(true);
  });

  it("reads an empty or undefined answer as no nodes", async () => {
    const empty = await snapshotTree({
      getChildren: () => undefined,
      getTreeItem: () => ({}),
    });
    expect(empty.nodes).toEqual([]);
    expect(empty.commands.size).toBe(0);
  });

  it("keys a section's nodes and commands by its view id", async () => {
    const keyed = keyedBySection(
      "datalayerSpaces",
      await snapshotTree(providerOf(spaces)),
    );
    expect(keyed.nodes[0].key).toBe("datalayerSpaces:0");
    expect(keyed.nodes[0].children[0].children[0].key).toBe(
      "datalayerSpaces:0.0.0",
    );
    expect([...keyed.commands.keys()]).toEqual(["datalayerSpaces:0.0.0"]);
  });
});

describe("the page's messages", () => {
  it("accepts the four the host answers", () => {
    expect(pageMessageOf({ type: "ready" })).toEqual({ type: "ready" });
    expect(pageMessageOf({ type: "login" })).toEqual({ type: "login" });
    expect(pageMessageOf({ type: "run", key: "datalayerSpaces:0" })).toEqual({
      type: "run",
      key: "datalayerSpaces:0",
    });
    expect(
      pageMessageOf({ type: "refresh", section: "datalayerSessions" }),
    ).toEqual({ type: "refresh", section: "datalayerSessions" });
  });

  it("refuses anything else", () => {
    expect(pageMessageOf(null)).toBeUndefined();
    expect(pageMessageOf("ready")).toBeUndefined();
    expect(pageMessageOf({ type: "run" })).toBeUndefined();
    expect(pageMessageOf({ type: "refresh", section: 3 })).toBeUndefined();
    expect(pageMessageOf({ type: "execute", command: "rm" })).toBeUndefined();
  });
});

describe("sessionStateOf", () => {
  it("reads a session's and a team run's state from the contextValue", () => {
    expect(sessionStateOf("session-open-datalayer")).toBe("open");
    expect(sessionStateOf("session-paused-local")).toBe("paused");
    expect(sessionStateOf("team-ended")).toBe("ended");
  });

  it("reads nothing from other rows", () => {
    expect(sessionStateOf("place-datalayer")).toBeUndefined();
    expect(sessionStateOf("application")).toBeUndefined();
    expect(sessionStateOf("session-unknown-local")).toBeUndefined();
    expect(sessionStateOf(undefined)).toBeUndefined();
  });
});
