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
 * @module webview/agentChat/main
 */

import React from "react";
import { createRoot } from "react-dom/client";

import type { AppChatChoice, EditorContext } from "../../src/chat/appChat";
import type { ApprovalRaised } from "../../src/chat/attention";
import type { TranscriptLine } from "../../src/chat/sessionRecord";
import type { OpenSessionRequest } from "../../src/chat/sessionVerbs";
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
// The network bridge (every `fetch` and `WebSocket` of this page tunnelled
// through the extension host) is installed by `./index`, the entry, before
// this module and anything it imports is evaluated: an import here may
// capture the globals at module-eval time and still get the bridged ones.
import {
  handleHostSurfaceMessage,
  installSessionSurfaces,
} from "./sessionSurfaces";
import { vscode } from "./vscodeApi";

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

// The editor's surfaces of a session (approvals, diffs, terminals, the
// status bar) are drawn by the extension host from what the chat posts.
installSessionSurfaces(vscode);

// Create the bridge transport and client.
const transport = createBridgeTransport(vscode);
const bridgeClient = new BridgeAgentRuntimesClient(transport.request);

let currentTheme: "light" | "dark" = getInitialTheme();

/**
 * The shared Datalayer theme store, which the chat reads for its theme (the
 * store's default is the Matrix theme): set to the `vscode` theme in the
 * editor's color mode, so the chat and its icons wear the editor's own
 * colours, as every other view of the extension does. Loaded lazily, as the
 * chat is, after the network bridge.
 *
 * @param mode - VS Code's color mode.
 */
function syncSharedTheme(mode: "light" | "dark"): void {
  void import("@datalayer/primer-addons").then(({ useThemeStore }) => {
    useThemeStore.setState({ theme: "vscode", colorMode: mode });
  });
}
syncSharedTheme(currentTheme);
let currentAuth: AgentChatAuthState = { authenticated: false, user: null };
let currentSettings: AgentChatSettings | null = null;
let currentAgents: ChatAgentHandle[] | null = null;
let currentAgentsError: string | null = null;
// True between the user clicking "Create Agent" and the next `chat-agents`
// message arriving — provisioning is async (5–30s) and the toast that VS
// Code shows lives at the screen edge, so we surface a spinner inside the
// sidebar so the empty state doesn't look frozen.
let creatingAgent = false;
// The person's deployments (STUDIO A-18), each talked to or said why not;
// null while loading.
let currentDeployments: AppChatChoice[] | null = null;
let currentDeploymentsError: string | null = null;
let currentServices: { aiAgentsUrl: string; spacerUrl: string } | null = null;
// The session the Sessions view asked to open, if any.
let currentOpenRequest: OpenSessionRequest | null = null;
// The local runtimes' approvals, by runtime address (VS-07): the host reads
// them over each runtime's websocket and posts them as they change.
let currentLocalApprovals: Record<string, ApprovalRaised[]> = {};
// The view's requests for the editor's open file, by id.
const editorRequests = new Map<
  string,
  (context: EditorContext | undefined) => void
>();
let editorRequestCount = 0;
// The view's requests to sign the person for a deployment (D-21), by id.
const signRequests = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void }
>();

/**
 * Asks the extension host to sign the person for a deployment that takes
 * only a signed user (D-21): the host asks ai-agents with the person's
 * token and keeps the user token, which it puts in the runs' bodies — it
 * never reaches the view.
 *
 * @param deploymentUid - The deployment talked to.
 *
 * @returns Resolves once signed; rejects with ai-agents' sentence.
 */
function requestSignedUser(deploymentUid: string): Promise<void> {
  editorRequestCount += 1;
  const requestId = `sign-${editorRequestCount}`;
  return new Promise((resolve, reject) => {
    signRequests.set(requestId, { resolve, reject });
    vscode.postMessage({
      type: "user-token-request",
      requestId,
      deploymentUid,
    });
    setTimeout(() => {
      if (signRequests.delete(requestId)) {
        reject(new Error("ai-agents did not answer in time."));
      }
    }, 20_000);
  });
}

// The view's requests for a session's record, by id.
const recordRequests = new Map<
  string,
  { resolve: (lines: TranscriptLine[]) => void; reject: (error: Error) => void }
>();

/**
 * Asks the extension host for a session's conversation from its record at
 * ai-agents (a team run's seat, a session on no runtime): the host reads it
 * with the person's token, which never reaches the view.
 *
 * @param uid - The session.
 *
 * @returns The transcript's lines; rejects with the sentence said.
 */
function requestSessionRecord(uid: string): Promise<TranscriptLine[]> {
  editorRequestCount += 1;
  const requestId = `record-${editorRequestCount}`;
  return new Promise((resolve, reject) => {
    recordRequests.set(requestId, { resolve, reject });
    vscode.postMessage({ type: "read-session-record", requestId, uid });
    setTimeout(() => {
      if (recordRequests.delete(requestId)) {
        reject(new Error("ai-agents did not answer in time."));
      }
    }, 20_000);
  });
}

/**
 * Asks the extension host for the active editor's file, which it reads
 * only now (STUDIO A-18, D-10).
 *
 * @returns The file, or undefined when none is open.
 */
function requestEditorContext(): Promise<EditorContext | undefined> {
  editorRequestCount += 1;
  const requestId = `editor-${editorRequestCount}`;
  return new Promise((resolve) => {
    editorRequests.set(requestId, resolve);
    vscode.postMessage({ type: "editor-context-request", requestId });
    setTimeout(() => {
      if (editorRequests.delete(requestId)) {
        resolve(undefined);
      }
    }, 5_000);
  });
}

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
      deployments={currentDeployments}
      deploymentsError={currentDeploymentsError}
      services={currentServices}
      openRequest={currentOpenRequest}
      localApprovals={currentLocalApprovals}
      readEditor={requestEditorContext}
      signUser={requestSignedUser}
      readSessionRecord={requestSessionRecord}
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
      syncSharedTheme(currentTheme);
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
    case "chat-deployments": {
      const msg = data as {
        // null while `datalayer.agentChat.enabled` is off.
        deployments: AppChatChoice[] | null;
        error: string | null;
        services: { aiAgentsUrl: string; spacerUrl: string } | null;
      };
      currentDeployments = msg.deployments;
      currentDeploymentsError = msg.error;
      currentServices = msg.services ?? currentServices;
      render();
      break;
    }
    case "open-session": {
      currentOpenRequest = (data as { request: OpenSessionRequest }).request;
      render();
      break;
    }
    case "local-approvals": {
      const msg = data as { url: string; approvals: ApprovalRaised[] };
      currentLocalApprovals = {
        ...currentLocalApprovals,
        [msg.url.replace(/\/+$/, "")]: Array.isArray(msg.approvals)
          ? msg.approvals
          : [],
      };
      render();
      break;
    }
    case "user-token": {
      const msg = data as { requestId: string; error: string | null };
      const pending = signRequests.get(msg.requestId);
      if (pending) {
        signRequests.delete(msg.requestId);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve();
        }
      }
      break;
    }
    case "session-record": {
      const msg = data as {
        requestId: string;
        lines: TranscriptLine[] | null;
        error: string | null;
      };
      const pending = recordRequests.get(msg.requestId);
      if (pending) {
        recordRequests.delete(msg.requestId);
        if (msg.error || !msg.lines) {
          pending.reject(
            new Error(msg.error || "The session's record was not read."),
          );
        } else {
          pending.resolve(msg.lines);
        }
      }
      break;
    }
    case "editor-context": {
      const msg = data as {
        requestId: string;
        context: EditorContext | null;
      };
      const resolve = editorRequests.get(msg.requestId);
      if (resolve) {
        editorRequests.delete(msg.requestId);
        resolve(msg.context ?? undefined);
      }
      break;
    }
    default:
      // A decision asked from a notification, or the chat focused on an
      // approval (`approval-decide`, `focus-approval`).
      handleHostSurfaceMessage(data as { type: string });
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
