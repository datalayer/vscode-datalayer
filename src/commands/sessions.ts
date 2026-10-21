/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Sessions view's commands (VS-04, VS-05, VS-03): refresh, filter and
 * open; the seven verbs — *Resume*, *Switch agent…*, *Clone from here*,
 * *Export*, *Import…*, *Rename*, *Archive* and *End* — calling the session
 * API (`appSessionsClient`) from the extension host, every refusal the
 * runtime's own sentence in a notification, never retried or defaulted; the
 * extension's two entries, *Reveal in Explorer* and *Open in the Studio*;
 * and the harness check with its credential kept in the secret storage.
 *
 * @module commands/sessions
 */

import type { SessionState } from "@datalayer/agent-runtimes/lib/portable/activity";
import { appSessionsClient } from "@datalayer/agent-runtimes/lib/portable/sessions";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import type { SessionFilter } from "../chat/sessions";
import {
  type AgentChoice,
  CHAT_CANNOT_OPEN_SENTENCE,
  clonedSaid,
  cloneTurnOf,
  exportFileName,
  importAsksForAgent,
  importedSaid,
  localSessionFolder,
  OPEN_SESSION_COMMAND,
  type OpenSessionRequest,
  refusalShown,
  sessionTargetOf,
  studioActivityUrl,
  swapChoicesOf,
  swappedSaid,
  swapSentence,
} from "../chat/sessionVerbs";
import {
  type SeatItem,
  type SessionItem,
  type SessionsTreeProvider,
} from "../providers/sessionsTreeProvider";
import type { ExtendedDatalayerClient } from "../services/core/datalayerAdapter";
import {
  credentialSourceSaid,
  type HarnessCheck,
  harnessCheck,
  type HarnessFacts,
} from "../services/localRuntime/harnessCheck";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";
import { showLocalRuntimeRefusal } from "./localRuntime";

/** What the commands need. */
export interface SessionsCommandServices {
  authProvider: {
    /** The person's token, or `""` signed out. */
    getToken(): string;
    /** Whether the person is signed in. */
    isAuthenticated(): boolean;
  };
  datalayer: ExtendedDatalayerClient;
  sessionsTreeProvider: SessionsTreeProvider;
  localRuntimes: LocalRuntimeService;
}

type Client = ReturnType<typeof appSessionsClient>;

/**
 * Opens a session in the Datalayer Chat through the chat provider's command,
 * when this build registers it; else says so.
 *
 * @param request - The session and its place.
 */
export async function openSessionInChat(
  request: OpenSessionRequest,
): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(OPEN_SESSION_COMMAND)) {
    void vscode.window.showInformationMessage(CHAT_CANNOT_OPEN_SENTENCE);
    return;
  }
  await vscode.commands.executeCommand("datalayer.agentChat.focus");
  await vscode.commands.executeCommand(OPEN_SESSION_COMMAND, request);
}

/**
 * Checks a harness against this machine, the catalogue read from the local runtime or `loop harnesses`.
 *
 * @param localRuntimes - The local runtimes, which read the machine.
 * @param facts - The harness as the catalogue lists it.
 *
 * @returns What the machine has and lacks for it.
 */
export async function checkHarnessHere(
  localRuntimes: LocalRuntimeService,
  facts: HarnessFacts,
): Promise<HarnessCheck> {
  return harnessCheck(facts, await localRuntimes.machineOf(facts));
}

/**
 * Registers the Sessions view's commands.
 *
 * @param context - The extension context.
 * @param services - What the commands need.
 */
export function registerSessionsCommands(
  context: vscode.ExtensionContext,
  services: SessionsCommandServices,
): void {
  const { sessionsTreeProvider: tree, localRuntimes } = services;

  const clientOf = async (item: SessionItem): Promise<Client | undefined> => {
    const runtimes =
      item.place.kind === "datalayer"
        ? ((await services.datalayer.listRuntimes()) ?? [])
        : [];
    const target = sessionTargetOf(
      item.place,
      item.row,
      runtimes.map((runtime) => ({
        uid: runtime.uid,
        runtimeName: runtime.runtimeName,
        ingress: runtime.ingress,
      })),
    );
    if (typeof target === "string") {
      void vscode.window.showErrorMessage(target);
      return undefined;
    }
    return appSessionsClient({
      baseUrl: target.baseUrl,
      getAccessToken: () =>
        target.signed
          ? services.authProvider.getToken() || undefined
          : undefined,
      fetch: (input, init) => fetch(input, init),
    });
  };

  const refused = (error: unknown): void => {
    void vscode.window.showErrorMessage(refusalShown(error));
  };

  const requestOf = (item: SessionItem): OpenSessionRequest => ({
    place: item.place,
    uid: item.row.uid,
    agent: item.row.agent,
    title: item.row.title,
    state: item.row.state,
    appUid: item.row.appUid,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.sessions.refresh", () =>
      tree.refresh(),
    ),

    vscode.commands.registerCommand("datalayer.sessions.filter", async () => {
      const current = tree.getFilter();
      const states: Array<{ label: string; state: SessionState | "" }> = [
        { label: "Any state", state: "" },
        { label: "Open", state: "open" },
        { label: "Paused", state: "paused" },
        { label: "Ended", state: "ended" },
      ];
      const state = await vscode.window.showQuickPick(states, {
        placeHolder: "Which sessions, by state?",
      });
      if (!state) {
        return;
      }
      const app = await vscode.window.showInputBox({
        prompt: "Narrow to an application (its name or uid); empty for all.",
        value: current.app,
      });
      if (app === undefined) {
        return;
      }
      const title = await vscode.window.showInputBox({
        prompt: "Narrow to a title containing…; empty for all.",
        value: current.title,
      });
      if (title === undefined) {
        return;
      }
      const filter: SessionFilter = { app, state: state.state, title };
      tree.setFilter(filter);
    }),

    vscode.commands.registerCommand(
      "datalayer.sessions.open",
      async (item?: SessionItem | SeatItem) => {
        if (!item) {
          return;
        }
        if (item.kind === "seat") {
          await openSessionInChat({
            place: { kind: "datalayer" },
            uid: item.seat.sessionUid,
            agent: "",
            title: `${item.run.team} · ${item.seat.seat}`,
            state: "open",
            appUid: "",
          });
          return;
        }
        await openSessionInChat(requestOf(item));
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.resume",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Resuming ${item.row.uid}…`,
            },
            () =>
              client.resume(item.row.uid, item.row.agent, {
                onEvent: () => undefined,
              }),
          );
          tree.refresh();
          await openSessionInChat(requestOf(item));
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.swap",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        let choices: AgentChoice[];
        try {
          const runtimes =
            item.place.kind === "datalayer"
              ? ((await services.datalayer.listRuntimes()) ?? [])
              : [];
          const target = sessionTargetOf(
            item.place,
            item.row,
            runtimes.map((runtime) => ({
              uid: runtime.uid,
              runtimeName: runtime.runtimeName,
              ingress: runtime.ingress,
            })),
          );
          if (typeof target === "string") {
            void vscode.window.showErrorMessage(target);
            return;
          }
          const response = await fetch(`${target.baseUrl}/api/v1/library`, {
            headers: target.signed
              ? { Authorization: `Bearer ${services.authProvider.getToken()}` }
              : {},
          });
          if (!response.ok) {
            throw new Error(
              `The runtime answered ${response.status} for its agents (GET /api/v1/library).`,
            );
          }
          choices = swapChoicesOf(await response.json(), item.row.agent);
        } catch (error) {
          refused(error);
          return;
        }
        if (choices.length === 0) {
          void vscode.window.showErrorMessage(
            `The runtime has no other agent than ${item.row.agent} to swap ${item.row.uid} to.`,
          );
          return;
        }
        const picked = await vscode.window.showQuickPick(choices, {
          placeHolder: "Which agent goes on with the session?",
        });
        if (!picked) {
          return;
        }
        const confirmed = await vscode.window.showWarningMessage(
          swapSentence(item.row, picked.agent),
          { modal: true },
          "Swap",
        );
        if (confirmed !== "Swap") {
          return;
        }
        try {
          const answer = await client.swap(item.row.uid, picked.agent);
          tree.refresh();
          void vscode.window.showInformationMessage(swappedSaid(answer));
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.clone",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        const turnInput = await vscode.window.showInputBox({
          prompt: `Clone ${item.row.uid} up to which turn? (1 to ${item.row.turns}; empty for the last)`,
          validateInput: (value) => {
            const turn = cloneTurnOf(value, item.row.turns);
            return typeof turn === "string" ? turn : undefined;
          },
        });
        if (turnInput === undefined) {
          return;
        }
        const turn = cloneTurnOf(turnInput, item.row.turns);
        if (typeof turn === "string") {
          void vscode.window.showErrorMessage(turn);
          return;
        }
        const title = await vscode.window.showInputBox({
          prompt: "The clone's title; empty keeps the source's.",
        });
        if (title === undefined) {
          return;
        }
        try {
          const answer = await client.clone(item.row.uid, {
            upToTurn: turn,
            title: title.trim() || undefined,
          });
          tree.refresh();
          void vscode.window.showInformationMessage(clonedSaid(answer, turn));
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.export",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            path.join(os.homedir(), exportFileName(item.row.uid)),
          ),
          filters: { "Session file": ["jsonl"] },
          title: "Export the session",
        });
        if (!target) {
          return;
        }
        try {
          const text = await client.exportFile(item.row.uid);
          await fs.writeFile(target.fsPath, text, "utf8");
          void vscode.window.showInformationMessage(
            `Exported ${item.row.uid} to ${target.fsPath}.`,
          );
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand("datalayer.sessions.import", async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { "Session file": ["jsonl"] },
        title: "Import a session file",
      });
      const file = files?.[0];
      if (!file) {
        return;
      }
      const text = await fs.readFile(file.fsPath, "utf8");
      const places: Array<{
        label: string;
        description: string;
        baseUrl: string;
        signed: boolean;
      }> = localRuntimes.list().map((runtime) => ({
        label: `This machine — ${runtime.folder.name}`,
        description: runtime.url,
        baseUrl: runtime.url,
        signed: false,
      }));
      if (services.authProvider.isAuthenticated()) {
        for (const runtime of (await services.datalayer.listRuntimes()) ?? []) {
          const target = sessionTargetOf(
            { kind: "datalayer" },
            {
              uid: "",
              runsOn: { kind: "runtime", uid: runtime.uid },
              state: "open",
            },
            [
              {
                uid: runtime.uid,
                runtimeName: runtime.runtimeName,
                ingress: runtime.ingress,
              },
            ],
          );
          if (typeof target !== "string") {
            places.push({
              label: `Datalayer — ${runtime.givenName || runtime.runtimeName}`,
              description: runtime.environmentName,
              baseUrl: target.baseUrl,
              signed: true,
            });
          }
        }
      }
      if (places.length === 0) {
        void vscode.window.showErrorMessage(
          "No runtime to import into: start the local runtime (Datalayer: Start the local runtime), or sign in and start a runtime on Datalayer.",
        );
        return;
      }
      const place = await vscode.window.showQuickPick(places, {
        placeHolder: "Which runtime imports the session?",
      });
      if (!place) {
        return;
      }
      const client = appSessionsClient({
        baseUrl: place.baseUrl,
        getAccessToken: () =>
          place.signed
            ? services.authProvider.getToken() || undefined
            : undefined,
        fetch: (input, init) => fetch(input, init),
      });
      try {
        const answer = await client.importFile(text);
        tree.refresh();
        void vscode.window.showInformationMessage(importedSaid(answer));
      } catch (error) {
        if (!importAsksForAgent(error)) {
          refused(error);
          return;
        }
        // The file's agent is not on the runtime: the runtime says so, and asks for one.
        const agent = await vscode.window.showInputBox({
          prompt: refusalShown(error),
          placeHolder: "An agentspec of that runtime",
        });
        if (!agent) {
          return;
        }
        try {
          const answer = await client.importFile(text, { agent });
          tree.refresh();
          void vscode.window.showInformationMessage(importedSaid(answer));
        } catch (again) {
          refused(again);
        }
      }
    }),

    vscode.commands.registerCommand(
      "datalayer.sessions.rename",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        const title = await vscode.window.showInputBox({
          prompt: "The session's title; empty takes it back.",
          value: item.row.title,
        });
        if (title === undefined) {
          return;
        }
        try {
          await client.rename(item.row.uid, title.trim());
          tree.refresh();
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.archive",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        try {
          await client.archive(item.row.uid, true);
          tree.refresh();
          void vscode.window.showInformationMessage(
            `Archived ${item.row.uid}: it is hidden from the list.`,
          );
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.end",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const confirmed = await vscode.window.showWarningMessage(
          `End ${item.row.title || item.row.uid}? What runs is cancelled; its record stays, and an ended session is cloned, never resumed.`,
          { modal: true },
          "End",
        );
        if (confirmed !== "End") {
          return;
        }
        const client = await clientOf(item);
        if (!client) {
          return;
        }
        try {
          await client.end(item.row.uid);
          tree.refresh();
        } catch (error) {
          refused(error);
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.revealFolder",
      async (item?: SessionItem) => {
        if (!item || item.place.kind !== "local") {
          return;
        }
        const folder = localSessionFolder(
          os.homedir(),
          item.row.uid,
          process.env.AGENT_RUNTIMES_SESSIONS_PATH,
        );
        await vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(folder),
        );
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.openInStudio",
      async (item?: SessionItem) => {
        if (!item) {
          return;
        }
        const appUid = item.row.appUid;
        if (!appUid) {
          void vscode.window.showErrorMessage(
            `Session ${item.row.uid} belongs to no application on Datalayer (a Preview of ${item.listed.application.name}): nothing to open in the Studio.`,
          );
          return;
        }
        await vscode.env.openExternal(
          vscode.Uri.parse(studioActivityUrl(appUid)),
        );
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.checkHarness",
      async (harnessId?: string) => {
        let catalogue: HarnessFacts[];
        try {
          catalogue = await localRuntimes.harnesses();
        } catch (error) {
          await showLocalRuntimeRefusal(error);
          return;
        }
        let facts = harnessId
          ? catalogue.find((harness) => harness.id === harnessId)
          : undefined;
        if (!facts) {
          const picked = await vscode.window.showQuickPick(
            catalogue.map((harness) => ({
              label: harness.name,
              description: `loop --harness ${harness.id}`,
              detail: [
                harness.credential,
                harness.servedToThirdParties.replace(/_/g, " "),
                harness.licence,
              ]
                .filter(Boolean)
                .join(" · "),
              facts: harness,
            })),
            { placeHolder: "Which coding agent to check on this machine?" },
          );
          facts = picked?.facts;
        }
        if (!facts) {
          return;
        }
        const check = await checkHarnessHere(localRuntimes, facts);
        const firstSecret = facts.secrets[0];
        if (check.ok && check.parts.length === 0) {
          const source =
            check.credentialSource && firstSecret
              ? ` ${credentialSourceSaid(firstSecret, check.credentialSource)}`
              : "";
          void vscode.window.showInformationMessage(
            `${facts.name} is ready on this machine.${source}`,
          );
          return;
        }
        const actions: string[] = [];
        if (check.parts.some((part) => part.setup)) {
          actions.push("Run setup in a terminal");
        }
        if (check.parts.some((part) => part.part === "credential")) {
          actions.push("Set the credential…");
        }
        const sentence = check.parts.map((part) => part.sentence).join(" ");
        const picked = check.ok
          ? await vscode.window.showInformationMessage(sentence, ...actions)
          : await vscode.window.showErrorMessage(sentence, ...actions);
        if (picked === "Run setup in a terminal") {
          const terminal = vscode.window.createTerminal({
            name: `Datalayer: ${check.setupCommand}`,
          });
          terminal.show();
          // Shown whole, not run: the person presses Enter.
          terminal.sendText(check.setupCommand, false);
        } else if (picked === "Set the credential…") {
          await vscode.commands.executeCommand(
            "datalayer.sessions.setCredential",
            firstSecret,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "datalayer.sessions.setCredential",
      async (name?: string) => {
        let chosen = name;
        if (!chosen) {
          let names: string[] = [];
          try {
            names = [
              ...new Set(
                (await localRuntimes.harnesses()).flatMap(
                  (harness) => harness.secrets,
                ),
              ),
            ];
          } catch {
            // No catalogue: the name is typed.
          }
          chosen = names.length
            ? await vscode.window.showQuickPick(names, {
                placeHolder: "Which credential?",
              })
            : await vscode.window.showInputBox({
                prompt: "The credential's name (e.g. ANTHROPIC_API_KEY).",
              });
        }
        if (!chosen) {
          return;
        }
        const value = await vscode.window.showInputBox({
          prompt: `${chosen}: kept in VS Code's secret storage, never in settings, never shown or logged; empty forgets it.`,
          password: true,
          ignoreFocusOut: true,
        });
        if (value === undefined) {
          return;
        }
        await localRuntimes.storeCredential(chosen, value.trim());
        void vscode.window.showInformationMessage(
          value.trim()
            ? `${chosen} is kept in the secret storage: a local runtime started from now on is given it when your environment has none.`
            : `${chosen} is forgotten.`,
        );
      },
    ),
  );
}
