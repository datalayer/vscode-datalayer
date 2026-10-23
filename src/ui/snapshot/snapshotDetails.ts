/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A snapshot's details page (`datalayer.snapshots.viewDetails`, a click on a
 * snapshot in the Agents view): what the extension host reads of a snapshot
 * for the page, and the messages the host and the page exchange. Pure: no
 * `vscode`, no React — the host (`commands/snapshots`) and the page
 * (`webview/snapshot`) share it.
 *
 * @module ui/snapshot/snapshotDetails
 */

import type { CodeSandboxSnapshotData } from "@datalayer/agent-runtimes/lib/models/CodeSandboxSnapshotDTO";

/** A file a snapshot holds, as the page lists it. */
export interface SnapshotFile {
  /** Its name or path. */
  name: string;
  /** Its size in bytes, when the snapshot says it. */
  size?: number;
}

/** A snapshot's details, serializable, as the page draws them. */
export interface SnapshotDetails {
  uid: string;
  name: string;
  /** Empty when it has none. */
  description: string;
  environment: string;
  /** When it was taken (its `updated_at`), as the service gives it. */
  updatedAt: string;
  /** Its status, when given (e.g. `ready`). */
  status?: string;
  /** Its size in bytes, when given. */
  size?: number;
  /** Its format and the format's version, when given. */
  format?: string;
  formatVersion?: string;
  /** Its language, from its metadata (`python 3.11`), when given. */
  language?: string;
  /** Its metadata's other plain values (strings, numbers, booleans), by key. */
  metadata: Array<{ key: string; value: string }>;
  /** The files it holds; empty when it lists none. */
  files: SnapshotFile[];
}

/** The page's words. */
export const SNAPSHOT_WORDS = {
  noDescription: "No description",
  noFiles: "This snapshot lists no files.",
  restore: "Restore from Snapshot",
  delete: "Delete Snapshot",
} as const;

/**
 * A number read from a value, when it is one (a number or a numeric string).
 *
 * @param value - What the service gave (a number, a string, anything).
 *
 * @returns The number, or undefined.
 */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * A file of a snapshot's `files`, whatever shape the service gives it: a
 * name, or an object with a name, path or filename and maybe a size.
 *
 * @param file - One entry of `files`.
 *
 * @returns The file, or undefined when it names none.
 */
function fileOf(file: unknown): SnapshotFile | undefined {
  if (typeof file === "string") {
    return file ? { name: file } : undefined;
  }
  if (file === null || typeof file !== "object") {
    return undefined;
  }
  const record = file as Record<string, unknown>;
  const name = [record.name, record.path, record.filename].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  if (!name) {
    return undefined;
  }
  const size = numberOf(record.size);
  return size === undefined ? { name } : { name, size };
}

/**
 * A snapshot's details, from the data the service gave for it.
 *
 * @param data - The snapshot's data (`CodeSandboxSnapshotDTO.rawData()`).
 *
 * @returns Its details, as the page draws them.
 */
export function snapshotDetailsOf(
  data: CodeSandboxSnapshotData,
): SnapshotDetails {
  const metadata = data.metadata ?? {};
  const languageInfo = metadata.language_info as
    { name?: unknown; version?: unknown } | undefined;
  const language =
    languageInfo && typeof languageInfo.name === "string"
      ? [
          languageInfo.name,
          typeof languageInfo.version === "string" ? languageInfo.version : "",
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;
  const plain = Object.entries(metadata)
    .filter(
      ([key, value]) =>
        key !== "language_info" &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"),
    )
    .map(([key, value]) => ({ key, value: String(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const details: SnapshotDetails = {
    uid: data.uid,
    name: data.name,
    description: data.description ?? "",
    environment: data.environment,
    updatedAt: data.updated_at,
    metadata: plain,
    files: (Array.isArray(data.files) ? data.files : [])
      .map(fileOf)
      .filter((file): file is SnapshotFile => file !== undefined),
  };
  const size = numberOf(data.size);
  if (size !== undefined) {
    details.size = size;
  }
  if (data.status) {
    details.status = data.status;
  }
  if (data.format) {
    details.format = data.format;
  }
  if (data.format_version) {
    details.formatVersion = data.format_version;
  }
  if (language) {
    details.language = language;
  }
  return details;
}

/**
 * A size in bytes, as people read it (`1.5 MB`).
 *
 * @param bytes - The size.
 *
 * @returns The size in B, KB, MB, GB or TB (1024 each).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown =
    unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}

/** What the host tells the page. */
export type SnapshotHostMessage =
  | { type: "snapshot-details"; body: SnapshotDetails }
  | { type: "theme-changed"; theme: "light" | "dark" };

/** What the page asks the host. */
export type SnapshotPageMessage =
  { type: "ready" } | { type: "restore" } | { type: "delete" };

/**
 * The page's message, when it is one the host answers.
 *
 * @param raw - The message, before it is read.
 *
 * @returns The message, or undefined.
 */
export function snapshotPageMessageOf(
  raw: unknown,
): SnapshotPageMessage | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const type = (raw as { type?: unknown }).type;
  return type === "ready" || type === "restore" || type === "delete"
    ? { type }
    : undefined;
}
