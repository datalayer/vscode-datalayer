/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for the Agent Chat webview bundle.
 *
 * Sets up the webpack CSP nonce for async chunk loading, creates the
 * bridge transport to the extension host, and renders the {@link App}
 * component.
 *
 * @module webview/agentChat/index
 */

// Tell webpack which nonce to use for dynamically injected <script> tags
// (async chunks loaded via React.lazy). The nonce value is set by the
// HTML template before this bundle executes.
// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
declare let __webpack_nonce__: string | undefined;
// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase, prefer-const
__webpack_nonce__ = (window as unknown as { __webpack_nonce__?: string })
  .__webpack_nonce__;

import React from "react";
import { createRoot } from "react-dom/client";

import {
  type AgentChatAuthState,
  type AgentChatSettings,
  type ChatAgentHandle,
  App,
} from "./App";
import {
  BridgeAgentRuntimesClient,
  createBridgeTransport,
} from "./bridgeClient";
// All ESM `import` declarations above are evaluated before this file's
// top-level statements, so `installNetworkBridge()` does NOT actually run
// before `./App` and `./bridgeClient` are loaded. That is intentionally
// fine here: neither of those modules calls `fetch()` or constructs a
// `WebSocket` at module-eval time. The heavy `<Chat>` component (and
// every protocol adapter inside `@datalayer/agent-runtimes`) is imported
// lazily via `React.lazy` from `App.tsx`, so it is evaluated only after
// `installNetworkBridge(vscode)` runs below — by which time `window.fetch`
// and `window.WebSocket` already point at the bridged implementations.
//
// If a future change introduces a module-level `fetch`/`WebSocket` call
// in any of the eagerly-imported modules, split this entry into a tiny
// bootstrap that installs the bridge and then `import()`s the rest.
import { installNetworkBridge } from "./networkBridge";

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

/**
 * Resolves the initial VS Code theme from body class names.
 *
 * @returns The current theme tag.
 */
function getInitialTheme(): "light" | "dark" {
  const isDark =
    document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast");
  return isDark ? "dark" : "light";
}

const vscode = acquireVsCodeApi();

// Install the fetch/WebSocket overrides first so any module imported below
// that uses the globals gets the bridged versions.
installNetworkBridge(vscode);

// Create the bridge transport and client.
const transport = createBridgeTransport(vscode);
const bridgeClient = new BridgeAgentRuntimesClient(transport.request);

let currentTheme: "light" | "dark" = getInitialTheme();
let currentAuth: AgentChatAuthState = { authenticated: false, user: null };
let currentSettings: AgentChatSettings | null = null;
let currentAgents: ChatAgentHandle[] | null = null;
let currentAgentsError: string | null = null;
// True between the user clicking "Create Agent" and the next `chat-agents`
// message arriving — provisioning is async (5–30s) and the toast that VS
// Code shows lives at the screen edge, so we surface a spinner inside the
// sidebar so the empty state doesn't look frozen.
let creatingAgent = false;

const container = document.getElementById("root");
if (!container) {
  throw new Error("Agent Chat webview root element not found");
}
const root = createRoot(container);

/**
 * Posts a control message to the extension host.
 *
 * @param type - The message type string.
 */
function postControl(type: string): void {
  vscode.postMessage({ type });
}

/** Requests an agent list refresh from the extension host. */
function handleRefreshAgents(): void {
  // Intentionally do NOT clear `currentAgents` here. Setting it to `null`
  // would briefly drop the App into the "Loading agents..." branch, which
  // unmounts the active `<Chat>` and aborts in-flight conversations. By
  // keeping the previous list visible, the dropdown updates in place when
  // the new `chat-agents` message arrives without disturbing a connected
  // chat session.
  currentAgentsError = null;
  postControl("refresh-agents");
}

/** Requests the extension host to open the Create Agent flow. */
function handleCreateAgent(): void {
  // Flip into the "provisioning" state immediately. The extension awaits
  // both the spec picker and the runtime spin-up before it triggers the
  // refresh that arrives as `chat-agents` below — that's where we clear
  // this flag.
  creatingAgent = true;
  postControl("create-agent");
  render();
}

/** Requests the extension host to start the Datalayer sign-in flow. */
function handleLogin(): void {
  postControl("login");
}

/** Re-renders the React tree with current state. */
function render(): void {
  root.render(
    <App
      theme={currentTheme}
      auth={currentAuth}
      settings={currentSettings}
      agents={currentAgents}
      agentsError={currentAgentsError}
      client={bridgeClient}
      creatingAgent={creatingAgent}
      onRefreshAgents={handleRefreshAgents}
      onCreateAgent={handleCreateAgent}
      onLogin={handleLogin}
    />,
  );
}

window.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown };
  if (
    data === null ||
    typeof data !== "object" ||
    typeof data.type !== "string"
  ) {
    return;
  }

  switch (data.type) {
    case "theme-change": {
      currentTheme = (data as { theme: "light" | "dark" }).theme;
      render();
      break;
    }
    case "auth-state": {
      const msg = data as {
        authenticated: boolean;
        user: { handle: string; email: string } | null;
      };
      currentAuth = { authenticated: msg.authenticated, user: msg.user };
      render();
      break;
    }
    case "chat-settings": {
      const msg = data as { protocol: string; agentSpecId: string };
      currentSettings = {
        protocol: msg.protocol,
        agentSpecId: msg.agentSpecId,
      };
      render();
      break;
    }
    case "chat-agents": {
      const msg = data as {
        agents: ChatAgentHandle[];
        error: string | null;
      };
      currentAgents = msg.agents;
      currentAgentsError = msg.error;
      // Any `chat-agents` push terminates the provisioning state — whether
      // the new agent succeeded, the user cancelled the spec picker, or
      // the API errored. The toast surface VS Code shows separately is
      // authoritative for success/failure messaging; here we just need to
      // clear the spinner so the user can see the resulting state.
      creatingAgent = false;
      render();
      break;
    }
    default:
      break;
  }
});

// When the webview is torn down (extension reload, view disposed), make
// sure the bridge transport detaches its message listener and rejects any
// pending RPCs so they don't hang forever in the lost webview context.
window.addEventListener("unload", () => {
  transport.dispose();
});

render();
