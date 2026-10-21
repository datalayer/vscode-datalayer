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
    `${title || "This session"} (${state}): its runtime's chat is open here. Its own conversation is opened by the chat's next release; until then this is a new conversation on the same runtime.`,
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
