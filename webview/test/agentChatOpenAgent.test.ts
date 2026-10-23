/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The chat's provider, opened from the Agents view and creating from its
 * picker: a runtime clicked reveals the chat and posts `open-agent` after
 * the list is read again — waiting for the page's `ready` when it does not
 * listen yet — and the picker's + (`create-runtime`) runs the Agents view's
 * own create command, then reads the list again.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenAgentRequest } from "../../src/chat/openSession";

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

const commands = vi.hoisted(() => ({
  executed: [] as string[],
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: async (command: string) => {
      commands.executed.push(command);
      return undefined;
    },
  },
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

// The editor's tools: none registered here (the registry loads the
// notebook and document packages).
vi.mock("../../src/tools/core/registration", () => ({
  registeredToolDefinitions: () => [],
  runRegisteredTool: async () => undefined,
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
  const sdk = {
    listRuntimes: vi.fn(async () => [
      {
        runtimeName: "pod-2",
        uid: "rt-2",
        ingress: "https://r1/jupyter/server/pod-2",
        token: "runtime-token",
        givenName: "Analyst",
        environmentName: "ai-agents-env",
      },
    ]),
  };
  const provider = new AgentChatViewProvider(
    { extensionMode: 3, extensionUri: "file:///ext" } as never,
    auth as never,
    sdk as never,
  );
  return { provider, sdk };
}

/** Lets the refreshes started by `resolveWebviewView` settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

const clicked: OpenAgentRequest = {
  uid: "rt-2",
  runtimeName: "pod-2",
  givenName: "Analyst",
};

describe("the chat opened from the Agents view", () => {
  beforeEach(() => {
    // Applications are not listed here: the runtimes are.
    settings.agentChat.enabled = false;
    commands.executed.length = 0;
  });

  afterEach(() => {
    settings.agentChat.enabled = true;
  });

  it("reveals the chat, and posts the agent once the page listens", async () => {
    const { provider } = makeProvider();
    const { view, posted, send } = makeView();
    provider.resolveWebviewView(view as never);

    await provider.openAgent(clicked);
    expect(commands.executed).toEqual(["datalayer.agentChat.focus"]);
    expect(posted.find((m) => m.type === "open-agent")).toBeUndefined();

    send({ type: "ready" });
    await settle();

    const agentsAt = posted.findIndex((m) => m.type === "chat-agents");
    const openAt = posted.findIndex((m) => m.type === "open-agent");
    expect(posted[openAt]).toEqual({ type: "open-agent", request: clicked });
    // The list is posted first: the runtime clicked is in it.
    expect(agentsAt).toBeGreaterThanOrEqual(0);
    expect(agentsAt).toBeLessThan(openAt);
  });

  it("listening, reads the list again, then posts the agent", async () => {
    const { provider, sdk } = makeProvider();
    const { view, posted, send } = makeView();
    provider.resolveWebviewView(view as never);
    send({ type: "ready" });
    await settle();
    const listedBefore = sdk.listRuntimes.mock.calls.length;
    posted.length = 0;

    await provider.openAgent(clicked);

    expect(commands.executed).toEqual(["datalayer.agentChat.focus"]);
    expect(sdk.listRuntimes.mock.calls.length).toBe(listedBefore + 1);
    // The list read again (deployments off: posted as none), then the agent.
    expect(posted.map((m) => m.type)).toEqual([
      "chat-deployments",
      "chat-agents",
      "open-agent",
    ]);
    expect(posted[2]).toEqual({ type: "open-agent", request: clicked });
  });

  it("the picker's + runs the Agents view's create command, then reads the list again", async () => {
    const { provider, sdk } = makeProvider();
    const { view, send } = makeView();
    provider.resolveWebviewView(view as never);
    send({ type: "ready" });
    await settle();
    const listedBefore = sdk.listRuntimes.mock.calls.length;

    send({ type: "create-runtime" });
    await settle();

    expect(commands.executed).toEqual(["datalayer.runtimes.create"]);
    expect(sdk.listRuntimes.mock.calls.length).toBe(listedBefore + 1);
  });

  it("the empty state's Create Agent still runs its own flow", async () => {
    const { provider } = makeProvider();
    const { view, send } = makeView();
    provider.resolveWebviewView(view as never);
    send({ type: "ready" });
    await settle();

    send({ type: "create-agent" });
    await settle();

    expect(commands.executed).toEqual(["datalayer.createAgent"]);
  });
});
