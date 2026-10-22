/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session the chat cannot talk to (a team run's seat, a session on no
 * runtime), read from its record: where it is read, and the transcript its
 * entries make — the person's messages, the agent's answers, each tool call
 * in one line, runs left out.
 */

import {
  recordTranscriptOf,
  sessionRecordUrl,
} from "../../src/chat/sessionRecord";

describe("a session's record read in the chat", () => {
  it("is read at ai-agents' record of the session", () => {
    expect(sessionRecordUrl("https://prod1.datalayer.run/", "s 1")).toBe(
      "https://prod1.datalayer.run/api/ai-agents/v1/apps/records/sessions/s%201",
    );
  });

  it("makes the person's messages, the agent's answers and the tool calls, in order", () => {
    const record = {
      success: true,
      session: { uid: "s-1" },
      entries: [
        { kind: "session", summary: "started", payload: {} },
        { kind: "run", summary: "", payload: {} },
        {
          kind: "turn",
          summary: "Fix the tests",
          turn_i: 1,
          payload: { asked: "Fix the tests", answered: "Done: two fixed." },
        },
        {
          kind: "tool_call",
          summary: "edit: done",
          turn_i: 1,
          payload: { tool: "edit", path: "a.py" },
        },
        {
          kind: "tool_call",
          summary: "",
          payload: { tool: "write", display: { path: "b.py" } },
        },
        { kind: "tool_call", summary: "search: 3 hits", payload: {} },
        {
          kind: "output",
          summary: "Done: two fixed.",
          payload: { status: "answered" },
        },
        { kind: "rule", summary: "Rule added", payload: {} },
      ],
    };
    expect(recordTranscriptOf(record)).toEqual([
      { who: "person", text: "Fix the tests", turn: 1 },
      { who: "agent", text: "Done: two fixed.", turn: 1 },
      { who: "tool", text: "edit a.py", turn: 1 },
      { who: "tool", text: "write b.py" },
      { who: "tool", text: "search" },
    ]);
  });

  it("reads user and assistant entries, and an output's words when no turn is kept", () => {
    expect(
      recordTranscriptOf({
        entries: [
          { kind: "user", summary: "Hello" },
          { kind: "assistant", payload: { text: "Hi there" } },
          { kind: "run" },
          { kind: "output", summary: "The answer" },
          { kind: "output", summary: "", payload: { status: "stopped" } },
        ],
      }),
    ).toEqual([
      { who: "person", text: "Hello" },
      { who: "agent", text: "Hi there" },
      { who: "agent", text: "The answer" },
    ]);
  });

  it("leaves out what the runtime told the application before the person's words", () => {
    expect(
      recordTranscriptOf({
        entries: [
          {
            kind: "turn",
            payload: {
              asked:
                "<asked-for>from a personal agent</asked-for> The question",
              answered: "",
            },
          },
        ],
      }),
    ).toEqual([{ who: "person", text: "The question" }]);
  });

  it("draws a long tool call in one short line", () => {
    const [line] = recordTranscriptOf({
      entries: [
        {
          kind: "tool_call",
          payload: { tool: "bash", command: `echo ${"x".repeat(300)}\nls` },
        },
      ],
    });
    expect(line!.text.length).toBe(120);
    expect(line!.text).not.toContain("\n");
    expect(line!.text.endsWith("…")).toBe(true);
  });

  it("refuses an answer with no list of entries", () => {
    expect(() => recordTranscriptOf({ session: {} })).toThrow(
      "The session's record came with no list of entries.",
    );
    expect(() => recordTranscriptOf(null)).toThrow();
    expect(() => recordTranscriptOf({ entries: ["turn"] })).toThrow(
      "The session's record has an entry that is not one.",
    );
  });

  it("keeps no conversation from a record of runs alone", () => {
    expect(recordTranscriptOf({ entries: [{ kind: "run" }] })).toEqual([]);
  });
});
