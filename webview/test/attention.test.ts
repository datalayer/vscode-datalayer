/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * What the editor says outside the chat: the approval notification's words
 * per class (never the arguments), which approvals are notified, the
 * decision's rules (shown first, read again, 409 said, 404 revealing
 * nothing), the status bar's item and the finished turns of the sessions
 * not in front.
 */

import {
  actionClassOf,
  approvalNotification,
  ATTENTION_WORDS,
  decisionAllowed,
  decisionOutcome,
  finishedTurns,
  newlyRaised,
  type SessionAttention,
  sessionSaid,
  statusBarItem,
  stillPending,
} from "../../src/chat/attention";

const approval = (
  toolName: string,
  args: Record<string, unknown> = {},
): { id: string; toolName: string; args: Record<string, unknown> } => ({
  id: `a-${toolName}`,
  toolName,
  args,
});

describe("the class of an approval", () => {
  it("reads _class when it names one of the seven", () => {
    expect(actionClassOf(approval("anything", { _class: "execute" }))).toBe(
      "execute",
    );
    expect(actionClassOf(approval("anything", { _class: "Publish" }))).toBe(
      "publish",
    );
  });

  it("maps an ACP kind as the Shield does, other failing closed to write", () => {
    expect(actionClassOf(approval("x", { _kind: "edit" }))).toBe("write");
    expect(actionClassOf(approval("x", { _kind: "search" }))).toBe("read");
    expect(actionClassOf(approval("x", { _kind: "delete" }))).toBe("delete");
    expect(actionClassOf(approval("x", { _kind: "execute" }))).toBe("execute");
    expect(actionClassOf(approval("x", { _kind: "other" }))).toBe("write");
  });

  it("reads the verb of the tool's name, and writes when nothing says", () => {
    expect(actionClassOf(approval("run_command"))).toBe("execute");
    expect(actionClassOf(approval("Run git push"))).toBe("execute");
    expect(actionClassOf(approval("delete_file"))).toBe("delete");
    expect(actionClassOf(approval("send_email"))).toBe("send");
    expect(actionClassOf(approval("read_file"))).toBe("read");
    expect(actionClassOf(approval("odoo_accounting_aged_balance"))).toBe(
      "write",
    );
  });
});

describe("the approval notification", () => {
  it("names the application, the action and the class, never the arguments", () => {
    const said = approvalNotification(
      "Support Desk",
      approval("run_command", { command: "git push origin main" }),
    );
    expect(said.message).toBe("Support Desk asks to Run command (execute)");
    expect(said.message).not.toContain("git push");
    expect(said.actions).toEqual(["Approve", "Decline", "Show"]);
  });

  it("notifies each approval once", () => {
    const seen = new Set(["a-1"]);
    expect(newlyRaised(seen, [{ id: "a-1" }, { id: "a-2" }])).toEqual([
      { id: "a-2" },
    ]);
    expect(newlyRaised(new Set(), [])).toEqual([]);
  });
});

describe("the decision from the notification", () => {
  it("is allowed only once the chat has shown the request", () => {
    expect(decisionAllowed(new Set(), "a-1")).toBe(false);
    expect(decisionAllowed(new Set(["a-1"]), "a-1")).toBe(true);
  });

  it("decides only what is still pending when read again", () => {
    expect(stillPending({ status: "pending" })).toBe(true);
    expect(stillPending({ status: "approved" })).toBe(false);
    expect(stillPending(null)).toBe(false);
  });

  it("says what the route answered: done, elsewhere, gone, refused", () => {
    expect(decisionOutcome(200, true, "Run command")).toBe(
      "Approved: Run command.",
    );
    expect(decisionOutcome(200, false, "Run command")).toBe(
      "Declined: Run command.",
    );
    expect(decisionOutcome(409, true, "Run command")).toBe(
      ATTENTION_WORDS.answeredElsewhere,
    );
    // 404 reveals nothing of the approval.
    expect(decisionOutcome(404, true, "Run command")).toBe(
      ATTENTION_WORDS.gone,
    );
    expect(decisionOutcome(404, true, "Run command")).not.toContain(
      "Run command",
    );
    expect(decisionOutcome(500, true, "Run command")).toBe(
      "The decision was refused (500).",
    );
  });
});

const session = (
  key: string,
  turn: SessionAttention["turn"],
  rest: Partial<SessionAttention> = {},
): SessionAttention => ({
  key,
  title: `Session ${key}`,
  agent: "shield-mvp-claude-code",
  state: "open",
  turn,
  held: true,
  inFront: false,
  ...rest,
});

describe("the status bar", () => {
  it("counts the sessions waiting for the person, the first opened on click", () => {
    const item = statusBarItem([
      session("a", "running"),
      session("b", "waiting"),
      session("c", "waiting", { inFront: true }),
    ]);
    expect(item).toEqual({
      text: "Datalayer: 2 waiting for you",
      tooltip: "Session c: Open · waiting for you — shield-mvp-claude-code",
      first: "b",
    });
  });

  it("says working while a turn of any session runs", () => {
    const item = statusBarItem([
      session("a", "idle", { inFront: true }),
      session("b", "running"),
    ]);
    expect(item?.text).toBe("Datalayer: working…");
    expect(item?.tooltip).toBe("Session a: Open — shield-mvp-claude-code");
    expect(item?.first).toBe("b");
  });

  it("is hidden when nothing runs or waits, paused and ended sessions aside", () => {
    expect(statusBarItem([])).toBeNull();
    expect(
      statusBarItem([
        session("a", "idle"),
        session("b", "", { state: "paused" }),
        session("c", "waiting", { state: "ended" }),
      ]),
    ).toBeNull();
  });

  it("says a session in words", () => {
    expect(sessionSaid(session("a", "running"))).toBe(
      "Open · answering — shield-mvp-claude-code",
    );
    expect(sessionSaid(session("a", "", { state: "paused", agent: "" }))).toBe(
      "Paused",
    );
  });
});

describe("the finished turns", () => {
  it("notifies a session not in front whose turn ended, with its first line", () => {
    const before = [session("a", "running"), session("b", "running")];
    const after = [
      session("a", "idle", {
        lastAnswer: "\nDone: three files changed.\nMore.",
      }),
      session("b", "idle", { inFront: true, lastAnswer: "Never said" }),
    ];
    expect(finishedTurns(before, after)).toEqual([
      { key: "a", title: "Session a", said: "Done: three files changed." },
    ]);
  });

  it("says that a runtime went away, and nothing for a session first seen", () => {
    expect(
      finishedTurns(
        [session("a", "idle")],
        [session("a", "idle", { held: false }), session("new", "idle")],
      ),
    ).toEqual([
      {
        key: "a",
        title: "Session a",
        said: "Session a: its runtime went away.",
      },
    ]);
  });

  it("says it finished when there is no answer to quote, and not for a turn that still runs", () => {
    expect(
      finishedTurns(
        [session("a", "running"), session("b", "running")],
        [session("a", "waiting"), session("b", "running")],
      ),
    ).toEqual([
      { key: "a", title: "Session a", said: "Session a finished its turn." },
    ]);
  });
});
