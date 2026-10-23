/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The editor's tools of the Agent Chat sidebar, on the extension host's
 * side: the provider lists the registered notebook and document tools to
 * the view (`document-tools`) and runs a call of one on a Datalayer editor
 * — the active tab, else the one of its kind focused last, or the one the
 * page located before — through the same registry Copilot's calls go
 * through, handing it the editor so its webview messages go to that
 * editor's panel (`document-tool-call` -> `document-tool-result`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  agentChat: {
    protocol: "vercel-ai",
    agentSpecId: "codeai/simple",
    enabled: true,
  },
  services: {
    aiAgentsUrl: "https://ai-agents.test",
    spacerUrl: "https://spacer.test",
  },
}));

const registry = vi.hoisted(() => ({
  registeredToolDefinitions: () => [
    {
      name: "datalayer_insertCell",
      description: "Insert a cell",
      parameters: { type: "object", properties: {} },
      tags: ["cell", "notebook", "insert"],
      config: { invocationMessage: () => "not posted" },
    },
    {
      name: "datalayer_readBlock",
      description: "Read a block",
      parameters: { type: "object", properties: {} },
      tags: ["lexical", "read", "block"],
    },
    {
      name: "datalayer_createNotebook",
      description: "Create",
      parameters: { type: "object", properties: {} },
      tags: ["notebook", "create"],
    },
  ],
  runRegisteredTool: vi.fn(
    async (_name: string, _input: unknown): Promise<unknown> =>
      "cell 2 inserted",
  ),
}));

const active = vi.hoisted(() => ({
  info: undefined as
    { uri: { toString: () => string }; editorType: string } | undefined,
}));

// The Datalayer editors open, as the document registry tracks them.
const opened = vi.hoisted(() => ({
  editors: [] as Array<{
    documentUri: string;
    type: "notebook" | "lexical";
    focusedAt: number;
  }>,
}));

vi.mock("../../src/extension", () => ({
  getServiceContainer: () => ({
    documentRegistry: { openEditors: () => opened.editors },
  }),
}));

vi.mock("vscode", () => ({
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
  // The provider holds an emitter for `session-changed`; never fired here.
  EventEmitter: class {
    event = () => ({ dispose: () => undefined });
    fire() {
      return undefined;
    }
    dispose() {
      return undefined;
    }
  },
  window: {
    onDidChangeActiveColorTheme: () => ({ dispose: () => undefined }),
    activeTextEditor: {
      document: {
        uri: "file:///work/secret.py",
        languageId: "python",
        getText: () => "token = 'x'",
      },
      selection: { isEmpty: true },
    },
  },
  workspace: {
    onDidChangeConfiguration: () => ({ dispose: () => undefined }),
    asRelativePath: () => "secret.py",
  },
}));

vi.mock("../../src/services/config/settingsValidator", () => ({
  getValidatedSettingsGroup: (group: "agentChat" | "services") =>
    settings[group],
}));

vi.mock("../../src/bridges/agentChatBridge", () => ({
  AgentChatBridgeHandler: class {
    attach() {
      return { dispose: () => undefined };
    }
  },
}));

vi.mock("../../src/bridges/agentChatNetworkBridge", () => ({
  AgentChatNetworkBridge: class {
    attach() {
      return { dispose: () => undefined };
    }
  },
}));

vi.mock("../../src/services/logging/loggers", () => ({
  ServiceLoggers: {
    main: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  },
}));

// The registry Copilot's tools are registered in, and the active editor.
vi.mock("../../src/tools/core/registration", () => registry);

vi.mock("../../src/utils/activeDocument", () => ({
  getActiveDocumentInfo: () => active.info,
}));

vi.mock("../../src/ui/templates/agentChatTemplate", () => ({
  getAgentChatHtml: () => "<html></html>",
}));

import { AgentChatViewProvider } from "../../src/providers/agentChatViewProvider";

/** A sidebar view whose posted messages are kept. */
function makeView() {
  const posted: Array<Record<string, unknown>> = [];
  let receive: (message: unknown) => void = () => undefined;
  const view = {
    visible: false,
    webview: {
      options: {},
      html: "",
      postMessage: async (message: Record<string, unknown>) => {
        posted.push(message);
        return true;
      },
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        receive = listener;
        return { dispose: () => undefined };
      },
    },
    onDidChangeVisibility: () => ({ dispose: () => undefined }),
    onDidDispose: () => ({ dispose: () => undefined }),
  };
  return { view, posted, send: (message: unknown) => receive(message) };
}

/** A provider signed in, with no runtime. */
function makeProvider() {
  const auth = {
    isAuthenticated: () => true,
    getToken: () => "person-token",
    getAuthState: () => ({ isAuthenticated: true, user: null }),
    onAuthStateChanged: () => ({ dispose: () => undefined }),
  };
  const sdk = { listRuntimes: vi.fn(async () => []) };
  const provider = new AgentChatViewProvider(
    { extensionMode: 3, extensionUri: "file:///ext" } as never,
    auth as never,
    sdk as never,
  );
  return { provider, sdk };
}

/** Lets the refreshes started by `resolveWebviewView` settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

/** A provider resolved on a view that said it listens. */
async function openChat() {
  const { provider } = makeProvider();
  const made = makeView();
  provider.resolveWebviewView(made.view as never);
  made.send({ type: "ready" });
  await settle();
  await settle();
  return made;
}

const notebook = (uri: string) => ({
  uri: { toString: () => uri },
  editorType: "datalayer-notebook",
});

describe("the editor's tools of the chat", () => {
  afterEach(() => {
    active.info = undefined;
    opened.editors = [];
    registry.runRegisteredTool.mockClear();
  });

  it("lists the registered notebook and document tools, serializable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deployments: [] }),
      })),
    );
    const { posted } = await openChat();
    vi.unstubAllGlobals();
    const listed = posted.find((m) => m.type === "document-tools");
    expect(listed?.tools).toEqual([
      {
        name: "datalayer_insertCell",
        description: "Insert a cell",
        parameters: { type: "object", properties: {} },
        writes: true,
        target: "notebook",
      },
      {
        name: "datalayer_readBlock",
        description: "Read a block",
        parameters: { type: "object", properties: {} },
        writes: false,
        target: "lexical",
      },
    ]);
  });

  it("runs a call on the active Datalayer notebook and names it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deployments: [] }),
      })),
    );
    const { posted, send } = await openChat();
    vi.unstubAllGlobals();
    active.info = notebook("file:///work/My%20Analysis.ipynb");
    send({
      type: "document-tool-call",
      requestId: "t1",
      name: "datalayer_insertCell",
      args: { source: "1+1", cells: '[{"a":1}]' },
    });
    await settle();
    await settle();
    expect(registry.runRegisteredTool).toHaveBeenCalledWith(
      "datalayer_insertCell",
      { source: "1+1", cells: [{ a: 1 }] },
      { uri: "file:///work/My%20Analysis.ipynb", kind: "notebook" },
    );
    expect(posted.find((m) => m.type === "document-tool-result")).toEqual({
      type: "document-tool-result",
      requestId: "t1",
      outcome: {
        editor: {
          kind: "notebook",
          name: "My Analysis.ipynb",
          uri: "file:///work/My%20Analysis.ipynb",
        },
        result: "cell 2 inserted",
      },
    });
  });

  it("refuses, saying why, with no Datalayer editor of its kind active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deployments: [] }),
      })),
    );
    const { posted, send } = await openChat();
    vi.unstubAllGlobals();
    active.info = notebook("file:///work/a.ipynb");
    send({
      type: "document-tool-call",
      requestId: "t2",
      name: "datalayer_readBlock",
      args: {},
    });
    await settle();
    await settle();
    send({
      type: "document-tool-call",
      requestId: "t3",
      name: "datalayer_createNotebook",
      args: {},
    });
    await settle();
    await settle();
    expect(registry.runRegisteredTool).not.toHaveBeenCalled();
    const results = posted.filter((m) => m.type === "document-tool-result");
    expect(results.find((m) => m.requestId === "t2")?.outcome).toEqual({
      error: expect.stringContaining("No Datalayer document (.dlex)"),
    });
    expect(results.find((m) => m.requestId === "t3")?.outcome).toEqual({
      error: "datalayer_createNotebook is not a tool of VS Code's editors.",
    });
  });

  it("says a tool's failure in the outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deployments: [] }),
      })),
    );
    const { posted, send } = await openChat();
    vi.unstubAllGlobals();
    active.info = notebook("file:///work/a.ipynb");
    registry.runRegisteredTool.mockRejectedValueOnce(
      new Error("Tool execution timeout (30s): insertCell"),
    );
    send({
      type: "document-tool-call",
      requestId: "t4",
      name: "datalayer_insertCell",
      args: {},
    });
    await settle();
    await settle();
    expect(
      posted.find((m) => m.type === "document-tool-result")?.outcome,
    ).toEqual({
      editor: {
        kind: "notebook",
        name: "a.ipynb",
        uri: "file:///work/a.ipynb",
      },
      error: "Tool execution timeout (30s): insertCell",
    });
  });

  /** Sends a call and returns its outcome. */
  async function outcomeOf(
    send: (message: unknown) => void,
    posted: Array<Record<string, unknown>>,
    message: Record<string, unknown>,
  ) {
    send({ type: "document-tool-call", args: {}, ...message });
    await settle();
    await settle();
    return posted.find(
      (m) =>
        m.type === "document-tool-result" && m.requestId === message.requestId,
    )?.outcome;
  }

  async function quietChat() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deployments: [] }),
      })),
    );
    const made = await openChat();
    vi.unstubAllGlobals();
    return made;
  }

  it("runs on the notebook focused last when the active tab is no Datalayer editor, routed to it", async () => {
    const { posted, send } = await quietChat();
    // Focus moved into the chat sidebar or a Python file: no Datalayer tab active.
    active.info = {
      uri: { toString: () => "file:///work/x.py" },
      editorType: "other",
    };
    opened.editors = [
      { documentUri: "file:///work/a.ipynb", type: "notebook", focusedAt: 2 },
      { documentUri: "file:///work/b.ipynb", type: "notebook", focusedAt: 5 },
      { documentUri: "file:///work/c.dlex", type: "lexical", focusedAt: 9 },
    ];
    const outcome = await outcomeOf(send, posted, {
      requestId: "t5",
      name: "datalayer_insertCell",
    });
    expect(registry.runRegisteredTool).toHaveBeenCalledWith(
      "datalayer_insertCell",
      {},
      { uri: "file:///work/b.ipynb", kind: "notebook" },
    );
    expect(outcome).toEqual({
      editor: {
        kind: "notebook",
        name: "b.ipynb",
        uri: "file:///work/b.ipynb",
      },
      note: expect.stringContaining("b.ipynb is not the active tab"),
      result: "cell 2 inserted",
    });
  });

  it("only says the editor when asked to locate, running nothing", async () => {
    const { posted, send } = await quietChat();
    opened.editors = [
      { documentUri: "file:///work/c.dlex", type: "lexical", focusedAt: 1 },
    ];
    const outcome = await outcomeOf(send, posted, {
      requestId: "t6",
      name: "datalayer_readBlock",
      locate: true,
    });
    expect(registry.runRegisteredTool).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      editor: { kind: "lexical", name: "c.dlex", uri: "file:///work/c.dlex" },
      note: expect.stringContaining("c.dlex"),
    });
  });

  it("runs on the editor located before, and refuses once it was closed", async () => {
    const { posted, send } = await quietChat();
    // Another notebook came to the front after the person approved.
    active.info = notebook("file:///work/other.ipynb");
    opened.editors = [
      { documentUri: "file:///work/a.ipynb", type: "notebook", focusedAt: 1 },
      {
        documentUri: "file:///work/other.ipynb",
        type: "notebook",
        focusedAt: 2,
      },
    ];
    await outcomeOf(send, posted, {
      requestId: "t7",
      name: "datalayer_insertCell",
      target: "file:///work/a.ipynb",
    });
    expect(registry.runRegisteredTool).toHaveBeenLastCalledWith(
      "datalayer_insertCell",
      {},
      { uri: "file:///work/a.ipynb", kind: "notebook" },
    );
    registry.runRegisteredTool.mockClear();
    opened.editors = opened.editors.slice(1);
    const outcome = await outcomeOf(send, posted, {
      requestId: "t8",
      name: "datalayer_insertCell",
      target: "file:///work/a.ipynb",
    });
    expect(registry.runRegisteredTool).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      error: expect.stringContaining("a.ipynb was closed"),
    });
  });

  it("tells the agent to ask for a notebook when none is open", async () => {
    const { posted, send } = await quietChat();
    const outcome = await outcomeOf(send, posted, {
      requestId: "t9",
      name: "datalayer_insertCell",
    });
    expect(registry.runRegisteredTool).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      error: expect.stringContaining("ask the person to open one"),
    });
  });
});
