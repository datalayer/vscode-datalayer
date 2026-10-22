/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A coding agent's diff, opened in the editor's diff view: two virtual
 * documents on the `datalayer-diff:` scheme (served as `lspDocumentManager`
 * serves cells), compared with `vscode.diff` under the title
 * *<path> — before · after (<harness>, turn n)*.
 *
 * For a session on this machine the *after* side is the file on disk when
 * it holds what the agent wrote — the same bytes, the same digest — else
 * the display's text, said in the status bar; on Datalayer the workspace is
 * the runtime's and the display's text is shown. The editor **reviews** a
 * diff; it never applies one: the agent writes the file, and the editor's
 * own watcher refreshes it when open.
 *
 * @module services/ui/diffDocuments
 */

import { createHash } from "crypto";
import * as vscode from "vscode";

import {
  afterSideOf,
  DIFF_SCHEME,
  diffDocumentPath,
  diffKeyOf,
  type DiffShown,
  diffTitle,
} from "../../chat/sessionDisplays";
import { ServiceLoggers } from "../logging/loggers";

/** A diff to open, and what is known of where it comes from. */
export interface DiffToOpen {
  /** The diff, as the agent's tool result carried it. */
  display: DiffShown;
  /** The harness that wrote it, when known. */
  harness?: string;
  /** The turn it was written in, when known. */
  turn?: number;
  /** The session runs on this machine: the disk is read for the after side. */
  local: boolean;
}

/** What opening a diff came to. */
export interface DiffOpened {
  /** The diff's id in the provider. */
  id: string;
  /** Where the after side comes from, in a sentence. */
  said: string;
  /** The digest of the after side shown. */
  sha256: string;
  /** The after side is the file on disk. */
  fromDisk: boolean;
}

/**
 * The digest of a text, as the file's bytes would be hashed.
 *
 * @param text - What is hashed.
 *
 * @returns Its SHA-256, hex.
 */
export function sha256Of(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** How long the after side's provenance stays in the status bar. */
const SAID_FOR_MS = 8_000;

/**
 * Serves the two sides of every diff opened, and opens them in the diff
 * view.
 */
export class DiffDocuments
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  /** @inheritdoc */
  public readonly onDidChange = this.onDidChangeEmitter.event;

  /** Each side's text, by `<id>/<side>`. */
  private readonly contents = new Map<string, string>();

  private readonly registration: vscode.Disposable;

  private count = 0;

  /** Registers the provider on the `datalayer-diff:` scheme. */
  constructor() {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(
      DIFF_SCHEME,
      this,
    );
  }

  /** @inheritdoc */
  public provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    const key = diffKeyOf(uri.path);
    return key ? this.contents.get(`${key.id}/${key.side}`) : undefined;
  }

  /**
   * Opens a diff in the editor's diff view.
   *
   * @param diff - The diff and where it comes from.
   *
   * @returns What was opened.
   */
  public async open(diff: DiffToOpen): Promise<DiffOpened> {
    this.count += 1;
    const id = String(this.count);
    const disk = diff.local
      ? await this.readFromWorkspace(diff.display.path)
      : null;
    const after = afterSideOf(diff.display, disk, diff.local);
    this.contents.set(`${id}/before`, diff.display.oldText ?? "");
    this.contents.set(`${id}/after`, after.text);
    const side = (which: "before" | "after"): vscode.Uri =>
      vscode.Uri.from({
        scheme: DIFF_SCHEME,
        path: diffDocumentPath(id, which, diff.display.path),
      });
    const title = diffTitle(diff.display, diff.harness, diff.turn);
    await vscode.commands.executeCommand(
      "vscode.diff",
      side("before"),
      side("after"),
      title,
    );
    const opened: DiffOpened = {
      id,
      said: after.said,
      sha256: sha256Of(after.text),
      fromDisk: after.fromDisk,
    };
    ServiceLoggers.main.info("[Diff] opened", {
      title,
      said: after.said,
      sha256: opened.sha256,
    });
    vscode.window.setStatusBarMessage(`${title} — ${after.said}`, SAID_FOR_MS);
    return opened;
  }

  /**
   * The file as it is in the first workspace folder, or null when it is
   * not there (outside the folder, absent, unreadable).
   *
   * @param path - The file's path, as the agent named it: relative to the
   *   workspace, or absolute inside it.
   *
   * @returns Its text, or null.
   */
  private async readFromWorkspace(path: string): Promise<string | null> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return null;
    }
    const uri = workspaceFileUri(folder.uri, path);
    if (!uri) {
      return null;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }

  /** @inheritdoc */
  public dispose(): void {
    this.registration.dispose();
    this.onDidChangeEmitter.dispose();
    this.contents.clear();
  }
}

/**
 * The URI of a path inside a workspace folder, or null for one that leaves
 * it: a relative path with no `..`, or an absolute path under the folder.
 *
 * @param folder - Where the workspace is.
 * @param path - What the agent named.
 *
 * @returns The file's URI, or null.
 */
export function workspaceFileUri(
  folder: vscode.Uri,
  path: string,
): vscode.Uri | null {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized || normalized.split("/").includes("..")) {
    return null;
  }
  if (normalized.startsWith("/")) {
    const root = folder.path.replace(/\/+$/, "");
    if (normalized !== root && !normalized.startsWith(`${root}/`)) {
      return null;
    }
    return folder.with({ path: normalized });
  }
  return vscode.Uri.joinPath(folder, normalized);
}
