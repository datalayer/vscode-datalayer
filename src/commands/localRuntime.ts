/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The local runtime's commands (VS-02): *Datalayer: Start the local runtime*
 * for a workspace folder and *Datalayer: Stop the local runtime*; the
 * refusal shown in a sentence with *Copy the install line*.
 *
 * @module commands/localRuntime
 */

import * as vscode from "vscode";

import { INSTALL_LINE } from "../services/localRuntime/detect";
import {
  type LocalRuntime,
  LocalRuntimeRefused,
  type LocalRuntimeService,
} from "../services/localRuntime/localRuntimeService";

/**
 * Shows why the local runtime was not started, with the install line to copy.
 *
 * @param error - What the service threw.
 */
export async function showLocalRuntimeRefusal(error: unknown): Promise<void> {
  const sentence = error instanceof Error ? error.message : String(error);
  const offerCopy =
    error instanceof LocalRuntimeRefused &&
    (error.reason === "absent" ||
      error.reason === "too-old" ||
      error.reason === "unanswered");
  const picked = offerCopy
    ? await vscode.window.showErrorMessage(sentence, "Copy the install line")
    : await vscode.window.showErrorMessage(sentence);
  if (picked === "Copy the install line") {
    await vscode.env.clipboard.writeText(INSTALL_LINE);
  }
}

/**
 * The workspace folder a local runtime is for: the first, or the one asked
 * when the workspace has several (V-9: one runtime per folder).
 *
 * @param placeholder - What the pick asks.
 *
 * @returns The folder, or undefined when there is none or the person cancelled.
 */
export async function pickWorkspaceFolder(
  placeholder = "Which folder is the coding agent's workspace?",
): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showErrorMessage(
      "Open a folder first: a local runtime runs in a workspace folder, which is the coding agent's workspace.",
    );
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  return vscode.window.showWorkspaceFolderPick({ placeHolder: placeholder });
}

/**
 * Starts the local runtime of a folder, the refusal shown when it is refused.
 *
 * @param localRuntimes - The service.
 * @param folder - The folder; asked when not given.
 *
 * @returns The runtime, or undefined when refused or cancelled.
 */
export async function startLocalRuntime(
  localRuntimes: LocalRuntimeService,
  folder?: vscode.WorkspaceFolder,
): Promise<LocalRuntime | undefined> {
  const chosen =
    folder ??
    (await pickWorkspaceFolder("Which folder does the local runtime serve?"));
  if (!chosen) {
    return undefined;
  }
  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Starting the local runtime of ${chosen.name}…`,
      },
      () => localRuntimes.ensureRunning(chosen),
    );
  } catch (error) {
    await showLocalRuntimeRefusal(error);
    return undefined;
  }
}

/**
 * Registers the local runtime's commands.
 *
 * @param context - The extension context.
 * @param localRuntimes - The service.
 */
export function registerLocalRuntimeCommands(
  context: vscode.ExtensionContext,
  localRuntimes: LocalRuntimeService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.local.start", async () => {
      const runtime = await startLocalRuntime(localRuntimes);
      if (runtime) {
        const handed = Object.entries(runtime.credentials)
          .map(
            ([name, source]) =>
              `${name} from ${source === "environment" ? "your environment" : "the secret storage"}`,
          )
          .join(", ");
        void vscode.window.showInformationMessage(
          `The local runtime of ${runtime.folder.name} is at ${runtime.url} (agent-runtimes ${runtime.version})` +
            (handed ? `; ${handed}.` : "; no harness credential handed."),
        );
      }
    }),
    vscode.commands.registerCommand("datalayer.local.stop", async () => {
      const running = localRuntimes.list();
      if (running.length === 0) {
        void vscode.window.showInformationMessage(
          "No local runtime is running.",
        );
        return;
      }
      if (running.length === 1) {
        await localRuntimes.stop(running[0]!.folder);
        void vscode.window.showInformationMessage(
          `The local runtime of ${running[0]!.folder.name} is stopped.`,
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        [
          ...running.map((runtime) => ({
            label: runtime.folder.name,
            description: runtime.url,
            runtime,
          })),
          {
            label: "Every local runtime",
            description: `${running.length} running`,
            runtime: undefined,
          },
        ],
        { placeHolder: "Which local runtime to stop?" },
      );
      if (!picked) {
        return;
      }
      await localRuntimes.stop(picked.runtime?.folder);
      void vscode.window.showInformationMessage(
        picked.runtime
          ? `The local runtime of ${picked.runtime.folder.name} is stopped.`
          : "Every local runtime is stopped.",
      );
    }),
  );
}
