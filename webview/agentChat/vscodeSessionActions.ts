/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * What VS Code adds to a thread's menu, through agent-runtimes'
 * `loop.session.action` point beside the chat's own entries (*Switch
 * agent…*, *Clone from here*, *Export*, *Import…*, *Resume*): *Reveal in
 * Explorer* for a session on this machine (its folder in the file store,
 * `~/.datalayer/sessions/<uid>`) and *Open in the Studio* for a session of
 * an application (its Activity page, in the browser). Each does its work
 * through the extension host, which it is posted to; nothing of the menu
 * is copied here.
 *
 * @module webview/agentChat/vscodeSessionActions
 */

import type { SessionActionContribution } from "@datalayer/agent-runtimes/lib/apps/core";

/** What the entries say. */
export const VSCODE_SESSION_ACTION_WORDS = {
  reveal: "Reveal in Explorer",
  /** Said after the folder was shown. */
  revealed: (uid: string): string =>
    `The folder of ${uid} is shown in the Explorer.`,
  openStudio: "Open in the Studio",
  /** Said after the Studio page was opened. */
  opened: (title: string): string =>
    `${title || "This conversation"} is listed on the Studio's Activity, in the browser.`,
} as const;

/** What the entries post to the extension host. */
export type VsCodeSessionActionPost =
  | { type: "reveal-session"; uid: string }
  | { type: "open-studio"; appUid: string };

/**
 * The entry *Reveal in Explorer*: a local session's folder in the file store, shown
 * by the editor; offered for a session on this machine only.
 *
 * @param post - The way to the extension host.
 * @param local - Whether the chat's session runs on this machine.
 *
 * @returns The entry.
 */
export function revealInExplorerAction(
  post: (message: VsCodeSessionActionPost) => void,
  local: () => boolean,
): SessionActionContribution {
  return {
    id: "vscode-reveal-in-explorer",
    label: VSCODE_SESSION_ACTION_WORDS.reveal,
    order: 80,
    divider: true,
    when: (session) => local() && Boolean(session.uid),
    run: (session, context) => {
      post({ type: "reveal-session", uid: session.uid });
      context.say(VSCODE_SESSION_ACTION_WORDS.revealed(session.uid));
    },
  };
}

/**
 * The entry *Open in the Studio*: the application's Activity page, where every
 * session of it is listed; offered for a session of an application.
 *
 * @param post - The way to the extension host.
 *
 * @returns The entry.
 */
export function openInStudioAction(
  post: (message: VsCodeSessionActionPost) => void,
): SessionActionContribution {
  return {
    id: "vscode-open-in-studio",
    label: VSCODE_SESSION_ACTION_WORDS.openStudio,
    order: 90,
    when: (session) => Boolean(session.appUid),
    run: (session, context) => {
      post({ type: "open-studio", appUid: session.appUid });
      context.say(VSCODE_SESSION_ACTION_WORDS.opened(session.title));
    },
  };
}

/**
 * VS Code's two entries, in their order.
 *
 * @param post - The way to the extension host.
 * @param local - Whether the chat's session runs on this machine.
 *
 * @returns The entries.
 */
export function vscodeSessionActions(
  post: (message: VsCodeSessionActionPost) => void,
  local: () => boolean,
): SessionActionContribution[] {
  return [revealInExplorerAction(post, local), openInStudioAction(post)];
}
