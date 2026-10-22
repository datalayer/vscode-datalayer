/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session opened in the Datalayer Chat from the Sessions view (its row,
 * *Resume*): which of the picker's choices the chat selects for it — the
 * local runtime of its folder, the deployment of its application, or the
 * runtime it runs on at Datalayer — and what the chat says of it. Pure: no
 * `vscode`, no React.
 *
 * @module chat/openSession
 */

import type { SessionRow } from "@datalayer/agent-runtimes/lib/portable/activity";
import type { ProtocolConfig } from "@datalayer/agent-runtimes/lib/types/protocol";

import type { AppChatChoice } from "./appChat";
import {
  type OpenSessionRequest,
  STUDIO_ORIGIN,
  sessionTargetOf,
} from "./sessionVerbs";

/** The picker's value for a runtime. */
export const RUNTIME_VALUE = "runtime:";

/** The picker's value for a deployed application. */
export const APP_VALUE = "app:";

/** A runtime the picker lists, as the chat knows it. */
export interface PickerRuntime {
  runtimeName: string;
  ingress: string;
  /** A Datalayer runtime's uid (its `DATALAYER_RUNTIME_ID`), when listed with one. */
  uid?: string;
  place?: "datalayer" | "local";
}

/** What the chat says of a session opened from the Sessions view. */
export const OPEN_SESSION_WORDS = {
  /**
   * The session's conversation is open in the chat.
   *
   * @param title - The session's title.
   * @param state - Its state word.
   *
   * @returns The sentence.
   */
  opened: (title: string, state: string): string =>
    `${title || "This session"} (${state}): its conversation is open here.`,
  /**
   * The local runtime of its folder is not listed.
   *
   * @param folderName - The session's folder.
   *
   * @returns The sentence.
   */
  noRuntime: (folderName: string): string =>
    `The local runtime of ${folderName} is not listed: start it from the Sessions view, then open the session again.`,
  /**
   * A team run's seat, read from its record.
   *
   * @param executionId - The team run.
   *
   * @returns The sentence.
   */
  teamSeat: (executionId: string): string =>
    `A seat of team run ${executionId}: its conversation is read here; to act on the run, open it on Datalayer.`,
  /**
   * A session on Datalayer on no runtime, read from its record.
   *
   * @param state - Its state word (`paused`, `ended`).
   *
   * @returns The sentence.
   */
  onNoRuntime: (state: string): string =>
    `${state ? state[0]!.toUpperCase() + state.slice(1) : "Paused"} on no runtime: resume it on Datalayer to go on here.`,
} as const;

/**
 * A team run's page on Datalayer, where its verbs are.
 *
 * @param executionId - The team run.
 *
 * @returns The page's address.
 */
export function teamRunUrl(executionId: string): string {
  return `${STUDIO_ORIGIN}/executions/${encodeURIComponent(executionId)}`;
}

/** A session read from its record, read-only: why, and where to act on it. */
export interface RecordRead {
  /** The sentence under the transcript, why it is read-only. */
  why: string;
  /** Where it is acted on, when there is a page for it. */
  link?: { label: string; url: string };
}

/**
 * The picker's choice for a session, and the sentence said. A local
 * session: the local runtime whose address is its place. A session on
 * Datalayer: a team run's seat is read from its record; else the talkable
 * deployment of its application when the picker lists it, else the
 * person's runtime it runs on, else — on no runtime — read from its record.
 * Nothing, said why, when a runtime that is not the person's holds it — a
 * session is never pointed at another runtime.
 *
 * @param request - The session and its place.
 * @param runtimes - The runtimes the picker lists.
 * @param deployments - The deployments the picker lists.
 *
 * @returns The value to select (or null), the sentence, and the record to
 *   read when the session is read from it.
 */
export function openSessionChoice(
  request: OpenSessionRequest,
  runtimes: readonly PickerRuntime[],
  deployments: readonly AppChatChoice[],
): { value: string | null; said: string; record?: RecordRead } {
  const said = OPEN_SESSION_WORDS.opened(request.title, request.state);
  if (request.place.kind === "datalayer" && request.teamRun) {
    const why = OPEN_SESSION_WORDS.teamSeat(request.teamRun);
    return {
      value: null,
      said: why,
      record: {
        why,
        link: { label: "Open the run", url: teamRunUrl(request.teamRun) },
      },
    };
  }
  if (request.place.kind === "local") {
    const wanted = request.place.url.replace(/\/+$/, "");
    const runtime = runtimes.find(
      (candidate) =>
        candidate.place === "local" &&
        candidate.ingress.replace(/\/+$/, "") === wanted,
    );
    return runtime
      ? { value: RUNTIME_VALUE + runtime.runtimeName, said }
      : {
          value: null,
          said: OPEN_SESSION_WORDS.noRuntime(request.place.folderName),
        };
  }
  const deployment = deployments.find(
    (choice) =>
      choice.kind === "talk" &&
      Boolean(request.appUid) &&
      choice.handle.appUid === request.appUid,
  );
  if (deployment && deployment.kind === "talk") {
    return { value: APP_VALUE + deployment.handle.uid, said };
  }
  if (!request.runtimeUid) {
    const why = OPEN_SESSION_WORDS.onNoRuntime(request.state);
    return { value: null, said: why, record: { why } };
  }
  const datalayerRuntimes = runtimes.filter(
    (candidate) => candidate.place !== "local",
  );
  const target = sessionTargetOf(
    request.place,
    {
      uid: request.uid,
      state: request.state,
      runsOn: { kind: "runtime", uid: request.runtimeUid },
    } as Pick<SessionRow, "uid" | "runsOn" | "state">,
    datalayerRuntimes.map((candidate) => ({
      uid: candidate.uid ?? candidate.runtimeName,
      runtimeName: candidate.runtimeName,
      ingress: candidate.ingress,
    })),
  );
  if (typeof target === "string") {
    return { value: null, said: target };
  }
  const runtime = datalayerRuntimes.find(
    (candidate) =>
      candidate.runtimeName === request.runtimeUid ||
      candidate.uid === request.runtimeUid,
  );
  if (!runtime) {
    throw new Error(
      `Session ${request.uid}: runtime ${request.runtimeUid ?? ""} was found, then lost.`,
    );
  }
  return { value: RUNTIME_VALUE + runtime.runtimeName, said };
}

/**
 * The chat's protocol on a session's runtime (VS-24): the session API's
 * AG-UI route of the agent, each thread a session — as the Studio's chat
 * view speaks to a runtime — with its ui channel and its sessions route, so
 * a session opened by uid is the conversation, and its menu's entries act
 * on it. A local runtime is this machine's own: nothing is signed. A
 * Datalayer runtime is reached at its agent-runtimes address
 * (`agentRuntimesUrlOf`), the runtime's token carried for the run and the
 * ui channel, as the runtime pick signs.
 *
 * @param runtimeUrl - The runtime's address: a local runtime's
 *   (`http://127.0.0.1:<port>`), or a Datalayer runtime's agent-runtimes base.
 * @param agentId - The agent the session runs on.
 * @param authToken - The runtime's token, for a Datalayer runtime.
 *
 * @returns The protocol configuration `<Chat protocol>` takes as given.
 */
export function sessionProtocol(
  runtimeUrl: string,
  agentId: string,
  authToken?: string,
): ProtocolConfig {
  const base = runtimeUrl.replace(/\/+$/, "");
  const agent = encodeURIComponent(agentId);
  const protocol: ProtocolConfig = {
    type: "ag-ui",
    endpoint: `${base}/api/v1/apps/agents/${agent}/ag-ui/`,
    agentId,
    ...(authToken ? { authToken } : {}),
    configEndpoint: `${base}/api/v1/configure`,
    enableConfigQuery: true,
    uiSocket: `${base.replace(/^http/, "ws")}/api/v1/apps/ui`,
    uiFiles: `${base}/api/v1/apps/agents/${agent}/files`,
    appSessions: `${base}/api/v1/apps/sessions`,
  };
  return protocol;
}
