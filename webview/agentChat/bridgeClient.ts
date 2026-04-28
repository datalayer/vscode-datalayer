/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Webview-side {@link IAgentRuntimesClient} implementation that proxies every
 * call to the extension host via `postMessage`.
 *
 * The extension host listens with
 * `AgentChatBridgeHandler` and answers with a response envelope
 * correlated by request ID. This file exposes:
 *
 * - {@link BridgeAgentRuntimesClient} — the `IAgentRuntimesClient`
 *   implementation used inside the Agent Chat webview.
 * - {@link createBridgeTransport} — factory that wires the VS Code
 *   `postMessage` plumbing and returns a typed `request` function used by
 *   the class.
 *
 * Phase 2b scope: request/response only. Streaming support (for
 * `streamChat`) lands in a follow-up phase when the SDK grows typed
 * streaming methods.
 *
 * @module webview/agentChat/bridgeClient
 */

import type { IAgentRuntimesClient } from "@datalayer/agent-runtimes/lib/client/IAgentRuntimesClient";
import type { RunningAgent } from "@datalayer/agent-runtimes/lib/types/agents";
import type {
  CreateAgentRuntimeRequest,
  CreateRuntimeApiResponse,
} from "@datalayer/agent-runtimes/lib/types/agents-lifecycle";
import type { ConversationCheckpoint } from "@datalayer/agent-runtimes/lib/types/checkpoints";
import type { CostUsage } from "@datalayer/agent-runtimes/lib/types/cost";
import type {
  EvalReport,
  RunEvalsRequest,
} from "@datalayer/agent-runtimes/lib/types/evals";
import type {
  AgentEvent,
  CreateAgentEventRequest,
  GetAgentEventResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  UpdateAgentEventRequest,
} from "@datalayer/agent-runtimes/lib/types/events";
import type {
  AgentNotification,
  NotificationFilters,
} from "@datalayer/agent-runtimes/lib/types/notifications";
import type { OutputArtifact } from "@datalayer/agent-runtimes/lib/types/outputs";
import type {
  AgentUsageSummary,
  ContextUsage,
} from "@datalayer/agent-runtimes/lib/types/usage";

/**
 * Typed dispatcher used by {@link BridgeAgentRuntimesClient} to post a
 * request to the extension host and resolve with the typed result.
 */
export type BridgeRequestFn = <TResult>(
  method: keyof IAgentRuntimesClient,
  args: unknown[],
) => Promise<TResult>;

/**
 * Opaque transport object returned by {@link createBridgeTransport}. Owns the
 * VS Code webview API handle and a map of pending requests keyed by
 * correlation ID.
 */
export interface BridgeTransport {
  /** Sends a request envelope and resolves with the typed result. */
  request: BridgeRequestFn;
  /** Disposes the message listener. */
  dispose(): void;
}

/**
 * Minimal shape of the VS Code webview API object returned by
 * `acquireVsCodeApi()`. Declared here to avoid coupling this file to the
 * project's internal message handler module.
 */
export interface VsCodeApiLike {
  /** Posts a message to the extension host. */
  postMessage(message: unknown): void;
}

/** Pending request state tracked while waiting for a response envelope. */
interface PendingRequest {
  /** Resolves the awaiting promise with the typed result. */
  resolve: (value: unknown) => void;
  /** Rejects the awaiting promise with an error. */
  reject: (error: Error) => void;
  /** Timeout handle so long-stuck requests fail loudly. */
  timeout: ReturnType<typeof setTimeout>;
}

/** Default timeout for a bridge request before it is rejected. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Creates a bridge transport bound to the given VS Code webview API handle.
 *
 * The transport installs a single `message` listener on `window` that
 * correlates incoming response envelopes to outstanding requests by ID, and
 * returns a typed `request` function plus a `dispose` method that detaches
 * the listener.
 *
 * @param vscode - The object returned by `acquireVsCodeApi()`.
 *
 * @returns A {@link BridgeTransport} that can answer typed bridge requests.
 */
export function createBridgeTransport(vscode: VsCodeApiLike): BridgeTransport {
  const pending = new Map<string, PendingRequest>();
  let counter = 0;

  const listener = (event: MessageEvent): void => {
    const data = event.data as
      | {
          type: "response";
          requestId: string;
          result: unknown;
        }
      | {
          type: "response.error";
          requestId: string;
          message: string;
          stack?: string;
        }
      | { type: string };

    if (
      data === null ||
      typeof data !== "object" ||
      typeof (data as { type?: unknown }).type !== "string"
    ) {
      return;
    }

    if (data.type === "response" || data.type === "response.error") {
      const id = (data as { requestId: string }).requestId;
      const entry = pending.get(id);
      if (!entry) {
        return;
      }
      pending.delete(id);
      clearTimeout(entry.timeout);
      if (data.type === "response") {
        entry.resolve((data as { result: unknown }).result);
      } else {
        const errorMsg = data as { message: string; stack?: string };
        const err = new Error(
          errorMsg.message || "Bridge request failed without a message",
        );
        // Forward the stack trace from the extension host (only present in
        // Development mode — `AgentChatBridgeHandler` strips it in
        // Production). Helps debug RPC failures from the webview side.
        if (errorMsg.stack) {
          err.stack = errorMsg.stack;
        }
        entry.reject(err);
      }
    }
  };

  window.addEventListener("message", listener);

  const request: BridgeRequestFn = <TResult>(
    method: keyof IAgentRuntimesClient,
    args: unknown[],
  ): Promise<TResult> => {
    counter += 1;
    const requestId = `agentChat-${Date.now()}-${counter}`;
    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            `Bridge request "${method}" timed out after ${DEFAULT_TIMEOUT_MS}ms`,
          ),
        );
      }, DEFAULT_TIMEOUT_MS);

      pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      vscode.postMessage({
        type: "request",
        requestId,
        method,
        args,
      });
    });
  };

  return {
    request,
    dispose: () => {
      window.removeEventListener("message", listener);
      for (const entry of pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(new Error("Bridge transport disposed"));
      }
      pending.clear();
    },
  };
}

/**
 * {@link IAgentRuntimesClient} implementation used inside the Agent Chat
 * webview. Each method is a one-line wrapper that forwards to the transport
 * created by {@link createBridgeTransport}.
 */
export class BridgeAgentRuntimesClient implements IAgentRuntimesClient {
  /**
   * Constructs the client.
   *
   * @param request - Typed request dispatcher returned by
   *   {@link createBridgeTransport}.
   */
  constructor(private readonly request: BridgeRequestFn) {}

  /** @inheritdoc */
  listRunningAgents(): Promise<RunningAgent[]> {
    return this.request<RunningAgent[]>("listRunningAgents", []);
  }

  /** @inheritdoc */
  getAgentStatus(podName: string, agentId?: string): Promise<RunningAgent> {
    return this.request<RunningAgent>("getAgentStatus", [podName, agentId]);
  }

  /** @inheritdoc */
  pauseAgent(podName: string): Promise<void> {
    return this.request<void>("pauseAgent", [podName]);
  }

  /** @inheritdoc */
  resumeAgent(podName: string): Promise<void> {
    return this.request<void>("resumeAgent", [podName]);
  }

  /** @inheritdoc */
  getAgentCheckpoints(
    podName: string,
    agentId?: string,
  ): Promise<ConversationCheckpoint[]> {
    return this.request<ConversationCheckpoint[]>("getAgentCheckpoints", [
      podName,
      agentId,
    ]);
  }

  /** @inheritdoc */
  getAgentUsage(podName: string, agentId?: string): Promise<AgentUsageSummary> {
    return this.request<AgentUsageSummary>("getAgentUsage", [podName, agentId]);
  }

  /** @inheritdoc */
  listNotifications(
    filters?: NotificationFilters,
  ): Promise<AgentNotification[]> {
    return this.request<AgentNotification[]>("listNotifications", [filters]);
  }

  /** @inheritdoc */
  markNotificationRead(notificationId: string): Promise<void> {
    return this.request<void>("markNotificationRead", [notificationId]);
  }

  /** @inheritdoc */
  markAllNotificationsRead(): Promise<void> {
    return this.request<void>("markAllNotificationsRead", []);
  }

  /** @inheritdoc */
  createEvent(
    data: CreateAgentEventRequest,
  ): Promise<{ success: boolean; event: AgentEvent }> {
    return this.request<{ success: boolean; event: AgentEvent }>(
      "createEvent",
      [data],
    );
  }

  /** @inheritdoc */
  listEvents(
    agentId: string,
    params?: Omit<ListAgentEventsParams, "agent_id">,
  ): Promise<ListAgentEventsResponse> {
    return this.request<ListAgentEventsResponse>("listEvents", [
      agentId,
      params,
    ]);
  }

  /** @inheritdoc */
  getEvent(agentId: string, eventId: string): Promise<GetAgentEventResponse> {
    return this.request<GetAgentEventResponse>("getEvent", [agentId, eventId]);
  }

  /** @inheritdoc */
  updateEvent(
    agentId: string,
    eventId: string,
    data: UpdateAgentEventRequest,
  ): Promise<GetAgentEventResponse> {
    return this.request<GetAgentEventResponse>("updateEvent", [
      agentId,
      eventId,
      data,
    ]);
  }

  /** @inheritdoc */
  getAgentOutputs(agentId: string): Promise<OutputArtifact[]> {
    return this.request<OutputArtifact[]>("getAgentOutputs", [agentId]);
  }

  /** @inheritdoc */
  getAgentOutput(agentId: string, outputId: string): Promise<OutputArtifact> {
    return this.request<OutputArtifact>("getAgentOutput", [agentId, outputId]);
  }

  /** @inheritdoc */
  generateAgentOutput(
    agentId: string,
    format: string,
    options?: Record<string, unknown>,
  ): Promise<OutputArtifact> {
    return this.request<OutputArtifact>("generateAgentOutput", [
      agentId,
      format,
      options,
    ]);
  }

  /** @inheritdoc */
  runEvals(agentId: string, request: RunEvalsRequest): Promise<EvalReport> {
    return this.request<EvalReport>("runEvals", [agentId, request]);
  }

  /** @inheritdoc */
  listEvals(agentId: string): Promise<EvalReport[]> {
    return this.request<EvalReport[]>("listEvals", [agentId]);
  }

  /** @inheritdoc */
  getEval(agentId: string, evalId: string): Promise<EvalReport> {
    return this.request<EvalReport>("getEval", [agentId, evalId]);
  }

  /** @inheritdoc */
  getContextUsage(agentId: string): Promise<ContextUsage> {
    return this.request<ContextUsage>("getContextUsage", [agentId]);
  }

  /** @inheritdoc */
  getCostUsage(agentId: string): Promise<CostUsage> {
    return this.request<CostUsage>("getCostUsage", [agentId]);
  }

  /** @inheritdoc */
  createAgentRuntime(
    data: CreateAgentRuntimeRequest,
  ): Promise<CreateRuntimeApiResponse> {
    return this.request<CreateRuntimeApiResponse>("createAgentRuntime", [data]);
  }
}
