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
 * agent list when the new runtime comes up. The + beside the picker posts
 * `create-runtime`, which runs the Agents view's own + command
 * (`datalayer.runtimes.create`), then reads the list again.
 *
 * A runtime clicked in the Agents view (`openAgent`, through
 * `OPEN_AGENT_COMMAND`) reveals the chat and posts `open-agent`: the picker
 * selects it. Like a session opened from the Sessions view (`open-session`),
 * a request made before the page listens is posted on its `ready`.
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
 * ## The editor's tools (`chat/documentTools`)
 *
 * On `ready` (and each refresh) the provider posts `document-tools`: the
 * tools registered for Copilot that work on a Datalayer notebook or
 * document. The view gives them to every chat's agent as frontend tools;
 * a call comes back as `document-tool-call`, which the provider runs on the
 * active Datalayer editor through the same registry (`runRegisteredTool`)
 * and answers with `document-tool-result`: the editor it ran on and the
 * result, or why not.
 *
 * @module providers/agentChatViewProvider
 */

import * as vscode from "vscode";

import { AgentChatBridgeHandler } from "../bridges/agentChatBridge";
import { AgentChatNetworkBridge } from "../bridges/agentChatNetworkBridge";
import {
  type AppChatChoice,
  type AppChatHandle,
  deploymentChoicesOf,
  deploymentsUrl,
  editorContextOf,
  fetchUserToken,
  isRunOf,
  loopbackRuntimeUrl,
  signedPrefixesOf,
  type SignedUser,
  signedUserFresh,
  signsRequest,
  withUserToken,
} from "../chat/appChat";
import {
  type ActiveEditor,
  DOCUMENT_TOOL_WORDS,
  documentToolArgsOf,
  type DocumentToolCallOptions,
  type DocumentToolOutcome,
  documentToolSpecsOf,
  documentToolTargetOf,
  editorNameOf,
  type OpenEditor,
} from "../chat/documentTools";
import type { OpenAgentRequest } from "../chat/openSession";
import { recordTranscriptOf, sessionRecordUrl } from "../chat/sessionRecord";
import type { OpenSessionRequest } from "../chat/sessionVerbs";
import {
  type AgentChatSettings,
  getValidatedSettingsGroup,
} from "../services/config/settingsValidator";
import type { DatalayerAuthProvider } from "../services/core/authProvider";
import type { ExtendedDatalayerClient } from "../services/core/datalayerAdapter";
import type { LocalApprovalSource } from "../services/localRuntime/localApprovalSource";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";
import { ServiceLoggers } from "../services/logging/loggers";
import { getAgentChatHtml } from "../ui/templates/agentChatTemplate";
import { getActiveDocumentInfo } from "../utils/activeDocument";

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
  /** A Datalayer runtime's uid: what a session's `runsOn` names (VS-24). */
  uid?: string;
  /** Ingress URL used as the `baseUrl` on `<Chat>`. */
  ingress: string;
  /** Per-runtime auth token used as the `authToken` on `<Chat>`. */
  token: string;
  /** User-friendly name for the runtime. */
  givenName: string;
  /** Environment name (e.g. `ai-agents-env`). */
  environmentName: string;
  /** Where it runs: `local` for a local runtime of a workspace folder (VS-02), no token lent to it. */
  place?: "datalayer" | "local";
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
  /** Whether the page listens (it said `ready`); until then messages wait. */
  private pageReady = false;
  /**
   * A session or an agent asked to open before the page listened: posted on
   * `ready` (the last one asked).
   */
  private pendingOpen:
    | { type: "open-session"; request: OpenSessionRequest }
    | { type: "open-agent"; request: OpenAgentRequest }
    | undefined;

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

  /** The deployments last listed that can be talked to, by uid (A-18). */
  private talkable = new Map<string, AppChatHandle>();

  /**
   * The user tokens ai-agents signed the person with, by deployment, for
   * the deployments that take only a signed user (D-21): put in their
   * runs' bodies by the network bridge, never posted to the webview.
   */
  private signedUsers = new Map<string, SignedUser | null>();

  /** Fired when the chat says a session changed (a turn answered). */
  private readonly sessionChangedEmitter = new vscode.EventEmitter<void>();

  /** A session changed in the chat: the Sessions view reads again. */
  public readonly onSessionChanged = this.sessionChangedEmitter.event;

  /**
   * Constructs the provider.
   *
   * @param context - VS Code extension context.
   * @param authProvider - Auth provider for event subscription.
   * @param sdk - Shared extended DatalayerClient instance.
   * @param localRuntimes - The local runtimes (VS-02), listed as places beside Datalayer's runtimes.
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authProvider: DatalayerAuthProvider,
    private readonly sdk: ExtendedDatalayerClient,
    private readonly localRuntimes?: LocalRuntimeService,
    /**
     * The editor's surfaces of a session (approvals as notifications, diffs
     * in the diff view, terminals, the status bar), attached to the view's
     * webview beside the bridges; none when not given.
     */
    private readonly surfaces?: {
      attach(webview: vscode.Webview): vscode.Disposable;
    },
    /** The local runtimes' approvals (VS-07): posted to the chat's banner. */
    private readonly localApprovals?: LocalApprovalSource,
  ) {
    // Forward `extensionMode` so the bridge can include JS stack traces in
    // Development builds without leaking them into webview logs in
    // Production / Test installs.
    this.bridge = new AgentChatBridgeHandler(sdk, context.extensionMode);
    this.networkBridge = new AgentChatNetworkBridge(
      (url) =>
        this.authProvider.isAuthenticated() &&
        signsRequest(url, this.signedPrefixes)
          ? this.authProvider.getToken() || undefined
          : undefined,
      (url, method, body) => this.signedRunBody(url, method, body),
      // A local runtime's loopback address (VS-02): plain http/ws to a
      // runtime running on this machine, and to nothing else.
      (url) =>
        loopbackRuntimeUrl(
          url,
          (this.localRuntimes?.list() ?? []).map((runtime) => runtime.url),
        ) !== undefined,
    );
  }

  /** @inheritdoc */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    // A new page: nothing is posted to it until it says `ready`.
    this.pageReady = false;

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
    const surfacesSubscription = this.surfaces?.attach(webviewView.webview);
    // A local runtime's approvals as they change (VS-07): the banner's
    // source for a session on this machine; *Show* focuses the chat on one.
    const approvalsSubscription = this.localApprovals?.onDidChange((change) => {
      void webviewView.webview.postMessage({
        type: "local-approvals",
        url: change.url,
        approvals: change.approvals,
      });
    });
    if (this.localApprovals) {
      this.localApprovals.showInChat = (id) => {
        this.view?.show(true);
        void this.view?.webview.postMessage({ type: "focus-approval", id });
      };
      for (const change of this.localApprovals.all()) {
        void webviewView.webview.postMessage({
          type: "local-approvals",
          url: change.url,
          approvals: change.approvals,
        });
      }
    }

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleWebviewMessage(message);
      },
    );

    // The initial state is posted when the page says it listens (`ready`):
    // the page arrives as a chunk after the entry, so state posted now was lost.

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
        if (event.affectsConfiguration("datalayer.agentChat.enabled")) {
          // Turned on, the deployments are listed; turned off, forgotten.
          void this.refreshAgents();
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
      surfacesSubscription?.dispose();
      approvalsSubscription?.dispose();
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

  /**
   * Opens a session in the chat, from the Sessions view: the view shown,
   * the chat told which session and where it runs (`open-session`).
   *
   * @param request - The session and its place.
   */
  public openSession(request: OpenSessionRequest): void {
    this.view?.show(true);
    if (!this.pageReady) {
      // The view is being created: its page is not listening yet.
      this.pendingOpen = { type: "open-session", request };
      return;
    }
    void this.view?.webview.postMessage({ type: "open-session", request });
  }

  /**
   * Opens an agent in the chat, from the Agents view (a click on its
   * runtime): the chat's container revealed and its view focused — created
   * when it never was — then the picker told which runtime to select
   * (`open-agent`), the list read again first so a runtime just created is
   * in it. A request made while the page is loading waits for its `ready`,
   * as a session's does.
   *
   * @param request - The agent clicked.
   */
  public async openAgent(request: OpenAgentRequest): Promise<void> {
    await vscode.commands.executeCommand("datalayer.agentChat.focus");
    if (!this.view || !this.pageReady) {
      this.pendingOpen = { type: "open-agent", request };
      return;
    }
    await this.refreshAgents();
    void this.view?.webview.postMessage({ type: "open-agent", request });
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
    if (await this.handleDocumentToolMessage(type, raw)) {
      return;
    }
    if (type === "ready") {
      // The page listens: the state it starts from (again on a reload).
      this.pageReady = true;
      this.postChatSettings(getValidatedSettingsGroup("agentChat"));
      this.postAuthState();
      void this.postDocumentTools();
      await this.refreshAgents();
      if (this.pendingOpen) {
        const pending = this.pendingOpen;
        this.pendingOpen = undefined;
        void this.view?.webview.postMessage(pending);
      }
    } else if (type === "refresh-agents") {
      void this.postDocumentTools();
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
    } else if (type === "create-runtime") {
      // The picker's +: the Agents view's own + (`datalayer.runtimes.create`),
      // the same flow; the list read again however it ends.
      try {
        await vscode.commands.executeCommand("datalayer.runtimes.create");
      } finally {
        await this.refreshAgents();
      }
    } else if (type === "login") {
      await vscode.commands.executeCommand("datalayer.login");
    } else if (type === "user-token-request") {
      const { requestId, deploymentUid } = raw as {
        requestId?: unknown;
        deploymentUid?: unknown;
      };
      if (typeof requestId === "string" && typeof deploymentUid === "string") {
        await this.signUser(requestId, deploymentUid);
      }
    } else if (type === "read-session-record") {
      const { requestId, uid } = raw as { requestId?: unknown; uid?: unknown };
      if (typeof requestId === "string" && typeof uid === "string") {
        await this.readSessionRecord(requestId, uid);
      }
    } else if (type === "session-changed") {
      this.sessionChangedEmitter.fire();
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
    // `datalayer.agentChat.enabled` (on by default): turned off, no deployment
    // is listed, ai-agents is asked nothing and the view never opens `AppChat`.
    const appChat = getValidatedSettingsGroup("agentChat").enabled;
    if (!this.view || !this.authProvider.isAuthenticated()) {
      this.forgetDeployments();
      this.postAgents([], null);
      this.postDeployments(appChat ? [] : null, null);
      return;
    }
    if (!appChat) {
      this.forgetDeployments();
      this.postDeployments(null, null);
      await this.refreshRuntimes();
      return;
    }
    await Promise.all([this.refreshRuntimes(), this.refreshDeployments()]);
  }

  /**
   * Forgets the deployments last listed: none is talked to or signed for.
   */
  private forgetDeployments(): void {
    this.signedPrefixes = [];
    this.talkable.clear();
    this.signedUsers.clear();
  }

  /**
   * Lists the person's deployments at ai-agents and posts them to the
   * webview as `chat-deployments` (STUDIO A-18); the runtimes they are kept
   * on become the prefixes the bridge signs.
   */
  private async refreshDeployments(): Promise<void> {
    const services = getValidatedSettingsGroup("services");
    // ai-agents' own setting (core's `aiAgentsUrl`), never the runtimes'.
    const aiAgentsUrl = services.aiAgentsUrl;
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
      this.talkable = new Map(
        choices.flatMap((choice) =>
          choice.kind === "talk"
            ? [[choice.handle.uid, choice.handle] as const]
            : [],
        ),
      );
      // A deployment no longer talked to is no longer signed for.
      for (const uid of [...this.signedUsers.keys()]) {
        if (!this.talkable.has(uid)) {
          this.signedUsers.delete(uid);
        }
      }
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
      this.forgetDeployments();
      this.postDeployments([], message);
    }
  }

  /**
   * Posts the person's deployments to the webview.
   *
   * @param deployments - Each talked to, or why not; null when
   *   `datalayer.agentChat.enabled` is off (nothing listed, nothing said).
   * @param error - Why they could not be listed, or null.
   * @param services - The ai-agents and Spacer base URLs the view asks.
   * @param services.aiAgentsUrl - The ai-agents service's base URL.
   * @param services.spacerUrl - The Spacer service's base URL.
   */
  private postDeployments(
    deployments: AppChatChoice[] | null,
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
   * The person's user token for a deployment (D-21), asked of ai-agents with
   * their own token when there is none or it is about to end.
   *
   * @param deploymentUid - The uid of the deployment talked to.
   *
   * @returns What ai-agents signed, sent in the runs' bodies.
   */
  private async userTokenFor(deploymentUid: string): Promise<string> {
    const kept = this.signedUsers.get(deploymentUid);
    if (kept && signedUserFresh(kept, Date.now() / 1000)) {
      return kept.token;
    }
    const token = this.authProvider.getToken();
    if (!this.authProvider.isAuthenticated() || !token) {
      throw new Error("Sign in to Datalayer to talk to your applications.");
    }
    const signed = await fetchUserToken(
      getValidatedSettingsGroup("services").aiAgentsUrl,
      deploymentUid,
      token,
    );
    this.signedUsers.set(deploymentUid, signed);
    return signed.token;
  }

  /**
   * Answers the view's `user-token-request` (D-21): signs the person for a
   * deployment listed as talked to, and says only whether it was done.
   *
   * @param requestId - The id the view's request is answered under.
   * @param deploymentUid - The uid of the deployment talked to.
   */
  private async signUser(
    requestId: string,
    deploymentUid: string,
  ): Promise<void> {
    let error: string | null = null;
    try {
      if (!this.talkable.has(deploymentUid)) {
        throw new Error("This deployment is not one you can talk to here now.");
      }
      this.signedUsers.set(deploymentUid, null);
      await this.userTokenFor(deploymentUid);
    } catch (failure) {
      this.signedUsers.delete(deploymentUid);
      error = failure instanceof Error ? failure.message : String(failure);
    }
    void this.view?.webview.postMessage({
      type: "user-token",
      requestId,
      error,
    });
  }

  /**
   * The body a run of a signed deployment leaves with: its user token put in
   * as `forwardedProps.loop.user_token` (D-21); `undefined` for any other
   * request, sent as the webview built it.
   *
   * @param url - The request's URL.
   * @param method - Its method.
   * @param body - Its body.
   *
   * @returns The body to send, or undefined.
   */
  private async signedRunBody(
    url: string,
    method: string,
    body: string,
  ): Promise<string | undefined> {
    for (const uid of this.signedUsers.keys()) {
      const handle = this.talkable.get(uid);
      if (handle && isRunOf(url, method, handle)) {
        return withUserToken(body, await this.userTokenFor(uid));
      }
    }
    return undefined;
  }

  /**
   * Answers the view's `read-session-record`: a session the chat cannot talk
   * to (a team run's seat, a session on no runtime) read from its record at
   * ai-agents with the person's token, and posted as its transcript's lines
   * (`session-record`) — the token never reaches the view.
   *
   * @param requestId - The id the view's request is answered under.
   * @param uid - Which session, as ai-agents names it.
   */
  private async readSessionRecord(
    requestId: string,
    uid: string,
  ): Promise<void> {
    let lines: ReturnType<typeof recordTranscriptOf> | null = null;
    let error: string | null = null;
    try {
      const token = this.authProvider.getToken();
      if (!this.authProvider.isAuthenticated() || !token) {
        throw new Error("Sign in to Datalayer to read this session.");
      }
      const aiAgentsUrl = getValidatedSettingsGroup("services").aiAgentsUrl;
      const response = await fetch(sessionRecordUrl(aiAgentsUrl, uid), {
        headers: { Authorization: `Bearer ${token}` },
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
            `ai-agents answered ${response.status} for the record of session ${uid}.`,
        );
      }
      lines = recordTranscriptOf(await response.json());
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      ServiceLoggers.main.warn("[AgentChat] session record not read", {
        uid,
        error,
      });
    }
    void this.view?.webview.postMessage({
      type: "session-record",
      requestId,
      lines,
      error,
    });
  }

  /**
   * Answers the page's messages of the editor's tools: `document-tools-request`
   * with the list, `document-tool-call` with its `document-tool-result`.
   *
   * @param type - What the page says the message is (`document-tool-call`, …).
   * @param raw - The message, as the page posted it.
   *
   * @returns Whether it was one of theirs.
   */
  private async handleDocumentToolMessage(
    type: unknown,
    raw: object,
  ): Promise<boolean> {
    if (type === "document-tools-request") {
      await this.postDocumentTools();
      return true;
    }
    if (type !== "document-tool-call") {
      return false;
    }
    const { requestId, name, args, locate, target } = raw as {
      requestId?: unknown;
      name?: unknown;
      args?: unknown;
      locate?: unknown;
      target?: unknown;
    };
    if (typeof requestId === "string" && typeof name === "string") {
      const outcome = await this.runDocumentTool(
        name,
        args && typeof args === "object" && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {},
        {
          locate: locate === true,
          ...(typeof target === "string" && target ? { target } : {}),
        },
      );
      void this.view?.webview.postMessage({
        type: "document-tool-result",
        requestId,
        outcome,
      });
    }
    return true;
  }

  /**
   * Posts the notebook and document tools the chat's agents are given
   * (`chat/documentTools`): the tools registered for Copilot that work on
   * a Datalayer notebook or document. The registry is loaded lazily, as
   * the extension's activation loads it.
   */
  private async postDocumentTools(): Promise<void> {
    try {
      const { registeredToolDefinitions } =
        await import("../tools/core/registration");
      void this.view?.webview.postMessage({
        type: "document-tools",
        tools: documentToolSpecsOf(registeredToolDefinitions()),
      });
    } catch (failure) {
      ServiceLoggers.main.warn("[AgentChat] editor tools not listed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  /**
   * Runs a tool a chat's agent called on a Datalayer notebook or document,
   * as Copilot's calls run it, and says which editor it ran on. The editor
   * is `documentToolTargetOf`'s: the one the page located before (shown to
   * the person), else the active tab, else the one of its kind focused
   * last. The call's webview messages go to that editor's panel. Never
   * throws: what failed is said in the outcome, which goes back to the run.
   *
   * @param name - The tool called.
   * @param args - Its arguments, as the model sent them.
   * @param options - `locate` to only say the editor; `target` to run on
   *   the one located before.
   *
   * @returns The outcome: the editor and the result, or why not.
   */
  private async runDocumentTool(
    name: string,
    args: Record<string, unknown>,
    options: DocumentToolCallOptions = {},
  ): Promise<DocumentToolOutcome> {
    const { registeredToolDefinitions, runRegisteredTool } =
      await import("../tools/core/registration");
    const spec = documentToolSpecsOf(registeredToolDefinitions()).find(
      (tool) => tool.name === name,
    );
    if (!spec) {
      return { error: DOCUMENT_TOOL_WORDS.unknown(name) };
    }
    const located = documentToolTargetOf(
      spec.target,
      activeEditorOf(getActiveDocumentInfo()),
      await openDatalayerEditors(),
      options.target,
    );
    const { editor, note } = located;
    if (!editor) {
      return {
        error: located.error ?? DOCUMENT_TOOL_WORDS.noEditor(spec.target),
      };
    }
    const where = { editor, ...(note ? { note } : {}) };
    if (options.locate) {
      return where;
    }
    try {
      const result = await runRegisteredTool(name, documentToolArgsOf(args), {
        uri: editor.uri,
        kind: editor.kind,
      });
      return { ...where, result };
    } catch (failure) {
      const error =
        failure instanceof Error ? failure.message : String(failure);
      ServiceLoggers.main.warn("[AgentChat] document tool failed", {
        name,
        error,
      });
      return { ...where, error };
    }
  }

  /**
   * Answers the view's `editor-context-request` with the active editor's
   * file (STUDIO A-18, D-10): asked only when an application's agent calls
   * `host_context` and its Appspec names the page.
   *
   * @param requestId - The id the view's request is answered under.
   */
  private postEditorContext(requestId: string): void {
    if (!this.view) {
      return;
    }
    // Off, no application is talked to here: the open file is never read.
    const editor = getValidatedSettingsGroup("agentChat").enabled
      ? vscode.window.activeTextEditor
      : undefined;
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
        // A deployment's runtime answers only its application's own routes:
        // it is talked to as that application (Your applications) or through
        // one of its sessions, never picked as a runtime by agent name.
        if (runtime.deploymentUid) {
          continue;
        }
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
              uid: runtime.uid,
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
      // The local runtimes (VS-02): a place beside Datalayer's, over
      // loopback, no token lent (the bridge signs its prefixes alone).
      for (const local of this.localRuntimes?.handles() ?? []) {
        agents.push(local);
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

/**
 * The active tab, as the chat's tools see it.
 *
 * @param info - The active tab's document, if any.
 *
 * @returns Its kind, URI and name, or `undefined`.
 */
function activeEditorOf(
  info: ReturnType<typeof getActiveDocumentInfo>,
): ActiveEditor | undefined {
  if (!info) {
    return undefined;
  }
  const uri = info.uri.toString();
  return {
    kind:
      info.editorType === "datalayer-notebook"
        ? "notebook"
        : info.editorType === "datalayer-lexical"
          ? "lexical"
          : "other",
    uri,
    name: editorNameOf(uri),
  };
}

/**
 * The Datalayer editors open (their webview panels registered and not
 * disposed), with when each was last focused. The service container is
 * loaded lazily, as the tools' registry is.
 *
 * @returns Each one's kind, URI, file name and focus counter.
 */
async function openDatalayerEditors(): Promise<OpenEditor[]> {
  const { getServiceContainer } = await import("../extension");
  return getServiceContainer()
    .documentRegistry.openEditors()
    .map(({ documentUri, type, focusedAt }) => ({
      kind: type,
      uri: documentUri,
      name: editorNameOf(documentUri),
      focusedAt,
    }));
}
