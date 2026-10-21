/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Studio's journey from the editor (VSCODE VS-11): *Datalayer: Try this
 * application* runs the Appspec or `app.py` open in the editor on this
 * machine (`loop apps run <file> --web --watch`) and shows its Preview in a
 * panel beside the editor, reloaded when the file is saved; *Open its
 * Validate tab* and *Open its Ship tab* open the application's tabs in the
 * browser (decision O-5), the application's uid asked once per file and
 * kept in the workspace state. A file that is neither is refused in a
 * sentence; `loop` missing is refused with the install line.
 *
 * @module commands/apps
 */

import * as path from "path";
import * as vscode from "vscode";

import {
  isAppUid,
  noUidSentence,
  panelTitle,
  previewHtml,
  refusalLineOf,
  servedAddressOf,
  studioTabUrl,
  tryArguments,
  tryTargetOf,
} from "../chat/apps";
import { freePort, spawnLoop } from "../services/apps/loopProcess";
import { runtimeEnvironment } from "../services/localRuntime/detect";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";

/** The commands. */
export const TRY_HERE_COMMAND = "datalayer.apps.tryHere";
export const OPEN_VALIDATE_COMMAND = "datalayer.apps.openValidate";
export const OPEN_SHIP_COMMAND = "datalayer.apps.openShip";

/** How long `loop apps run --web` may take to say where it serves. */
const SERVE_TIMEOUT_MS = 90_000;

/** The workspace-state key of a file's application uid. */
export function uidKeyOf(file: string): string {
  return `datalayer.apps.uid:${file}`;
}

/** One preview per file: its panel and its process. */
interface Preview {
  panel: vscode.WebviewPanel;
  stop: () => void;
  url: string;
}

/**
 * Registers the commands.
 *
 * @param context - The extension context.
 * @param localRuntimes - Where `loop` is (`detect`, VS-02).
 */
export function registerAppsCommands(
  context: vscode.ExtensionContext,
  localRuntimes: LocalRuntimeService,
): void {
  const output = vscode.window.createOutputChannel("Datalayer: Try");
  context.subscriptions.push(output);
  const previews = new Map<string, Preview>();
  context.subscriptions.push({
    dispose: () => {
      for (const preview of previews.values()) {
        preview.stop();
        preview.panel.dispose();
      }
      previews.clear();
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      TRY_HERE_COMMAND,
      async (resource?: vscode.Uri): Promise<string | undefined> => {
        try {
          return await tryHere(localRuntimes, resource, previews, output);
        } catch (error) {
          const sentence =
            error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(sentence);
          output.appendLine(sentence);
          return undefined;
        }
      },
    ),
    vscode.commands.registerCommand(
      OPEN_VALIDATE_COMMAND,
      (resource?: vscode.Uri) => openTab(context, "validate", resource),
    ),
    vscode.commands.registerCommand(
      OPEN_SHIP_COMMAND,
      (resource?: vscode.Uri) => openTab(context, "ship", resource),
    ),
  );
}

/** The file to try: the one given, else the active editor's. */
async function fileOf(
  resource?: vscode.Uri,
): Promise<{ path: string; content: string }> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file") {
    throw new Error(
      "Open an Appspec (.yaml) or an app.py in the editor first: nothing is open to try.",
    );
  }
  const document = await vscode.workspace.openTextDocument(uri);
  return { path: uri.fsPath, content: document.getText() };
}

async function tryHere(
  localRuntimes: LocalRuntimeService,
  resource: vscode.Uri | undefined,
  previews: Map<string, Preview>,
  output: vscode.OutputChannel,
): Promise<string | undefined> {
  const file = await fileOf(resource);
  const target = tryTargetOf(file.path, file.content);
  if ("refused" in target) {
    throw new Error(target.refused);
  }
  const known = previews.get(file.path);
  if (known) {
    known.panel.reveal(vscode.ViewColumn.Beside, true);
    return known.url;
  }
  const detected = await localRuntimes.detect();
  if (!detected.ok) {
    throw new Error(detected.sentence);
  }
  const folder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(file.path),
  );
  const cwd = folder?.uri.fsPath ?? path.dirname(file.path);
  const port = await freePort();
  const { environment } = runtimeEnvironment({
    host: process.env,
    folder: cwd,
    declared: [],
    secrets: {},
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      process_.stop();
      reject(
        new Error(
          `${target.name} did not come up within ninety seconds: its output is in the Datalayer: Try output channel.`,
        ),
      );
    }, SERVE_TIMEOUT_MS);
    const process_ = spawnLoop(detected.path, tryArguments(file.path, port), {
      cwd,
      env: environment,
      onLine: (line) => {
        output.appendLine(`[${target.name}] ${line}`);
        const served = servedAddressOf(line);
        if (served) {
          clearTimeout(timer);
          previews.set(file.path, {
            panel: openPanel(),
            stop: process_.stop,
            url: served,
          });
          resolve(served);
          return;
        }
        const refused = refusalLineOf(line);
        if (refused) {
          clearTimeout(timer);
          process_.stop();
          reject(new Error(`${target.name} was refused: ${refused}`));
        }
      },
    });
    void process_.exited.then((code) => {
      clearTimeout(timer);
      const preview = previews.get(file.path);
      if (preview) {
        previews.delete(file.path);
        preview.panel.dispose();
        output.appendLine(`[${target.name}] ended (exit ${code ?? "killed"}).`);
      } else {
        reject(
          new Error(
            `${target.name} ended (exit ${code ?? "killed"}) before it served: its output is in the Datalayer: Try output channel.`,
          ),
        );
      }
    });
    const openPanel = (): vscode.WebviewPanel => {
      const panel = vscode.window.createWebviewPanel(
        "datalayer.apps.preview",
        panelTitle(target.name),
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      panel.webview.html = previewHtml(
        `http://127.0.0.1:${port}/app`,
        target.name,
      );
      panel.onDidDispose(() => {
        const preview = previews.get(file.path);
        if (preview) {
          previews.delete(file.path);
          preview.stop();
        }
      });
      return panel;
    };
  });
  return url;
}

async function openTab(
  context: vscode.ExtensionContext,
  tab: "validate" | "ship",
  resource?: vscode.Uri,
): Promise<string | undefined> {
  let file: { path: string; content: string };
  try {
    file = await fileOf(resource);
  } catch (error) {
    void vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
  const target = tryTargetOf(file.path, file.content);
  if ("refused" in target) {
    void vscode.window.showErrorMessage(target.refused);
    return undefined;
  }
  let uid = context.workspaceState.get<string>(uidKeyOf(file.path), "");
  if (!uid) {
    const relative = vscode.workspace.asRelativePath(file.path);
    const typed = await vscode.window.showInputBox({
      prompt: noUidSentence(relative),
      placeHolder: "The application's uid, from its Studio page",
      validateInput: (value) =>
        isAppUid(value)
          ? undefined
          : "An application's uid is 8 to 128 letters, digits, hyphens or underscores.",
    });
    if (!typed) {
      return undefined;
    }
    uid = typed.trim();
    await context.workspaceState.update(uidKeyOf(file.path), uid);
  }
  const url = studioTabUrl(uid, tab);
  await vscode.env.openExternal(vscode.Uri.parse(url));
  return url;
}
