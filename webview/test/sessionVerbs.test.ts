/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The verbs' pure parts (VS-05): which runtime answers for a session, the
 * swap's choices and what is said before and after, the clone's turn, the
 * export's file name, the refusal shown as the runtime said it, the import's
 * second try, the extension's own two entries.
 */

import { RuntimeRefusal } from "@datalayer/agent-runtimes/lib/portable/sessions";

import {
  CHAT_CANNOT_OPEN_SENTENCE,
  clonedSaid,
  cloneTurnOf,
  exportFileName,
  importAsksForAgent,
  importedSaid,
  localSessionFolder,
  OPEN_SESSION_COMMAND,
  refusalShown,
  sessionTargetOf,
  studioActivityUrl,
  swapChoicesOf,
  swappedSaid,
  swapSentence,
} from "../../src/chat/sessionVerbs";

const RUNTIMES = [
  {
    uid: "01m5d3e8",
    runtimeName: "ai-agents-pool-abc",
    ingress: "https://r1.datalayer.run/jupyter/server/ai-agents-pool-abc",
  },
];

describe("which runtime answers", () => {
  it("sends a local session's verbs to its runtime, unsigned", () => {
    expect(
      sessionTargetOf(
        {
          kind: "local",
          folder: "/p",
          folderName: "p",
          url: "http://127.0.0.1:41231/",
        },
        { uid: "s", runsOn: { kind: "runtime", uid: "local" }, state: "open" },
        RUNTIMES,
      ),
    ).toEqual({ baseUrl: "http://127.0.0.1:41231", signed: false });
  });

  it("sends a Datalayer session's verbs to the runtime it runs on, signed", () => {
    expect(
      sessionTargetOf(
        { kind: "datalayer" },
        {
          uid: "s",
          runsOn: { kind: "runtime", uid: "01m5d3e8" },
          state: "open",
        },
        RUNTIMES,
      ),
    ).toEqual({
      baseUrl: "https://r1.datalayer.run/agent-runtimes/ai-agents-pool-abc",
      signed: true,
    });
  });

  it("refuses in a sentence a session on no runtime, on a stranger's, or on a team run", () => {
    expect(
      sessionTargetOf(
        { kind: "datalayer" },
        { uid: "s", runsOn: null, state: "paused" },
        RUNTIMES,
      ),
    ).toContain("on no runtime now (paused)");
    expect(
      sessionTargetOf(
        { kind: "datalayer" },
        { uid: "s", runsOn: { kind: "runtime", uid: "gone" }, state: "open" },
        RUNTIMES,
      ),
    ).toContain("runtime gone, which is not one of yours now");
    expect(
      sessionTargetOf(
        { kind: "datalayer" },
        {
          uid: "s",
          runsOn: { kind: "team_run", executionId: "run-1", seat: "runner" },
          state: "open",
        },
        RUNTIMES,
      ),
    ).toContain("seat of team run run-1");
  });
});

describe("the swap", () => {
  const LIBRARY = [
    {
      id: "shield-mvp-claude-code",
      name: "Shield MVP (Claude Code)",
      harness: "claude-code",
    },
    { id: "shield-mvp-codex", name: "Shield MVP (Codex)", harness: "codex" },
    { id: "notes-assistant", name: "" },
  ];

  it("offers every agent of the library but the one bound, a harness said", () => {
    expect(swapChoicesOf(LIBRARY, "shield-mvp-claude-code")).toEqual([
      {
        agent: "shield-mvp-codex",
        label: "Shield MVP (Codex)",
        description: "shield-mvp-codex · harness codex",
      },
      {
        agent: "notes-assistant",
        label: "notes-assistant",
        description: "notes-assistant",
      },
    ]);
    expect(swapChoicesOf({ not: "a list" }, "x")).toEqual([]);
  });

  it("says what is about to happen before, and the runtime's sentence after", () => {
    expect(
      swapSentence(
        { uid: "e67a52b2", agent: "shield-mvp-claude-code", turns: 4 },
        "shield-mvp-codex",
      ),
    ).toContain(
      "was with shield-mvp-claude-code for 4 turns; from here it goes on with shield-mvp-codex",
    );
    expect(
      swappedSaid({
        agent: "shield-mvp-codex",
        said: "This conversation was with Claude Code until turn 4; from here it is with Codex.",
      }),
    ).toBe(
      "Swapped to shield-mvp-codex. This conversation was with Claude Code until turn 4; from here it is with Codex.",
    );
  });
});

describe("the clone, the export, the import", () => {
  it("cuts a clone at the last turn unsaid, and refuses a turn the session lacks", () => {
    expect(cloneTurnOf("", 4)).toBe(4);
    expect(cloneTurnOf("2", 4)).toBe(2);
    expect(cloneTurnOf("7", 4)).toBe(
      "Session has 4 turns; there is no turn 7 to clone it at.",
    );
    expect(cloneTurnOf("two", 4)).toContain('"two" is not one');
    expect(clonedSaid({ uid: "c1a9f0e3", state: "paused" }, 2)).toBe(
      "Cloned from turn 2 as c1a9f0e3, paused: resume it to go on from there.",
    );
  });

  it("names the export file after the session", () => {
    expect(exportFileName("e67a52b2")).toBe("e67a52b2.session.jsonl");
  });

  it("shows a refusal as the runtime said it, and knows when an import asks for an agent", () => {
    const refused = new RuntimeRefusal(
      409,
      "Session e67a52b2 is answering turn 5: swap it when the turn is over, or interrupt it first.",
    );
    expect(refusalShown(refused)).toBe(
      "Session e67a52b2 is answering turn 5: swap it when the turn is over, or interrupt it first.",
    );
    expect(refusalShown(new Error("fetch failed"))).toBe("fetch failed");
    expect(
      importAsksForAgent(
        new RuntimeRefusal(
          422,
          "The file's agent shield-mvp-claude-code is not on this runtime: name one with ?agent=.",
        ),
      ),
    ).toBe(true);
    expect(
      importAsksForAgent(
        new RuntimeRefusal(
          422,
          "The file is datalayer-session/2; this runtime reads datalayer-session/1.",
        ),
      ),
    ).toBe(false);
    expect(importAsksForAgent(refused)).toBe(false);
    expect(importedSaid({ uid: "7d2c4b10", turns: 4, redactions: 2 })).toBe(
      "Imported as 7d2c4b10 (paused, 4 turns, 2 redactions): resume it to go on from there.",
    );
  });
});

describe("the extension's own entries", () => {
  it("opens the application's Activity page and reveals a local session's folder", () => {
    expect(studioActivityUrl("app-1")).toBe(
      "https://datalayer.ai/studio/apps/app-1?tab=activity",
    );
    expect(localSessionFolder("/home/ada/", "e67a52b2")).toBe(
      "/home/ada/.datalayer/sessions/e67a52b2",
    );
    expect(localSessionFolder("/home/ada", "e67a52b2", "/tmp/sessions/")).toBe(
      "/tmp/sessions/e67a52b2",
    );
  });

  it("names the chat's command and what is said when it is not there", () => {
    expect(OPEN_SESSION_COMMAND).toBe(
      "datalayer.internal.agentChat.openSession",
    );
    expect(CHAT_CANNOT_OPEN_SENTENCE).toContain("cannot open a session");
  });
});
