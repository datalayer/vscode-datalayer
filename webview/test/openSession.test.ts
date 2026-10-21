/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session opened in the chat from the Sessions view: the picker's choice
 * for its place (the local runtime of its folder, the deployment of its
 * application) and what the chat says, listed or not.
 */

import type { AppChatChoice } from "../../src/chat/appChat";
import {
  localSessionProtocol,
  OPEN_SESSION_WORDS,
  openSessionChoice,
} from "../../src/chat/openSession";
import type { OpenSessionRequest } from "../../src/chat/sessionVerbs";

const local: OpenSessionRequest = {
  place: {
    kind: "local",
    folder: "/home/me/project",
    folderName: "project",
    url: "http://127.0.0.1:4321/",
  },
  uid: "s-1",
  agent: "shield-mvp-claude-code",
  title: "Fix the tests",
  state: "paused",
  appUid: "",
};

const datalayer: OpenSessionRequest = {
  place: { kind: "datalayer" },
  uid: "s-2",
  agent: "support-desk",
  title: "A refund",
  state: "open",
  appUid: "app-1",
};

const runtimes = [
  { runtimeName: "pod-1", ingress: "https://r1/agent-runtimes/pod-1" },
  {
    runtimeName: "local:/home/me/project",
    ingress: "http://127.0.0.1:4321",
    place: "local" as const,
  },
];

const deployments: AppChatChoice[] = [
  {
    kind: "talk",
    handle: {
      uid: "dep-1",
      appUid: "app-1",
      name: "Support Desk",
      slug: "",
      target: "",
      version: 3,
      url: "https://r1/agent-runtimes/pod-1",
      agentId: "a-1",
    } as AppChatChoice extends { kind: "talk"; handle: infer H } ? H : never,
  },
];

describe("a session opened from the Sessions view", () => {
  it("selects the local runtime of its folder by its address", () => {
    expect(openSessionChoice(local, runtimes, [])).toEqual({
      value: "runtime:local:/home/me/project",
      said: OPEN_SESSION_WORDS.opened("Fix the tests", "paused"),
    });
  });

  it("says when the local runtime is not listed", () => {
    expect(openSessionChoice(local, [runtimes[0]!], [])).toEqual({
      value: null,
      said: OPEN_SESSION_WORDS.noRuntime("project"),
    });
  });

  it("selects the deployment of its application on Datalayer", () => {
    expect(openSessionChoice(datalayer, runtimes, deployments)).toEqual({
      value: "app:dep-1",
      said: OPEN_SESSION_WORDS.opened("A refund", "open"),
    });
  });

  it("says when the application is not listed, or the session has none", () => {
    expect(openSessionChoice(datalayer, runtimes, []).said).toBe(
      OPEN_SESSION_WORDS.noDeployment("A refund"),
    );
    expect(
      openSessionChoice({ ...datalayer, appUid: "" }, runtimes, deployments)
        .value,
    ).toBeNull();
  });
});

describe("the chat's protocol on a local session (VS-24)", () => {
  it("speaks to the session API's AG-UI route, with the ui channel and the sessions route", () => {
    expect(localSessionProtocol("http://127.0.0.1:41231/", "default")).toEqual({
      type: "ag-ui",
      endpoint: "http://127.0.0.1:41231/api/v1/apps/agents/default/ag-ui/",
      agentId: "default",
      configEndpoint: "http://127.0.0.1:41231/api/v1/configure",
      enableConfigQuery: true,
      uiSocket: "ws://127.0.0.1:41231/api/v1/apps/ui",
      uiFiles: "http://127.0.0.1:41231/api/v1/apps/agents/default/files",
      appSessions: "http://127.0.0.1:41231/api/v1/apps/sessions",
    });
  });

  it("says the session's conversation is open here", () => {
    expect(OPEN_SESSION_WORDS.opened("Fix the tests", "paused")).toBe(
      "Fix the tests (paused): its conversation is open here.",
    );
    expect(OPEN_SESSION_WORDS.opened("", "open")).toBe(
      "This session (open): its conversation is open here.",
    );
  });
});
