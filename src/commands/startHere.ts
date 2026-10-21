/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Datalayer: Start a coding agent here* (VSCODE VS-06).
 *
 * From the command palette, the Sessions view's title or a folder's context
 * menu: the person picks a harness of the catalogue (the machine checked
 * first — binaries, the adapter, the credential, the terms — as
 * `services/localRuntime/harnessCheck.ts` says it) and an application (the
 * blank harness application, or one of the folder's own Appspecs); the
 * application is configured on the local runtime of the folder
 * (`LocalRuntimeService.ensureRunning`, VS-02) and a session opened on it,
 * then handed to the Datalayer Chat (`openSessionInChat`, VS-05). The
 * folder's own `CLAUDE.md` or `AGENTS.md` is kept and said in the first
 * line; one that is the harness's own instructions file refuses the start
 * (the runtime would write over it). Every refusal is one sentence;
 * nothing is retried.
 *
 * @module commands/startHere
 */

import { readdirSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parse as parseYaml } from "yaml";

import { appHostOfSpec } from "../chat/appChat";
import {
  agentIdOf,
  appPicks,
  configureRequestOf,
  harnessPicks,
  instructionsFilesOf,
  isAppspec,
  keptSaid,
  NO_HARNESS_SENTENCE,
  ownInstructionsFiles,
  runtimeRefusal,
  SET_CREDENTIAL_COMMAND,
  sessionUidOf,
  startRequestOf,
  startedSession,
  type StartedSession,
  type WorkspaceAppspec,
} from "../chat/startHere";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";
import { credentialSourceSaid } from "../services/localRuntime/harnessCheck";
import { pickWorkspaceFolder, showLocalRuntimeRefusal } from "./localRuntime";
import { checkHarnessHere, openSessionInChat } from "./sessions";

/** The command. */
export const START_HERE_COMMAND = "datalayer.sessions.startHere";

/** How long `POST /sessions` may take to name the session. */
const SESSION_OPEN_TIMEOUT_MS = 30_000;

/**
 * Registers the command.
 *
 * @param context - The extension context.
 * @param localRuntimes - The local runtimes, one per folder (VS-02).
 */
export function registerStartHereCommands(
  context: vscode.ExtensionContext,
  localRuntimes: LocalRuntimeService,
): void {
  const output = vscode.window.createOutputChannel("Datalayer: coding agents");
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand(
      START_HERE_COMMAND,
      async (resource?: vscode.Uri): Promise<StartedSession | undefined> => {
        try {
          return await startHere(localRuntimes, output, resource);
        } catch (error) {
          const sentence =
            error instanceof Error ? error.message : String(error);
          output.appendLine(sentence);
          await showLocalRuntimeRefusal(error);
          return undefined;
        }
      },
    ),
  );
}

/**
 * The folder the agent works in: the one the resource is in, the only one
 * open, or the one the person picks of a multi-root workspace.
 */
async function folderOf(
  resource?: vscode.Uri,
): Promise<vscode.WorkspaceFolder | undefined> {
  if (resource) {
    const owner = vscode.workspace.getWorkspaceFolder(resource);
    if (owner) {
      return owner;
    }
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  const only = folders[0];
  if (folders.length === 1 && only) {
    return only;
  }
  return pickWorkspaceFolder("Which folder does the coding agent work in?");
}

/** The folder's own Appspecs: every `.yaml`/`.yml` declaring the schema, outside node_modules. */
async function workspaceAppspecs(
  folder: vscode.WorkspaceFolder,
): Promise<WorkspaceAppspec[]> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.{yaml,yml}"),
    "**/{node_modules,.git,.venv,dist,out}/**",
    50,
  );
  const found: WorkspaceAppspec[] = [];
  for (const file of files) {
    const content = Buffer.from(
      await vscode.workspace.fs.readFile(file),
    ).toString("utf8");
    if (!isAppspec(content)) {
      continue;
    }
    try {
      const spec = parseYaml(content) as unknown;
      if (spec && typeof spec === "object" && !Array.isArray(spec)) {
        found.push({
          path: path.relative(folder.uri.fsPath, file.fsPath),
          spec: spec as Record<string, unknown>,
        });
      }
    } catch {
      // Not readable as YAML: not offered.
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

async function startHere(
  localRuntimes: LocalRuntimeService,
  output: vscode.OutputChannel,
  resource?: vscode.Uri,
): Promise<StartedSession | undefined> {
  const folder = await folderOf(resource);
  if (!folder) {
    return undefined;
  }
  const runtime = await localRuntimes.ensureRunning(folder);
  const url = runtime.url;

  // The harness, with its terms; the machine checked first.
  const harnesses = await localRuntimes.harnesses();
  if (harnesses.length === 0) {
    throw new Error(NO_HARNESS_SENTENCE);
  }
  const catalogue = await fetch(`${url}/api/v1/harnesses`);
  const instructionsFiles = catalogue.ok
    ? instructionsFilesOf(await catalogue.json())
    : {};
  const harnessPick = await vscode.window.showQuickPick(
    harnessPicks(harnesses),
    {
      placeHolder: "Which coding agent works in this folder?",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!harnessPick) {
    return undefined;
  }
  const facts = harnesses.find((harness) => harness.id === harnessPick.id);
  if (!facts) {
    return undefined;
  }
  const check = await checkHarnessHere(localRuntimes, facts);
  if (!check.ok) {
    const blocking = check.parts.filter((part) => part.blocking);
    const first = blocking[0];
    const actions = [
      ...(blocking.some((part) => part.setup)
        ? ["Run setup in a terminal"]
        : []),
      ...(blocking.some((part) => part.part === "credential")
        ? ["Set the credential"]
        : []),
    ];
    const chosen = await vscode.window.showErrorMessage(
      first?.sentence ?? `${facts.name} cannot start here.`,
      ...actions,
    );
    if (chosen === "Run setup in a terminal") {
      const terminal = vscode.window.createTerminal({
        name: `Datalayer: ${facts.name} setup`,
      });
      terminal.show();
      terminal.sendText(check.setupCommand, false);
    } else if (chosen === "Set the credential") {
      await vscode.commands.executeCommand(
        SET_CREDENTIAL_COMMAND,
        facts.secrets[0],
      );
    }
    return undefined;
  }
  for (const part of check.parts) {
    output.appendLine(part.sentence);
  }

  // The folder's own instructions files: kept, and said (the runtime keeps
  // them: the application's instructions go beside, VS-23).
  const own = ownInstructionsFiles(readdirSync(folder.uri.fsPath));
  const harness = {
    id: facts.id,
    name: facts.name,
    instructionsFile: instructionsFiles[facts.id] ?? "",
  };
  // The application: the blank one, or one of the folder's own.
  const appPick = await vscode.window.showQuickPick(
    appPicks(harness, folder.name, await workspaceAppspecs(folder)),
    {
      placeHolder: "Which application does it run as?",
      matchOnDescription: true,
    },
  );
  if (!appPick) {
    return undefined;
  }

  // Configured on the local runtime, a session opened on its agent.
  const configured = await fetch(`${url}/api/v1/apps/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configureRequestOf(appPick.spec)),
  });
  if (!configured.ok) {
    throw new Error(
      runtimeRefusal(
        "Configuring the application",
        configured.status,
        await configured.text(),
      ),
    );
  }
  const agentId = agentIdOf(await configured.json());
  const uid = await openSession(url, agentId);

  const started = startedSession({
    folder: folder.uri.fsPath,
    folderName: folder.name,
    url,
    uid,
    agentId,
    spec: appPick.spec,
    host: appHostOfSpec(appPick.spec),
  });
  const firstLine = keptSaid(own, harness);
  const credential = facts.secrets
    .map((name) =>
      check.credentialSource
        ? credentialSourceSaid(name, check.credentialSource)
        : "",
    )
    .filter(Boolean)
    .join(" ");
  output.appendLine(
    `${started.title}: session ${uid} on ${url} in ${folder.uri.fsPath}. ${firstLine} ${credential}`.trim(),
  );
  void vscode.window.showInformationMessage(
    `${firstLine}${credential ? ` ${credential}` : ""}`,
  );

  await vscode.commands
    .executeCommand("datalayer.sessions.refresh")
    .then(undefined, () => undefined);
  await openSessionInChat(started);
  return started;
}

/** `POST /api/v1/apps/sessions`: the stream read until it names the session. */
async function openSession(url: string, agentId: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_OPEN_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/api/v1/apps/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(startRequestOf(agentId)),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        runtimeRefusal(
          "Opening the session",
          response.status,
          await response.text(),
        ),
      );
    }
    if (!response.body) {
      throw new Error(
        "Opening the session was answered with no body by the local runtime.",
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let read = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) {
        read += decoder.decode(value, { stream: true });
        try {
          const uid = sessionUidOf(read);
          void reader.cancel().catch(() => undefined);
          return uid;
        } catch {
          // Not named yet.
        }
      }
      if (done) {
        return sessionUidOf(read);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
