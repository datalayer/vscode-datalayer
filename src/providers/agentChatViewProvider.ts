/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Webview view provider for the Datalayer Agent Chat sidebar.
 *
 * Hosts the compiled `dist/agentChat.js` bundle inside a VS Code
 * `WebviewView` contributed under the `datalayerChat` view container.
 *
 * ## SAAS flow
 *
 * On view resolve (and on every sign-in) the provider:
 *
 * 1. Calls `datalayer.listRuntimes()` to enumerate all available runtimes.
 * 2. Extracts `{runtimeName, ingress, token, givenName, environmentName}` for
 *    every runtime that has a valid ingress URL and token.
 * 3. Posts the full list to the webview as a `chat-agents` message.
 * 4. The webview renders a picker; the user selects one.
 * 5. `<Chat>` is pointed at the selected runtime's ingress + token.
 *
 * If no runtimes are available the webview shows an empty state with a
 * "Create Agent" button that posts a `create-agent` message back to this
 * provider, which dispatches `datalayer.createAgent` and refreshes the
 * agent list when the new runtime comes up.
 *
 * ## A deployed application's agent (STUDIO A-18)
 *
 * Beside the runtimes, the provider lists the person's deployments at
 * ai-agents (`GET /api/ai-agents/v1/apps/deployments`, the runtimes plane)
 * and posts them as `chat-deployments`, each talked to or said why not
 * (`deploymentChoicesOf`). The webview talks to one over its runtime's
 * session API; it never holds the person's token: the network bridge
 * lends it to the requests under the prefixes `signedPrefixesOf` gives —
 * the runtimes those deployments are kept on, ai-agents' Tool Approvals
 * and Spacer's items. The editor's open file is read only when the view
 * asks for it (`editor-context-request`), which it does when the
 * application's agent calls `host_context` and its Appspec lets it.
 *
 * @module providers/agentChatViewProvider
 */

import * as vscode from "vscode";

import { AgentChatBridgeHandler } from "../bridges/agentChatBridge";
import { AgentChatNetworkBridge } from "../bridges/agentChatNetworkBridge";
import {
  type AppChatChoice,
  deploymentChoicesOf,
  deploymentsUrl,
  editorContextOf,
  signedPrefixesOf,
  signsRequest,
} from "../chat/appChat";
import {
  type AgentChatSettings,
  getValidatedSettingsGroup,
} from "../services/config/settingsValidator";
import type { DatalayerAuthProvider } from "../services/core/authProvider";
import type { ExtendedDatalayerClient } from "../services/core/datalayerAdapter";
import { ServiceLoggers } from "../services/logging/loggers";
import { getAgentChatHtml } from "../ui/templates/agentChatTemplate";

/**
 * Minimal shape of a runtime handle the webview needs to render its agent
 * picker and configure the `<Chat>` component. Extracted from the SDK's
 * `RuntimeDTO` getters.
 */
export interface ChatAgentHandle {
  /**
   * Kubernetes pod name. Unique runtime identifier used as `runtimeId`
   * on `<Chat>` for tracking/telemetry. The `agentId` prop is hard-coded
   * to `"default"` instead — see `webview/agentChat/App.tsx`.
   */
  runtimeName: string;
  /** Ingress URL used as the `baseUrl` on `<Chat>`. */
  ingress: string;
  /** Per-runtime auth token used as the `authToken` on `<Chat>`. */
  token: string;
  /** User-friendly name for the runtime. */
  givenName: string;
  /** Environment name (e.g. `ai-agents-env`). */
  environmentName: string;
}

/**
 * Polling interval for refreshing the runtimes list while the chat sidebar
 * is visible. Catches server-side terminations (e.g. timeouts) without
 * requiring the user to click the refresh button.
 */
const VISIBLE_POLL_INTERVAL_MS = 30_000;

/**
 * Implements `vscode.WebviewViewProvider` for the `datalayerAgentChatView`.
 */
export class AgentChatViewProvider implements vscode.WebviewViewProvider {
  /** ID of the webview view contributed in `package.json`. */
  public static readonly viewType = "datalayerAgentChatView";

  /** Current webview view, if resolved and still live. */
  private view: vscode.WebviewView | undefined;

  /** Bridge handler for `IAgentRuntimesClient` bridge calls. */
  private readonly bridge: AgentChatBridgeHandler;

  /**
   * Network bridge: tunnels every `fetch`/`WebSocket` call from the webview
   * through the extension host, bypassing CORS restrictions.
   */
  private readonly networkBridge: AgentChatNetworkBridge;

  /** Active polling timer; `undefined` when not polling. */
  private pollTimer: NodeJS.Timeout | undefined;

  /**
   * Promise resolved by the currently running `refreshAgents()` call, or
   * `undefined` when no refresh is in flight. Used to coalesce concurrent
   * callers (the visibility poller, the webview's manual refresh button,
   * and post-creation/-termination triggers from other commands) so we
   * never have two `listRuntimes()` requests racing or two `chat-agents`
   * messages posting in the wrong order.
   */
  private inFlightRefresh: Promise<void> | undefined;

  /**
   * The URL prefixes the network bridge signs with the person's token:
   * the runtimes of the deployments last listed, Tool Approvals, Spacer's
   * items (STUDIO A-18). Empty while nobody is signed in.
   */
  private signedPrefixes: string[] = [];

  /**
   * Constructs the provider.
   *
   * @param context - VS Code extension context.
   * @param authProvider - Auth provider for event subscription.
   * @param sdk - Shared extended DatalayerClient instance.
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authProvider: DatalayerAuthProvider,
    private readonly sdk: ExtendedDatalayerClient,
  ) {
    // Forward `extensionMode` so the bridge can include JS stack traces in
    // Development builds without leaking them into webview logs in
    // Production / Test installs.
    this.bridge = new AgentChatBridgeHandler(sdk, context.extensionMode);
    this.networkBridge = new AgentChatNetworkBridge((url) =>
      this.authProvider.isAuthenticated() &&
      signsRequest(url, this.signedPrefixes)
        ? this.authProvider.getToken() || undefined
        : undefined,
    );
  }

  /** @inheritdoc */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    // Explicitly allow the extension root as a local resource root so the
    // webview can load `dist/agentChat.js`. Notebook/lexical webviews work
    // with just `enableScripts: true` because `WebviewPanel` defaults the
    // resource roots to include the extension root. For `WebviewView` the
    // default may behave differently in some VS Code versions, so we set it
    // explicitly.
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const html = getAgentChatHtml(
      webviewView.webview,
      this.context.extensionUri,
    );
    ServiceLoggers.main.debug("[AgentChat] resolveWebviewView", {
      extensionUri: this.context.extensionUri.toString(),
      htmlLength: html.length,
    });

    webviewView.webview.html = html;

    const bridgeSubscription = this.bridge.attach(webviewView.webview);
    const networkSubscription = this.networkBridge.attach(webviewView.webview);

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleWebviewMessage(message);
      },
    );

    // Post initial state to the webview.
    this.postChatSettings(getValidatedSettingsGroup("agentChat"));
    this.postAuthState();
    void this.refreshAgents();

    // React to auth changes.
    const authSubscription = this.authProvider.onAuthStateChanged(() => {
      this.postAuthState();
      void this.refreshAgents();
    });

    // React to theme changes.
    const themeSubscription = vscode.window.onDidChangeActiveColorTheme(
      (theme) => {
        void webviewView.webview.postMessage({
          type: "theme-change",
          theme: this.resolveThemeKind(theme.kind),
        });
      },
    );

    // React to settings changes.
    const configSubscription = vscode.workspace.onDidChangeConfiguration(
      (event) => {
        if (event.affectsConfiguration("datalayer.agentChat")) {
          this.postChatSettings(getValidatedSettingsGroup("agentChat"));
        }
      },
    );

    // Periodically refresh the agents list while the sidebar is visible so
    // that server-side terminations (e.g. runtime timeouts) propagate to the
    // dropdown without requiring the user to click the refresh button.
    if (webviewView.visible) {
      this.startPolling();
    }
    const visibilitySubscription = webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startPolling();
        // Refresh immediately when the view becomes visible again so the user
        // sees up-to-date agents instead of whatever was last cached.
        void this.refreshAgents();
      } else {
        this.stopPolling();
      }
    });

    webviewView.onDidDispose(() => {
      this.stopPolling();
      bridgeSubscription.dispose();
      networkSubscription.dispose();
      messageSubscription.dispose();
      authSubscription.dispose();
      themeSubscription.dispose();
      configSubscription.dispose();
      visibilitySubscription.dispose();
      this.view = undefined;
    });
  }

  /**
   * Triggers a refresh of the agents list shown in the sidebar dropdown.
   *
   * Safe to call when the view has not been resolved or is not visible — it
   * is a no-op in that case. Used by extension-host commands (agent
   * creation, termination) to keep the dropdown in sync with platform
   * state.
   */
  public async refresh(): Promise<void> {
    await this.refreshAgents();
  }

  /** Starts the visibility-aware polling timer. Idempotent. */
  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.refreshAgents();
    }, VISIBLE_POLL_INTERVAL_MS);
  }

  /** Stops the polling timer if running. */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Handles non-bridge messages from the webview.
   *
   * @param raw - Raw payload received from the webview.
   */
  private async handleWebviewMessage(raw: unknown): Promise<void> {
    if (raw === null || typeof raw !== "object") {
      return;
    }
    const type = (raw as { type?: unknown }).type;
    if (type === "refresh-agents") {
      await this.refreshAgents();
    } else if (type === "create-agent") {
      // Always run the spec picker — that's what users expect when they
      // click "Create Agent" in the sidebar's empty state. An earlier
      // version threaded `datalayer.agentChat.agentSpecId` through here
      // to skip the picker, but that turned the button into "create the
      // configured spec immediately", which surprised users who wanted
      // to choose. The refresh runs in `finally` so even when the user
      // cancels the picker the spinner clears promptly via a
      // `chat-agents` update.
      try {
        await vscode.commands.executeCommand("datalayer.createAgent");
      } finally {
        await this.refreshAgents();
      }
    } else if (type === "login") {
      await vscode.commands.executeCommand("datalayer.login");
    } else if (type === "editor-context-request") {
      const requestId = (raw as { requestId?: unknown }).requestId;
      if (typeof requestId === "string") {
        this.postEditorContext(requestId);
      }
    }
  }

  /**
   * Lists all available runtimes and posts their handles to the webview.
   *
   * Concurrent callers (poll + manual refresh + post-create/terminate
   * triggers) all share the same in-flight promise, so we never run two
   * `listRuntimes()` requests at once and the `chat-agents` messages
   * posted to the webview stay in their listed order. Late callers do
   * not start a fresh refresh — they simply await the current one and
   * see whatever it produces.
   *
   * @returns Promise that resolves once the refresh (or the in-flight
   *   refresh it coalesced into) completes.
   */
  private async refreshAgents(): Promise<void> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }
    const refresh = this.runRefreshAgents().finally(() => {
      this.inFlightRefresh = undefined;
    });
    this.inFlightRefresh = refresh;
    return refresh;
  }

  /**
   * Inner refresh body — does NOT touch `inFlightRefresh`. All public
   * call sites must go through {@link refreshAgents} so coalescing
   * stays correct.
   */
  private async runRefreshAgents(): Promise<void> {
    if (!this.view || !this.authProvider.isAuthenticated()) {
      this.signedPrefixes = [];
      this.postAgents([], null);
      this.postDeployments([], null);
      return;
    }
    await Promise.all([this.refreshRuntimes(), this.refreshDeployments()]);
  }

  /**
   * Lists the person's deployments at ai-agents and posts them to the
   * webview as `chat-deployments` (STUDIO A-18); the runtimes they are kept
   * on become the prefixes the bridge signs.
   */
  private async refreshDeployments(): Promise<void> {
    const services = getValidatedSettingsGroup("services");
    // ai-agents is served on the runtimes plane (core's `aiAgentsUrl`).
    const aiAgentsUrl = services.runtimesUrl;
    try {
      const response = await fetch(deploymentsUrl(aiAgentsUrl), {
        headers: { Authorization: `Bearer ${this.authProvider.getToken()}` },
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as { detail?: unknown };
          detail = typeof body.detail === "string" ? body.detail : "";
        } catch {
          // The status says it.
        }
        throw new Error(
          detail ||
            `ai-agents answered ${response.status} for your deployments.`,
        );
      }
      const choices = deploymentChoicesOf(await response.json());
      this.signedPrefixes = signedPrefixesOf(
        choices.flatMap((choice) =>
          choice.kind === "talk" ? [choice.handle] : [],
        ),
        { aiAgentsUrl, spacerUrl: services.spacerUrl },
      );
      this.postDeployments(choices, null, {
        aiAgentsUrl,
        spacerUrl: services.spacerUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ServiceLoggers.main.warn("[AgentChat] Failed to list deployments", {
        message,
      });
      this.signedPrefixes = [];
      this.postDeployments([], message);
    }
  }

  /**
   * Posts the person's deployments to the webview.
   *
   * @param deployments - Each talked to, or why not.
   * @param error - Why they could not be listed, or null.
   * @param services - The ai-agents and Spacer base URLs the view asks.
   */
  private postDeployments(
    deployments: AppChatChoice[],
    error: string | null,
    services?: { aiAgentsUrl: string; spacerUrl: string },
  ): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type: "chat-deployments",
      deployments,
      error,
      services: services ?? null,
    });
  }

  /**
   * Answers the view's `editor-context-request` with the active editor's
   * file (STUDIO A-18, D-10): asked only when an application's agent calls
   * `host_context` and its Appspec names the page.
   *
   * @param requestId - The view's request.
   */
  private postEditorContext(requestId: string): void {
    if (!this.view) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const context = editor
      ? editorContextOf(
          {
            path: vscode.workspace.asRelativePath(editor.document.uri, false),
            language: editor.document.languageId,
            text: editor.document.getText(),
          },
          editor.selection.isEmpty
            ? undefined
            : editor.document.getText(editor.selection),
        )
      : null;
    void this.view.webview.postMessage({
      type: "editor-context",
      requestId,
      context,
    });
  }

  /**
   * Lists the runtimes and posts their handles to the webview.
   */
  private async refreshRuntimes(): Promise<void> {
    try {
      const runtimes = (await this.sdk.listRuntimes()) ?? [];
      const agents: ChatAgentHandle[] = [];
      // Demoted from `info` to `debug`: this method runs every 30s while
      // the sidebar is visible (visibility-aware poll) and would flood
      // the output channel during normal use.
      ServiceLoggers.main.debug("[AgentChat] listRuntimes returned", {
        count: runtimes.length,
      });
      for (const runtime of runtimes) {
        try {
          const ingress = runtime.ingress;
          const token = runtime.token;
          ServiceLoggers.main.debug("[AgentChat] runtime", {
            runtimeName: runtime.runtimeName,
            hasIngress: !!ingress,
            hasToken: !!token,
            givenName: runtime.givenName,
            environmentName: runtime.environmentName,
          });
          if (ingress && token) {
            // The platform's `listRuntimes` returns an ingress URL that
            // points at the Jupyter server (`/jupyter/server/...`). The
            // agent-runtimes REST API and streaming chat endpoints are
            // instead served from a sibling path (`/agent-runtimes/...`)
            // on the same host. Rewrite the ingress so the Chat component
            // hits the correct backend.
            //
            // Verified against the SAAS web app which POSTs to
            // `https://r1.datalayer.run/agent-runtimes/ai-agents-pool/{pod}
            //  /api/v1/vercel-ai/default`.
            const normalizedIngress = ingress
              .replace("/jupyter/server/", "/agent-runtimes/")
              .replace(/\/$/, "");
            agents.push({
              runtimeName: runtime.runtimeName,
              ingress: normalizedIngress,
              token,
              givenName: runtime.givenName,
              environmentName: runtime.environmentName,
            });
          }
        } catch (err) {
          ServiceLoggers.main.warn("[AgentChat] skipping runtime", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      ServiceLoggers.main.debug("[AgentChat] posting agents to webview", {
        agentCount: agents.length,
      });
      this.postAgents(agents, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ServiceLoggers.main.warn("[AgentChat] Failed to list agents", {
        message,
      });
      this.postAgents([], message);
    }
  }

  /**
   * Posts the available agents list to the webview.
   *
   * @param agents - Array of runtime handles.
   * @param error - Error message or null.
   */
  private postAgents(agents: ChatAgentHandle[], error: string | null): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type: "chat-agents",
      agents,
      error,
    });
  }

  /**
   * Posts chat settings to the webview.
   *
   * @param config - Validated settings.
   */
  private postChatSettings(config: AgentChatSettings): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type: "chat-settings",
      protocol: config.protocol,
      agentSpecId: config.agentSpecId,
    });
  }

  /**
   * Posts authentication state (without the token).
   */
  private postAuthState(): void {
    if (!this.view) {
      return;
    }
    const state = this.authProvider.getAuthState();
    void this.view.webview.postMessage({
      type: "auth-state",
      authenticated: state.isAuthenticated,
      user: state.user
        ? { handle: state.user.handle, email: state.user.email }
        : null,
    });
  }

  /**
   * Maps a VS Code theme kind to a light/dark tag.
   *
   * @param kind - VS Code theme kind.
   *
   * @returns Theme tag for the webview.
   */
  private resolveThemeKind(kind: vscode.ColorThemeKind): "light" | "dark" {
    if (
      kind === vscode.ColorThemeKind.Dark ||
      kind === vscode.ColorThemeKind.HighContrast
    ) {
      return "dark";
    }
    return "light";
  }
}
