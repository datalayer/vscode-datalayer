/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * An agent opened in the chat from the Agents view: the picker's choice for
 * the runtime clicked (by uid, else by name, never a local runtime), what is
 * said when it is not listed, and the request checked as the host's command
 * and the page receive it.
 */

import {
  OPEN_AGENT_WORDS,
  openAgentChoice,
  type OpenAgentRequest,
  openAgentRequestOf,
  RUNTIME_VALUE,
} from "../../src/chat/openSession";

const runtimes = [
  {
    runtimeName: "pod-1",
    uid: "rt-1",
    ingress: "https://r1/agent-runtimes/pod-1",
  },
  {
    runtimeName: "pod-2",
    uid: "rt-2",
    ingress: "https://r1/agent-runtimes/pod-2",
  },
  {
    runtimeName: "local:/home/me/project",
    uid: "rt-3",
    ingress: "http://127.0.0.1:4321",
    place: "local" as const,
  },
];

const clicked: OpenAgentRequest = {
  uid: "rt-2",
  runtimeName: "pod-2",
  givenName: "Analyst",
};

describe("openAgentChoice", () => {
  it("selects the runtime of the uid clicked", () => {
    expect(openAgentChoice(clicked, runtimes)).toEqual({
      value: `${RUNTIME_VALUE}pod-2`,
      said: "",
    });
  });

  it("selects by name when the picker's runtime has no uid", () => {
    expect(
      openAgentChoice({ ...clicked, uid: "" }, [
        { runtimeName: "pod-2", ingress: "https://r1/agent-runtimes/pod-2" },
      ]),
    ).toEqual({ value: `${RUNTIME_VALUE}pod-2`, said: "" });
  });

  it("never selects a local runtime", () => {
    expect(
      openAgentChoice(
        { uid: "rt-3", runtimeName: "other", givenName: "Here" },
        runtimes,
      ),
    ).toEqual({ value: null, said: OPEN_AGENT_WORDS.notListed("Here") });
  });

  it("says so when the runtime is not listed, by its name or its runtime name", () => {
    expect(openAgentChoice(clicked, [])).toEqual({
      value: null,
      said: OPEN_AGENT_WORDS.notListed("Analyst"),
    });
    expect(openAgentChoice({ ...clicked, givenName: "" }, []).said).toBe(
      OPEN_AGENT_WORDS.notListed("pod-2"),
    );
    expect(OPEN_AGENT_WORDS.notListed("Analyst")).toMatch(/^Analyst is not/);
  });
});

describe("openAgentRequestOf", () => {
  it("reads a request", () => {
    expect(openAgentRequestOf({ ...clicked, extra: true })).toEqual(clicked);
    expect(openAgentRequestOf({ runtimeName: "pod-2" })).toEqual({
      uid: "",
      runtimeName: "pod-2",
      givenName: "",
    });
  });

  it("refuses what names no runtime", () => {
    expect(openAgentRequestOf(undefined)).toBeUndefined();
    expect(openAgentRequestOf("pod-2")).toBeUndefined();
    expect(openAgentRequestOf({ uid: "rt-2" })).toBeUndefined();
    expect(openAgentRequestOf({ runtimeName: "" })).toBeUndefined();
  });
});
