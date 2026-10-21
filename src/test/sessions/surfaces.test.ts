/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session's surfaces in the extension host (VSCODE VS-07, VS-08, VS-09),
 * against the stub `loop` (VS-14): one terminal written as a command
 * streams, one diff opened in the diff view with the after side from the
 * disk, one approval of a local session said as a notification and decided
 * over the runtime's websocket — allowed only once the chat has shown it.
 */

import * as assert from "assert";
import { type ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

import { SESSION_SURFACES_COMMAND } from "../../bridges/agentChatBridge";
import { ATTENTION_WORDS } from "../../chat/attention";
import { LOCAL_AGENT_ID } from "../../chat/localApprovals";
import { portOf } from "../../services/localRuntime/detect";
import { LocalApprovalSource } from "../../services/localRuntime/localApprovalSource";
import type { ApprovalNotifications } from "../../services/ui/approvalNotifications";
import type { DiffDocuments } from "../../services/ui/diffDocuments";
import type { SessionTerminals } from "../../services/ui/sessionTerminal";

const STUB_LOOP = path.resolve(
  __dirname,
  "../../../../src/test/fixtures/stub-loop/stub-loop.mjs",
);

interface Surfaces {
  diffs: DiffDocuments;
  terminals: SessionTerminals;
  approvals: ApprovalNotifications;
}

/** The stub runtime, started for the suite: its address, stopped after. */
async function startStub(): Promise<{ url: string; child: ChildProcess }> {
  const child = spawn(process.execPath, [STUB_LOOP, "serve"], {
    cwd: path.resolve(__dirname, "../../../../src/test/fixtures"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let read = "";
    const timer = setTimeout(
      () => reject(new Error(`the stub said nothing of its port: ${read}`)),
      15_000,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      read += chunk.toString();
      for (const line of read.split("\n")) {
        const found = portOf(line);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        }
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the stub exited with ${code}: ${read}`));
    });
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

/** A session opened on the stub: it raises one approval for it. */
async function openStubSession(url: string): Promise<string> {
  const configured = await fetch(`${url}/api/v1/apps/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app: {
        schema: "loop.app/v1",
        id: "surfaces",
        version: 1,
        name: "Surfaces",
        kind: "app",
      },
    }),
  });
  assert.ok(configured.ok, `configure answered ${configured.status}`);
  const opened = await fetch(`${url}/api/v1/apps/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: LOCAL_AGENT_ID, opener: "" }),
  });
  const text = await opened.text();
  const uid = /"uid":\s*"([^"]+)"/.exec(text)?.[1];
  assert.ok(uid, `no session uid in ${text}`);
  return uid;
}

suite("A session's surfaces in the editor (VS-07, VS-08, VS-09)", function () {
  this.timeout(90_000);

  let stub: { url: string; child: ChildProcess } | undefined;
  let surfaces: Surfaces;

  suiteSetup(async () => {
    await vscode.extensions
      .getExtension("Datalayer.datalayer-vscode")
      ?.activate();
    surfaces = await vscode.commands.executeCommand<Surfaces>(
      SESSION_SURFACES_COMMAND,
    );
    assert.ok(surfaces, "the surfaces' services are not answered");
    stub = await startStub();
  });

  suiteTeardown(() => {
    stub?.child.kill("SIGTERM");
  });

  test("one terminal: written as the command streams, read-only, reused", async () => {
    const key = "s-terminal";
    const before = vscode.window.terminals.length;
    surfaces.terminals.write(key, "Fix the tests", {
      kind: "terminal",
      id: "d1",
      terminalId: "t1",
      command: "make test",
      output: "one\n",
      exitCode: null,
      released: false,
    });
    surfaces.terminals.write(key, "Fix the tests", {
      kind: "terminal",
      id: "d1",
      terminalId: "t1",
      command: "make test",
      output: "one\ntwo\n",
      exitCode: 0,
      released: true,
    });
    const terminal = vscode.window.terminals.find(
      (candidate) => candidate.name === "Datalayer: Fix the tests",
    );
    assert.ok(terminal, "the session's terminal was not created");
    assert.strictEqual(vscode.window.terminals.length, before + 1);
    assert.deepStrictEqual(surfaces.terminals.sessions.includes(key), true);
    surfaces.terminals.end(key);
    assert.strictEqual(surfaces.terminals.sessions.includes(key), false);
  });

  test("one diff: opened in the diff view, the after side the disk when it holds what was written", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "the fixture workspace is open");
    const onDisk = Buffer.from(
      await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder.uri, "CLAUDE.md"),
      ),
    ).toString("utf8");
    const opened = await surfaces.diffs.open({
      display: {
        kind: "diff",
        id: "d2",
        path: "CLAUDE.md",
        oldText: "# Before\n",
        newText: onDisk,
        language: "markdown",
      },
      harness: "fake",
      turn: 1,
      local: true,
    });
    assert.strictEqual(opened.fromDisk, true);
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    const input = active?.input;
    assert.ok(
      input instanceof vscode.TabInputTextDiff,
      `the active tab is not a diff: ${active?.label}`,
    );
    assert.strictEqual(input.original.scheme, "datalayer-diff");
    assert.strictEqual(input.modified.scheme, "datalayer-diff");
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("one approval: said as a notification, decided over the runtime's websocket once the chat has shown it", async () => {
    assert.ok(stub);
    const url = stub.url;
    const uid = await openStubSession(url);
    const changed = new vscode.EventEmitter<void>();
    const window = vscode.window as unknown as Record<string, unknown>;
    const kept = {
      showInformationMessage: window.showInformationMessage,
      showWarningMessage: window.showWarningMessage,
    };
    const said: string[] = [];
    const answers: string[] = ["Approve", "Approve"];
    window.showInformationMessage = async (message: string) => {
      said.push(message);
      return message.includes("asks to") ? answers.shift() : undefined;
    };
    window.showWarningMessage = async (message: string) => {
      said.push(message);
      return undefined;
    };
    const source = new LocalApprovalSource(
      {
        list: () => [{ url, folder: { name: "fixtures" } }],
        onDidChange: changed.event,
      },
      surfaces.approvals,
    );
    const focused: string[] = [];
    source.showInChat = (id) => focused.push(id);
    try {
      const listed = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("no approval was read from the stub")),
          15_000,
        );
        source.onDidChange((change) => {
          const approval = change.approvals.find(
            (candidate) => candidate.id === `approval-${uid}`,
          );
          if (approval) {
            clearTimeout(timer);
            resolve(approval.id);
          }
        });
      });
      // Said once, naming the folder, the action and its class — never the arguments.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const notified = said.filter((line) => line.includes("asks to"));
      assert.strictEqual(notified.length, 1, JSON.stringify(said));
      assert.strictEqual(
        notified[0],
        "The coding agent in fixtures asks to Run git push (execute)",
      );
      // Approved before the chat showed it: refused, the chat focused.
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(said.includes(ATTENTION_WORDS.notShown), JSON.stringify(said));
      assert.deepStrictEqual(focused, [listed]);
      let decisions = (await (await fetch(`${url}/stub/decisions`)).json()) as {
        decisions: unknown[];
      };
      assert.deepStrictEqual(decisions.decisions, []);
      // Shown in the chat, the decision goes over the websocket and is confirmed.
      surfaces.approvals.shownInChat([listed]);
      const outcome = await source.decide(url, listed, true);
      assert.strictEqual(outcome, ATTENTION_WORDS.approved("Run git push"));
      decisions = (await (await fetch(`${url}/stub/decisions`)).json()) as {
        decisions: unknown[];
      };
      assert.deepStrictEqual(decisions.decisions, [
        { approvalId: listed, approved: true },
      ]);
      assert.deepStrictEqual(source.pending(url), []);
      // Decided again: answered elsewhere.
      assert.strictEqual(
        await source.decide(url, listed, false),
        ATTENTION_WORDS.answeredElsewhere,
      );
    } finally {
      source.dispose();
      Object.assign(window, kept);
    }
  });
});
