/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * What a coding agent's displays become in the editor: pure, no `vscode`,
 * no React. The displays themselves are agent-runtimes' (`portable/displays`:
 * a **diff** `{path, oldText, newText, language}`, a **terminal**
 * `{terminalId, command, output, exitCode}`), read strictly from a tool's
 * result; nothing of their reading is copied here.
 *
 * - A diff opens in the editor's diff view between two virtual documents
 *   (`datalayer-diff:/<id>/before/<name>`, `…/after/<name>`), titled
 *   *<path> — before · after (<harness>, turn n)*. For a session on this
 *   machine the *after* side is the file on disk when it holds what the
 *   agent wrote (its bytes and digest the same), else the display's text,
 *   said. The editor reviews a diff; it never applies one.
 * - A terminal display is written to the session's read-only terminal as
 *   it arrives: the command echoed with its prompt once, the output since
 *   what was written, the exit when it comes.
 *
 * @module chat/sessionDisplays
 */

import {
  displayOfToolResult,
  type ProtocolDisplay,
} from "@datalayer/agent-runtimes/lib/portable/displays";

/** A diff, as the agent's tool result carried it. */
export type DiffShown = Extract<ProtocolDisplay, { kind: "diff" }>;

/** A terminal, as the agent's tool result carried it. */
export type TerminalShown = Extract<ProtocolDisplay, { kind: "terminal" }>;

/**
 * The display a tool's result carries, or null: the result as the chat
 * hands it (an object, or its JSON as a string).
 *
 * @param toolName - Which tool answered.
 * @param result - What it answered.
 *
 * @returns The display, or null for a result without one.
 */
export function displayOfToolCall(
  toolName: string,
  result: unknown,
): ProtocolDisplay | null {
  let read: unknown = result;
  if (typeof result === "string") {
    try {
      read = JSON.parse(result);
    } catch {
      return null;
    }
  }
  return displayOfToolResult(toolName, read);
}

/**
 * A diff, read from a display the chat posts (the display's JSON, from the
 * bridge): strict, null for anything else.
 *
 * @param value - The posted display.
 *
 * @returns The diff, or null.
 */
export function diffShownOf(value: unknown): DiffShown | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const shown = value as Record<string, unknown>;
  if (
    shown.kind !== "diff" ||
    typeof shown.path !== "string" ||
    !shown.path.trim() ||
    typeof shown.newText !== "string" ||
    !(shown.oldText === null || typeof shown.oldText === "string")
  ) {
    return null;
  }
  return {
    kind: "diff",
    id: typeof shown.id === "string" ? shown.id : "",
    path: shown.path.trim(),
    oldText: shown.oldText,
    newText: shown.newText,
    language: typeof shown.language === "string" ? shown.language : "text",
  };
}

/**
 * A terminal, read from a display the chat posts: strict, null for anything
 * else.
 *
 * @param value - The posted display.
 *
 * @returns The terminal, or null.
 */
export function terminalShownOf(value: unknown): TerminalShown | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const shown = value as Record<string, unknown>;
  if (
    shown.kind !== "terminal" ||
    typeof shown.terminalId !== "string" ||
    !shown.terminalId.trim()
  ) {
    return null;
  }
  const exitCode =
    typeof shown.exitCode === "number" && Number.isInteger(shown.exitCode)
      ? shown.exitCode
      : null;
  return {
    kind: "terminal",
    id: typeof shown.id === "string" ? shown.id : "",
    terminalId: shown.terminalId.trim(),
    command: typeof shown.command === "string" ? shown.command : "",
    output: typeof shown.output === "string" ? shown.output : "",
    exitCode,
    released: shown.released === true,
  };
}

// --- Diffs ---------------------------------------------------------------

/** The scheme of the diff view's two sides. */
export const DIFF_SCHEME = "datalayer-diff";

/** A side of a diff. */
export type DiffSide = "before" | "after";

/**
 * The path of a side's virtual document: `/<id>/<side>/<file name>`, so
 * the editor names the tab by the file and highlights by its suffix.
 *
 * @param id - The diff's id in the provider.
 * @param side - Before or after.
 * @param path - The file's path, as the agent named it.
 *
 * @returns `/<id>/<side>/<file name>`.
 */
export function diffDocumentPath(
  id: string,
  side: DiffSide,
  path: string,
): string {
  const name = path.split("/").filter(Boolean).pop() ?? "file";
  return `/${encodeURIComponent(id)}/${side}/${name}`;
}

/**
 * The diff and side a virtual document's path names, or null.
 *
 * @param path - The document's path.
 *
 * @returns Its id and side.
 */
export function diffKeyOf(path: string): { id: string; side: DiffSide } | null {
  const match = /^\/([^/]+)\/(before|after)\/[^/]*$/.exec(path);
  if (!match) {
    return null;
  }
  return { id: decodeURIComponent(match[1]!), side: match[2] as DiffSide };
}

/**
 * The diff view's title: *<path> — before · after (<harness>, turn n)*;
 * without a harness or a turn, *<path> — before · after*.
 *
 * @param display - The diff, for its path.
 * @param harness - Who wrote it, or `''`.
 * @param turn - When it was written, or 0.
 *
 * @returns What the diff view's tab says.
 */
export function diffTitle(
  display: Pick<DiffShown, "path">,
  harness = "",
  turn = 0,
): string {
  const who = [harness, turn > 0 ? `turn ${turn}` : ""]
    .filter(Boolean)
    .join(", ");
  return `${display.path} — before · after${who ? ` (${who})` : ""}`;
}

/**
 * The bytes of a text, as a file holds it (UTF-8).
 *
 * @param text - What is counted.
 *
 * @returns Its byte count.
 */
export function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** What the diff view's *after* side is. */
export interface AfterSide {
  text: string;
  /** The file on disk, which holds what the agent wrote. */
  fromDisk: boolean;
  /** Said under the title: where the side comes from. */
  said: string;
}

/** What the *after* side says of itself. */
export const DIFF_WORDS = {
  disk: "after: the file on disk, which holds what the agent wrote",
  notHere: "after: as the agent wrote it (the file is not in this folder)",
  /** The file on disk no longer holds what was written. */
  differs: (disk: number, shown: number): string =>
    `after: as the agent wrote it (the file on disk differs: ${disk} bytes on disk, ${shown} bytes written)`,
  datalayer: "after: as the agent wrote it, on its runtime",
  openInEditor: "Open in the editor",
} as const;

/**
 * The *after* side of a diff: the file on disk when it holds what the
 * agent wrote (the same text, the same bytes), else the display's text,
 * said — the disk not read (null) for a session on Datalayer, whose
 * workspace is its runtime's.
 *
 * @param display - The diff.
 * @param disk - The file as it is on disk; null when there is none to read.
 * @param local - Whether the session runs on this machine.
 *
 * @returns Its text, where it comes from, and the sentence saying so.
 */
export function afterSideOf(
  display: Pick<DiffShown, "newText">,
  disk: string | null,
  local = true,
): AfterSide {
  if (!local) {
    return {
      text: display.newText,
      fromDisk: false,
      said: DIFF_WORDS.datalayer,
    };
  }
  if (disk === null) {
    return { text: display.newText, fromDisk: false, said: DIFF_WORDS.notHere };
  }
  const shown = bytesOf(display.newText);
  const held = bytesOf(disk);
  if (held === shown && disk === display.newText) {
    return { text: disk, fromDisk: true, said: DIFF_WORDS.disk };
  }
  return {
    text: display.newText,
    fromDisk: false,
    said: DIFF_WORDS.differs(held, shown),
  };
}

// --- Terminals -----------------------------------------------------------

/** What the editor says in and of a session's terminal. */
export const TERMINAL_WORDS = {
  /** The terminal's name in the Terminal panel. */
  name: (title: string): string => `Datalayer: ${title}`,
  readOnly:
    "This terminal shows what the agent ran; its commands are decided in the chat.",
  /** The command's exit, written after its output. */
  exit: (code: number): string => `[exit ${code}]`,
} as const;

/** What was written of one terminal display so far. */
export interface TerminalWritten {
  terminalId: string;
  /** The command echoed. */
  echoed: boolean;
  /** The output written so far. */
  output: string;
  /** The exit written. */
  ended: boolean;
}

const crlf = (text: string): string => text.replace(/\r?\n/g, "\r\n");

/**
 * What to write to the session's terminal for a terminal display as it
 * arrives: the command with its prompt once, the output since what was
 * written (whole again when the output no longer continues it), the exit
 * line when the exit code comes.
 *
 * @param previous - What was written of this terminal, if anything.
 * @param display - The display as it stands now.
 *
 * @returns The chunks to write, and what is written after them.
 */
export function terminalWrites(
  previous: TerminalWritten | undefined,
  display: TerminalShown,
): { chunks: string[]; next: TerminalWritten } {
  const chunks: string[] = [];
  const was: TerminalWritten = previous ?? {
    terminalId: display.terminalId,
    echoed: false,
    output: "",
    ended: false,
  };
  let echoed = was.echoed;
  if (!echoed && display.command) {
    chunks.push(`$ ${display.command}\r\n`);
    echoed = true;
  }
  let output = was.output;
  if (display.output !== output) {
    if (display.output.startsWith(output)) {
      chunks.push(crlf(display.output.slice(output.length)));
    } else {
      // Not a continuation: shown whole, after a line.
      chunks.push(`\r\n${crlf(display.output)}`);
    }
    output = display.output;
  }
  let ended = was.ended;
  if (!ended && display.exitCode !== null) {
    const newline = output && !output.endsWith("\n") ? "\r\n" : "";
    chunks.push(`${newline}${TERMINAL_WORDS.exit(display.exitCode)}\r\n`);
    ended = true;
  }
  return {
    chunks,
    next: { terminalId: display.terminalId, echoed, output, ended },
  };
}
