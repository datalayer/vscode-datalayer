/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * `datalayer.agentChat.enabled` (STUDIO A-18): off, the Agent Chat sidebar
 * lists no deployment, asks ai-agents nothing and never reads the open file;
 * on, it lists the deployments as before. Its default (off) is checked by
 * the extension tests (`src/test/services/settingsValidator.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  agentChat: {
    protocol: "vercel-ai",
    agentSpecId: "codeai/simple",
    enabled: false,
  },
  services: {
    aiAgentsUrl: "https://ai-agents.test",
    spacerUrl: "https://spacer.test",
  },
}));

vi.mock("vscode", () => ({
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
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

describe("datalayer.agentChat.enabled", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        deployments: [
          {
            uid: "dep-1",
            app_name: "Support Desk",
            state: "live",
            version: 2,
            always_on: false,
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    settings.agentChat.enabled = false;
  });

  it("off, lists no deployment and asks ai-agents nothing", async () => {
    const { provider, sdk } = makeProvider();
    const { view, posted } = makeView();
    provider.resolveWebviewView(view as never);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.listRuntimes).toHaveBeenCalled();
    const deployments = posted.filter((m) => m.type === "chat-deployments");
    expect(deployments.length).toBeGreaterThan(0);
    for (const message of deployments) {
      expect(message.deployments).toBeNull();
      expect(message.error).toBeNull();
    }
  });

  it("off, never reads the open file nor signs for a deployment", async () => {
    const { provider } = makeProvider();
    const { view, posted, send } = makeView();
    provider.resolveWebviewView(view as never);
    await settle();

    send({ type: "editor-context-request", requestId: "r1" });
    send({
      type: "user-token-request",
      requestId: "r2",
      deploymentUid: "dep-1",
    });
    await settle();

    expect(posted.find((m) => m.type === "editor-context")).toEqual({
      type: "editor-context",
      requestId: "r1",
      context: null,
    });
    const signed = posted.find((m) => m.type === "user-token");
    expect(signed?.error).toEqual(expect.any(String));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("on, lists the deployments; one not kept always on is closed, saying why", async () => {
    settings.agentChat.enabled = true;
    const { provider } = makeProvider();
    const { view, posted } = makeView();
    provider.resolveWebviewView(view as never);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "https://ai-agents.test/",
    );
    const listed = posted.filter(
      (m) => m.type === "chat-deployments" && Array.isArray(m.deployments),
    );
    expect(listed[listed.length - 1]?.deployments).toEqual([
      {
        kind: "closed",
        uid: "dep-1",
        name: "Support Desk",
        why: "Support Desk is not kept always on, so no runtime holds its agent: turn on Always on in its Ship tab to talk to it here.",
      },
    ]);
  });
});
