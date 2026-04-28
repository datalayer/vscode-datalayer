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
import * as vscode from "vscode";

import type { ExtendedDatalayerClient } from "../services/core/datalayerAdapter";
import { ServiceLoggers } from "../services/logging/loggers";

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
  | BridgeResponseMessage
  | BridgeResponseErrorMessage;

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
