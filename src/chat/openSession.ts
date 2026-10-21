/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session opened in the Datalayer Chat from the Sessions view (its row,
 * *Resume*): which of the picker's choices the chat selects for it — the
 * local runtime of its folder, or the deployment of its application — and
 * what the chat says of it. Pure: no `vscode`, no React.
 *
 * @module chat/openSession
 */

import type { ProtocolConfig } from "@datalayer/agent-runtimes/lib/types/protocol";

import type { AppChatChoice } from "./appChat";
import type { OpenSessionRequest } from "./sessionVerbs";

/** The picker's value for a runtime. */
export const RUNTIME_VALUE = "runtime:";

/** The picker's value for a deployed application. */
export const APP_VALUE = "app:";

/** A runtime the picker lists, as the chat knows it. */
export interface PickerRuntime {
  runtimeName: string;
  ingress: string;
  place?: "datalayer" | "local";
}

/** What the chat says of a session opened from the Sessions view. */
export const OPEN_SESSION_WORDS = {
  opened: (title: string, state: string): string =>
    `${title || "This session"} (${state}): its conversation is open here.`,
  noRuntime: (folderName: string): string =>
    `The local runtime of ${folderName} is not listed: start it from the Sessions view, then open the session again.`,
  noDeployment: (title: string): string =>
    `${title || "This session"} runs on Datalayer, and its application is not listed here: turn on the Datalayer › Agent Chat setting and keep the application always on in its Ship tab.`,
} as const;

/**
 * The picker's choice for a session, and the sentence said: the local
 * runtime whose address is the session's place, or the talkable deployment
 * of its application; nothing, said why, when neither is listed.
 *
 * @param request - The session and its place.
 * @param runtimes - The runtimes the picker lists.
 * @param deployments - The deployments the picker lists.
 *
 * @returns The value to select (or null) and the sentence.
 */
export function openSessionChoice(
  request: OpenSessionRequest,
  runtimes: readonly PickerRuntime[],
  deployments: readonly AppChatChoice[],
): { value: string | null; said: string } {
  const said = OPEN_SESSION_WORDS.opened(request.title, request.state);
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
  return deployment && deployment.kind === "talk"
    ? { value: APP_VALUE + deployment.handle.uid, said }
    : { value: null, said: OPEN_SESSION_WORDS.noDeployment(request.title) };
}

/**
 * The chat's protocol on a local runtime (VS-24): the session API's AG-UI
 * route of the agent, each thread a session — as the Studio's chat view
 * speaks to a runtime — with its ui channel and its sessions route, so a
 * session opened by uid is the conversation, and its menu's entries act on
 * it. Nothing is signed: the runtime is this machine's own.
 *
 * @param runtimeUrl - The local runtime's address (`http://127.0.0.1:<port>`).
 * @param agentId - The agent the sessions run on (`default`).
 *
 * @returns The protocol configuration `<Chat protocol>` takes as given.
 */
export function localSessionProtocol(
  runtimeUrl: string,
  agentId: string,
): ProtocolConfig {
  const base = runtimeUrl.replace(/\/+$/, "");
  const agent = encodeURIComponent(agentId);
  const protocol: ProtocolConfig = {
    type: "ag-ui",
    endpoint: `${base}/api/v1/apps/agents/${agent}/ag-ui/`,
    agentId,
    configEndpoint: `${base}/api/v1/configure`,
    enableConfigQuery: true,
    uiSocket: `${base.replace(/^http/, "ws")}/api/v1/apps/ui`,
    uiFiles: `${base}/api/v1/apps/agents/${agent}/files`,
    appSessions: `${base}/api/v1/apps/sessions`,
  };
  return protocol;
}
