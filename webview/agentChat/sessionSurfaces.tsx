/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The chat's side of the editor's session surfaces: what the chat posts to
 * the extension host (an approval raised or shown, a decision sent, a diff
 * to open, a terminal's output, the session's state) and what it answers
 * (a decision asked from a notification, the chat focused on an approval).
 *
 * The displays a coding agent's tool results carry are drawn by
 * agent-runtimes' own cards (`DiffCard`, `TerminalCard`, mounted as the
 * Shield's displays plugin mounts them, through a Reactor the chat reads
 * renderers from): the diff row gains *Open in the editor*, which opens it
 * in the editor's diff view (reviewed, never applied); the terminal row is
 * also written to the session's terminal in the editor's Terminal panel.
 *
 * @module webview/agentChat/sessionSurfaces
 */

import React from "react";

import {
  DiffCard,
  TerminalCard,
} from "@datalayer/agent-runtimes/lib/apps/plugins/shield-displays";
import {
  protocolDisplayOf,
  SHIELD_DIFF_TYPE,
  SHIELD_TERMINAL_TYPE,
} from "@datalayer/agent-runtimes/lib/portable/displays";
import { LoopSessionAction } from "@datalayer/agent-runtimes/lib/apps/core";
import type { ProtocolDisplay } from "@datalayer/agent-runtimes/lib/portable/displays";
import type { ToolCallRenderContext } from "@datalayer/agent-runtimes/lib/types/chat";
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from "@datalayer/reactor";
import { registerReactor } from "@datalayer/reactor/react";
import { Renderers } from "@datalayer/reactor/ui";
import {
  defineRenderer,
  type RendererProps,
} from "@datalayer/reactor/ui/react";

import type {
  ApprovalRaised,
  SessionAttention,
} from "../../src/chat/attention";
import {
  DIFF_WORDS,
  displayOfToolCall,
  type TerminalShown,
} from "../../src/chat/sessionDisplays";
import {
  type VsCodeSessionActionPost,
  vscodeSessionActions,
} from "./vscodeSessionActions";

/** What the chat posts to the extension host. */
export type SurfacePost =
  | {
      type: "approval-raised";
      app: string;
      sessionKey: string;
      approvals: ApprovalRaised[];
    }
  | { type: "approval-shown"; ids: string[] }
  | { type: "approval-decided"; requestId: string; said: string }
  | {
      type: "open-diff";
      display: unknown;
      harness: string;
      turn: number;
      local: boolean;
    }
  | {
      type: "terminal-output";
      sessionKey: string;
      title: string;
      display: TerminalShown;
    }
  | { type: "session-state"; sessions: SessionAttention[] }
  | { type: "session-ended"; sessionKey: string }
  | { type: "session-changed" }
  | VsCodeSessionActionPost;

/** The session the chat shows, for what is posted about it. */
export interface SurfaceContext {
  /** What tells it apart: the session's uid, or the chat's choice. */
  sessionKey: string;
  title: string;
  agent: string;
  /** The harness the agent runs on, or `''`. */
  harness: string;
  /** The application asking, named in a notification. */
  app: string;
  /** It runs on this machine: a diff's after side is read from the disk. */
  local: boolean;
}

let post: (message: SurfacePost) => void = () => undefined;
let context: SurfaceContext | null = null;
let turn = 0;
let decider: ((id: string, approved: boolean) => Promise<string>) | null = null;
let focus: ((id: string) => void) | null = null;

/**
 * Installs the channel to the extension host.
 *
 * @param api - The webview's VS Code API.
 */
export function installSessionSurfaces(api: {
  postMessage: (message: unknown) => void;
}): void {
  post = (message) => api.postMessage(message);
}

/**
 * Posts to the extension host.
 *
 * @param message - What to post.
 */
export function postSurface(message: SurfacePost): void {
  post(message);
}

/**
 * The session the chat shows now; null when none. Set as a chat mounts, the
 * turn count starting over.
 *
 * @param next - The session, or null.
 */
export function setSurfaceContext(next: SurfaceContext | null): void {
  context = next;
  turn = 0;
}

/** The session the chat shows now. */
export const surfaceContext = (): SurfaceContext | null => context;

/** One more turn of the person: counted for the diff view's title. */
export function noteTurn(): number {
  turn += 1;
  return turn;
}

/** The person's turns so far in the chat shown. */
export const turnsSoFar = (): number => turn;

/**
 * Registers how a decision asked from a notification is sent (the chat
 * holds the approval's source), and how the chat is focused on one.
 *
 * @param next - The two, or null when the chat unmounts.
 */
export function registerApprovalHandlers(
  next: {
    decide: (id: string, approved: boolean) => Promise<string>;
    focus: (id: string) => void;
  } | null,
): void {
  decider = next?.decide ?? null;
  focus = next?.focus ?? null;
}

/**
 * Handles a message from the extension host about the surfaces.
 *
 * @param data - The message.
 *
 * @returns Whether it was one of the surfaces' messages.
 */
export function handleHostSurfaceMessage(data: {
  type: string;
  [key: string]: unknown;
}): boolean {
  if (data.type === "approval-decide") {
    const { requestId, id, approved } = data;
    if (typeof requestId !== "string" || typeof id !== "string") {
      return true;
    }
    const decide = decider;
    void (async () => {
      let said: string;
      try {
        said = decide
          ? await decide(id, approved === true)
          : "No chat is open to decide it: open the Datalayer Chat.";
      } catch (error) {
        said = error instanceof Error ? error.message : String(error);
      }
      post({ type: "approval-decided", requestId, said });
    })();
    return true;
  }
  if (data.type === "focus-approval") {
    if (typeof data.id === "string") {
      focus?.(data.id);
    }
    return true;
  }
  return false;
}

/**
 * A tool's result, as the chat completes it: a terminal display is written
 * to the session's terminal in the editor.
 *
 * @param toolName - The tool.
 * @param result - Its result.
 */
export function reportToolResult(toolName: string, result: unknown): void {
  const shown = context;
  if (!shown) {
    return;
  }
  const display = displayOfToolCall(toolName, result);
  if (display?.kind === "terminal") {
    post({
      type: "terminal-output",
      sessionKey: shown.sessionKey,
      title: shown.title,
      display,
    });
  }
}

/**
 * A running tool call's display as the stream updates it (VS-24's hook,
 * `onToolCallUpdate`): a terminal display is written to the session's
 * terminal in the editor as the command streams, not only when it ends.
 *
 * @param display - The display as it stands now.
 */
export function reportToolDisplay(display: ProtocolDisplay): void {
  const shown = context;
  if (!shown || display.kind !== "terminal") {
    return;
  }
  post({
    type: "terminal-output",
    sessionKey: shown.sessionKey,
    title: shown.title,
    display,
  });
}

/**
 * The session's state as the chat knows it, for the status bar: the one in
 * front, with its turn's phase.
 *
 * @param state - The turn's phase, and what was last answered.
 * @param state.turn - The turn's phase.
 * @param state.lastAnswer - The first line of the last answer, when known.
 */
export function reportSessionState(state: {
  turn: SessionAttention["turn"];
  lastAnswer?: string;
}): void {
  const shown = context;
  if (!shown) {
    post({ type: "session-state", sessions: [] });
    return;
  }
  post({
    type: "session-state",
    sessions: [
      {
        key: shown.sessionKey,
        title: shown.title,
        agent: shown.agent,
        state: "open",
        turn: state.turn,
        held: true,
        inFront: true,
        ...(state.lastAnswer ? { lastAnswer: state.lastAnswer } : {}),
      },
    ],
  });
}

/** The chat shows no session: nothing in front. */
export function reportNoSession(): void {
  post({ type: "session-state", sessions: [] });
}

/** A session changed (a turn answered): the Sessions view reads again. */
export function reportSessionChanged(): void {
  post({ type: "session-changed" });
}

/**
 * The first line of what the agent answered, as the chat hands the message
 * (its text, or an object with `content` or `text`); `''` when none.
 *
 * @param message - The message received.
 *
 * @returns Its first non-empty line.
 */
export function answerTextOf(message: unknown): string {
  let text = "";
  if (typeof message === "string") {
    text = message;
  } else if (message && typeof message === "object") {
    const record = message as Record<string, unknown>;
    text =
      typeof record.content === "string"
        ? record.content
        : typeof record.text === "string"
          ? record.text
          : "";
  }
  return (
    text
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? ""
  );
}

/** The plugin's name in the Reactor. */
export const SESSION_SURFACES_PLUGIN_NAME =
  "@datalayer/vscode-plugin-session-surfaces";

const buttonStyle: React.CSSProperties = {
  marginTop: "4px",
  padding: "2px 8px",
  background: "var(--vscode-button-secondaryBackground)",
  color: "var(--vscode-button-secondaryForeground)",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
  fontSize: "12px",
};

/** A diff row: agent-runtimes' card, and *Open in the editor*. */
function Diff({
  display,
  context: render,
}: RendererProps<ToolCallRenderContext>): React.JSX.Element {
  const read = protocolDisplayOf(display);
  if (!read || read.kind !== "diff") {
    return <span>{render?.defaultUI ?? display.text}</span>;
  }
  return (
    <div data-vscode-diff={read.path}>
      <DiffCard display={read} />
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          post({
            type: "open-diff",
            display: read,
            harness: context?.harness ?? "",
            turn: turnsSoFar(),
            local: context?.local ?? false,
          });
        }}
      >
        {DIFF_WORDS.openInEditor}
      </button>
    </div>
  );
}

/** A terminal row: agent-runtimes' card (its output also in the editor's terminal). */
function Terminal({
  display,
  context: render,
}: RendererProps<ToolCallRenderContext>): React.JSX.Element {
  const read = protocolDisplayOf(display);
  if (!read || read.kind !== "terminal") {
    return <span>{render?.defaultUI ?? display.text}</span>;
  }
  return <TerminalCard display={read} />;
}

let registered = false;

/**
 * Mounts the displays' renderers once: the Reactor the chat reads them
 * from, with this plugin's two renderers for the Shield's diff and
 * terminal types.
 */
export function ensureDisplayRenderers(): void {
  if (registered) {
    return;
  }
  registered = true;
  const plugin = definePlugin({
    name: SESSION_SURFACES_PLUGIN_NAME,
    displayName: "Diffs and terminals in the editor",
    description:
      "What a coding agent changed, opened in the diff view; what it ran, in the Terminal panel.",
    octicon: "diff",
    emoji: "\u{1F6E1}",
    contributes: [
      contribution(
        Renderers,
        defineRenderer({ type: SHIELD_DIFF_TYPE, component: Diff }),
        { id: "vscode-shield-diff" },
      ),
      contribution(
        Renderers,
        defineRenderer({ type: SHIELD_TERMINAL_TYPE, component: Terminal }),
        { id: "vscode-shield-terminal" },
      ),
      // The thread's menu entries VS Code adds (`loop.session.action`).
      ...vscodeSessionActions(post, () => context?.local ?? false).map(
        (entry) =>
          contribution(LoopSessionAction, entry, {
            id: entry.id,
            order: entry.order,
          }),
      ),
    ],
  });
  // Started: a Reactor's contributions are read as it starts, so the
  // renderers and the menu's entries are there for the chat to read.
  const reactor = buildReactorFromPlugins([plugin as never]);
  void reactor.start();
  registerReactor(reactor);
}
