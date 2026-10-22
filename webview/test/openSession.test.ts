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
  OPEN_SESSION_WORDS,
  openSessionChoice,
  sessionProtocol,
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
  {
    runtimeName: "pod-1",
    uid: "rt-1",
    ingress: "https://r1/agent-runtimes/pod-1",
  },
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

  it("selects the runtime it runs on when its application is not listed", () => {
    const onRuntime = { ...datalayer, runtimeUid: "rt-1" };
    expect(openSessionChoice(onRuntime, runtimes, [])).toEqual({
      value: "runtime:pod-1",
      said: OPEN_SESSION_WORDS.opened("A refund", "open"),
    });
    expect(
      openSessionChoice({ ...datalayer, runtimeUid: "pod-1" }, runtimes, [])
        .value,
    ).toBe("runtime:pod-1");
  });

  it("never selects a local runtime for a session on Datalayer", () => {
    expect(
      openSessionChoice(
        { ...datalayer, runtimeUid: "local:/home/me/project" },
        runtimes,
        [],
      ).value,
    ).toBeNull();
  });

  it("says why when the session is on no runtime, a team seat, or not on yours", () => {
    const paused = openSessionChoice(
      { ...datalayer, state: "paused" },
      runtimes,
      [],
    );
    expect(paused.value).toBeNull();
    expect(paused.said).toMatch(/^Session s-2 is on no runtime now \(paused\)/);

    const seat = openSessionChoice(
      { ...datalayer, appUid: "", teamRun: "ex-9" },
      runtimes,
      deployments,
    );
    expect(seat.value).toBeNull();
    expect(seat.said).toMatch(/seat of team run ex-9/);

    const foreign = openSessionChoice(
      { ...datalayer, runtimeUid: "rt-other" },
      runtimes,
      [],
    );
    expect(foreign.value).toBeNull();
    expect(foreign.said).toMatch(
      /runs on runtime rt-other, which is not one of yours now/,
    );
  });
});

describe("the chat's protocol on a local session (VS-24)", () => {
  it("speaks to the session API's AG-UI route, with the ui channel and the sessions route", () => {
    expect(sessionProtocol("http://127.0.0.1:41231/", "default")).toEqual({
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

  it("speaks to a Datalayer runtime's session API with its token and the session's own agent", () => {
    expect(
      sessionProtocol(
        "https://r1/agent-runtimes/pod-1/",
        "exchange-desk",
        "tok",
      ),
    ).toEqual({
      type: "ag-ui",
      endpoint:
        "https://r1/agent-runtimes/pod-1/api/v1/apps/agents/exchange-desk/ag-ui/",
      agentId: "exchange-desk",
      authToken: "tok",
      configEndpoint: "https://r1/agent-runtimes/pod-1/api/v1/configure",
      enableConfigQuery: true,
      uiSocket: "wss://r1/agent-runtimes/pod-1/api/v1/apps/ui",
      uiFiles:
        "https://r1/agent-runtimes/pod-1/api/v1/apps/agents/exchange-desk/files",
      appSessions: "https://r1/agent-runtimes/pod-1/api/v1/apps/sessions",
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

describe("the chat in the editor's theme", () => {
  it("turns off the chat's own theme on every <Chat> the view renders", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    for (const file of ["App.tsx", "AppChat.tsx"]) {
      const source = readFileSync(
        resolve(__dirname, "../agentChat", file),
        "utf8",
      );
      const chats = source.match(/<(Lazy)?Chat\s/g) ?? [];
      const disabled =
        source.match(/disableInternalJupyterTheme=\{true\}/g) ?? [];
      expect(chats.length).toBeGreaterThan(0);
      expect(disabled.length).toBe(chats.length);
    }
  });
});
