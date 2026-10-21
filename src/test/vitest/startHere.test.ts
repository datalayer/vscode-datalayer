/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Start a coding agent here* (VSCODE VS-06), the pure part: what is kept
 * of the folder's own, what is refused, what is asked of the runtime, and
 * what the chat is handed.
 */

import { describe, expect, it } from "vitest";

import { appHostOfSpec } from "../../chat/appChat";
import {
  agentIdOf,
  appPicks,
  blankHarnessApp,
  configureRequestOf,
  harnessPicks,
  instructionsConflict,
  instructionsFilesOf,
  isAppspec,
  keptSaid,
  ownInstructionsFiles,
  runtimeRefusal,
  sessionUidOf,
  startRequestOf,
  startedSession,
} from "../../chat/startHere";
import { harnessesOf } from "../../services/localRuntime/harnessCheck";

const CATALOGUE = {
  harnesses: [
    {
      id: "claude-code",
      name: "Claude Code",
      acp: {
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp@0.91.0"],
        load_session: true,
        modes: ["default", "plan"],
      },
      requires: { secrets: ["ANTHROPIC_API_KEY"], binaries: ["node", "git"] },
      terms: {
        served_to_third_parties: "api_key_only",
        licence:
          "Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)",
      },
      registered: {
        adapter: "@agentclientprotocol/claude-agent-acp",
        version: "0.91.0",
        credential: "ANTHROPIC_API_KEY",
        binaries: "Node 22, git",
      },
      capabilities: {
        resume: "load",
        fork_history: "replay",
        interrupt: true,
        steering: false,
        images: true,
        compaction: "own",
      },
      instructions_file: "CLAUDE.md",
    },
    {
      id: "codex",
      name: "Codex",
      acp: { command: "npx", args: [], load_session: false, modes: [] },
      requires: { secrets: ["OPENAI_API_KEY"], binaries: ["node"] },
      terms: { served_to_third_parties: "permitted", licence: "Apache-2.0" },
      registered: {
        adapter: "@zed-industries/codex-acp",
        version: "0.9.0",
        credential: "OPENAI_API_KEY",
        binaries: "Node 22",
      },
      capabilities: {
        resume: "replay",
        fork_history: "replay",
        interrupt: true,
        steering: false,
        images: false,
        compaction: "own",
      },
      instructions_file: "AGENTS.md",
    },
  ],
};

describe("the folder's own instructions files", () => {
  it("finds those present, in the conventional order", () => {
    expect(
      ownInstructionsFiles(["src", "AGENTS.md", "README.md", "CLAUDE.md"]),
    ).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(ownInstructionsFiles(["src"])).toEqual([]);
  });

  it("reads each harness's instructions file from the catalogue", () => {
    expect(instructionsFilesOf(CATALOGUE)).toEqual({
      "claude-code": "CLAUDE.md",
      codex: "AGENTS.md",
    });
    expect(instructionsFilesOf({})).toEqual({});
  });

  it("refuses when the folder's own file is the one the harness is given", () => {
    const claude = { name: "Claude Code", instructionsFile: "CLAUDE.md" };
    expect(instructionsConflict(["CLAUDE.md"], claude)).toContain(
      "would overwrite yours",
    );
    expect(instructionsConflict(["AGENTS.md"], claude)).toBeNull();
    expect(
      instructionsConflict(["CLAUDE.md"], { name: "X", instructionsFile: "" }),
    ).toBeNull();
  });

  it("says what is kept in the session's first line", () => {
    const codex = { name: "Codex", instructionsFile: "AGENTS.md" };
    expect(keptSaid(["CLAUDE.md"], codex)).toBe(
      "Your CLAUDE.md is kept as it is. Codex is given its instructions as AGENTS.md, written by Datalayer from the application.",
    );
    expect(keptSaid(["CLAUDE.md", "GEMINI.md"], codex)).toContain(
      "Your CLAUDE.md, GEMINI.md are kept as they are.",
    );
    expect(keptSaid([], codex)).toContain(
      "This folder has no instructions file of its own.",
    );
  });
});

describe("the picks", () => {
  it("lists the harnesses with their credential and terms", () => {
    const picks = harnessPicks(harnessesOf(CATALOGUE));
    expect(picks.map((pick) => pick.id)).toEqual(["claude-code", "codex"]);
    expect(picks[0]?.label).toBe("Claude Code");
    expect(picks[0]?.description).toBe("takes ANTHROPIC_API_KEY");
    expect(picks[0]?.detail).toContain("Serving others: api key only");
    expect(picks[0]?.detail).toContain(
      "adapter @agentclientprotocol/claude-agent-acp 0.91.0",
    );
  });

  it("offers the blank harness application first, then the folder's own", () => {
    const picks = appPicks({ id: "claude-code", name: "Claude Code" }, "repo", [
      {
        path: "apps/desk.yaml",
        spec: {
          schema: "loop.app/v1",
          id: "desk",
          name: "Desk",
          description: "A desk.",
        },
      },
    ]);
    expect(picks.map((pick) => pick.label)).toEqual([
      "Claude Code in this folder",
      "Desk",
    ]);
    expect(picks[0]?.path).toBe("");
    expect(picks[1]?.description).toBe("apps/desk.yaml");
    expect(picks[1]?.detail).toBe("A desk.");
  });

  it("takes an Appspec by its schema line", () => {
    expect(isAppspec("schema: loop.app/v1\nid: x\n")).toBe(true);
    expect(isAppspec("# a comment\nschema: 'loop.app/v1'\n")).toBe(true);
    expect(isAppspec("schema: loop.agent/v1\n")).toBe(false);
    expect(isAppspec("")).toBe(false);
  });
});

describe("the blank harness application", () => {
  const app = blankHarnessApp({ id: "codex", name: "Codex" }, "repo");

  it("is an Appspec on the harness's example agent, in the folder", () => {
    expect(app.schema).toBe("loop.app/v1");
    expect(app.id).toBe("vscode-codex");
    expect(app.agent).toBe("example-harness-codex");
    expect(app.name).toBe("Codex in repo");
  });

  it("does reading and editing, asks before deleting and running, passes the open file", () => {
    const rules = app.rules as { applies_to: string; behaviour: string }[];
    const behaviour = Object.fromEntries(
      rules.map((rule) => [rule.applies_to, rule.behaviour]),
    );
    expect(behaviour).toEqual({
      read: "do_it",
      write: "do_it",
      delete: "ask_me_first",
      execute: "ask_me_first",
      host_context: "do_it",
    });
    const host = appHostOfSpec(app);
    expect(host.context).toEqual(["page"]);
    expect(host.user).toBe("claimed");
    expect(host.name).toBe("Codex in repo");
  });

  it("keeps the record whole", () => {
    expect((app.record as { include: string[] }).include).toContain("diffs");
    expect((app.record as { include: string[] }).include).toContain(
      "terminals",
    );
  });
});

describe("the requests", () => {
  it("configures the application and starts a session on its agent", () => {
    const spec = { schema: "loop.app/v1", id: "x" };
    expect(configureRequestOf(spec)).toEqual({ app: spec });
    expect(agentIdOf({ agent_id: "default" })).toBe("default");
    expect(agentIdOf({ id: "chat" })).toBe("chat");
    expect(agentIdOf({})).toBe("default");
    expect(startRequestOf("default")).toEqual({ agent: "default", opener: "" });
  });

  it("reads the session's uid from the loop.session event of the stream", () => {
    const streamed = [
      "event: message",
      'data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}',
      "",
      'data: {"type":"CUSTOM","name":"loop.session","value":{"uid":"a1b2c3d4e5f6","state":"open"}}',
      "",
      'data: {"type":"RUN_FINISHED","threadId":"t","runId":"r"}',
    ].join("\n");
    expect(sessionUidOf(streamed)).toBe("a1b2c3d4e5f6");
    expect(sessionUidOf('{"uid":"plain0001"}')).toBe("plain0001");
    expect(() => sessionUidOf('data: {"type":"RUN_FINISHED"}')).toThrow(
      /names no session uid/,
    );
  });

  it("says the runtime's refusal in a sentence", () => {
    expect(
      runtimeRefusal(
        "Configuring the application",
        422,
        '{"detail":{"problems":["No agent named x.","Its model is unknown."]}}',
      ),
    ).toBe(
      "Configuring the application was refused by the local runtime (422): No agent named x. Its model is unknown.",
    );
    expect(
      runtimeRefusal(
        "Opening the session",
        404,
        '{"detail":"There is no agent default on this runtime."}',
      ),
    ).toContain("(404): There is no agent default on this runtime.");
    expect(runtimeRefusal("Opening the session", 502, "Bad Gateway")).toBe(
      "Opening the session was refused by the local runtime (502): Bad Gateway",
    );
    expect(runtimeRefusal("Opening the session", 500, "")).toBe(
      "Opening the session was refused by the local runtime (500).",
    );
  });
});

describe("what the chat is handed", () => {
  it("opens the session at the local place with the file's host terms", () => {
    const spec = blankHarnessApp(
      { id: "claude-code", name: "Claude Code" },
      "repo",
    );
    const started = startedSession({
      folder: "/home/me/repo",
      folderName: "repo",
      url: "http://127.0.0.1:41231",
      uid: "a1b2c3d4e5f6",
      agentId: "default",
      spec,
      host: appHostOfSpec(spec),
    });
    expect(started.place).toEqual({
      kind: "local",
      folder: "/home/me/repo",
      folderName: "repo",
      url: "http://127.0.0.1:41231",
    });
    expect(started.uid).toBe("a1b2c3d4e5f6");
    expect(started.agent).toBe("default");
    expect(started.state).toBe("open");
    expect(started.title).toBe("Claude Code in repo");
    expect(started.appUid).toBe("");
    expect(started.host.context).toEqual(["page"]);
  });
});
