/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Cross-window notebook registry using VS Code's globalState.
 *
 * Each VS Code window running the Datalayer extension writes its open
 * notebooks and MCP server port into the shared globalState store. When
 * an MCP tool call fails to find a notebook locally, the executor queries
 * this registry to detect whether the requested document is open in a
 * *different* VS Code window — and returns an actionable error instead of
 * a generic "no notebook found" message.
 *
 * @module mcp/crossWindowRegistry
 */

import * as vscode from "vscode";

import type { DocumentRegistry } from "../services/documents/documentRegistry";

/** globalState key used to share the registry across windows. */
const GLOBAL_STATE_KEY = "datalayer.mcp.windowRegistry";

/** How often (ms) each window refreshes its heartbeat + notebook list. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * How old (ms) a globalState entry can be before it is considered stale
 * (i.e. that window has closed or the extension deactivated without cleaning up).
 * Set to 3× the heartbeat interval for tolerance.
 */
const HEARTBEAT_TTL_MS = 45_000;

/** A single notebook or lexical document entry. */
interface DocEntry {
  /** VS Code document URI string. */
  uri: string;
  /** Filename (last path segment). */
  filename: string;
  /** Document type. */
  type: "notebook" | "lexical";
}

/** Registry entry written by each active VS Code window. */
interface WindowEntry {
  /** MCP HTTP server port this window is listening on. */
  port: number;
  /** Unique ID for this window instance (port + startup timestamp). */
  windowId: string;
  /** All open notebooks and lexical docs in this window's Datalayer editor. */
  documents: DocEntry[];
  /** Unix timestamp (ms) of the last heartbeat write. */
  heartbeat: number;
}

/** Shape of the full cross-window registry stored in globalState. */
type Registry = Record<string, WindowEntry>;

/**
 * Manages cross-window document visibility via VS Code `globalState`.
 *
 * Usage:
 * ```typescript
 * const cwr = new CrossWindowRegistry(context, port, documentRegistry);
 * cwr.start(); // begin heartbeat
 * context.subscriptions.push({ dispose: () => cwr.dispose() });
 * ```
 */
export class CrossWindowRegistry {
  private readonly windowId: string;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly port: number,
    private readonly documentRegistry: DocumentRegistry,
  ) {
    this.windowId = `${port}-${Date.now()}`;
  }

  /**
   * Register this window in globalState and start the heartbeat interval.
   * Call once immediately after the MCP server binds its port.
   */
  start(): void {
    this.sync();
    this.heartbeatTimer = setInterval(() => this.sync(), HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Remove this window's entry from globalState and stop the heartbeat.
   * Call from the extension's deactivation / subscription disposal.
   */
  dispose(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    const registry = this.readRegistry();
    delete registry[this.windowId];
    void this.context.globalState.update(GLOBAL_STATE_KEY, registry);
  }

  /**
   * Check whether a notebook (by URI or filename) is open in a *different*
   * VS Code window. Returns the first match found, or `undefined` if the
   * document is not registered in any other active window.
   *
   * @param uriOrFilename - Full URI string or bare filename to search for.
   */
  findInOtherWindows(
    uriOrFilename: string,
  ): { port: number; filename: string; uri: string } | undefined {
    const registry = this.readRegistry();
    const now = Date.now();

    for (const [wid, entry] of Object.entries(registry)) {
      if (wid === this.windowId) {
        continue; // don't report our own window
      }
      if (now - entry.heartbeat > HEARTBEAT_TTL_MS) {
        continue; // stale — window likely closed
      }
      for (const doc of entry.documents) {
        if (
          doc.uri === uriOrFilename ||
          doc.filename === uriOrFilename ||
          doc.uri.endsWith(`/${uriOrFilename}`)
        ) {
          return { port: entry.port, filename: doc.filename, uri: doc.uri };
        }
      }
    }
    return undefined;
  }

  /**
   * Returns a summary of all documents open in OTHER active windows.
   * Useful for building informational error messages when no local notebook
   * is found and the user might be confused about which window to use.
   */
  getOtherWindowsSummary(): Array<{
    port: number;
    documents: DocEntry[];
  }> {
    const registry = this.readRegistry();
    const now = Date.now();
    const result: Array<{ port: number; documents: DocEntry[] }> = [];

    for (const [wid, entry] of Object.entries(registry)) {
      if (wid === this.windowId) {
        continue;
      }
      if (now - entry.heartbeat > HEARTBEAT_TTL_MS) {
        continue;
      }
      if (entry.documents.length > 0) {
        result.push({ port: entry.port, documents: entry.documents });
      }
    }
    return result;
  }

  // ── private ───────────────────────────────────────────────────────────────

  /** Write/refresh this window's entry in globalState. */
  private sync(): void {
    const documents: DocEntry[] = [
      ...this.documentRegistry.getByType("notebook").map((e) => ({
        uri: e.documentUri,
        filename: e.documentUri.split("/").pop() ?? e.documentUri,
        type: "notebook" as const,
      })),
      ...this.documentRegistry.getByType("lexical").map((e) => ({
        uri: e.documentUri,
        filename: e.documentUri.split("/").pop() ?? e.documentUri,
        type: "lexical" as const,
      })),
    ];

    const registry = this.readRegistry();
    registry[this.windowId] = {
      port: this.port,
      windowId: this.windowId,
      documents,
      heartbeat: Date.now(),
    };
    void this.context.globalState.update(GLOBAL_STATE_KEY, registry);
  }

  /** Read the current registry from globalState. */
  private readRegistry(): Registry {
    return this.context.globalState.get<Registry>(GLOBAL_STATE_KEY) ?? {};
  }
}
