/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session's conversation read from its record at ai-agents, for a session
 * the chat cannot talk to: a team run's seat, or a session on Datalayer on no
 * runtime (paused, ended). The record's entries become the lines of a
 * read-only transcript: what the person asked, what the agent answered, and
 * each tool call in one short line. Pure: no `vscode`, no React, no network.
 *
 * @module chat/sessionRecord
 */

import { askedOf } from "@datalayer/agent-runtimes/lib/portable/records";

/** Who a line of the transcript is from. */
export type TranscriptWho = "person" | "agent" | "tool";

/** One line of a session's read-only transcript. */
export interface TranscriptLine {
  who: TranscriptWho;
  text: string;
  /** The turn it belongs to, when the record numbers it. */
  turn?: number;
}

/** The longest a tool call's line is drawn. */
const TOOL_LINE_LIMIT = 120;

/**
 * Where a session's record is read: ai-agents' record of a session the
 * person opened, its entries oldest first.
 *
 * @param aiAgentsUrl - Where ai-agents answers (its base address).
 * @param uid - The session.
 *
 * @returns `<aiAgentsUrl>/api/ai-agents/v1/apps/records/sessions/<uid>`.
 */
export function sessionRecordUrl(aiAgentsUrl: string, uid: string): string {
  return `${aiAgentsUrl.replace(/\/+$/, "")}/api/ai-agents/v1/apps/records/sessions/${encodeURIComponent(uid)}`;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function oneLine(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * A tool call in one line: its name and what it acted on (a path, a URL, a
 * command), else the record's summary of it.
 *
 * @param payload - The entry's payload.
 * @param summary - The entry's summary.
 *
 * @returns The line.
 */
function toolLineOf(payload: Record<string, unknown>, summary: string): string {
  const display =
    payload.display && typeof payload.display === "object"
      ? (payload.display as Record<string, unknown>)
      : {};
  const name =
    stringOf(payload.tool) ||
    stringOf(payload.name) ||
    stringOf(payload.tool_name) ||
    summary.split(":")[0]!.trim() ||
    "tool";
  const target =
    stringOf(payload.path) ||
    stringOf(display.path) ||
    stringOf(payload.target) ||
    stringOf(payload.url) ||
    stringOf(payload.command) ||
    stringOf(payload.file);
  return oneLine(target ? `${name} ${target}` : name, TOOL_LINE_LIMIT);
}

/**
 * The read-only transcript of a session's record: the person's messages,
 * the agent's answers and each tool call, in the record's order (oldest
 * first). A `turn` holds both what was asked and what it answered; an
 * `output`'s words are the answer only when the record keeps no turns (else
 * they repeat the turn's). Runs and every other entry are left out.
 *
 * @param record - ai-agents' answer: `{ session, entries }`.
 *
 * @returns The lines.
 *
 * @throws When the answer has no `entries` list, or an entry is not an object.
 */
export function recordTranscriptOf(record: unknown): TranscriptLine[] {
  const entries =
    record && typeof record === "object"
      ? (record as { entries?: unknown }).entries
      : undefined;
  if (!Array.isArray(entries)) {
    throw new Error("The session's record came with no list of entries.");
  }
  const kindOf = (entry: unknown): string =>
    entry && typeof entry === "object"
      ? stringOf((entry as { kind?: unknown }).kind)
      : "";
  const keepsTurns = entries.some((entry) => kindOf(entry) === "turn");
  const lines: TranscriptLine[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") {
      throw new Error("The session's record has an entry that is not one.");
    }
    const entry = raw as Record<string, unknown>;
    const payload =
      entry.payload && typeof entry.payload === "object"
        ? (entry.payload as Record<string, unknown>)
        : {};
    const summary = stringOf(entry.summary);
    const turn =
      typeof entry.turn_i === "number" && Number.isFinite(entry.turn_i)
        ? { turn: entry.turn_i }
        : {};
    const text = summary || stringOf(payload.text) || stringOf(payload.content);
    const push = (who: TranscriptWho, said: string): void => {
      const trimmed = said.trim();
      if (trimmed) {
        lines.push({ who, text: trimmed, ...turn });
      }
    };
    switch (kindOf(entry)) {
      case "turn":
        push("person", askedOf(stringOf(payload.asked) || summary));
        push("agent", stringOf(payload.answered));
        break;
      case "user":
        push("person", askedOf(text));
        break;
      case "assistant":
        push("agent", text);
        break;
      case "output":
        if (!keepsTurns) {
          push("agent", text);
        }
        break;
      case "tool_call":
        push("tool", toolLineOf(payload, summary));
        break;
      default:
        // `run`, `session`, rules, steps…: not the conversation.
        break;
    }
  }
  return lines;
}
