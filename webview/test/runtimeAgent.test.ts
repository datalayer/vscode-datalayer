/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A runtime picked in the chat's picker (not a session): the agent talked to
 * is read from the runtime's own list — `default` when listed, else the only
 * one, else the person picks, else a sentence — on its own transport.
 */

import {
  RUNTIME_AGENT_WORDS,
  fetchRuntimeAgents,
  narrowProtocol,
  runtimeAgentOf,
  runtimeAgentsUrl,
} from "../../src/chat/runtimeAgent";

describe("the agent talked to on a runtime picked", () => {
  it("prefers default when the runtime lists it", () => {
    expect(
      runtimeAgentOf(
        {
          agents: [
            { id: "helper", name: "Helper", transport: "ag-ui" },
            { id: "default", name: "Default", transport: "vercel-ai" },
          ],
        },
        "pod-1",
        "vercel-ai",
      ),
    ).toEqual({
      kind: "agent",
      agent: { id: "default", name: "Default", protocol: "vercel-ai" },
    });
  });

  it("talks to the only agent of an application's kept runtime", () => {
    expect(
      runtimeAgentOf(
        {
          agents: [
            {
              id: "exchange-desk",
              name: "Exchange desk",
              status: "running",
              transport: "ag-ui",
            },
          ],
        },
        "pod-1",
        "vercel-ai",
      ),
    ).toEqual({
      kind: "agent",
      agent: { id: "exchange-desk", name: "Exchange desk", protocol: "ag-ui" },
    });
  });

  it("lists several agents for the person to pick, none guessed", () => {
    expect(
      runtimeAgentOf(
        {
          agents: [
            { id: "a", name: "A", transport: "ag-ui" },
            { id: "b", transport: "a2a" },
          ],
        },
        "pod-1",
        "vercel-ai",
      ),
    ).toEqual({
      kind: "several",
      agents: [
        { id: "a", name: "A", protocol: "ag-ui" },
        { id: "b", name: "b", protocol: "a2a" },
      ],
    });
  });

  it("says no agent runs on the runtime when none is listed", () => {
    expect(runtimeAgentOf({ agents: [] }, "my-runtime", "vercel-ai")).toEqual({
      kind: "none",
      said: "No agent runs on my-runtime yet.",
    });
    expect(RUNTIME_AGENT_WORDS.none("my-runtime")).toBe(
      "No agent runs on my-runtime yet.",
    );
  });

  it("honours the agent's transport over the setting", () => {
    const one = (entry: Record<string, unknown>) =>
      runtimeAgentOf({ agents: [entry] }, "pod-1", "vercel-ai");
    expect(one({ id: "x", transport: "ag-ui" })).toMatchObject({
      agent: { protocol: "ag-ui" },
    });
    // `protocol` is the older name the runtime also gives.
    expect(one({ id: "x", protocol: "a2a" })).toMatchObject({
      agent: { protocol: "a2a" },
    });
    expect(one({ id: "x", transport: "ag-ui", protocol: "a2a" })).toMatchObject(
      { agent: { protocol: "ag-ui" } },
    );
    // The setting only when the runtime names no transport.
    expect(
      runtimeAgentOf({ agents: [{ id: "x" }] }, "pod-1", "vercel-ai-jupyter"),
    ).toMatchObject({ agent: { protocol: "vercel-ai-jupyter" } });
  });

  it("refuses a transport the chat does not speak, and an answer that is no list", () => {
    expect(() =>
      runtimeAgentOf(
        { agents: [{ id: "x", transport: "mcp-ui" }] },
        "pod-1",
        "vercel-ai",
      ),
    ).toThrow(
      "Agent x on pod-1 answers on mcp-ui, which this chat does not speak.",
    );
    expect(() => runtimeAgentOf({ detail: "nope" }, "pod-1", "ag-ui")).toThrow(
      "pod-1 answered no list of agents.",
    );
    expect(() =>
      runtimeAgentOf({ agents: [{ name: "x" }] }, "pod-1", "ag-ui"),
    ).toThrow("pod-1 listed an agent with no id.");
  });
});

describe("reading a runtime's agents", () => {
  it("asks the agent-runtimes base of the ingress", () => {
    expect(
      runtimeAgentsUrl("https://r1.datalayer.run/jupyter/server/pool/pod-1/"),
    ).toBe("https://r1.datalayer.run/agent-runtimes/pool/pod-1/api/v1/agents");
    expect(runtimeAgentsUrl("http://127.0.0.1:41231")).toBe(
      "http://127.0.0.1:41231/api/v1/agents",
    );
  });

  it("signs with the runtime's token, and says the status on a refusal", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const answer = { agents: [{ id: "default" }] };
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(answer), { status: 200 });
    };
    await expect(
      fetchRuntimeAgents("https://r1/agent-runtimes/pod-1", "tok", fetcher),
    ).resolves.toEqual(answer);
    expect(calls[0]!.url).toBe("https://r1/agent-runtimes/pod-1/api/v1/agents");
    expect(calls[0]!.init.headers).toEqual({ Authorization: "Bearer tok" });

    await expect(
      fetchRuntimeAgents(
        "https://r1/agent-runtimes/pod-1",
        "tok",
        async () => new Response("", { status: 404, statusText: "Not Found" }),
      ),
    ).rejects.toThrow("HTTP 404: Not Found");
  });

  it("narrows the setting, the default for an unknown one", () => {
    expect(narrowProtocol("ag-ui")).toBe("ag-ui");
    expect(narrowProtocol("nonsense")).toBe("vercel-ai");
  });
});
