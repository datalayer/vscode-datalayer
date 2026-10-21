/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Datalayer: Try this application* (VSCODE VS-11): an Appspec (`loop.app/v1`)
 * or an `app.py` open in the editor is run on this machine with hot reload
 * — `loop apps run <file> --web --watch` — and its Preview (the page the
 * embed draws, the Studio's Try tab's) opens in a panel beside the editor;
 * saved, it reloads. *Validate* and *Ship* open the application's tabs in
 * the browser once the file is pushed (`loop apps push <file> --app <uid>`;
 * decision O-5: the browser does both). A file that is neither is refused
 * in a sentence.
 *
 * Pure: no `vscode`, no child process. The command (`commands/apps.ts`)
 * does the I/O.
 *
 * @module chat/apps
 */

import { STUDIO_ORIGIN } from "./sessionVerbs";
import { isAppspec } from "./startHere";

/** Where `loop apps run --web` serves the page (`APP_PATH`). */
export const APP_PATH = "/app";

/** The loopback address the preview is served on. */
export const PREVIEW_HOST = "127.0.0.1";

/** What a file open in the editor is, for Try. */
export type TryTarget =
  | { kind: "appspec"; path: string; name: string }
  | { kind: "python"; path: string; name: string };

/**
 * What the file is: an Appspec, an `app.py`, or neither.
 *
 * @param path - The file's path.
 * @param content - Its text.
 *
 * @returns The target, or the refusal.
 */
export function tryTargetOf(
  path: string,
  content: string,
): TryTarget | { refused: string } {
  const base = path.split(/[\\/]/).pop() ?? path;
  if (/\.ya?ml$/i.test(base)) {
    if (!isAppspec(content)) {
      return {
        refused: `${base} is not an application: an Appspec starts with \`schema: ${"loop.app/v1"}\`.`,
      };
    }
    const named = content.match(/^\s*name:\s*["']?(.+?)["']?\s*$/m);
    return { kind: "appspec", path, name: named?.[1]?.trim() || base };
  }
  if (/\.py$/i.test(base)) {
    return { kind: "python", path, name: base };
  }
  return {
    refused: `${base} is neither an Appspec (a .yaml with \`schema: loop.app/v1\`) nor an app.py: open one to try it.`,
  };
}

/**
 * The arguments `loop` runs the file with: the page served on this machine,
 * reloaded when the file changes, no browser opened (the panel is the page).
 *
 * @param file - The file's path.
 * @param port - The port picked for it.
 *
 * @returns The arguments after `loop`.
 */
export function tryArguments(file: string, port: number): string[] {
  return [
    "apps",
    "run",
    file,
    "--web",
    "--watch",
    "--headless",
    "--host",
    PREVIEW_HOST,
    "--port",
    String(port),
  ];
}

/**
 * The page's address on a port.
 *
 * @param port - The loopback port `loop apps run` picked.
 *
 * @returns `http://127.0.0.1:<port>/app`.
 */
export function previewUrlOf(port: number): string {
  return `http://${PREVIEW_HOST}:${port}${APP_PATH}`;
}

/**
 * The address `loop apps run --web` says it serves on, from its line
 * (*<name> is served on this machine at http://127.0.0.1:8000/app, …*).
 *
 * @param line - One line of the process's output.
 *
 * @returns The address, or null when the line names none.
 */
export function servedAddressOf(line: string): string | null {
  const match = line.match(/is served on this machine at (https?:\/\/[^\s,]+)/);
  return match?.[1] ?? null;
}

/**
 * The refusal `loop apps run` printed, when it did (*✗ …*).
 *
 * @param line - One line of the process's output.
 *
 * @returns The sentence after the mark, or null.
 */
export function refusalLineOf(line: string): string | null {
  const match = line.match(/^\s*✗\s+(.+)$/);
  return match?.[1]?.trim() ?? null;
}

/**
 * The application's Validate or Ship tab in the Studio.
 *
 * @param uid - The application's uid, once pushed.
 * @param tab - `validate` or `ship`.
 *
 * @returns The Studio page's address.
 */
export function studioTabUrl(uid: string, tab: "validate" | "ship"): string {
  return `${STUDIO_ORIGIN}/studio/apps/${encodeURIComponent(uid)}?tab=${tab}`;
}

/**
 * The line that saves a file as an application, offered when the file has
 * no uid yet.
 *
 * @param file - The file's path.
 *
 * @returns `loop apps push <file> --app <uid>`.
 */
export function pushLine(file: string): string {
  return `loop apps push ${file} --app <uid>`;
}

/**
 * The sentence when the file is not known as an application yet.
 *
 * @param file - The file's path.
 *
 * @returns The sentence naming the push line.
 */
export function noUidSentence(file: string): string {
  return (
    `This file is not saved as an application yet: save it from the Studio, or push it with ` +
    `\`${pushLine(file)}\` in a terminal (the uid is the application's, from its Studio page), then give the uid here.`
  );
}

/**
 * Whether a string is an application uid (as `SESSION_UID` and the items' uids are shaped).
 *
 * @param value - What the person typed.
 *
 * @returns True for 8 to 128 letters, digits, hyphens or underscores.
 */
export function isAppUid(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value.trim());
}

/**
 * What the preview panel is called in its tab.
 *
 * @param name - The application's name.
 *
 * @returns The title, *Try: <name>*.
 */
export function panelTitle(name: string): string {
  return `Try: ${name}`;
}

/**
 * The panel's page: the preview in a frame filling it, the address said
 * above it, a CSP that allows that origin and nothing else.
 *
 * @param url - The preview's address.
 * @param name - The application's name.
 *
 * @returns The page's markup, whole.
 */
export function previewHtml(url: string, name: string): string {
  const origin = new URL(url).origin;
  const safeName = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeName}</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
  .address { padding: 4px 8px; font-size: 12px; opacity: 0.8; border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  iframe { flex: 1; border: 0; width: 100%; background: white; }
</style>
</head>
<body>
<div class="address">${safeName} — served on this machine at ${url}; saved, it reloads.</div>
<iframe src="${url}" title="${safeName}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>
</body>
</html>`;
}
