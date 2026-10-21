/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code's two entries on a thread's menu (`loop.session.action`): when
 * each applies, and what each posts to the extension host and says.
 */

import type { SessionFacts } from "@datalayer/agent-runtimes/lib/apps/core";

import {
  VSCODE_SESSION_ACTION_WORDS,
  type VsCodeSessionActionPost,
  vscodeSessionActions,
} from "../agentChat/vscodeSessionActions";

const session = (rest: Partial<SessionFacts> = {}): SessionFacts =>
  ({
    uid: "s-1",
    appUid: "app-1",
    title: "Fix the tests",
    state: "open",
    turn: "idle",
    turns: 2,
    agent: "shield-mvp-claude-code",
    harness: "claude-code",
    ...rest,
  }) as SessionFacts;

describe("VS Code's session entries", () => {
  it("offers Reveal in Explorer for a session on this machine only", () => {
    const [reveal] = vscodeSessionActions(
      () => undefined,
      () => true,
    );
    expect(reveal!.label).toBe(VSCODE_SESSION_ACTION_WORDS.reveal);
    expect(reveal!.when(session())).toBe(true);
    expect(reveal!.when(session({ uid: "" }))).toBe(false);
    const [onDatalayer] = vscodeSessionActions(
      () => undefined,
      () => false,
    );
    expect(onDatalayer!.when(session())).toBe(false);
  });

  it("offers Open in the Studio for a session of an application", () => {
    const [, studio] = vscodeSessionActions(
      () => undefined,
      () => true,
    );
    expect(studio!.label).toBe(VSCODE_SESSION_ACTION_WORDS.openStudio);
    expect(studio!.when(session())).toBe(true);
    expect(studio!.when(session({ appUid: "" }))).toBe(false);
  });

  it("posts to the extension host and says what it did", async () => {
    const posted: VsCodeSessionActionPost[] = [];
    const said: string[] = [];
    const context = { say: (sentence: string) => said.push(sentence) };
    const [reveal, studio] = vscodeSessionActions(
      (message) => posted.push(message),
      () => true,
    );
    await reveal!.run(session(), context as never);
    await studio!.run(session(), context as never);
    expect(posted).toEqual([
      { type: "reveal-session", uid: "s-1" },
      { type: "open-studio", appUid: "app-1" },
    ]);
    expect(said).toEqual([
      VSCODE_SESSION_ACTION_WORDS.revealed("s-1"),
      VSCODE_SESSION_ACTION_WORDS.opened("Fix the tests"),
    ]);
  });
});
