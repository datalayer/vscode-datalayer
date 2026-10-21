/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The approvals of the sessions on this machine (VSCODE VS-07, the local
 * place): one websocket per local runtime running
 * (`/api/v1/tool-approvals/ws`), read for its `agent.snapshot` messages —
 * each *ask me first* request pending is said as an editor notification
 * (once, through `ApprovalNotifications`) and handed to the chat's banner
 * (`onDidChange`, posted as `local-approvals`); a decision, from the
 * notification or the banner, is sent as `tool_approval_decision` and
 * confirmed by the next snapshot no longer listing it. The runtime decides
 * approvals over this socket, not an HTTP route, so nothing is read again
 * by id: the latest snapshot is the read.
 *
 * @module services/localRuntime/localApprovalSource
 */

import { actionOf } from "@datalayer/agent-runtimes/lib/portable/approvalCard";
import * as vscode from "vscode";
import { WebSocket } from "ws";

import type { ApprovalRaised } from "../../chat/attention";
import {
  approvalsOfSnapshot,
  decisionMessage,
  decisionSettled,
  isSnapshot,
  LOCAL_AGENT_ID,
  LOCAL_APPROVAL_WORDS,
  localApprovalsSocketUrl,
} from "../../chat/localApprovals";
import { ServiceLoggers } from "../logging/loggers";
import type { ApprovalNotifications } from "../ui/approvalNotifications";

/** What the source watches: the local runtimes running. */
export interface WatchedRuntimes {
  list(): Array<{ url: string; folder: { name: string } }>;
  onDidChange: vscode.Event<void>;
}

/** The approvals of one runtime, as last read. */
export interface LocalApprovals {
  /** The runtime's address. */
  url: string;
  approvals: ApprovalRaised[];
}

/** A decision waiting for the snapshot that confirms it. */
interface Waiter {
  id: string;
  approved: boolean;
  action: string;
  resolve: (said: string) => void;
  timer: NodeJS.Timeout;
}

interface Entry {
  url: string;
  folderName: string;
  socket: WebSocket;
  pending: ApprovalRaised[];
  waiters: Waiter[];
  retry: NodeJS.Timeout | null;
  closed: boolean;
}

/** How long a decision waits for the snapshot confirming it. */
const DECISION_TIMEOUT_MS = 10_000;

/** How long before a socket that closed is opened again. */
const RETRY_MS = 3_000;

/**
 * The local runtimes' approvals, watched over their websockets.
 */
export class LocalApprovalSource implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();

  private readonly changed = new vscode.EventEmitter<LocalApprovals>();

  /** A runtime's approvals as last read: the chat's banner follows it. */
  readonly onDidChange: vscode.Event<LocalApprovals> = this.changed.event;

  private readonly subscriptions: vscode.Disposable[] = [];

  /** Focuses the chat on an approval (*Show*); set by the chat's provider. */
  public showInChat: (id: string) => void = () => {
    // Nothing until the chat's provider sets it.
  };

  /**
   * @param runtimes - The local runtimes running.
   * @param notifications - The editor notifications, each approval once.
   */
  constructor(
    private readonly runtimes: WatchedRuntimes,
    private readonly notifications: ApprovalNotifications,
  ) {
    this.subscriptions.push(runtimes.onDidChange(() => this.sync()));
    this.sync();
  }

  /**
   * The approvals pending on a runtime, as last read.
   *
   * @param url - The runtime's address.
   *
   * @returns The approvals, none for a runtime not watched.
   */
  public pending(url: string): ApprovalRaised[] {
    return [...(this.entries.get(this.key(url))?.pending ?? [])];
  }

  /**
   * Every runtime watched, with its approvals.
   *
   * @returns One entry per runtime, its approvals as last read.
   */
  public all(): LocalApprovals[] {
    return [...this.entries.values()].map((entry) => ({
      url: entry.url,
      approvals: [...entry.pending],
    }));
  }

  /**
   * Decides an approval over the runtime's websocket, and says what it came
   * to once the next snapshot no longer lists it.
   *
   * @param url - The runtime's address.
   * @param id - Which approval is decided.
   * @param approved - Whether it is approved.
   *
   * @returns The sentence: done, answered elsewhere, not confirmed.
   */
  public decide(url: string, id: string, approved: boolean): Promise<string> {
    const entry = this.entries.get(this.key(url));
    if (!entry || entry.socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve(
        LOCAL_APPROVAL_WORDS.socketGone(entry?.folderName ?? url),
      );
    }
    const known = entry.pending.find((approval) => approval.id === id);
    const action = actionOf(known?.toolName ?? "");
    const settledAlready = decisionSettled(
      Boolean(known),
      entry.pending,
      id,
      approved,
      action,
    );
    if (settledAlready !== null && !known) {
      return Promise.resolve(settledAlready);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        entry.waiters = entry.waiters.filter(
          (waiter) => waiter.timer !== timer,
        );
        resolve(LOCAL_APPROVAL_WORDS.notConfirmed);
      }, DECISION_TIMEOUT_MS);
      entry.waiters.push({ id, approved, action, resolve, timer });
      ServiceLoggers.main.info("[Approvals] local decision sent", {
        id,
        approved,
      });
      entry.socket.send(decisionMessage(id, approved));
    });
  }

  /** @inheritdoc */
  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    for (const key of [...this.entries.keys()]) {
      this.forget(key);
    }
    this.changed.dispose();
  }

  /**
   * The map's key of a runtime.
   *
   * @param url - The runtime's address.
   *
   * @returns The address without its trailing slash.
   */
  private key(url: string): string {
    return url.replace(/\/+$/, "");
  }

  /** The sockets follow the runtimes: one opened per runtime, closed with it. */
  private sync(): void {
    const running = new Map(
      this.runtimes.list().map((runtime) => [this.key(runtime.url), runtime]),
    );
    for (const key of [...this.entries.keys()]) {
      if (!running.has(key)) {
        this.forget(key);
      }
    }
    for (const [key, runtime] of running) {
      if (!this.entries.has(key)) {
        this.open(key, runtime.folder.name);
      }
    }
  }

  /**
   * Opens a runtime's approvals socket and keeps its entry.
   *
   * @param url - The runtime's address.
   * @param folderName - The folder it runs for, named in the notifications.
   */
  private open(url: string, folderName: string): void {
    const socket = new WebSocket(localApprovalsSocketUrl(url, LOCAL_AGENT_ID));
    const entry: Entry = {
      url,
      folderName,
      socket,
      pending: [],
      waiters: [],
      retry: null,
      closed: false,
    };
    this.entries.set(url, entry);
    socket.on("message", (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (isSnapshot(message)) {
        this.snapshot(entry, message);
      }
    });
    socket.on("error", (error) => {
      ServiceLoggers.main.warn("[Approvals] local socket error", {
        url,
        message: error.message,
      });
    });
    socket.on("close", () => {
      for (const waiter of entry.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve(LOCAL_APPROVAL_WORDS.socketGone(folderName));
      }
      if (entry.closed || this.entries.get(url) !== entry) {
        return;
      }
      // The runtime still runs: opened again after a while.
      entry.retry = setTimeout(() => {
        if (this.entries.get(url) === entry) {
          this.entries.delete(url);
          this.sync();
        }
      }, RETRY_MS);
    });
  }

  /**
   * Closes a runtime's socket and forgets it, its waiters answered.
   *
   * @param key - The runtime's key.
   */
  private forget(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    this.entries.delete(key);
    entry.closed = true;
    if (entry.retry) {
      clearTimeout(entry.retry);
    }
    for (const waiter of entry.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve(LOCAL_APPROVAL_WORDS.socketGone(entry.folderName));
    }
    try {
      entry.socket.close();
    } catch {
      // Already gone.
    }
    this.changed.fire({ url: entry.url, approvals: [] });
  }

  /**
   * A snapshot: the pending approvals read, said, handed on; the decisions confirmed.
   *
   * @param entry - The runtime the snapshot came from.
   * @param message - The `agent.snapshot` message, parsed.
   */
  private snapshot(entry: Entry, message: unknown): void {
    entry.pending = approvalsOfSnapshot(message, LOCAL_AGENT_ID);
    for (const waiter of entry.waiters.splice(0)) {
      const said = decisionSettled(
        true,
        entry.pending,
        waiter.id,
        waiter.approved,
        waiter.action,
      );
      if (said === null) {
        entry.waiters.push(waiter);
      } else {
        clearTimeout(waiter.timer);
        waiter.resolve(said);
      }
    }
    this.notifications.raised(
      `The coding agent in ${entry.folderName}`,
      entry.pending,
      {
        decide: (id, approved) => this.decide(entry.url, id, approved),
        show: (id) => this.showInChat(id),
      },
    );
    this.changed.fire({ url: entry.url, approvals: [...entry.pending] });
  }
}
