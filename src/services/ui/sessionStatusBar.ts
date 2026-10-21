/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The sessions in the status bar, and the finished turns: *Datalayer: 2
 * waiting for you* (a click opens the first waiting session), *Datalayer:
 * working…* while a turn of any session runs, hidden when nothing is; a
 * notification when a turn of a session **not in front** finishes (the
 * first line of its answer) or its runtime goes away — never for the
 * session the chat shows.
 *
 * The sessions come from two sources, merged by key: the chat (the one in
 * front, live) and the Sessions view (every other, as listed), the latter
 * through the internal command `datalayer.internal.sessions.attention`.
 *
 * @module services/ui/sessionStatusBar
 */

import * as vscode from "vscode";

import {
  finishedTurns,
  type SessionAttention,
  statusBarItem,
} from "../../chat/attention";

/** The internal command a source reports its sessions with. */
export const SESSIONS_ATTENTION_COMMAND =
  "datalayer.internal.sessions.attention";

/** The internal command the status bar item runs: the first session waiting opened. */
export const SESSIONS_OPEN_FIRST_COMMAND =
  "datalayer.internal.sessions.openFirst";

/** The Sessions view's command that opens a session by its key, when it exists. */
const SESSIONS_OPEN_COMMAND = "datalayer.sessions.open";

/**
 * The status bar item of the sessions, and the finished turns' notifications.
 */
export class SessionStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  private readonly subscriptions: vscode.Disposable[] = [];

  /** Each source's last rows. */
  private readonly sources = new Map<string, readonly SessionAttention[]>();

  /** The sessions as last merged. */
  private last: SessionAttention[] = [];

  /** The session a click opens. */
  private first: string | null = null;

  /** Creates the item and registers the two internal commands. */
  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99,
    );
    this.item.command = SESSIONS_OPEN_FIRST_COMMAND;
    this.subscriptions.push(
      this.item,
      vscode.commands.registerCommand(
        SESSIONS_ATTENTION_COMMAND,
        (rows: unknown, source = "tree") => {
          this.observed(String(source), sessionsOf(rows));
        },
      ),
      vscode.commands.registerCommand(SESSIONS_OPEN_FIRST_COMMAND, () =>
        this.openFirst(),
      ),
    );
  }

  /**
   * A source's sessions as read now: the item redrawn, the finished turns
   * of the sessions not in front notified.
   *
   * @param source - Who reports: `chat` (the session in front) or `tree`.
   * @param rows - The sessions.
   */
  public observed(source: string, rows: readonly SessionAttention[]): void {
    this.sources.set(source, rows);
    const merged = this.merged();
    for (const notice of finishedTurns(this.last, merged)) {
      void vscode.window.showInformationMessage(notice.said);
    }
    this.last = merged;
    const shown = statusBarItem(merged);
    if (!shown) {
      this.first = null;
      this.item.hide();
      return;
    }
    this.first = shown.first;
    this.item.text = shown.text.startsWith("Datalayer: working")
      ? `$(sync~spin) ${shown.text}`
      : `$(bell) ${shown.text}`;
    this.item.tooltip = shown.tooltip;
    this.item.show();
  }

  /**
   * The sources merged by key: the chat's live row wins over a listing's.
   *
   * @returns Every session once.
   */
  private merged(): SessionAttention[] {
    const byKey = new Map<string, SessionAttention>();
    for (const [source, rows] of this.sources) {
      if (source === "chat") {
        continue;
      }
      for (const row of rows) {
        byKey.set(row.key, { ...row, inFront: false });
      }
    }
    for (const row of this.sources.get("chat") ?? []) {
      byKey.set(row.key, row);
    }
    return [...byKey.values()];
  }

  /** Opens the first session waiting: the Sessions view's command, else the chat. */
  private async openFirst(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    if (this.first && commands.includes(SESSIONS_OPEN_COMMAND)) {
      await vscode.commands.executeCommand(SESSIONS_OPEN_COMMAND, this.first);
      return;
    }
    await vscode.commands.executeCommand("datalayerAgentChatView.focus");
  }

  /** @inheritdoc */
  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}

const STATES = ["open", "paused", "ended"] as const;
const TURNS = ["idle", "running", "waiting", ""] as const;

/**
 * Sessions as a source posts them, read strictly: a row without a key or
 * with a state that is none of the three is left out.
 *
 * @param rows - What was posted.
 *
 * @returns Every row that reads.
 */
export function sessionsOf(rows: unknown): SessionAttention[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const sessions: SessionAttention[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : "";
    const state = row.state;
    if (!key || !(STATES as readonly unknown[]).includes(state)) {
      continue;
    }
    const turn = (TURNS as readonly unknown[]).includes(row.turn)
      ? (row.turn as SessionAttention["turn"])
      : "";
    sessions.push({
      key,
      title: typeof row.title === "string" ? row.title : "",
      agent: typeof row.agent === "string" ? row.agent : "",
      state: state as SessionAttention["state"],
      turn,
      held: typeof row.held === "boolean" ? row.held : null,
      inFront: row.inFront === true,
      ...(typeof row.lastAnswer === "string"
        ? { lastAnswer: row.lastAnswer }
        : {}),
    });
  }
  return sessions;
}
