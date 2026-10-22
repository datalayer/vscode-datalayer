/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The *Datalayer* home page's data, read from the sidebar's own tree
 * providers: each provider is asked for its items (`getChildren()`,
 * `getTreeItem()`), a few levels deep, and each item becomes a plain,
 * serialisable node — label, description, tooltip, icon id, command,
 * contextValue, children. The page draws the nodes; a click is sent back by
 * the node's key, and the host runs the item's own command with its own
 * arguments, kept here, as the tree would.
 *
 * Pure: no `vscode` import. The tree items are read by their shape.
 *
 * @module ui/home/homeSnapshot
 */

import {
  SESSION_STATES,
  type SessionState,
} from "@datalayer/agent-runtimes/lib/portable/activity";

/** A command as a tree item carries it. */
export interface TreeCommandLike {
  command: string;
  title?: string;
  tooltip?: string;
  arguments?: unknown[];
}

/** What is read of a tree item (`vscode.TreeItem`'s shape). */
export interface TreeItemLike {
  label?: string | { label: string };
  description?: string | boolean;
  tooltip?: string | { value: string } | unknown;
  iconPath?: unknown;
  command?: TreeCommandLike;
  contextValue?: string;
  /** `vscode.TreeItemCollapsibleState`: 0 none, 1 collapsed, 2 expanded. */
  collapsibleState?: number;
  id?: string;
}

/** What is asked of a tree provider (`vscode.TreeDataProvider`'s shape). */
export interface TreeProviderLike<T> {
  getChildren(
    element?: T,
  ): T[] | null | undefined | PromiseLike<T[] | null | undefined>;
  getTreeItem(element: T): TreeItemLike | PromiseLike<TreeItemLike>;
}

/** One item of a section, as the page draws it. */
export interface HomeNode {
  /** Unique within the snapshot: what the page sends back on a click. */
  key: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** A codicon id (`vscode.ThemeIcon`'s `id`), when the item has one. */
  icon?: string;
  /** The item's command, without its arguments (they stay on the host). */
  command?: { id: string; title?: string };
  contextValue?: string;
  /** Whether the tree shows the item expanded. */
  expanded: boolean;
  children: HomeNode[];
  /** Children not read: deeper than the snapshot goes, or past the cap. */
  more: boolean;
}

/** A sidebar block, as the page draws it. */
export interface HomeSection {
  /** The sidebar view's id (`datalayerSpaces`, …). */
  id: string;
  title: string;
  icon: string;
  nodes: HomeNode[];
  /** A sentence when the provider failed to answer. */
  error?: string;
}

/** The page's whole state. */
export interface HomeState {
  signedIn: boolean;
  /** The person's name or email when signed in. */
  user?: string;
  sections: HomeSection[];
}

/** Messages from the page to the host. */
export type HomePageMessage =
  | { type: "ready" }
  | { type: "run"; key: string }
  | { type: "refresh"; section: string }
  | { type: "login" };

/** Messages from the host to the page. */
export type HomeHostMessage =
  | { type: "theme-changed"; theme: "light" | "dark" }
  | { type: "home-state"; body: HomeState }
  | { type: "home-section"; body: HomeSection };

/** How deep and how wide a snapshot reads. */
export interface SnapshotOptions {
  /** Levels read, the roots being the first. */
  depth: number;
  /** Items kept per level. */
  maxItems: number;
}

/** Three levels: Sessions' place → application → session, Spaces' root → space → document. */
export const DEFAULT_SNAPSHOT_OPTIONS: SnapshotOptions = {
  depth: 3,
  maxItems: 100,
};

/** A command with its own arguments, kept on the host by node key. */
export interface KeptCommand {
  command: string;
  arguments: unknown[];
}

/** A section's nodes and the commands its clicks run. */
export interface SectionSnapshot {
  nodes: HomeNode[];
  commands: Map<string, KeptCommand>;
}

/**
 * The text of a tree item's label.
 *
 * @param label - A string, or a `TreeItemLabel`.
 *
 * @returns The text, or empty.
 */
export function labelOf(label: TreeItemLike["label"]): string {
  if (typeof label === "string") {
    return label;
  }
  if (label && typeof label === "object" && typeof label.label === "string") {
    return label.label;
  }
  return "";
}

/**
 * The text of a tree item's tooltip.
 *
 * @param tooltip - A string, a `MarkdownString`, or nothing.
 *
 * @returns The text, or `undefined`.
 */
export function tooltipOf(
  tooltip: TreeItemLike["tooltip"],
): string | undefined {
  if (typeof tooltip === "string") {
    return tooltip || undefined;
  }
  if (
    tooltip &&
    typeof tooltip === "object" &&
    typeof (tooltip as { value?: unknown }).value === "string"
  ) {
    return (tooltip as { value: string }).value || undefined;
  }
  return undefined;
}

/**
 * The codicon id of a tree item's icon: a `ThemeIcon` has an `id`; a file
 * icon (a `Uri`, light and dark paths) has none the page can draw.
 *
 * @param iconPath - The item's `iconPath`.
 *
 * @returns The id, or `undefined`.
 */
export function iconOf(iconPath: unknown): string | undefined {
  if (
    iconPath &&
    typeof iconPath === "object" &&
    typeof (iconPath as { id?: unknown }).id === "string" &&
    // A Uri has no `id`; a ThemeIcon's id never has a scheme.
    !("scheme" in (iconPath as object))
  ) {
    return (iconPath as { id: string }).id;
  }
  return undefined;
}

/**
 * One tree item as a node, without its children.
 *
 * @param item - The tree item, as its provider draws it.
 * @param key - Its place in the tree (`0.2.1`).
 *
 * @returns The page's entry for it, and the command its click runs.
 */
export function nodeOf(
  item: TreeItemLike,
  key: string,
): { node: HomeNode; command?: KeptCommand } {
  const description =
    typeof item.description === "string" && item.description
      ? item.description
      : undefined;
  const node: HomeNode = {
    key,
    label: labelOf(item.label),
    expanded: item.collapsibleState === 2,
    children: [],
    more: false,
  };
  if (description) {
    node.description = description;
  }
  const tooltip = tooltipOf(item.tooltip);
  if (tooltip) {
    node.tooltip = tooltip;
  }
  const icon = iconOf(item.iconPath);
  if (icon) {
    node.icon = icon;
  }
  if (item.contextValue) {
    node.contextValue = item.contextValue;
  }
  if (item.command && typeof item.command.command === "string") {
    node.command = { id: item.command.command };
    if (item.command.title) {
      node.command.title = item.command.title;
    }
    return {
      node,
      command: {
        command: item.command.command,
        arguments: item.command.arguments ?? [],
      },
    };
  }
  return { node };
}

/**
 * Reads a tree provider as the page's nodes, as deep as `options.depth`.
 * The keys are the path of indexes (`0`, `0.2`, `0.2.1`), so a snapshot read
 * again keys the same items the same way while the tree is unchanged.
 *
 * @param provider - The sidebar's tree provider.
 * @param options - How deep and how wide.
 *
 * @returns The nodes, and the commands by key.
 */
export async function snapshotTree<T>(
  provider: TreeProviderLike<T>,
  options: SnapshotOptions = DEFAULT_SNAPSHOT_OPTIONS,
): Promise<SectionSnapshot> {
  const commands = new Map<string, KeptCommand>();

  const read = async (
    element: T | undefined,
    prefix: string,
    level: number,
  ): Promise<{ nodes: HomeNode[]; more: boolean }> => {
    const children = (await provider.getChildren(element)) ?? [];
    const kept = children.slice(0, options.maxItems);
    const nodes: HomeNode[] = [];
    for (const [index, child] of kept.entries()) {
      const key = prefix ? `${prefix}.${index}` : `${index}`;
      const item = await provider.getTreeItem(child);
      const { node, command } = nodeOf(item, key);
      if (command) {
        commands.set(key, command);
      }
      const collapsible = (item.collapsibleState ?? 0) !== 0;
      if (collapsible) {
        if (level + 1 < options.depth) {
          const below = await read(child, key, level + 1);
          node.children = below.nodes;
          node.more = below.more;
        } else {
          node.more = true;
        }
      }
      nodes.push(node);
    }
    return { nodes, more: children.length > kept.length };
  };

  const { nodes } = await read(undefined, "", 0);
  return { nodes, commands };
}

/**
 * Prefixes a section's keys with its id, so keys are unique across sections.
 *
 * @param sectionId - The sidebar view's id.
 * @param key - The node's key within its section.
 *
 * @returns `<sectionId>:<key>`.
 */
export function sectionKey(sectionId: string, key: string): string {
  return `${sectionId}:${key}`;
}

/**
 * Rewrites a snapshot's keys with the section's id.
 *
 * @param sectionId - The sidebar view's id.
 * @param snapshot - The nodes and commands read from the view's tree.
 *
 * @returns The same snapshot keyed `<sectionId>:<key>`.
 */
export function keyedBySection(
  sectionId: string,
  snapshot: SectionSnapshot,
): SectionSnapshot {
  const rekey = (nodes: HomeNode[]): HomeNode[] =>
    nodes.map((node) => ({
      ...node,
      key: sectionKey(sectionId, node.key),
      children: rekey(node.children),
    }));
  const commands = new Map<string, KeptCommand>();
  for (const [key, command] of snapshot.commands) {
    commands.set(sectionKey(sectionId, key), command);
  }
  return { nodes: rekey(snapshot.nodes), commands };
}

/**
 * Whether a message from the page is one the host answers.
 *
 * @param message - What the page posted.
 *
 * @returns The message, typed, or `undefined`.
 */
export function pageMessageOf(message: unknown): HomePageMessage | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const raw = message as Record<string, unknown>;
  switch (raw.type) {
    case "ready":
    case "login":
      return { type: raw.type };
    case "run":
      return typeof raw.key === "string"
        ? { type: "run", key: raw.key }
        : undefined;
    case "refresh":
      return typeof raw.section === "string"
        ? { type: "refresh", section: raw.section }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * A session's or a team run's state, read from its row's contextValue
 * (`session-<state>-<place>`, `team-<state>`), for the page's state label.
 *
 * @param contextValue - The node's contextValue.
 *
 * @returns `open`, `paused` or `ended`; `undefined` for any other row.
 */
export function sessionStateOf(
  contextValue: string | undefined,
): SessionState | undefined {
  const match = /^(?:session|team)-([a-z]+)(?:-|$)/.exec(contextValue ?? "");
  const state = match?.[1];
  return (SESSION_STATES as readonly string[]).includes(state ?? "")
    ? (state as SessionState)
    : undefined;
}
