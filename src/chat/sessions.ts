/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Sessions view's rows (VS-04, VS-12): the person's sessions on
 * Datalayer (the record, through ai-agents) and on this machine (each local
 * runtime's `GET /api/v1/apps/sessions`) in one tree grouped by place then
 * application, each row as `loop sessions list` prints it — title, state
 * with the turn phase, agent and harness, turns, lineage, *not held* for a
 * runtime that is gone — filtered by application, state and title, the
 * archived hidden; and the person's team runs with their seats.
 *
 * Pure: no `vscode`, no network. The tree provider
 * (`providers/sessionsTreeProvider.ts`) fetches and draws; the verbs are
 * `chat/sessionVerbs.ts`.
 *
 * @module chat/sessions
 */

import {
  sessionAgentSaid,
  sessionLineageSaid,
  type SessionRow,
  sessionRowOf,
  type SessionState,
  sessionStateSaid,
} from "@datalayer/agent-runtimes/lib/portable/activity";

/** Where a session runs: Datalayer's record, or a local runtime of one workspace folder. */
export type SessionPlace =
  | { kind: "datalayer" }
  | { kind: "local"; folder: string; folderName: string; url: string };

/**
 * One key per place.
 *
 * @param place - The place.
 *
 * @returns `datalayer`, or `local:<folder>`.
 */
export function placeKey(place: SessionPlace): string {
  return place.kind === "datalayer" ? "datalayer" : `local:${place.folder}`;
}

/**
 * The place as the tree labels it.
 *
 * @param place - The place.
 *
 * @returns *On Datalayer*, or *On this machine — <folder>*.
 */
export function placeLabel(place: SessionPlace): string {
  return place.kind === "datalayer"
    ? "On Datalayer"
    : `On this machine — ${place.folderName}`;
}

/**
 * Where a session is listed on Datalayer: the record, through ai-agents, for its opener.
 *
 * @param aiAgentsUrl - ai-agents' base URL.
 * @param openedBy - The person's uid.
 *
 * @returns The URL.
 */
export function datalayerSessionsUrl(
  aiAgentsUrl: string,
  openedBy: string,
): string {
  return `${aiAgentsUrl.replace(/\/$/, "")}/api/ai-agents/v1/apps/sessions?opened_by=${encodeURIComponent(openedBy)}`;
}

/** The session API's list route on a runtime. */
export const LOCAL_SESSIONS_PATH = "/api/v1/apps/sessions";

/** The application a session belongs to, as the tree groups it. */
export interface SessionApplication {
  /** The application's uid, else its id on the runtime, else empty. */
  key: string;
  /** Its name, else its id, else its uid. */
  name: string;
}

/** A session as listed, with the application it belongs to. */
export interface ListedSession {
  row: SessionRow;
  application: SessionApplication;
}

function said(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The application of a raw session row: ai-agents' rows carry `app_uid`;
 * a runtime's rows carry `app: {id, name}` and `instance.app_uid`.
 *
 * @param raw - The row as answered.
 *
 * @returns The application's key and name.
 */
export function applicationOf(
  raw: Record<string, unknown>,
): SessionApplication {
  const app =
    raw.app && typeof raw.app === "object"
      ? (raw.app as Record<string, unknown>)
      : {};
  const instance =
    raw.instance && typeof raw.instance === "object"
      ? (raw.instance as Record<string, unknown>)
      : {};
  const uid = said(raw.app_uid) || said(instance.app_uid);
  const id = said(app.id) || (typeof raw.app === "string" ? raw.app : "");
  return {
    key: uid || id,
    name: said(app.name) || id || uid || "An application",
  };
}

/**
 * The sessions a list route answered (`{sessions, has_more}`), each with its
 * application; a row whose state is none of the three is refused by
 * `sessionRowOf`, never defaulted.
 *
 * @param body - The route's answer.
 *
 * @returns The sessions, in the route's order.
 *
 * @throws Error when the answer lists no sessions, or a row is malformed.
 */
export function listedSessionsOf(body: unknown): ListedSession[] {
  const sessions =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).sessions
      : undefined;
  if (!Array.isArray(sessions)) {
    throw new Error("The answer for the sessions names no sessions.");
  }
  return sessions.map((raw) => {
    const record = raw as Record<string, unknown>;
    return { row: sessionRowOf(record), application: applicationOf(record) };
  });
}

/** What the tree is narrowed to; empty strings narrow nothing. */
export interface SessionFilter {
  /** An application's key or name, matched case-insensitively. */
  app: string;
  /** One state, or any. */
  state: SessionState | "";
  /** A piece of the title, matched case-insensitively. */
  title: string;
}

/** Nothing narrowed. */
export const NO_FILTER: SessionFilter = { app: "", state: "", title: "" };

/**
 * The sessions the filter keeps: the archived never, then by application,
 * state and title.
 *
 * @param sessions - The sessions listed.
 * @param filter - What to keep.
 *
 * @returns The sessions kept, in order.
 */
export function filterSessions(
  sessions: readonly ListedSession[],
  filter: SessionFilter,
): ListedSession[] {
  const app = filter.app.trim().toLowerCase();
  const title = filter.title.trim().toLowerCase();
  return sessions.filter(({ row, application }) => {
    if (row.archived) {
      return false;
    }
    if (filter.state && row.state !== filter.state) {
      return false;
    }
    if (
      app &&
      !application.key.toLowerCase().includes(app) &&
      !application.name.toLowerCase().includes(app)
    ) {
      return false;
    }
    if (title && !row.title.toLowerCase().includes(title)) {
      return false;
    }
    return true;
  });
}

/**
 * The filter in words, for the view's description.
 *
 * @param filter - The filter.
 *
 * @returns *application: x · state: open · title: y*, or empty when nothing is narrowed.
 */
export function filterSaid(filter: SessionFilter): string {
  return [
    filter.app.trim() ? `application: ${filter.app.trim()}` : "",
    filter.state ? `state: ${filter.state}` : "",
    filter.title.trim() ? `title: ${filter.title.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One application's sessions under a place. */
export interface SessionGroup {
  application: SessionApplication;
  sessions: ListedSession[];
}

/**
 * The sessions grouped by application, in the order the applications first appear.
 *
 * @param sessions - The sessions kept.
 *
 * @returns The groups.
 */
export function groupByApplication(
  sessions: readonly ListedSession[],
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const session of sessions) {
    const key = session.application.key || session.application.name;
    let group = groups.get(key);
    if (!group) {
      group = { application: session.application, sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

/**
 * A row's label: its title, else its uid.
 *
 * @param row - The session.
 *
 * @returns The label.
 */
export function rowLabel(row: SessionRow): string {
  return row.title || row.uid;
}

/**
 * A row's description, as `loop sessions list` prints it: the state with the
 * turn phase, the agent with its harness, the turns, the lineage, *not held*
 * for an open session whose runtime is gone.
 *
 * @param row - The session.
 *
 * @returns The parts joined with ` · `.
 */
export function rowDescription(row: SessionRow): string {
  const turns = `${row.turns} turn${row.turns === 1 ? "" : "s"}`;
  const lineage = sessionLineageSaid(row);
  return [
    sessionStateSaid(row),
    sessionAgentSaid(row),
    turns,
    lineage ? lineage.charAt(0).toLowerCase() + lineage.slice(1) : "",
    row.state === "open" && row.held === false ? "not held" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The codicon of a row's state: the turn phase as its icon when open.
 *
 * @param row - The session.
 *
 * @returns A codicon id.
 */
export function stateIconOf(row: Pick<SessionRow, "state" | "turn">): string {
  if (row.state === "ended") {
    return "circle-slash";
  }
  if (row.state === "paused") {
    return "debug-pause";
  }
  if (row.turn === "running") {
    return "sync~spin";
  }
  if (row.turn === "waiting") {
    return "question";
  }
  return "circle-filled";
}

/**
 * The context value the menus match: `session-<state>-<place kind>`.
 *
 * @param row - The session.
 * @param place - Its place.
 *
 * @returns E.g. `session-paused-local`.
 */
export function contextValueOf(
  row: Pick<SessionRow, "state">,
  place: SessionPlace,
): string {
  return `session-${row.state}-${place.kind}`;
}

/**
 * The one row a place that did not answer shows.
 *
 * @param place - The place.
 * @param message - What went wrong, the server's words.
 *
 * @returns The sentence.
 */
export function placeProblemSentence(
  place: SessionPlace,
  message: string,
): string {
  return place.kind === "datalayer"
    ? `Datalayer did not answer for your sessions: ${message}`
    : `The local runtime of ${place.folderName} did not answer: ${message}`;
}

/** The sentence under a place with no session. */
export const NOTHING_LISTED = "No session yet.";

/** The sentence under *On Datalayer* while signed out. */
export const SIGNED_OUT_SENTENCE =
  "Sign in to Datalayer to see your sessions there.";

/** The sentence under *On this machine* while no local runtime runs. */
export const NO_LOCAL_RUNTIME_SENTENCE =
  "No local runtime is running: start a coding agent in a folder, or Datalayer: Start the local runtime.";

// ---------------------------------------------------------------------------
// Teams (VS-12)
// ---------------------------------------------------------------------------

/** A seat of a team run: its execution, its session when it has one. */
export interface TeamSeat {
  executionId: string;
  /** The seat's id, from `team:<team>/<seat>`. */
  seat: string;
  /** The execution's state word. */
  status: string;
  /** The seat's session on Datalayer, when the control plane bound one. */
  sessionUid: string;
  /** The execution's status message, when it has one. */
  statusMessage: string;
}

/** A team run: the root execution and its seats. */
export interface TeamRun {
  executionId: string;
  team: string;
  /** The run's state as a session's (MH-22). */
  state: SessionState;
  /** The execution's own state word. */
  status: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  /** The supervisor's last line, when the execution carries one. */
  steering: string;
  seats: TeamSeat[];
}

/** A seat's agent id names its team: `team:<team>/<seat>`. */
export const TEAM_PREFIX = "team:";

const OPEN_WORDS = new Set([
  "created",
  "assigned",
  "running",
  "waiting",
  "retrying",
]);
const ENDED_WORDS = new Set(["completed", "failed", "cancelled", "terminated"]);

/**
 * A team run's state as a session's (MH-22): `created|assigned|running|waiting|retrying`
 * → `open`, `paused` → `paused`, `completed|failed|cancelled|terminated` → `ended`.
 *
 * @param status - The execution's state word.
 *
 * @returns The session state.
 *
 * @throws Error for any other word.
 */
export function teamStateOf(status: string): SessionState {
  if (OPEN_WORDS.has(status)) {
    return "open";
  }
  if (status === "paused") {
    return "paused";
  }
  if (ENDED_WORDS.has(status)) {
    return "ended";
  }
  throw new Error(
    `There is no execution state ${JSON.stringify(status)}: one of ${[...OPEN_WORDS, "paused", ...ENDED_WORDS].join(", ")}.`,
  );
}

/**
 * The team of an execution, from its seat's agent id; empty for none.
 *
 * @param agentId - The execution's agent id.
 *
 * @returns The team's id.
 */
export function teamOf(agentId: string): string {
  return agentId.startsWith(TEAM_PREFIX)
    ? (agentId.slice(TEAM_PREFIX.length).split("/")[0] ?? "")
    : "";
}

/**
 * The seat of an execution, from its agent id; the id itself when it names no seat.
 *
 * @param agentId - The execution's agent id.
 *
 * @returns The seat.
 */
export function seatOf(agentId: string): string {
  if (!agentId.startsWith(TEAM_PREFIX)) {
    return agentId;
  }
  const after = agentId.slice(TEAM_PREFIX.length);
  const slash = after.indexOf("/");
  return slash >= 0 ? after.slice(slash + 1) : after;
}

/**
 * The person's team runs from the control plane's executions
 * (`GET /api/ai-agents/v1/orchestration/executions`): each root execution of
 * a team, newest first, with its seats (the executions below it, by parent),
 * each seat's session uid when the binding carries one.
 *
 * @param executions - The executions answered.
 *
 * @returns The runs.
 *
 * @throws Error for an execution without an id, or a state word that is none.
 */
export function teamRunsOf(executions: readonly unknown[]): TeamRun[] {
  const records = executions.map((raw) => {
    const record = raw as Record<string, unknown>;
    const agent =
      record.agent && typeof record.agent === "object"
        ? (record.agent as Record<string, unknown>)
        : {};
    const objective =
      record.objective && typeof record.objective === "object"
        ? (record.objective as Record<string, unknown>)
        : {};
    const executionId = said(record.executionId);
    if (!executionId) {
      throw new Error(
        "An execution of the control plane names no executionId.",
      );
    }
    return {
      executionId,
      parentExecutionId: said(record.parentExecutionId),
      rootExecutionId: said(record.rootExecutionId),
      depth: typeof record.depth === "number" ? record.depth : 0,
      status: said(record.status),
      statusMessage: said(record.statusMessage),
      agentId: said(agent.agentId),
      sessionId: said(agent.sessionId),
      goal: said(objective.goal),
      createdAt: said(record.createdAt),
      updatedAt: said(record.updatedAt),
    };
  });
  const roots = records.filter(
    (record) => record.depth === 0 && teamOf(record.agentId) !== "",
  );
  roots.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  return roots.map((root) => ({
    executionId: root.executionId,
    team: teamOf(root.agentId),
    state: teamStateOf(root.status),
    status: root.status,
    goal: root.goal,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
    steering: root.statusMessage,
    seats: records
      .filter(
        (record) =>
          record.parentExecutionId === root.executionId ||
          (record.rootExecutionId === root.executionId &&
            record.executionId !== root.executionId &&
            record.depth === 1),
      )
      .filter(
        (record, index, all) =>
          all.findIndex((other) => other.executionId === record.executionId) ===
          index,
      )
      .map((record) => ({
        executionId: record.executionId,
        seat: seatOf(record.agentId),
        status: record.status,
        sessionUid: record.sessionId,
        statusMessage: record.statusMessage,
      })),
  }));
}

/**
 * Where the control plane lists the person's executions.
 *
 * @param aiAgentsUrl - ai-agents' base URL.
 *
 * @returns The URL.
 */
export function executionsUrl(aiAgentsUrl: string): string {
  return `${aiAgentsUrl.replace(/\/$/, "")}/api/ai-agents/v1/orchestration/executions`;
}

/**
 * A team run's label: its team and its goal's first line.
 *
 * @param run - The run.
 *
 * @returns The label.
 */
export function teamRunLabel(run: TeamRun): string {
  const goal = run.goal.split("\n")[0]?.trim() ?? "";
  return goal ? `${run.team} — ${goal}` : run.team || run.executionId;
}

/**
 * A team run's description: its state, its seats, its supervisor's last line.
 *
 * @param run - The run.
 *
 * @returns The parts joined with ` · `.
 */
export function teamRunDescription(run: TeamRun): string {
  const state = sessionStateSaid({ state: run.state, turn: "" });
  const seats = `${run.seats.length} seat${run.seats.length === 1 ? "" : "s"}`;
  return [
    run.status === run.state ? state : `${state} (${run.status})`,
    seats,
    run.steering,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A seat's description: its state and whether its session can be opened.
 *
 * @param seat - The seat.
 *
 * @returns The parts joined with ` · `.
 */
export function teamSeatDescription(seat: TeamSeat): string {
  return [
    seat.status,
    seat.sessionUid ? `session ${seat.sessionUid}` : "no session yet",
    seat.statusMessage,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The sentence under *Teams* when the person has no run. */
export const NO_TEAM_RUN = "No team run yet.";

/** The sentence under *Teams* when the control plane did not answer. */
export function teamsProblemSentence(message: string): string {
  return `Datalayer did not answer for your team runs: ${message}`;
}
