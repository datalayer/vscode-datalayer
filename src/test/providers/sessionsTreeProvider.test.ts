/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Sessions view (VS-04, VS-12) in the extension host, with stub
 * answers: the places, the rows under an application, a place that did not
 * answer in one row, the filter, the team runs with their seats.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { listedSessionsOf, teamRunsOf } from "../../chat/sessions";
import {
  ApplicationItem,
  NoteItem,
  PlaceItem,
  SeatItem,
  SessionItem,
  type SessionSources,
  SessionsTreeProvider,
  TeamRunItem,
} from "../../providers/sessionsTreeProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

const RECORDED = listedSessionsOf({
  sessions: [
    {
      uid: "e67a52b2",
      app_uid: "app-1",
      title: "The refactor",
      agent: "shield-mvp-codex",
      harness: "codex",
      state: "open",
      turn: "",
      held: false,
      turns: 5,
      runs_on: { kind: "runtime", uid: "01m5d3e8" },
      lineage: { forked_from: null, imported_from: null },
      archived: false,
    },
    {
      uid: "c1a9f0e3",
      app_uid: "app-1",
      title: "Before the refactor",
      agent: "shield-mvp-claude-code",
      harness: "claude-code",
      state: "paused",
      turn: "idle",
      held: false,
      turns: 2,
      runs_on: null,
      lineage: {
        forked_from: { uid: "e67a52b2", at_turn: 2 },
        imported_from: null,
      },
      archived: false,
    },
  ],
  has_more: false,
});

const HELD = listedSessionsOf({
  sessions: [
    {
      uid: "7d2c4b10",
      app: { id: "shield-mvp-claude-code", name: "Shield MVP (Claude Code)" },
      instance: { app_uid: "" },
      agent: "shield-mvp-claude-code",
      harness: "claude-code",
      state: "open",
      turn: "running",
      held: true,
      turns: 1,
      title: "",
      runs_on: { kind: "runtime", uid: "local" },
      lineage: { forked_from: null, imported_from: null },
      archived: false,
    },
  ],
  has_more: false,
});

const RUNS = teamRunsOf([
  {
    executionId: "run-1",
    rootExecutionId: "run-1",
    depth: 0,
    status: "running",
    agent: {
      agentId: "team:benchmarks",
      capability: "benchmarks",
      protocol: "datalayer",
    },
    objective: { goal: "Run the suite" },
    createdAt: "2026-10-21T09:00:00Z",
    updatedAt: "2026-10-21T09:30:00Z",
  },
  {
    executionId: "seat-1",
    parentExecutionId: "run-1",
    rootExecutionId: "run-1",
    depth: 1,
    status: "completed",
    agent: {
      agentId: "team:benchmarks/runner",
      capability: "runner",
      protocol: "a2a",
      sessionId: "s-runner",
    },
    objective: { goal: "Run it" },
    createdAt: "2026-10-21T09:01:00Z",
    updatedAt: "2026-10-21T09:20:00Z",
  },
]);

function sources(overrides: Partial<SessionSources> = {}): SessionSources {
  return {
    signedIn: () => true,
    datalayer: async () => RECORDED,
    local: () => [
      {
        place: {
          kind: "local",
          folder: "/home/ada/project",
          folderName: "project",
          url: "http://127.0.0.1:41231",
        },
        list: async () => HELD,
      },
    ],
    teams: async () => RUNS,
    ...overrides,
  };
}

suite("SessionsTreeProvider Tests", () => {
  suiteSetup(() => {
    if (!ServiceLoggers.isInitialized()) {
      const context = createMockExtensionContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (LoggerManager as any).instance = undefined;
      ServiceLoggers.initialize(LoggerManager.getInstance(context));
    }
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  test("lists the places: Datalayer, each local runtime, Teams", async () => {
    const provider = new SessionsTreeProvider(sources());
    const places = await provider.getChildren();
    assert.deepStrictEqual(
      places.map((item) => item.label),
      ["On Datalayer", "On this machine — project", "Teams"],
    );
    assert.ok(places.every((item) => item instanceof PlaceItem));
    provider.dispose();
  });

  test("groups a place's sessions by application, each row as loop sessions list prints it", async () => {
    const provider = new SessionsTreeProvider(sources());
    const [datalayer] = await provider.getChildren();
    const applications = await provider.getChildren(datalayer);
    assert.strictEqual(applications.length, 1);
    const application = applications[0];
    assert.ok(application instanceof ApplicationItem);
    assert.strictEqual(application.label, "app-1");
    const rows = await provider.getChildren(application);
    assert.strictEqual(rows.length, 2);
    const row = rows[0];
    assert.ok(row instanceof SessionItem);
    assert.strictEqual(row.label, "The refactor");
    assert.strictEqual(
      row.description,
      "Open · shield-mvp-codex (codex) · 5 turns · not held",
    );
    assert.strictEqual(row.contextValue, "session-open-datalayer");
    assert.strictEqual(row.command?.command, "datalayer.sessions.open");
    const clone = rows[1];
    assert.ok(clone instanceof SessionItem);
    assert.strictEqual(clone.contextValue, "session-paused-datalayer");
    assert.ok(
      String(clone.description).includes("cloned from e67a52b2 at turn 2"),
    );
    provider.dispose();
  });

  test("lists a local runtime's held sessions under their application's name", async () => {
    const provider = new SessionsTreeProvider(sources());
    const [, local] = await provider.getChildren();
    const [application] = await provider.getChildren(local);
    assert.ok(application instanceof ApplicationItem);
    assert.strictEqual(application.label, "Shield MVP (Claude Code)");
    const [row] = await provider.getChildren(application);
    assert.ok(row instanceof SessionItem);
    assert.strictEqual(row.contextValue, "session-open-local");
    assert.strictEqual(row.label, "7d2c4b10");
    assert.ok(String(row.description).startsWith("Open · answering"));
    provider.dispose();
  });

  test("says an unreachable place in one row, and signed out in one", async () => {
    const provider = new SessionsTreeProvider(
      sources({
        datalayer: async () => {
          throw new Error("ai-agents answered 503.");
        },
      }),
    );
    const [datalayer] = await provider.getChildren();
    const [note] = await provider.getChildren(datalayer);
    assert.ok(note instanceof NoteItem);
    assert.strictEqual(
      note.label,
      "Datalayer did not answer for your sessions: ai-agents answered 503.",
    );
    assert.strictEqual(note.contextValue, "note-problem");
    provider.dispose();

    const signedOut = new SessionsTreeProvider(
      sources({ signedIn: () => false, local: () => [] }),
    );
    const places = await signedOut.getChildren();
    const [first] = await signedOut.getChildren(places[0]);
    assert.ok(first instanceof NoteItem);
    assert.strictEqual(
      first.label,
      "Sign in to Datalayer to see your sessions there.",
    );
    const [noRuntime] = await signedOut.getChildren(places[1]);
    assert.ok(noRuntime instanceof NoteItem);
    assert.ok(
      String(noRuntime.label).startsWith("No local runtime is running"),
    );
    signedOut.dispose();
  });

  test("narrows by state and says the filter, refreshed on change", async () => {
    const provider = new SessionsTreeProvider(sources());
    let fired = 0;
    provider.onDidChangeTreeData(() => {
      fired += 1;
    });
    provider.setFilter({ app: "", state: "paused", title: "" });
    const [datalayer] = await provider.getChildren();
    const [application] = await provider.getChildren(datalayer);
    assert.ok(application instanceof ApplicationItem);
    const rows = await provider.getChildren(application);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual((rows[0] as SessionItem).row.uid, "c1a9f0e3");
    provider.refresh();
    assert.strictEqual(fired, 2);
    provider.dispose();
  });

  test("lists the team runs with their seats, a seat's session opened by its uid", async () => {
    const provider = new SessionsTreeProvider(sources());
    const places = await provider.getChildren();
    const [run] = await provider.getChildren(places[2]);
    assert.ok(run instanceof TeamRunItem);
    assert.strictEqual(run.label, "benchmarks — Run the suite");
    assert.strictEqual(run.contextValue, "team-open");
    const [seat] = await provider.getChildren(run);
    assert.ok(seat instanceof SeatItem);
    assert.strictEqual(seat.label, "runner");
    assert.strictEqual(seat.contextValue, "seat-session");
    assert.strictEqual(seat.command?.command, "datalayer.sessions.open");
    assert.strictEqual(seat.command?.arguments?.[0], seat);
    assert.ok(
      vscode.TreeItemCollapsibleState.Collapsed === run.collapsibleState,
    );
    provider.dispose();
  });
});
