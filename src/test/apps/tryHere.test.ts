/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Try this application* (VSCODE VS-11) in the extension host, against the
 * stub `loop` (VS-14): the refusal of a file that is not an application,
 * the fixture Appspec served and its page answering, the preview reused.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

import { TRY_HERE_COMMAND } from "../../commands/apps";

const FIXTURES = path.resolve(__dirname, "../../../../src/test/fixtures");
const STUB_LOOP = path.join(
  FIXTURES,
  "stub-loop",
  process.platform === "win32" ? "loop.cmd" : "loop",
);

suite("Try this application (VS-11)", function () {
  this.timeout(120_000);

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
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("a yaml that is not an application is refused", async () => {
    const window = vscode.window as unknown as Record<string, unknown>;
    const kept = window.showErrorMessage;
    const said: string[] = [];
    window.showErrorMessage = async (message: string) => {
      said.push(message);
      return undefined;
    };
    try {
      const url = await vscode.commands.executeCommand<string | undefined>(
        TRY_HERE_COMMAND,
        vscode.Uri.file(path.join(FIXTURES, "apps", "not-an-app.yaml")),
      );
      assert.strictEqual(url, undefined);
      assert.ok(
        said.some((line) =>
          line.includes("not-an-app.yaml is not an application"),
        ),
        JSON.stringify(said),
      );
    } finally {
      window.showErrorMessage = kept;
    }
  });

  test("the fixture Appspec is served and its page answers; asked again, the preview is reused", async () => {
    const file = vscode.Uri.file(path.join(FIXTURES, "apps", "desk.yaml"));
    const url = await vscode.commands.executeCommand<string | undefined>(
      TRY_HERE_COMMAND,
      file,
    );
    assert.ok(url, "no address answered");
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/app$/);
    const page = await fetch(url);
    assert.strictEqual(page.status, 200);
    assert.ok((await page.text()).includes("desk.yaml"));
    const again = await vscode.commands.executeCommand<string | undefined>(
      TRY_HERE_COMMAND,
      file,
    );
    assert.strictEqual(again, url);
  });
});
