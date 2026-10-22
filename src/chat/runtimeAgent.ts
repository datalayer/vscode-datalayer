/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The agent the Datalayer Chat talks to on a runtime picked in its picker
 * (not a session): read from the runtime's own list (`GET /api/v1/agents`),
 * never assumed. A runtime of the person's has a `default` agent; an
 * application's kept runtime has only the application's (e.g.
 * `exchange-desk`), and asking it for `default` answers 404. The agent's own
 * transport is the protocol spoken to it.
 *
 * Pure but for {@link fetchRuntimeAgents}, which takes its fetcher: no
 * `vscode`, no React.
 *
 * @module chat/runtimeAgent
 */

import type { Protocol } from "@datalayer/agent-runtimes/lib/types/protocol";
import { agentRuntimesUrlOf } from "@datalayer/agent-runtimes/lib/portable/sessions";

/**
 * Protocols the embedded `<Chat>` component accepts. Mirrors the upstream
 * `Protocol` type exactly — a runtime allowlist, so a string read from the
 * settings or from a runtime is narrowed without an `as Protocol` cast.
 */
export const SUPPORTED_PROTOCOLS = [
  "ag-ui",
  "a2a",
  "acp",
  "vercel-ai",
  "vercel-ai-jupyter",
] as const satisfies readonly Protocol[];

/** Default applied when the person's setting is missing or unrecognized. */
export const DEFAULT_PROTOCOL: Protocol = "vercel-ai";

/**
 * Narrows the `datalayer.agentChat.protocol` setting into the upstream
 * {@link Protocol} type: {@link DEFAULT_PROTOCOL} when the value is
 * unrecognized, so the chat still mounts.
 *
 * @param raw - Protocol string read from VS Code settings.
 *
 * @returns A valid `Protocol` value.
 */
export function narrowProtocol(raw: string): Protocol {
  return isProtocol(raw) ? raw : DEFAULT_PROTOCOL;
}

function isProtocol(raw: string): raw is Protocol {
  return (SUPPORTED_PROTOCOLS as readonly string[]).includes(raw);
}

/** An agent a runtime runs, as the chat talks to it. */
export interface RuntimeAgent {
  /** The agent's id: the `agentId` of `<Chat>`. */
  id: string;
  /** Its name, for the agents' select. */
  name: string;
  /** The protocol spoken to it: its transport. */
  protocol: Protocol;
}

/** The agent to talk to on a runtime, or why none. */
export type RuntimeAgentChoice =
  | { kind: "agent"; agent: RuntimeAgent }
  | { kind: "several"; agents: RuntimeAgent[] }
  | { kind: "none"; said: string };

/** What the chat says of a runtime's agents. */
export const RUNTIME_AGENT_WORDS = {
  /** While the runtime's list is read. */
  reading: "Reading the runtime's agents…",
  /**
   * No agent runs on the runtime.
   *
   * @param runtime - The runtime's name.
   *
   * @returns The sentence.
   */
  none: (runtime: string): string => `No agent runs on ${runtime} yet.`,
  /**
   * The runtime's list could not be read.
   *
   * @param runtime - The runtime's name.
   * @param why - What went wrong.
   *
   * @returns The sentence.
   */
  failed: (runtime: string, why: string): string =>
    `Could not read the agents of ${runtime}: ${why}`,
  /** The second select's label. */
  pickLabel: "Select the runtime's agent",
  /** The second select's empty choice. */
  pickPrompt: "-- Select an agent of this runtime --",
  /** Several agents, none picked yet. */
  pickAbove: "This runtime runs several agents: select one above.",
} as const;

/**
 * Where a runtime lists its agents.
 *
 * @param ingress - The runtime's ingress.
 *
 * @returns `<agent-runtimes base>/api/v1/agents`.
 */
export function runtimeAgentsUrl(ingress: string): string {
  return `${agentRuntimesUrlOf(ingress)}/api/v1/agents`;
}

/**
 * The agent to talk to on a runtime, from its list: `default` when listed,
 * else the only one listed, else all of them for the person to pick (never
 * guessed), else a sentence. Each agent is spoken to on its own transport;
 * the setting's protocol only when the runtime names none.
 *
 * @param answer - The runtime's answer to `GET /api/v1/agents`.
 * @param runtime - The runtime's name, for the sentence.
 * @param settingsProtocol - The `datalayer.agentChat.protocol` setting.
 *
 * @returns The agent, the agents to pick from, or why none.
 *
 * @throws When the answer is not a list of agents, or an agent's transport
 *   is one the chat does not speak.
 */
export function runtimeAgentOf(
  answer: unknown,
  runtime: string,
  settingsProtocol: string,
): RuntimeAgentChoice {
  const list =
    answer && typeof answer === "object"
      ? (answer as { agents?: unknown }).agents
      : undefined;
  if (!Array.isArray(list)) {
    throw new Error(`${runtime} answered no list of agents.`);
  }
  const agents = list.map((raw): RuntimeAgent => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!id) {
      throw new Error(`${runtime} listed an agent with no id.`);
    }
    const said =
      typeof entry.transport === "string" && entry.transport
        ? entry.transport
        : typeof entry.protocol === "string" && entry.protocol
          ? entry.protocol
          : "";
    if (said && !isProtocol(said)) {
      throw new Error(
        `Agent ${id} on ${runtime} answers on ${said}, which this chat does not speak.`,
      );
    }
    return {
      id,
      name: typeof entry.name === "string" && entry.name ? entry.name : id,
      protocol: said ? (said as Protocol) : narrowProtocol(settingsProtocol),
    };
  });
  const preferred = agents.find((agent) => agent.id === "default");
  if (preferred) {
    return { kind: "agent", agent: preferred };
  }
  if (agents.length === 1) {
    return { kind: "agent", agent: agents[0]! };
  }
  if (agents.length > 1) {
    return { kind: "several", agents };
  }
  return { kind: "none", said: RUNTIME_AGENT_WORDS.none(runtime) };
}

/**
 * Reads a runtime's agents, signed with the runtime's token as the chat's
 * own requests to it are.
 *
 * @param ingress - The runtime's ingress.
 * @param token - The runtime's token; nothing signed when empty.
 * @param fetcher - What asks (the webview's bridged `fetch`).
 * @param signal - Aborts the read.
 *
 * @returns The runtime's answer.
 *
 * @throws With the status when the runtime refuses.
 */
export async function fetchRuntimeAgents(
  ingress: string,
  token: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetcher(runtimeAgentsUrl(ingress), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
