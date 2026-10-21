/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Datalayer: Start a coding agent here* (VSCODE VS-06).
 *
 * A coding agent — Claude Code, Codex, any harness of the catalogue — is
 * started in the open workspace folder on the local runtime of that folder:
 * the person picks a harness (its terms shown, the machine checked first)
 * and an application — the blank harness application the extension
 * composes, or one of the folder's own Appspecs — the application is
 * configured on the local runtime (`POST /api/v1/apps/configure`, its
 * agent the runtime's `default`), and a session is opened on it
 * (`POST /api/v1/apps/sessions`). The folder's own instructions files
 * (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.goosehints`) are kept and said;
 * one that is the harness's own instructions file is refused, since the
 * runtime writes that file read-only for the harness (the seam named in
 * the plan). The open file reaches the agent as `host_context` under A-18's
 * rule: only when the Appspec names `page` and a rule lets it.
 *
 * Pure: no `vscode`, no React, no network, no file system. The command
 * (`commands/startHere.ts`) does the I/O.
 *
 * @module chat/startHere
 */

import type { AppHost } from "./appChat";
import type { HarnessFacts } from "../services/localRuntime/harnessCheck";
import type { OpenSessionRequest } from "./sessionVerbs";

/** The instructions files a folder may hold of its own, by harness convention. */
export const OWN_INSTRUCTIONS_FILES: readonly string[] = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".goosehints",
];

/** The Appspec schema an application file declares. */
export const APPSPEC_SCHEMA = "loop.app/v1";

/** The id prefix of the blank harness application the extension composes. */
export const BLANK_APP_PREFIX = "vscode-";

/** The sentence when no folder is open. */
export const NO_FOLDER_SENTENCE =
  "Open a folder first: a coding agent works in the open workspace folder, and none is open.";

/** The sentence when the catalogue lists no harness. */
export const NO_HARNESS_SENTENCE =
  "The local runtime lists no harness (`GET /api/v1/harnesses`): update agent-runtimes with `uv tool install 'agent-runtimes[shield]'`.";

/** The command that keeps a harness credential in the secret storage (VS-03's). */
export const SET_CREDENTIAL_COMMAND = "datalayer.sessions.setCredential";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The instructions file each harness of the catalogue writes, by id, as
 * `GET /api/v1/harnesses` says it (`instructions_file`).
 *
 * @param body - The route's answer.
 *
 * @returns Harness id → its instructions file name; absent when it writes none.
 */
export function instructionsFilesOf(body: unknown): Record<string, string> {
  const files: Record<string, string> = {};
  const harnesses = record(body).harnesses;
  for (const raw of Array.isArray(harnesses) ? harnesses : []) {
    const harness = record(raw);
    const id = text(harness.id);
    const file = text(harness.instructions_file);
    if (id && file) {
      files[id] = file;
    }
  }
  return files;
}

/**
 * The instructions files the folder holds of its own.
 *
 * @param entries - The folder's top-level entry names.
 *
 * @returns Those of {@link OWN_INSTRUCTIONS_FILES} present, in that order.
 */
export function ownInstructionsFiles(entries: readonly string[]): string[] {
  const present = new Set(entries);
  return OWN_INSTRUCTIONS_FILES.filter((name) => present.has(name));
}

/**
 * Why the start is refused when the folder's own instructions file is the
 * one the harness is given: the runtime writes `<instructions file>` from
 * the application, read-only, over whatever is there — it would overwrite
 * the folder's own. Nothing is started until agent-runtimes keeps it.
 *
 * @param own - The folder's own instructions files.
 * @param harness - The harness picked, with the file it writes.
 *
 * @returns The sentence, or null when nothing of the folder's is in the way.
 */
export function instructionsConflict(
  own: readonly string[],
  harness: { name: string; instructionsFile: string },
): string | null {
  if (!harness.instructionsFile || !own.includes(harness.instructionsFile)) {
    return null;
  }
  return (
    `This folder has its own ${harness.instructionsFile}, and ${harness.name} is given a ${harness.instructionsFile} ` +
    `that Datalayer writes from the application, read-only: starting it here would overwrite yours. ` +
    `Move or rename your ${harness.instructionsFile} first, or pick a harness that reads another file.`
  );
}

/**
 * The session's first line: what of the folder's own is kept.
 *
 * @param own - The folder's own instructions files.
 * @param harness - The harness, with the file it is given.
 *
 * @returns The sentence.
 */
export function keptSaid(
  own: readonly string[],
  harness: { name: string; instructionsFile: string },
): string {
  const given = harness.instructionsFile
    ? ` ${harness.name} is given its instructions as ${harness.instructionsFile}, written by Datalayer from the application.`
    : "";
  if (own.length === 0) {
    return `This folder has no instructions file of its own.${given}`;
  }
  const names = own.join(", ");
  return `Your ${names} ${own.length === 1 ? "is" : "are"} kept as ${own.length === 1 ? "it is" : "they are"}.${given}`;
}

/** A harness as the quick pick offers it. */
export interface HarnessPick {
  id: string;
  label: string;
  description: string;
  detail: string;
}

/**
 * The harnesses as the quick pick lists them: the name, the credential it
 * takes, its terms.
 *
 * @param harnesses - The catalogue.
 *
 * @returns One item per harness, in the catalogue's order.
 */
export function harnessPicks(
  harnesses: readonly HarnessFacts[],
): HarnessPick[] {
  return harnesses.map((harness) => ({
    id: harness.id,
    label: harness.name,
    description: harness.credential ? `takes ${harness.credential}` : "",
    detail:
      `Serving others: ${harness.servedToThirdParties.replace(/_/g, " ")}` +
      (harness.tierRestrictions ? ` — ${harness.tierRestrictions}` : "") +
      ` · ${harness.licence}` +
      (harness.adapter
        ? ` · adapter ${harness.adapter} ${harness.adapterVersion}`
        : ""),
  }));
}

/** An application file of the workspace, as found. */
export interface WorkspaceAppspec {
  /** Its path, relative to the folder. */
  path: string;
  /** The Appspec, parsed. */
  spec: Record<string, unknown>;
}

/**
 * Whether a text is an Appspec (`schema: loop.app/v1`).
 *
 * @param content - The file's text.
 *
 * @returns True when it declares the schema.
 */
export function isAppspec(content: string): boolean {
  return /^\s*schema:\s*["']?loop\.app\/v1["']?\s*$/m.test(content);
}

/** An application as the quick pick offers it. */
export interface AppPick {
  label: string;
  description: string;
  detail: string;
  /** The Appspec to configure, when picked. */
  spec: Record<string, unknown>;
  /** Its file, relative to the folder; empty for the blank one. */
  path: string;
}

/**
 * The blank harness application: the harness as the application's agent,
 * reading and editing in the folder done, deleting and running a command
 * asked first, the open file passed to it when it asks (`host_context`),
 * every action in the record.
 *
 * @param harness - The harness's id and name.
 * @param folderName - The workspace folder's name.
 *
 * @returns The Appspec, as `POST /api/v1/apps/configure` takes it.
 */
export function blankHarnessApp(
  harness: { id: string; name: string },
  folderName: string,
): Record<string, unknown> {
  return {
    schema: APPSPEC_SCHEMA,
    id: `${BLANK_APP_PREFIX}${harness.id}`,
    version: "0.0.1",
    name: `${harness.name} in ${folderName}`,
    kind: "chat",
    description: `${harness.name} working in the folder ${folderName}, behind the Shield.`,
    agent: `example-harness-${harness.id}`,
    instructions:
      "You work in the open folder only. Do what is asked, in as few steps as possible, then stop with one short sentence.",
    rules: [
      { action: "Read files", applies_to: "read", behaviour: "do_it" },
      { action: "Edit files", applies_to: "write", behaviour: "do_it" },
      {
        action: "Delete files",
        applies_to: "delete",
        behaviour: "ask_me_first",
      },
      {
        action: "Run a command",
        applies_to: "execute",
        behaviour: "ask_me_first",
      },
      {
        action: "Read the open file",
        applies_to: "host_context",
        behaviour: "do_it",
      },
    ],
    record: {
      keep_for: "30_days",
      include: [
        "conversations",
        "actions",
        "decisions",
        "approvals",
        "diffs",
        "terminals",
      ],
    },
    deployment: { embedded: { host: { context: ["page"] } } },
    interface: {
      layout: "chat",
      welcome: `Ask ${harness.name} to read, write or run something in ${folderName}.`,
    },
    tags: ["harness", "vscode"],
  };
}

/**
 * The applications the quick pick offers: the blank harness application
 * first, then the folder's own Appspecs.
 *
 * @param harness - The harness picked.
 * @param folderName - The folder.
 * @param own - The folder's Appspecs.
 *
 * @returns The items, the blank one first.
 */
export function appPicks(
  harness: { id: string; name: string },
  folderName: string,
  own: readonly WorkspaceAppspec[],
): AppPick[] {
  const blank = blankHarnessApp(harness, folderName);
  const items: AppPick[] = [
    {
      label: `${harness.name} in this folder`,
      description: "the blank harness application",
      detail:
        "Reading and editing done; deleting and running a command asked first; the open file passed when it asks.",
      spec: blank,
      path: "",
    },
  ];
  for (const file of own) {
    const name = text(file.spec.name) || text(file.spec.id) || file.path;
    items.push({
      label: name,
      description: file.path,
      detail: text(file.spec.description),
      spec: file.spec,
      path: file.path,
    });
  }
  return items;
}

/**
 * The body of `POST /api/v1/apps/configure`.
 *
 * @param spec - The Appspec.
 *
 * @returns `{app}`.
 */
export function configureRequestOf(spec: Record<string, unknown>): {
  app: Record<string, unknown>;
} {
  return { app: spec };
}

/**
 * The agent the runtime made for the application, from `configure`'s
 * answer: `agent_id`, else `id`, else the runtime's `default`.
 *
 * @param answer - The route's answer.
 *
 * @returns The agent id.
 */
export function agentIdOf(answer: unknown): string {
  const body = record(answer);
  return text(body.agent_id) || text(body.id) || "default";
}

/**
 * The body of `POST /api/v1/apps/sessions`: the agent, no opener (the
 * person's first message is the first turn).
 *
 * @param agentId - The agent.
 *
 * @returns The request body.
 */
export function startRequestOf(agentId: string): {
  agent: string;
  opener: string;
} {
  return { agent: agentId, opener: "" };
}

/**
 * The session's uid from what `POST /api/v1/apps/sessions` streamed: the
 * `loop.session` event's `uid`, or a plain JSON answer's.
 *
 * @param streamed - The response body, SSE lines or JSON.
 *
 * @returns The uid.
 *
 * @throws Error when no session is named in it.
 */
export function sessionUidOf(streamed: string): string {
  const lines = streamed.split(/\r?\n/);
  for (const line of lines) {
    const payload = line.startsWith("data:")
      ? line.slice(5).trim()
      : line.trim();
    if (!payload.startsWith("{")) {
      continue;
    }
    let event: Record<string, unknown>;
    try {
      event = record(JSON.parse(payload));
    } catch {
      continue;
    }
    if (event.type === "CUSTOM" && event.name === "loop.session") {
      const uid = text(record(event.value).uid);
      if (uid) {
        return uid;
      }
    }
    const plain = text(event.uid) || text(record(event.session).uid);
    if (plain) {
      return plain;
    }
  }
  throw new Error(
    "The local runtime opened no session: its answer names no session uid.",
  );
}

/**
 * The refusal as the runtime said it, for a notification.
 *
 * @param what - What was asked (*Configuring the application*).
 * @param status - The HTTP status.
 * @param body - The response's text.
 *
 * @returns One sentence, the runtime's `detail` or `problems` when it gave them.
 */
export function runtimeRefusal(
  what: string,
  status: number,
  body: string,
): string {
  let said = body.trim();
  try {
    const parsed = record(JSON.parse(body));
    const detail = parsed.detail;
    if (typeof detail === "string") {
      said = detail;
    } else {
      const problems = record(detail).problems;
      if (Array.isArray(problems) && problems.length > 0) {
        said = problems.map((problem) => text(problem)).join(" ");
      }
    }
  } catch {
    // Not JSON: the text as it is.
  }
  return `${what} was refused by the local runtime (${status})${said ? `: ${said}` : "."}`;
}

/** What the chat is handed to open the session started here. */
export interface StartedSession extends OpenSessionRequest {
  /** The local runtime's address. */
  url: string;
  /** The application's name. */
  name: string;
  /** What the Appspec says its host passes (A-18's rule, unchanged). */
  host: AppHost;
}

/**
 * The request that opens the started session in the Datalayer Chat: the
 * local place, the session, the agent, the application's host terms.
 *
 * @param input - The folder, the runtime, the session, the agent, the application and its host terms.
 *
 * @returns The request, as {@link OpenSessionRequest} plus the host terms.
 */
export function startedSession(input: {
  folder: string;
  folderName: string;
  url: string;
  uid: string;
  agentId: string;
  spec: Record<string, unknown>;
  host: AppHost;
}): StartedSession {
  const name = text(input.spec.name) || text(input.spec.id) || "Application";
  return {
    place: {
      kind: "local",
      folder: input.folder,
      folderName: input.folderName,
      url: input.url,
    },
    uid: input.uid,
    agent: input.agentId,
    title: name,
    state: "open",
    appUid: text(input.spec.uid),
    url: input.url,
    name,
    host: input.host,
  };
}
