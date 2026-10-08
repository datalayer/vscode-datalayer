/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A deployed application's agent in VS Code (STUDIO A-18): the picker's
 * choices from ai-agents' deployments, the session API's address, the
 * Appspec's host terms (D-10, D-21), `host_context`, the transcript's lines
 * (A-06), the approvals (R-05) and what the host signs for the view.
 */

import {
  agUiEndpoint,
  appHostOf,
  appItemUrl,
  behaviourOf,
  decideApprovalUrl,
  deploymentChoicesOf,
  deploymentsUrl,
  EDITOR_TEXT_LIMIT,
  editorContextOf,
  editorContextRefusal,
  fetchUserToken,
  hostContextTool,
  isRunOf,
  noneTalkableSentence,
  pendingApprovalsOf,
  pendingApprovalsUrl,
  pickedHandleOf,
  revisionRefusal,
  signedPrefixesOf,
  signedRunFetch,
  signedUserFresh,
  signedUserOf,
  signsRequest,
  SURFACE,
  takesSignedUser,
  talkableKeyOf,
  toolLineOf,
  userTokenRefusal,
  userTokenUrl,
  withUserToken,
} from "../../src/chat/appChat";

const running = {
  uid: "d1",
  app_uid: "app-1",
  app_name: "Support Desk",
  version: 3,
  target: "hosted",
  slug: "support-desk",
  state: "live",
  always_on: true,
  kept: {
    state: "running",
    url: "https://r1.datalayer.run/agent-runtimes/pool/pod-1/",
    agent_id: "support-desk-d1",
  },
};

/** An application's Spacer item as Spacer answers it. */
const item = (spec: Record<string, unknown>, revision = 3) => ({
  document: {
    name_t: "Support Desk",
    model_s: JSON.stringify({
      format: "loop.app.item/v1",
      spec: { schema: "loop.app/v1", name: "Support Desk", ...spec },
      state: { revision },
    }),
  },
});

describe("the picker's choices", () => {
  it("talks to a deployment kept always on, on a running runtime", () => {
    const [choice] = deploymentChoicesOf({ deployments: [running] });
    expect(choice).toEqual({
      kind: "talk",
      handle: {
        uid: "d1",
        appUid: "app-1",
        name: "Support Desk",
        version: 3,
        target: "hosted",
        slug: "support-desk",
        url: "https://r1.datalayer.run/agent-runtimes/pool/pod-1",
        agentId: "support-desk-d1",
      },
    });
  });

  it("says why the others are not talked to, and lists them last", () => {
    const choices = deploymentChoicesOf({
      deployments: [
        { ...running, uid: "p", state: "paused" },
        { ...running, uid: "off", always_on: false },
        {
          ...running,
          uid: "down",
          kept: { state: "waiting", why: "Its computer could not be started." },
        },
        running,
        { nothing: true },
      ],
    });
    expect(choices.map((c) => c.kind)).toEqual([
      "talk",
      "closed",
      "closed",
      "closed",
    ]);
    const why = choices.flatMap((c) => (c.kind === "closed" ? [c.why] : []));
    expect(why).toEqual([
      "Support Desk is paused.",
      "Support Desk is not kept always on, so no runtime holds its agent: turn on Always on in its Ship tab to talk to it here.",
      "Support Desk is kept always on, but its runtime is not running: Its computer could not be started.",
    ]);
  });

  it("reads nothing from an answer that lists nothing", () => {
    expect(deploymentChoicesOf({})).toEqual([]);
    expect(deploymentChoicesOf(null)).toEqual([]);
  });
});

describe("the addresses", () => {
  it("asks ai-agents, Spacer and the runtime's session API", () => {
    expect(deploymentsUrl("https://r1.datalayer.run/")).toBe(
      "https://r1.datalayer.run/api/ai-agents/v1/apps/deployments",
    );
    expect(appItemUrl("https://prod1.datalayer.run", "app 1")).toBe(
      "https://prod1.datalayer.run/api/spacer/v1/lexicals/app%201",
    );
    expect(
      agUiEndpoint({ url: "https://r1/agent-runtimes/p/", agentId: "a/b" }),
    ).toBe("https://r1/agent-runtimes/p/api/v1/apps/agents/a%2Fb/ag-ui/");
    expect(pendingApprovalsUrl("https://r1", "agent-1")).toBe(
      "https://r1/api/ai-agents/v1/tool-approvals?agent_id=agent-1&status=pending",
    );
    expect(decideApprovalUrl("https://r1", "x1", true)).toBe(
      "https://r1/api/ai-agents/v1/tool-approvals/x1/approve",
    );
    expect(decideApprovalUrl("https://r1", "x1", false)).toBe(
      "https://r1/api/ai-agents/v1/tool-approvals/x1/reject",
    );
  });
});

describe("the Appspec's host terms", () => {
  it("reads what the host passes, who its user is, its rules and connections", () => {
    const host = appHostOf(
      item({
        deployment: {
          embedded: {
            host: {
              context: ["page", "user", "Bad Name"],
              functions: [{ name: "open_ticket", description: "Opens" }],
            },
          },
        },
        rules: [{ action: "Read", applies_to: ["read"], behaviour: "do_it" }],
        connections: [{ server: "odoo-accounting", tools: ["aged_balance"] }],
      }),
    );
    expect(host).toEqual({
      name: "Support Desk",
      revision: 3,
      context: ["page", "user"],
      user: "claimed",
      functions: ["open_ticket"],
      rules: [{ appliesTo: ["read"], behaviour: "do_it" }],
      connections: [{ server: "odoo-accounting", tools: ["aged_balance"] }],
    });
  });

  it("refuses an item that holds no Appspec", () => {
    expect(() => appHostOf({ document: { model_s: "{}" } })).toThrow(
      "The application holds no Appspec that can be read: open it in the Studio and save it.",
    );
    expect(() => appHostOf({})).toThrow();
  });

  it("decides on the version deployed only, and signs a signed user (D-21)", () => {
    const signed = appHostOf(
      item({ deployment: { embedded: { host: { user: "signed" } } } }),
    );
    const handle = { name: "Support Desk", version: 3 };
    expect(revisionRefusal(handle, signed)).toBe("");
    expect(takesSignedUser(signed)).toBe(true);
    expect(takesSignedUser(appHostOf(item({})))).toBe(false);
    // Another version's Appspec decides nothing: closed, never guessed.
    const later = appHostOf(
      item({ deployment: { embedded: { host: { user: "claimed" } } } }, 4),
    );
    expect(revisionRefusal(handle, later)).toBe(
      "Support Desk runs version 3, and its Appspec read is version 4: what the version it runs says of its host and its user is not known, so it is not opened here. Deploy the version you are at to talk to it here.",
    );
    expect(
      userTokenRefusal(
        "Support Desk",
        "Only the members of its owner's organization may open it, and you are not one of them.",
      ),
    ).toBe(
      "Support Desk takes only a signed user (deployment.embedded.host.user: signed), and Datalayer did not sign you for it: Only the members of its owner's organization may open it, and you are not one of them.",
    );
  });

  it("reads the editor only when the deployed version names the page", () => {
    const handle = { name: "Support Desk", version: 3 };
    const page = item({
      deployment: { embedded: { host: { context: ["page"] } } },
    });
    expect(editorContextRefusal(handle, appHostOf(page))).toBe("");
    expect(editorContextRefusal(handle, appHostOf(item({})))).toBe(
      "Support Desk does not let its host pass the page (deployment.embedded.host.context), so your editor is not read.",
    );
    const later = item(
      { deployment: { embedded: { host: { context: ["page"] } } } },
      4,
    );
    expect(editorContextRefusal(handle, appHostOf(later))).toBe(
      "Support Desk runs version 3, and its Appspec read is version 4: what the deployed version lets its host pass is not known, so your editor is not read.",
    );
  });
});

describe("host_context (D-10)", () => {
  const file = {
    path: "src/app.py",
    language: "python",
    text: "print('hi')",
  };

  it("passes the open file as page and the person as user", async () => {
    const host = appHostOf(
      item({
        deployment: {
          embedded: { host: { context: ["page", "user", "plan"] } },
        },
        rules: [{ action: "Read", applies_to: ["read"], behaviour: "do_it" }],
      }),
    );
    const tool = hostContextTool(
      host,
      async () => editorContextOf(file, "hi"),
      { handle: "ada" },
    );
    expect(tool?.name).toBe("host_context");
    expect(tool?.location).toBe("frontend");
    expect(await tool?.handler({})).toEqual({
      values: {
        page: {
          path: "src/app.py",
          language: "python",
          text: "print('hi')",
          truncated: false,
          selection: "hi",
        },
        user: { handle: "ada", signed: false },
      },
      unsaid: ["plan"],
    });
  });

  it("says the page unsaid when no file is open", async () => {
    const host = appHostOf(
      item({
        deployment: { embedded: { host: { context: ["page"] } } },
        rules: [
          {
            action: "It",
            applies_to: ["host_context"],
            behaviour: "ask_first",
          },
        ],
      }),
    );
    const tool = hostContextTool(host, async () => undefined, null);
    expect(await tool?.handler({})).toEqual({ values: {}, unsaid: ["page"] });
  });

  it("is refused when no rule lets it run, or one leaves it to the person", async () => {
    const none = appHostOf(
      item({ deployment: { embedded: { host: { context: ["page"] } } } }),
    );
    const read = vi.fn(async () => editorContextOf(file));
    expect(await hostContextTool(none, read, null)?.handler({})).toEqual({
      error:
        "No rule of this application lets host_context run: it is left to the person, and VS Code passed nothing.",
    });
    const left = appHostOf(
      item({
        deployment: { embedded: { host: { context: ["page"] } } },
        rules: [
          { action: "Read", applies_to: ["read"], behaviour: "do_it" },
          {
            action: "It",
            applies_to: ["host_context"],
            behaviour: "leave_to_me",
          },
        ],
      }),
    );
    expect(behaviourOf(left, "host_context")).toBe("leave_to_me");
    expect(await hostContextTool(left, read, null)?.handler({})).toHaveProperty(
      "error",
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("is not given when the Appspec names nothing passed", () => {
    expect(
      hostContextTool(appHostOf(item({})), async () => undefined, null),
    ).toBeUndefined();
  });

  it("cuts a long file", () => {
    const long = editorContextOf({
      ...file,
      text: "x".repeat(EDITOR_TEXT_LIMIT + 5),
    });
    expect(long.text).toHaveLength(EDITOR_TEXT_LIMIT);
    expect(long.truncated).toBe(true);
    expect(editorContextOf(file, "   ")).not.toHaveProperty("selection");
  });
});

describe("the transcript's lines (A-06)", () => {
  const host = {
    connections: [
      { server: "odoo-accounting", tools: [] },
      { server: "earthdata", tools: ["search_granules"] },
    ],
  };

  it("names the server of the connection the tool is of", () => {
    expect(toolLineOf("Desk", "odoo_accounting_aged_balance", host)).toBe(
      "Desk → odoo-accounting: odoo_accounting_aged_balance",
    );
    expect(toolLineOf("Desk", "search_granules", host)).toBe(
      "Desk → earthdata: search_granules",
    );
  });

  it("says its runtime for a tool of no connection, VS Code for host_context", () => {
    expect(toolLineOf("Desk", "execute_code", host)).toBe(
      "Desk → its runtime: execute_code",
    );
    expect(toolLineOf("Desk", "host_context", host)).toBe(
      "Desk → VS Code: host_context",
    );
    expect(toolLineOf("Desk", "x", undefined)).toBe("Desk → its runtime: x");
  });
});

describe("approvals (R-05)", () => {
  it("lists the agent's pending approvals, oldest first", () => {
    const body = {
      approvals: [
        {
          id: "b",
          agent_id: "agent-1",
          tool_name: "send_mail",
          tool_args: { to: "x" },
          status: "pending",
          created_at: "2026-10-07T10:01:00Z",
        },
        {
          id: "a",
          agent_id: "agent-1",
          tool_name: "delete_row",
          note: "Deletes a row",
          status: "pending",
          created_at: "2026-10-07T10:00:00Z",
        },
        { id: "c", agent_id: "agent-2", status: "pending" },
        { id: "d", agent_id: "agent-1", status: "approved" },
      ],
    };
    expect(pendingApprovalsOf(body, "agent-1")).toEqual([
      {
        id: "a",
        toolName: "delete_row",
        toolDescription: "Deletes a row",
        args: {},
        agentId: "agent-1",
        requestedAt: "2026-10-07T10:00:00Z",
      },
      {
        id: "b",
        toolName: "send_mail",
        args: { to: "x" },
        agentId: "agent-1",
        requestedAt: "2026-10-07T10:01:00Z",
      },
    ]);
  });
});

describe("what the host signs with the person's token", () => {
  const prefixes = signedPrefixesOf(
    [{ url: "https://r1.datalayer.run/agent-runtimes/pool/pod-1" }],
    {
      aiAgentsUrl: "https://r1.datalayer.run",
      spacerUrl: "https://prod1.datalayer.run/",
    },
  );

  it("signs the kept runtime, Tool Approvals and Spacer's items", () => {
    for (const url of [
      "https://r1.datalayer.run/agent-runtimes/pool/pod-1/api/v1/apps/agents/a/ag-ui/",
      "https://r1.datalayer.run/api/ai-agents/v1/tool-approvals?agent_id=a&status=pending",
      "https://r1.datalayer.run/api/ai-agents/v1/tool-approvals/x/approve",
      "https://prod1.datalayer.run/api/spacer/v1/lexicals/app-1",
    ]) {
      expect(signsRequest(url, prefixes)).toBe(true);
    }
  });

  it("signs nothing else", () => {
    for (const url of [
      "https://r1.datalayer.run/agent-runtimes/pool/pod-2/api/v1/apps/agents/a/ag-ui/",
      "https://r1.datalayer.run/agent-runtimes/pool/pod-1/../pod-2/api",
      "https://r1.datalayer.run/api/ai-agents/v1/apps/deployments",
      "https://r1.datalayer.run.evil.example/agent-runtimes/pool/pod-1/x",
      "http://r1.datalayer.run/agent-runtimes/pool/pod-1/x",
      "https://user:pw@r1.datalayer.run/agent-runtimes/pool/pod-1/x",
      "not a url",
    ]) {
      expect(signsRequest(url, prefixes)).toBe(false);
    }
  });
});

describe("the review of 2026-10-07: live only, the version said, a signed user signed", () => {
  it("offers only a live deployment that says the version it runs", () => {
    const choices = deploymentChoicesOf({
      deployments: [
        { ...running, uid: "gone", state: "deleted" },
        { ...running, uid: "none", state: undefined },
        { ...running, uid: "nov", version: undefined },
        { ...running, uid: "bad-version", version: "3" },
        { ...running, uid: "zero", version: 0 },
      ],
    });
    expect(choices.every((choice) => choice.kind === "closed")).toBe(true);
    expect(
      choices.flatMap((c) => (c.kind === "closed" ? [c.why] : [])),
    ).toEqual([
      "Support Desk is not live (deleted), so it is not offered here.",
      "Support Desk is not live, so it is not offered here.",
      `Support Desk does not say which version it runs, so what it lets ${SURFACE} do is not known: it is not offered here.`,
      `Support Desk does not say which version it runs, so what it lets ${SURFACE} do is not known: it is not offered here.`,
      `Support Desk does not say which version it runs, so what it lets ${SURFACE} do is not known: it is not offered here.`,
    ]);
  });

  it("says why none can be talked to, whatever the reason", () => {
    expect(noneTalkableSentence([])).toBe(
      "You have no deployed applications: ship one from the Studio's Ship tab to talk to it here.",
    );
    const closed = deploymentChoicesOf({
      deployments: [
        { ...running, uid: "p", state: "paused" },
        { ...running, uid: "down", kept: { state: "stopped" } },
      ],
    });
    expect(noneTalkableSentence(closed)).toBe(
      "None of your applications can be talked to here now: each one says why — paused, not kept always on, or its runtime not running.",
    );
    expect(
      noneTalkableSentence(deploymentChoicesOf({ deployments: [running] })),
    ).toBe("");
  });

  it("keeps the conversation through a refresh, and takes the newest handle", () => {
    const first = deploymentChoicesOf({ deployments: [running] });
    const same = deploymentChoicesOf({ deployments: [{ ...running }] });
    expect(talkableKeyOf(first)).toBe(talkableKeyOf(same));
    const moved = deploymentChoicesOf({
      deployments: [
        {
          ...running,
          version: 4,
          kept: {
            ...running.kept,
            url: "https://r1.datalayer.run/agent-runtimes/pool/pod-9",
            agent_id: "a9",
          },
        },
      ],
    });
    expect(talkableKeyOf(moved)).not.toBe(talkableKeyOf(first));
    expect(pickedHandleOf(moved, "d1")).toMatchObject({
      version: 4,
      url: "https://r1.datalayer.run/agent-runtimes/pool/pod-9",
      agentId: "a9",
    });
    expect(pickedHandleOf(moved, "other")).toBeNull();
    expect(pickedHandleOf(moved, null)).toBeNull();
  });

  it("signs a request under a prefix however its origin is spelled", () => {
    const prefixes = signedPrefixesOf(
      [{ url: "https://R1.DATALAYER.RUN:443/agent-runtimes/pool/pod-1" }],
      {
        aiAgentsUrl: "https://r1.datalayer.run:443",
        spacerUrl: "https://Prod1.Datalayer.Run",
      },
    );
    expect(
      signsRequest(
        "https://r1.datalayer.run/agent-runtimes/pool/pod-1/api/v1/configure",
        prefixes,
      ),
    ).toBe(true);
    expect(
      signsRequest(
        "https://r1.datalayer.run/api/ai-agents/v1/tool-approvals?agent_id=a",
        prefixes,
      ),
    ).toBe(true);
    expect(
      signsRequest(
        "https://prod1.datalayer.run/api/spacer/v1/lexicals/app-1",
        prefixes,
      ),
    ).toBe(true);
    expect(
      signsRequest(
        "https://r1.datalayer.run/agent-runtimes/pool/pod-2/x",
        prefixes,
      ),
    ).toBe(false);
  });

  it("asks ai-agents to sign the person, with their own token", async () => {
    expect(userTokenUrl("https://r1.datalayer.run/", "d 1")).toBe(
      "https://r1.datalayer.run/api/ai-agents/v1/apps/deployments/d%201/user-token",
    );
    const asked: Array<[string, RequestInit]> = [];
    const answer =
      (status: number, body: unknown) =>
      async (url: string, init: RequestInit) => {
        asked.push([url, init]);
        return new Response(JSON.stringify(body), { status });
      };
    const signed = await fetchUserToken(
      "https://r1.datalayer.run",
      "d1",
      "tok",
      answer(200, { user_token: "u.t.k", exp: 2000 }),
    );
    expect(signed).toEqual({ token: "u.t.k", exp: 2000 });
    expect(asked[0][0]).toBe(
      "https://r1.datalayer.run/api/ai-agents/v1/apps/deployments/d1/user-token",
    );
    expect(asked[0][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer tok" },
    });
    await expect(
      fetchUserToken(
        "https://r1.datalayer.run",
        "d1",
        "tok",
        answer(403, { detail: "Only a person is signed as themselves." }),
      ),
    ).rejects.toThrow("Only a person is signed as themselves.");
    await expect(
      fetchUserToken("https://r1.datalayer.run", "d1", "tok", answer(500, {})),
    ).rejects.toThrow("ai-agents refused to sign you (500).");
    expect(() => signedUserOf({})).toThrow("ai-agents answered no user token.");
    expect(signedUserFresh({ token: "t", exp: 1000 }, 900)).toBe(true);
    expect(signedUserFresh({ token: "t", exp: 1000 }, 950)).toBe(false);
    expect(signedUserFresh(null, 0)).toBe(false);
  });

  it("sends the user token with the agent's runs only", async () => {
    const handle = {
      url: "https://r1.datalayer.run/agent-runtimes/pool/pod-1",
      agentId: "a b",
    };
    const run = agUiEndpoint(handle);
    expect(isRunOf(run, "POST", handle)).toBe(true);
    expect(isRunOf(run, "GET", handle)).toBe(false);
    expect(
      isRunOf(
        "https://r1.datalayer.run/agent-runtimes/pool/pod-1/api/v1/configure",
        "POST",
        handle,
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        withUserToken(
          JSON.stringify({ threadId: "t", forwardedProps: null }),
          "u.t.k",
        ),
      ),
    ).toEqual({
      threadId: "t",
      forwardedProps: { loop: { user_token: "u.t.k" } },
    });
    expect(
      JSON.parse(
        withUserToken(
          JSON.stringify({
            forwardedProps: { voice: 1, loop: { modes: ["x"] } },
          }),
          "u",
        ),
      ).forwardedProps,
    ).toEqual({ voice: 1, loop: { modes: ["x"], user_token: "u" } });
    expect(withUserToken("not json", "u")).toBe("not json");
    expect(withUserToken("[1]", "u")).toBe("[1]");
    const sent: Array<[string, RequestInit | undefined]> = [];
    const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push([String(input), init]);
      return new Response("{}");
    }) as typeof fetch;
    let asked = 0;
    const wrapped = signedRunFetch(base, handle, async () => {
      asked += 1;
      return "u.t.k";
    });
    await wrapped(run, {
      method: "POST",
      body: JSON.stringify({ threadId: "t" }),
    });
    await wrapped(
      "https://r1.datalayer.run/agent-runtimes/pool/pod-1/api/v1/configure",
      { method: "POST", body: "{}" },
    );
    await wrapped("https://example.com/x");
    expect(
      JSON.parse(String(sent[0][1]?.body)).forwardedProps.loop.user_token,
    ).toBe("u.t.k");
    expect(sent[1][1]?.body).toBe("{}");
    expect(sent[2][1]).toBeUndefined();
    expect(asked).toBe(1);
  });
});
