/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * What the editor says outside the chat about a session, and when (the
 * approvals and the finished turns): pure, no `vscode`, no React.
 *
 * - **An approval raised** — an *ask me first* decision — is said as an
 *   editor notification that names the application, the action and its
 *   class (*read*, *write*, *send*, *buy*, *delete*, *execute*, *publish*)
 *   and never its arguments: the request is read whole in the chat, and a
 *   decision from the notification is allowed only once the chat has shown
 *   it. The decision goes through the one route each (`approve`, `reject`)
 *   after the approval is read again: one answered elsewhere (409, or no
 *   longer pending) is said so; one that is gone (404) reveals nothing.
 * - **The status bar** says how many sessions wait for the person, or that
 *   one is working, and nothing when nothing is.
 * - **A finished turn** of a session the chat does not show is said as a
 *   notification with the first line of its answer; the session the chat
 *   shows is never notified (what the person is looking at needs no toast).
 *   A runtime that went away is said the same way.
 *
 * @module chat/attention
 */

import { actionOf } from "@datalayer/agent-runtimes/lib/portable/approvalCard";

/** The Rules' classes of an action, as the Shield names them. */
export type ActionClass =
  "read" | "write" | "send" | "buy" | "delete" | "execute" | "publish";

/** Every class, for a strict read of what an approval says. */
export const ACTION_CLASSES: readonly ActionClass[] = [
  "read",
  "write",
  "send",
  "buy",
  "delete",
  "execute",
  "publish",
];

/**
 * A coding agent's ACP `kind`, as a class: `read`, `search`, `fetch` read;
 * `edit`, `move` write; `delete` deletes; `execute` executes; `other` is a
 * write (fail closed), as the Shield maps them.
 */
export const ACP_KIND_CLASSES: Readonly<Record<string, ActionClass>> = {
  read: "read",
  search: "read",
  fetch: "read",
  edit: "write",
  move: "write",
  delete: "delete",
  execute: "execute",
  other: "write",
};

/** The verbs a tool's name starts with, when the approval names no class. */
const NAMED_CLASSES: readonly [RegExp, ActionClass][] = [
  [/^(run|exec|execute|shell|bash|terminal|command)\b/i, "execute"],
  [/^(delete|remove|rm|drop|unlink)\b/i, "delete"],
  [/^(send|mail|email|reply|message|post)\b/i, "send"],
  [/^(publish|deploy|release|push)\b/i, "publish"],
  [/^(buy|pay|purchase|order|charge)\b/i, "buy"],
  [/^(read|search|fetch|grep|glob|list|find|get|view|open|cat)\b/i, "read"],
];

/** An approval, as the chat's banner holds it. */
export interface ApprovalRaised {
  /** Its id where it is decided (ai-agents, or the local runtime). */
  id: string;
  /** The tool waiting on it. */
  toolName: string;
  /** Its arguments: read for the class only, never said in a notification. */
  args: Record<string, unknown>;
  /** The agent waiting on it. */
  agentId: string;
  /** When it was asked. */
  requestedAt: string;
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * The class of what an approval asks: `_class` when it names one of the
 * seven, else its ACP `_kind` mapped, else the verb its tool's name starts
 * with; `write` when nothing says (fail closed, as `other` is).
 *
 * @param approval - Its tool and arguments.
 *
 * @returns One of the seven classes.
 */
export function actionClassOf(
  approval: Pick<ApprovalRaised, "toolName" | "args">,
): ActionClass {
  const named = text(approval.args._class).toLowerCase();
  if ((ACTION_CLASSES as readonly string[]).includes(named)) {
    return named as ActionClass;
  }
  const kind = ACP_KIND_CLASSES[text(approval.args._kind).toLowerCase()];
  if (kind) {
    return kind;
  }
  const words = approval.toolName.replace(/[_\-.:/]+/g, " ").trim();
  for (const [verb, cls] of NAMED_CLASSES) {
    if (verb.test(words)) {
      return cls;
    }
  }
  return "write";
}

/** The notification's three answers, in their order. */
export const APPROVAL_ACTIONS = ["Approve", "Decline", "Show"] as const;
/** One of the notification's answers. */
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

/** What the editor says of approvals and decisions. */
export const ATTENTION_WORDS = {
  /**
   * The sentence of a notification: *Support Desk asks to Run git push (execute)*.
   *
   * @param app - The application asking.
   * @param action - What it asks to do, in words.
   * @param cls - The action's class.
   *
   * @returns The sentence.
   */
  asks: (app: string, action: string, cls: ActionClass): string =>
    `${app} asks to ${action} (${cls})`,
  notShown: "Open the chat to read the whole request before deciding it: Show.",
  answeredElsewhere: "This approval was answered elsewhere.",
  gone: "This approval is no longer waiting.",
  /**
   * What a decision came to: approved.
   *
   * @param action - The action in words.
   *
   * @returns The sentence.
   */
  approved: (action: string): string => `Approved: ${action}.`,
  /**
   * What a decision came to: declined.
   *
   * @param action - The action in words.
   *
   * @returns The sentence.
   */
  declined: (action: string): string => `Declined: ${action}.`,
  /**
   * A decision the route refused.
   *
   * @param status - The route's status.
   *
   * @returns The sentence.
   */
  refused: (status: number): string => `The decision was refused (${status}).`,
  /** The status bar while a turn of any session runs. */
  working: "Datalayer: working…",
  /**
   * The status bar while sessions wait for the person.
   *
   * @param count - How many wait.
   *
   * @returns The item's text.
   */
  waiting: (count: number): string => `Datalayer: ${count} waiting for you`,
  /**
   * A finished turn of a session not in front, when its answer has no first line.
   *
   * @param title - The session's title.
   *
   * @returns The sentence.
   */
  finished: (title: string): string => `${title} finished its turn.`,
  /**
   * A session whose runtime no longer holds it.
   *
   * @param title - The session's title.
   *
   * @returns The sentence.
   */
  runtimeGone: (title: string): string => `${title}: its runtime went away.`,
} as const;

/**
 * The notification an approval is said as: the application, the action in
 * words (`send_email` → *Send email*) and its class — never its arguments.
 *
 * @param app - The application asking.
 * @param approval - What it asks: its tool and arguments.
 *
 * @returns The message and its answers.
 */
export function approvalNotification(
  app: string,
  approval: Pick<ApprovalRaised, "toolName" | "args">,
): { message: string; actions: readonly ApprovalAction[] } {
  return {
    message: ATTENTION_WORDS.asks(
      app,
      actionOf(approval.toolName),
      actionClassOf(approval),
    ),
    actions: APPROVAL_ACTIONS,
  };
}

/**
 * The approvals to notify: those pending now that were not seen before —
 * each is notified once, however often the banner is read again.
 *
 * @param seen - The ids notified already.
 * @param pending - What is pending now.
 *
 * @returns The approvals not seen before, in the order asked.
 */
export function newlyRaised<T extends { id: string }>(
  seen: ReadonlySet<string>,
  pending: readonly T[],
): T[] {
  return pending.filter((approval) => !seen.has(approval.id));
}

/**
 * Whether a decision may be taken from the notification: only once the chat
 * has shown the request whole at least once.
 *
 * @param shown - The ids the chat has shown.
 * @param id - The approval to decide.
 *
 * @returns Whether deciding is allowed.
 */
export function decisionAllowed(
  shown: ReadonlySet<string>,
  id: string,
): boolean {
  return shown.has(id);
}

/**
 * Whether an approval read again still waits: decided only then.
 *
 * @param readAgain - The approval as read again, or null when the read failed.
 *
 * @returns Whether it is still pending.
 */
export function stillPending(
  readAgain: { status?: unknown } | null | undefined,
): boolean {
  return Boolean(readAgain) && text(readAgain?.status) === "pending";
}

/**
 * What a decision came to, in a sentence: done; answered elsewhere (409);
 * gone (404, which reveals nothing of it); refused with its status.
 *
 * @param status - The route's status.
 * @param approved - Whether approval was asked.
 * @param action - The action in words.
 *
 * @returns The sentence.
 */
export function decisionOutcome(
  status: number,
  approved: boolean,
  action: string,
): string {
  if (status >= 200 && status < 300) {
    return approved
      ? ATTENTION_WORDS.approved(action)
      : ATTENTION_WORDS.declined(action);
  }
  if (status === 409) {
    return ATTENTION_WORDS.answeredElsewhere;
  }
  if (status === 404) {
    return ATTENTION_WORDS.gone;
  }
  return ATTENTION_WORDS.refused(status);
}

/** A session as the editor watches it: its state, its turn, where it is. */
export interface SessionAttention {
  /** What tells sessions apart: the session's uid, or the chat's choice. */
  key: string;
  title: string;
  /** The agent bound to it. */
  agent: string;
  state: "open" | "paused" | "ended";
  /** The turn's phase of an open session; `''` when unknown. */
  turn: "idle" | "running" | "waiting" | "";
  /** Whether its runtime holds it; `null` when unknown. */
  held: boolean | null;
  /** The chat shows it. */
  inFront: boolean;
  /** The first line of what it last answered, when known. */
  lastAnswer?: string;
}

/** The turn's phase in words, after the state. */
const phaseWords: Record<SessionAttention["turn"], string> = {
  idle: "",
  running: "answering",
  waiting: "waiting for you",
  "": "",
};

/**
 * One session in a sentence: *Open · answering — shield-mvp-claude-code*.
 *
 * @param session - Its state, turn and agent.
 *
 * @returns The sentence.
 */
export function sessionSaid(session: SessionAttention): string {
  const state = session.state.charAt(0).toUpperCase() + session.state.slice(1);
  const phase = session.state === "open" ? phaseWords[session.turn] : "";
  const stated = phase ? `${state} · ${phase}` : state;
  return session.agent ? `${stated} — ${session.agent}` : stated;
}

/**
 * The status bar's item: *Datalayer: 2 waiting for you* when sessions wait
 * (the first waiting one is what a click opens), *Datalayer: working…*
 * while a turn of any runs, nothing otherwise. The tooltip says the
 * session in front.
 *
 * @param sessions - The sessions watched.
 *
 * @returns The item, or null when it is hidden.
 */
export function statusBarItem(
  sessions: readonly SessionAttention[],
): { text: string; tooltip: string; first: string | null } | null {
  const open = sessions.filter((session) => session.state === "open");
  const waiting = open.filter((session) => session.turn === "waiting");
  const running = open.filter((session) => session.turn === "running");
  const front = sessions.find((session) => session.inFront);
  const tooltip = front ? `${front.title}: ${sessionSaid(front)}` : "";
  if (waiting.length > 0) {
    return {
      text: ATTENTION_WORDS.waiting(waiting.length),
      tooltip: tooltip || `${waiting[0]!.title}: ${sessionSaid(waiting[0]!)}`,
      first: waiting[0]!.key,
    };
  }
  if (running.length > 0) {
    return {
      text: ATTENTION_WORDS.working,
      tooltip: tooltip || `${running[0]!.title}: ${sessionSaid(running[0]!)}`,
      first: running[0]!.key,
    };
  }
  return null;
}

/** A notification about a session's turn. */
export interface TurnNotice {
  key: string;
  title: string;
  said: string;
}

const firstLine = (value: string | undefined): string =>
  (value ?? "").split("\n").find((line) => line.trim()) ?? "";

/**
 * The turns to notify between two readings: a session **not in front**
 * whose turn was running and is not any more (the first line of its answer,
 * else that it finished), or whose runtime went away. The session in front
 * is never notified.
 *
 * @param before - The sessions as last read.
 * @param after - The sessions as read now.
 *
 * @returns The notices, in the order of `after`.
 */
export function finishedTurns(
  before: readonly SessionAttention[],
  after: readonly SessionAttention[],
): TurnNotice[] {
  const was = new Map(before.map((session) => [session.key, session]));
  const notices: TurnNotice[] = [];
  for (const session of after) {
    if (session.inFront) {
      continue;
    }
    const earlier = was.get(session.key);
    if (!earlier) {
      continue;
    }
    const title = session.title || session.key;
    if (earlier.held !== false && session.held === false) {
      notices.push({
        key: session.key,
        title,
        said: ATTENTION_WORDS.runtimeGone(title),
      });
      continue;
    }
    if (
      earlier.turn === "running" &&
      session.turn !== "running" &&
      session.state === "open"
    ) {
      notices.push({
        key: session.key,
        title,
        said: firstLine(session.lastAnswer) || ATTENTION_WORDS.finished(title),
      });
    }
  }
  return notices;
}
