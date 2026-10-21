/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extension-host handler for the Datalayer Agent Chat webview bridge.
 *
 * The Agent Chat webview lives in a VS Code sandbox and must not make direct
 * HTTP calls to the Datalayer platform. Instead, it implements
 * `IAgentRuntimesClient` with a `BridgeAgentRuntimesClient` that posts
 * JSON messages through `postMessage`. This module is the matching
 * extension-host handler: it listens on the webview's `onDidReceiveMessage`,
 * invokes the real {@link SdkAgentRuntimesClient} (which in turn uses the
 * shared `DatalayerClient + AgentsMixin`), and posts the result back to the
 * webview correlated by `requestId`.
 *
 * Only a whitelisted set of method names is dispatched, so the webview cannot
 * reach arbitrary properties on the client instance. The whitelist mirrors
 * {@link IAgentRuntimesClient}.
 *
 * Phase 2b scope: request/response only (no streaming). Streaming support
 * (for `streamChat`) lands alongside the chat endpoint SDK coverage in a
 * follow-up phase.
 *
 * @module bridges/agentChatBridge
 */

import type { IAgentRuntimesClient } from "@datalayer/agent-runtimes/lib/client/IAgentRuntimesClient";
import { SdkAgentRuntimesClient } from "@datalayer/agent-runtimes/lib/client/SdkAgentRuntimesClient";
import { homedir } from "os";
import * as vscode from "vscode";

import type { ApprovalRaised } from "../chat/attention";
import { diffShownOf, terminalShownOf } from "../chat/sessionDisplays";
import { localSessionFolder, studioActivityUrl } from "../chat/sessionVerbs";
import type { ExtendedDatalayerClient } from "../services/core/datalayerAdapter";
import type { LocalApprovalSource } from "../services/localRuntime/localApprovalSource";
import { ServiceLoggers } from "../services/logging/loggers";
import type { ApprovalNotifications } from "../services/ui/approvalNotifications";
import type { DiffDocuments } from "../services/ui/diffDocuments";
import {
  sessionsOf,
  type SessionStatusBar,
} from "../services/ui/sessionStatusBar";
import type { SessionTerminals } from "../services/ui/sessionTerminal";

/**
 * Allowed method names the webview can invoke on the bridge. Mirrors the
 * non-streaming surface of {@link IAgentRuntimesClient}.
 *
 * This whitelist is enforced at runtime by {@link AgentChatBridgeHandler}: any
 * incoming `request` message with a `method` not in this set is rejected with
 * a response.error. This prevents the webview from reaching arbitrary
 * properties on the client instance (e.g. `constructor`, `__proto__`).
 */
export const ALLOWED_BRIDGE_METHODS: ReadonlySet<keyof IAgentRuntimesClient> =
  new Set<keyof IAgentRuntimesClient>([
    "listRunningAgents",
    "getAgentStatus",
    "pauseAgent",
    "resumeAgent",
    "getAgentCheckpoints",
    "getAgentUsage",
    "listNotifications",
    "markNotificationRead",
    "markAllNotificationsRead",
    "createEvent",
    "listEvents",
    "getEvent",
    "updateEvent",
    "getAgentOutputs",
    "getAgentOutput",
    "generateAgentOutput",
    "runEvals",
    "listEvals",
    "getEval",
    "getContextUsage",
    "getCostUsage",
    "createAgentRuntime",
  ]);

/**
 * Request envelope sent by the webview to invoke an {@link IAgentRuntimesClient}
 * method on the extension host.
 */
export interface BridgeRequestMessage {
  /** Message discriminator. */
  type: "request";
  /** Correlation ID that matches the eventual response. */
  requestId: string;
  /** Method name on {@link IAgentRuntimesClient}. Must be in the whitelist. */
  method: string;
  /** Positional arguments, forwarded as a tuple to the target method. */
  args: unknown[];
}

/**
 * Successful response envelope posted back to the webview.
 */
export interface BridgeResponseMessage {
  /** Message discriminator. */
  type: "response";
  /** Matches the `requestId` from the original request. */
  requestId: string;
  /** Structured-cloneable return value from the target method. */
  result: unknown;
}

/**
 * Error response envelope posted back to the webview when a bridge call
 * throws or is rejected.
 */
export interface BridgeResponseErrorMessage {
  /** Message discriminator. */
  type: "response.error";
  /** Matches the `requestId` from the original request. */
  requestId: string;
  /** Human-readable error message. */
  message: string;
  /** Optional stack trace (only included in development builds). */
  stack?: string;
}

/**
 * Union of every message posted from the extension host to the webview.
 */
export type BridgeOutgoingMessage =
  BridgeResponseMessage | BridgeResponseErrorMessage;

/**
 * Dispatches bridge requests from the Agent Chat webview to a real
 * {@link IAgentRuntimesClient} instance living in the extension host.
 */
export class AgentChatBridgeHandler {
  /** Underlying client used to answer bridge calls. */
  private readonly client: IAgentRuntimesClient;

  /**
   * When true, error responses include the JS stack trace. Disabled in
   * production so internal extension paths and Node module locations don't
   * leak into webview-side logs.
   */
  private readonly includeStackInErrors: boolean;

  /**
   * Wraps an existing `DatalayerClient + AgentsMixin` instance in a
   * {@link SdkAgentRuntimesClient} so the bridge can call the interface
   * methods regardless of how the SDK instance was composed.
   *
   * @param sdk - The extension's shared DatalayerClient with AgentsMixin
   *   methods, constructed in `createVSCodeDatalayer`.
   * @param extensionMode - Current extension mode. When `Development` the
   *   bridge forwards stack traces to the webview to aid debugging; in
   *   `Production` and `Test` it omits them to avoid leaking internals.
   */
  constructor(
    sdk: ExtendedDatalayerClient,
    extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Production,
  ) {
    this.client = new SdkAgentRuntimesClient(sdk);
    this.includeStackInErrors =
      extensionMode === vscode.ExtensionMode.Development;
  }

  /**
   * Attaches the handler to a webview and returns a disposable that
   * unregisters the listener.
   *
   * @param webview - The webview whose `onDidReceiveMessage` will be bound.
   *
   * @returns A disposable that detaches the listener.
   */
  public attach(webview: vscode.Webview): vscode.Disposable {
    return webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleRawMessage(webview, raw);
    });
  }

  /**
   * Entry point for every webview `postMessage`. Validates the envelope,
   * dispatches the call, and posts the response or error envelope back.
   *
   * @param webview - The webview to reply to.
   * @param raw - Raw message payload received from the webview.
   */
  private async handleRawMessage(
    webview: vscode.Webview,
    raw: unknown,
  ): Promise<void> {
    if (!this.isRequestMessage(raw)) {
      // Not one of our envelopes — ignore silently. Other handlers (theme,
      // auth) may own this message.
      return;
    }
    await this.dispatch(webview, raw);
  }

  /**
   * Type guard narrowing a raw message to a valid {@link BridgeRequestMessage}.
   *
   * @param raw - Raw payload received from the webview.
   *
   * @returns `true` if `raw` conforms to the request envelope shape.
   */
  private isRequestMessage(raw: unknown): raw is BridgeRequestMessage {
    if (raw === null || typeof raw !== "object") {
      return false;
    }
    const candidate = raw as Record<string, unknown>;
    return (
      candidate.type === "request" &&
      typeof candidate.requestId === "string" &&
      typeof candidate.method === "string" &&
      Array.isArray(candidate.args)
    );
  }

  /**
   * Validates the method name against the whitelist, invokes it on the
   * underlying client, and sends the response envelope back to the webview.
   *
   * @param webview - Webview to reply on.
   * @param message - Validated request envelope.
   */
  private async dispatch(
    webview: vscode.Webview,
    message: BridgeRequestMessage,
  ): Promise<void> {
    const { requestId, method, args } = message;

    if (!this.isAllowedMethod(method)) {
      this.postError(
        webview,
        requestId,
        `Method "${method}" is not allowed on the Agent Chat bridge.`,
      );
      return;
    }

    try {
      ServiceLoggers.main.debug("[AgentChatBridge] rpc", {
        direction: "→",
        method,
        argCount: args.length,
      });
      // Typed lookup: because `method` has been narrowed to a key of
      // IAgentRuntimesClient, this index access is type-safe.
      const fn = this.client[method] as (
        ...fnArgs: unknown[]
      ) => Promise<unknown>;
      const result = await fn.apply(this.client, args);
      ServiceLoggers.main.debug("[AgentChatBridge] rpc", {
        direction: "←",
        method,
        outcome: "ok",
      });
      const response: BridgeResponseMessage = {
        type: "response",
        requestId,
        result,
      };
      void webview.postMessage(response);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ServiceLoggers.main.warn("[AgentChatBridge] rpc FAILED", {
        method,
        message: err.message,
      });
      this.postError(
        webview,
        requestId,
        err.message,
        this.includeStackInErrors ? err.stack : undefined,
      );
    }
  }

  /**
   * Runtime whitelist check. Also narrows `method` to `keyof
   * IAgentRuntimesClient` for the subsequent typed index access.
   *
   * @param method - Untrusted method name from the webview.
   *
   * @returns `true` when the method is an allowed bridge method.
   */
  private isAllowedMethod(
    method: string,
  ): method is keyof IAgentRuntimesClient {
    return ALLOWED_BRIDGE_METHODS.has(method as keyof IAgentRuntimesClient);
  }

  /**
   * Posts a {@link BridgeResponseErrorMessage} back to the webview.
   *
   * @param webview - Webview to reply on.
   * @param requestId - Request correlation ID.
   * @param message - Human-readable error message.
   * @param stack - Optional stack trace. Only forwarded when the extension
   *   is running in Development mode; callers must gate this themselves.
   */
  private postError(
    webview: vscode.Webview,
    requestId: string,
    message: string,
    stack?: string,
  ): void {
    const response: BridgeResponseErrorMessage = {
      type: "response.error",
      requestId,
      message,
      stack,
    };
    void webview.postMessage(response);
  }
}

// ---------------------------------------------------------------------------
// The editor's surfaces of a session: approvals, diffs, terminals, the
// status bar.
// ---------------------------------------------------------------------------

/**
 * What the chat posts about a session, and what the extension host answers:
 *
 * - `approval-raised {app, sessionKey, approvals}` — the approvals the
 *   chat's banner holds now; each new one is said as an editor notification.
 * - `approval-shown {ids}` — the chat showed these whole: a decision from
 *   the notification is allowed.
 * - `approval-decide {requestId, id, approved}` (host → chat) — the
 *   notification's decision: the chat reads the approval again and sends it
 *   through the one route, then answers `approval-decided {requestId, said}`.
 * - `focus-approval {id}` (host → chat) — *Show*: the chat focused on it.
 * - `open-diff {display, harness, turn, local}` — a diff row's *Open in the
 *   editor*, or a write's approval: opened in the diff view.
 * - `terminal-output {sessionKey, title, display}` — a terminal display as
 *   it stands: written to the session's terminal.
 * - `session-state {sessions}` — the chat's sessions (the one in front):
 *   the status bar and the finished turns.
 * - `session-ended {sessionKey}` — its terminal disposed.
 * - `local-approval-decide {url, id, approved}` — the banner's decision on
 *   a local session, sent over the runtime's websocket (VS-07); the host
 *   posts `local-approvals {url, approvals}` as each runtime's change.
 */
export type SessionSurfaceMessage =
  | {
      type: "approval-raised";
      app: string;
      sessionKey: string;
      approvals: ApprovalRaised[];
    }
  | { type: "approval-shown"; ids: string[] }
  | { type: "approval-decided"; requestId: string; said: string }
  | {
      type: "open-diff";
      display: unknown;
      harness?: string;
      turn?: number;
      local: boolean;
    }
  | {
      type: "terminal-output";
      sessionKey: string;
      title: string;
      display: unknown;
    }
  | { type: "session-state"; sessions: unknown }
  | { type: "session-ended"; sessionKey: string }
  | { type: "reveal-session"; uid: string }
  | { type: "open-studio"; appUid: string }
  | {
      type: "local-approval-decide";
      url: string;
      id: string;
      approved: boolean;
    };

/** The services a session's surfaces are drawn with. */
export interface SessionSurfaceServices {
  diffs: DiffDocuments;
  terminals: SessionTerminals;
  approvals: ApprovalNotifications;
  statusBar: SessionStatusBar;
  /** The local runtimes' approvals, decided over their websockets (VS-07). */
  localApprovals?: LocalApprovalSource;
}

/** How long the chat has to answer a decision asked of it. */
const DECISION_TIMEOUT_MS = 20_000;

/** The internal command answering the surfaces' services (the extension-host suite's). */
export const SESSION_SURFACES_COMMAND = "datalayer.internal.sessions.surfaces";

/** The view the chat lives in, focused on *Show*. */
const CHAT_VIEW_FOCUS_COMMAND = "datalayerAgentChatView.focus";

/**
 * Handles the chat's session-surface messages for one webview, and asks the
 * chat to send the decisions taken from a notification.
 */
export class SessionSurfacesHandler {
  /** The decisions asked of the chat, by request id. */
  private readonly decisions = new Map<
    string,
    { resolve: (said: string) => void; timer: NodeJS.Timeout }
  >();

  private count = 0;

  /**
   * @param services - The editor's surfaces.
   */
  constructor(private readonly services: SessionSurfaceServices) {}

  /**
   * Attaches to a webview; detached by the disposable returned.
   *
   * @param webview - The chat's webview.
   *
   * @returns A disposable that detaches the listener.
   */
  public attach(webview: vscode.Webview): vscode.Disposable {
    const listener = webview.onDidReceiveMessage((raw: unknown) => {
      void this.handle(webview, raw);
    });
    return {
      dispose: () => {
        listener.dispose();
        for (const pending of this.decisions.values()) {
          clearTimeout(pending.timer);
          pending.resolve("The chat went away before answering.");
        }
        this.decisions.clear();
      },
    };
  }

  /**
   * Whether a raw message is one of the session-surface messages.
   *
   * @param raw - What the webview posted.
   *
   * @returns Whether it is one of them.
   */
  public static isSurfaceMessage(raw: unknown): raw is SessionSurfaceMessage {
    if (raw === null || typeof raw !== "object") {
      return false;
    }
    const type = (raw as { type?: unknown }).type;
    return (
      type === "approval-raised" ||
      type === "approval-shown" ||
      type === "approval-decided" ||
      type === "open-diff" ||
      type === "terminal-output" ||
      type === "session-state" ||
      type === "session-ended" ||
      type === "reveal-session" ||
      type === "open-studio" ||
      type === "local-approval-decide"
    );
  }

  /**
   * Draws what one message asks: a notification, the diff view, the
   * terminal, the status bar.
   *
   * @param webview - The chat's webview, answered on a decision.
   * @param raw - What the webview posted.
   */
  private async handle(webview: vscode.Webview, raw: unknown): Promise<void> {
    if (!SessionSurfacesHandler.isSurfaceMessage(raw)) {
      return;
    }
    const { terminals, approvals, statusBar } = this.services;
    switch (raw.type) {
      case "approval-raised":
        this.raised(webview, raw);
        return;
      case "approval-shown":
        approvals.shownInChat(
          Array.isArray(raw.ids)
            ? raw.ids.filter((id): id is string => typeof id === "string")
            : [],
        );
        return;
      case "approval-decided": {
        const pending = this.decisions.get(raw.requestId);
        if (pending) {
          this.decisions.delete(raw.requestId);
          clearTimeout(pending.timer);
          pending.resolve(
            typeof raw.said === "string" && raw.said
              ? raw.said
              : "The decision was sent.",
          );
        }
        return;
      }
      case "open-diff":
        await this.openDiff(raw);
        return;
      case "terminal-output": {
        const display = terminalShownOf(raw.display);
        if (display && typeof raw.sessionKey === "string" && raw.sessionKey) {
          terminals.write(
            raw.sessionKey,
            typeof raw.title === "string" ? raw.title : "",
            display,
          );
        }
        return;
      }
      case "session-state":
        statusBar.observed("chat", sessionsOf(raw.sessions));
        return;
      case "session-ended":
        if (typeof raw.sessionKey === "string") {
          terminals.end(raw.sessionKey);
        }
        return;
      case "reveal-session":
      case "open-studio":
        await this.elsewhere(raw);
        return;
      case "local-approval-decide": {
        // The banner's decision on a local session: sent over the
        // runtime's websocket; the next snapshot redraws the banner.
        const source = this.services.localApprovals;
        if (
          source &&
          typeof raw.url === "string" &&
          typeof raw.id === "string" &&
          typeof raw.approved === "boolean"
        ) {
          const said = await source.decide(raw.url, raw.id, raw.approved);
          ServiceLoggers.main.info("[Approvals] local decision", {
            id: raw.id,
            said,
          });
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * The thread's menu entries VS Code adds: *Reveal in Explorer* (a local
   * session's folder in the file store) and *Open in the Studio* (the
   * application's Activity page, in the browser).
   *
   * @param raw - Which, and for what.
   */
  private async elsewhere(
    raw: Extract<
      SessionSurfaceMessage,
      { type: "reveal-session" } | { type: "open-studio" }
    >,
  ): Promise<void> {
    if (raw.type === "reveal-session") {
      if (typeof raw.uid !== "string" || !/^[A-Za-z0-9_-]+$/.test(raw.uid)) {
        return;
      }
      const folder = localSessionFolder(
        homedir(),
        raw.uid,
        process.env.AGENT_RUNTIMES_SESSIONS_PATH,
      );
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(folder),
      );
      return;
    }
    if (typeof raw.appUid === "string" && raw.appUid) {
      await vscode.env.openExternal(
        vscode.Uri.parse(studioActivityUrl(raw.appUid)),
      );
    }
  }

  /**
   * A diff row's *Open in the editor*: opened in the diff view, a refusal
   * said.
   *
   * @param raw - The diff posted, and where it comes from.
   */
  private async openDiff(
    raw: Extract<SessionSurfaceMessage, { type: "open-diff" }>,
  ): Promise<void> {
    const display = diffShownOf(raw.display);
    if (!display) {
      ServiceLoggers.main.warn("[Diff] a row that does not read as a diff");
      return;
    }
    try {
      await this.services.diffs.open({
        display,
        harness: typeof raw.harness === "string" ? raw.harness : "",
        turn: typeof raw.turn === "number" ? raw.turn : 0,
        local: raw.local === true,
      });
    } catch (error) {
      void vscode.window.showWarningMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * The approvals the chat's banner holds now, each new one said as a
   * notification whose decision is asked back of the chat.
   *
   * @param webview - The chat's webview.
   * @param raw - The approvals posted.
   */
  private raised(
    webview: vscode.Webview,
    raw: Extract<SessionSurfaceMessage, { type: "approval-raised" }>,
  ): void {
    const listed = Array.isArray(raw.approvals) ? raw.approvals : [];
    this.services.approvals.raised(
      typeof raw.app === "string" && raw.app ? raw.app : "The application",
      listed.filter(
        (approval) =>
          approval &&
          typeof approval === "object" &&
          typeof approval.id === "string" &&
          typeof approval.toolName === "string",
      ),
      {
        decide: (id, approved) => this.askDecision(webview, id, approved),
        show: (id) => {
          void vscode.commands.executeCommand(CHAT_VIEW_FOCUS_COMMAND);
          void webview.postMessage({ type: "focus-approval", id });
        },
      },
    );
  }

  /**
   * Asks the chat to decide an approval through its route, and waits for
   * what it says.
   *
   * @param webview - The chat's webview.
   * @param id - The approval to decide.
   * @param approved - Whether to approve it.
   *
   * @returns The sentence the chat answered, or that it did not answer.
   */
  private askDecision(
    webview: vscode.Webview,
    id: string,
    approved: boolean,
  ): Promise<string> {
    this.count += 1;
    const requestId = `decision-${this.count}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.decisions.delete(requestId)) {
          resolve("The chat did not answer in time: decide it there.");
        }
      }, DECISION_TIMEOUT_MS);
      this.decisions.set(requestId, { resolve, timer });
      void webview.postMessage({
        type: "approval-decide",
        requestId,
        id,
        approved,
      });
    });
  }
}
