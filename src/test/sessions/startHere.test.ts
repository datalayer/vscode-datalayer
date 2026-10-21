/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Start a coding agent here* (VSCODE VS-06) in the extension host, against
 * the stub `loop` (VS-14): the refusal when the folder's own instructions
 * file is the harness's, and a start on the fake harness — configured,
 * opened, listed, handed to the chat.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

import { START_HERE_COMMAND } from "../../commands/startHere";
import {
  SET_CREDENTIAL_COMMAND,
  type StartedSession,
} from "../../chat/startHere";

const STUB_LOOP = path.resolve(
  __dirname,
  "../../../../src/test/fixtures/stub-loop",
  process.platform === "win32" ? "loop.cmd" : "loop",
);

type Answer = (
  items: readonly vscode.QuickPickItem[],
) => vscode.QuickPickItem | undefined;

/** Answers the quick picks and keeps what the window said, restored after. */
function withWindow(
  answers: Answer[],
  run: () => Promise<void>,
): Promise<string[]> {
  const window = vscode.window as unknown as Record<string, unknown>;
  const kept = {
    showQuickPick: window.showQuickPick,
    showErrorMessage: window.showErrorMessage,
    showWarningMessage: window.showWarningMessage,
    showInformationMessage: window.showInformationMessage,
  };
  const said: string[] = [];
  window.showQuickPick = async (
    items:
      | readonly vscode.QuickPickItem[]
      | Thenable<readonly vscode.QuickPickItem[]>,
  ) => {
    const answer = answers.shift();
    return answer ? answer(await items) : undefined;
  };
  for (const name of [
    "showErrorMessage",
    "showWarningMessage",
    "showInformationMessage",
  ]) {
    window[name] = async (message: string) => {
      said.push(message);
      return undefined;
    };
  }
  return run()
    .then(() => said)
    .finally(() => {
      Object.assign(window, kept);
    });
}

suite("Start a coding agent here (VS-06)", function () {
  this.timeout(90_000);

  suiteSetup(async () => {
    await vscode.extensions
      .getExtension("Datalayer.datalayer-vscode")
      ?.activate();
    await vscode.workspace
      .getConfiguration("datalayer.local")
      .update("loopPath", STUB_LOOP, vscode.ConfigurationTarget.Global);
  });

  suiteTeardown(async () => {
    await vscode.workspace
      .getConfiguration("datalayer.local")
      .update("loopPath", undefined, vscode.ConfigurationTarget.Global);
  });

  test("the commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes(START_HERE_COMMAND));
    assert.ok(commands.includes(SET_CREDENTIAL_COMMAND));
  });

  test("a harness whose own instructions file the folder holds is refused", async () => {
    let started: StartedSession | undefined;
    const said = await withWindow(
      [(items) => items.find((item) => item.label === "Claude Code")],
      async () => {
        started = await vscode.commands.executeCommand<
          StartedSession | undefined
        >(START_HERE_COMMAND);
      },
    );
    assert.strictEqual(started, undefined);
    // Either the folder's CLAUDE.md is in the way, or the machine lacks
    // what Claude Code needs (its key): both refuse before anything starts.
    assert.ok(
      said.some((line) =>
        /would overwrite yours|takes ANTHROPIC_API_KEY|needs `git`|needs `node`/.test(
          line,
        ),
      ),
      `the refusal was not said: ${JSON.stringify(said)}`,
    );
  });

  test("the fake harness is started: configured, opened, listed, handed to the chat", async () => {
    let started: StartedSession | undefined;
    const said = await withWindow(
      [
        (items) => items.find((item) => item.label === "Fake harness"),
        (items) =>
          items.find(
            (item) => item.description === "the blank harness application",
          ),
      ],
      async () => {
        started = await vscode.commands.executeCommand<
          StartedSession | undefined
        >(START_HERE_COMMAND);
      },
    );
    assert.ok(started, `nothing started: ${JSON.stringify(said)}`);
    assert.strictEqual(started.place.kind, "local");
    assert.match(started.uid, /^stub\d{8}$/);
    assert.strictEqual(started.agent, "default");
    assert.strictEqual(started.title, "Fake harness in fixtures");
    assert.deepStrictEqual(started.host.context, ["page"]);
    assert.ok(
      said.some((line) => line.startsWith("Your CLAUDE.md is kept as it is.")),
      JSON.stringify(said),
    );
    const listed = (await (
      await fetch(`${started.url}/api/v1/apps/sessions`)
    ).json()) as {
      sessions: { uid: string }[];
    };
    assert.ok(listed.sessions.some((session) => session.uid === started?.uid));
  });
});
