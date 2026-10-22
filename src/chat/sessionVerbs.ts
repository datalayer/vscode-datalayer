/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The seven verbs of a session from the Sessions view (VS-05), their pure
 * parts: which runtime answers for a session on Datalayer, the quick pick's
 * choices for a swap, the turn a clone is cut at, the export's file name,
 * the refusal shown as the runtime said it, the import's second try when
 * the file's agent is not on the runtime, and where the extension's own two
 * entries go (*Reveal in Explorer*, *Open in the Studio*).
 *
 * Pure: no `vscode`, no network. `commands/sessions.ts` calls the runtime
 * through `appSessionsClient` and draws the dialogs.
 *
 * @module chat/sessionVerbs
 */

import type { SessionRow } from "@datalayer/agent-runtimes/lib/portable/activity";
import {
  agentRuntimesUrlOf,
  RuntimeRefusal,
} from "@datalayer/agent-runtimes/lib/portable/sessions";

import type { SessionPlace } from "./sessions";

/** The suffix of a session's export file (`<uid>.session.jsonl`). */
export const SESSION_FILE_SUFFIX = ".session.jsonl";

/**
 * The file an export is saved as.
 *
 * @param uid - The session.
 *
 * @returns `<uid>.session.jsonl`.
 */
export function exportFileName(uid: string): string {
  return `${uid}${SESSION_FILE_SUFFIX}`;
}

/** Where a session's verbs are sent: a runtime's address, and the token lent to it. */
export interface SessionTarget {
  baseUrl: string;
  /** Whether the person's token goes with the requests: never to loopback. */
  signed: boolean;
}

/** A runtime of the person's, as the runtimes service lists it. */
export interface KnownRuntime {
  uid: string;
  runtimeName: string;
  ingress: string;
}

/**
 * The runtime that answers for a session: a local place's own address; on
 * Datalayer, the runtime the session runs on, found among the person's by
 * its uid (the runtime's `DATALAYER_RUNTIME_ID`) or its name.
 *
 * @param place - Where the session runs: this machine, or Datalayer.
 * @param row - The session as listed, with where it runs on Datalayer.
 * @param runtimes - The person's runtimes, for a session on Datalayer.
 *
 * @returns The target, or the sentence when no runtime of the person's holds the session.
 */
export function sessionTargetOf(
  place: SessionPlace,
  row: Pick<SessionRow, "uid" | "runsOn" | "state">,
  runtimes: readonly KnownRuntime[],
): SessionTarget | string {
  if (place.kind === "local") {
    return { baseUrl: place.url.replace(/\/$/, ""), signed: false };
  }
  const runsOn = row.runsOn;
  if (!runsOn) {
    return (
      `Session ${row.uid} is on no runtime now (${row.state}): its verbs go through a runtime of its application — ` +
      "resume it from the Studio's Activity page, or import its file on a runtime here."
    );
  }
  if (runsOn.kind === "team_run") {
    return `Session ${row.uid} is a seat of team run ${runsOn.executionId}: the team's verbs come with a later release.`;
  }
  const runtime = runtimes.find(
    (candidate) =>
      candidate.uid === runsOn.uid || candidate.runtimeName === runsOn.uid,
  );
  if (!runtime) {
    return `Session ${row.uid} runs on runtime ${runsOn.uid}, which is not one of yours now: resume it from the Studio's Activity page, or clone it here.`;
  }
  return { baseUrl: agentRuntimesUrlOf(runtime.ingress), signed: true };
}

/** One choice of the swap's quick pick. */
export interface AgentChoice {
  /** The agentspec's id, what `POST /sessions/{uid}/agent` takes. */
  agent: string;
  label: string;
  description: string;
}

/**
 * The swap's choices from the runtime's library (`GET /api/v1/library`): every
 * agentspec but the one bound, a harness agent said with its harness.
 *
 * @param library - The library's answer.
 * @param current - The agent bound now.
 *
 * @returns The choices, in the library's order.
 */
export function swapChoicesOf(
  library: unknown,
  current: string,
): AgentChoice[] {
  if (!Array.isArray(library)) {
    return [];
  }
  const choices: AgentChoice[] = [];
  for (const raw of library) {
    const spec = raw as Record<string, unknown>;
    const id = typeof spec.id === "string" ? spec.id : "";
    if (!id || id === current) {
      continue;
    }
    const harness = typeof spec.harness === "string" ? spec.harness : "";
    const name = typeof spec.name === "string" && spec.name ? spec.name : id;
    choices.push({
      agent: id,
      label: name,
      description: harness ? `${id} · harness ${harness}` : id,
    });
  }
  return choices;
}

/**
 * What the person is told before a swap is sent: the runtime words the
 * sentence the new agent reads; this says what is about to happen.
 *
 * @param row - The session's uid, agent and turns so far.
 * @param target - The agent it goes on with.
 *
 * @returns What the person reads before the swap is sent.
 */
export function swapSentence(
  row: Pick<SessionRow, "uid" | "agent" | "turns">,
  target: string,
): string {
  return (
    `Session ${row.uid} was with ${row.agent} for ${row.turns} turn${row.turns === 1 ? "" : "s"}; from here it goes on with ${target}. ` +
    "What was said carries; the new agent is told so in the conversation, and the sentence it reads is shown once the runtime answers."
  );
}

/**
 * The turn a clone is cut at, from what the person typed.
 *
 * @param input - The input box's text; empty means the last turn.
 * @param turns - The session's turns.
 *
 * @returns The turn, or the sentence refusing the input.
 */
export function cloneTurnOf(input: string, turns: number): number | string {
  const text = input.trim();
  if (!text) {
    return turns;
  }
  if (!/^\d+$/.test(text)) {
    return `A turn is a whole number from 1 to ${turns}; "${text}" is not one.`;
  }
  const turn = Number(text);
  if (turn < 1 || turn > turns) {
    return `Session has ${turns} turn${turns === 1 ? "" : "s"}; there is no turn ${turn} to clone it at.`;
  }
  return turn;
}

/**
 * A refusal as the notification shows it: the runtime's own sentence,
 * never reworded, never retried or defaulted.
 *
 * @param error - What the client threw.
 *
 * @returns The sentence.
 */
export function refusalShown(error: unknown): string {
  if (error instanceof RuntimeRefusal) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Whether an import's refusal asks for an agent (the file's is not on the runtime).
 *
 * @param error - What the client threw.
 *
 * @returns True when a second try naming an agent is what the runtime asks.
 */
export function importAsksForAgent(error: unknown): boolean {
  return (
    error instanceof RuntimeRefusal &&
    error.status === 422 &&
    /agent/i.test(error.message)
  );
}

/**
 * What a swap answered, in a sentence: the new agent and what it was told.
 *
 * @param answer - The route's answer.
 *
 * @returns The sentence.
 */
export function swappedSaid(answer: Record<string, unknown>): string {
  const agent = typeof answer.agent === "string" ? answer.agent : "";
  const said = typeof answer.said === "string" ? answer.said : "";
  return said ? `Swapped to ${agent}. ${said}` : `Swapped to ${agent}.`;
}

/**
 * What a clone answered, in a sentence.
 *
 * @param answer - The route's answer.
 * @param atTurn - The turn asked.
 *
 * @returns The sentence.
 */
export function clonedSaid(
  answer: Record<string, unknown>,
  atTurn: number,
): string {
  const uid = typeof answer.uid === "string" ? answer.uid : "";
  return `Cloned from turn ${atTurn} as ${uid}, paused: resume it to go on from there.`;
}

/**
 * What an import answered, in a sentence.
 *
 * @param answer - The route's answer.
 *
 * @returns The sentence.
 */
export function importedSaid(answer: Record<string, unknown>): string {
  const uid = typeof answer.uid === "string" ? answer.uid : "";
  const turns = Number(answer.turns) || 0;
  const redactions = Number(answer.redactions) || 0;
  return `Imported as ${uid} (paused, ${turns} turn${turns === 1 ? "" : "s"}, ${redactions} redaction${redactions === 1 ? "" : "s"}): resume it to go on from there.`;
}

/** The web application, where the Studio's pages are. */
export const STUDIO_ORIGIN = "https://datalayer.ai";

/**
 * The application's Activity page in the Studio.
 *
 * @param appUid - The application's uid at Datalayer.
 *
 * @returns The page's address, its Activity tab chosen.
 */
export function studioActivityUrl(appUid: string): string {
  return `${STUDIO_ORIGIN}/studio/apps/${encodeURIComponent(appUid)}?tab=activity`;
}

/**
 * A local session's folder in the file store (`~/.datalayer/sessions/<uid>`).
 *
 * @param home - The person's home directory.
 * @param uid - The session's uid, which names its folder.
 * @param sessionsPath - `AGENT_RUNTIMES_SESSIONS_PATH`, when set.
 *
 * @returns The absolute path of the session's folder.
 */
export function localSessionFolder(
  home: string,
  uid: string,
  sessionsPath?: string,
): string {
  const root = sessionsPath?.trim()
    ? sessionsPath.trim().replace(/[\\/]+$/, "")
    : `${home.replace(/[\\/]+$/, "")}/.datalayer/sessions`;
  return `${root}/${uid}`;
}

/** The message the tree sends the chat to open a session (B's `open-session`). */
export interface OpenSessionRequest {
  place: SessionPlace;
  uid: string;
  agent: string;
  title: string;
  state: SessionRow["state"];
  /** The application's uid, when the session has one. */
  appUid: string;
  /**
   * On Datalayer, the runtime the session runs on (its `runsOn.uid` when
   * `runsOn.kind` is `runtime`); absent when it is on none (paused, ended)
   * or is a team run's seat.
   */
  runtimeUid?: string;
  /** On Datalayer, the team run whose seat the session is, when it is one. */
  teamRun?: string;
}

/** The command the chat's provider registers to open a session; the tree calls it. */
export const OPEN_SESSION_COMMAND = "datalayer.internal.agentChat.openSession";

/** The sentence when the chat cannot open a session in this build. */
export const CHAT_CANNOT_OPEN_SENTENCE =
  "The Datalayer Chat cannot open a session in this build of the extension yet: the session is listed, and its verbs work from here.";
