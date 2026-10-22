/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Agent Chat sidebar application component.
 *
 * Renders an agent picker — the person's runtimes, and their deployed
 * applications kept always on (STUDIO A-18, talked to by `AppChat`) — then
 * lazy-loads the heavy `<Chat>` component from `@datalayer/agent-runtimes`
 * via `React.lazy` + `Suspense`. This keeps the initial bundle small
 * (~3 MiB) so the webview evaluates immediately; the Chat chunk (~16 MiB)
 * loads asynchronously after the picker renders.
 *
 * @module webview/agentChat/App
 */

import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";

import type { IAgentRuntimesClient } from "@datalayer/agent-runtimes/lib/client/IAgentRuntimesClient";
import { AgentRuntimesClientProvider } from "@datalayer/agent-runtimes/lib/client/AgentRuntimesClientContext";
import { agentRuntimesUrlOf } from "@datalayer/agent-runtimes/lib/portable/sessions";

import {
  APP_CHAT_WORDS,
  type AppChatChoice,
  type EditorContext,
  noneTalkableSentence,
  pickedHandleOf,
  talkableKeyOf,
} from "../../src/chat/appChat";
import type { ApprovalRaised } from "../../src/chat/attention";
import {
  openSessionChoice,
  type RecordRead,
  sessionProtocol,
} from "../../src/chat/openSession";
import type { TranscriptLine } from "../../src/chat/sessionRecord";
import {
  RUNTIME_AGENT_WORDS,
  type RuntimeAgent,
  type RuntimeAgentChoice,
  fetchRuntimeAgents,
  runtimeAgentOf,
} from "../../src/chat/runtimeAgent";
import type { OpenSessionRequest } from "../../src/chat/sessionVerbs";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";
import { SessionTranscript } from "./SessionTranscript";

import {
  answerTextOf,
  ensureDisplayRenderers,
  noteTurn,
  postSurface,
  reportNoSession,
  reportSessionChanged,
  reportSessionState,
  reportToolDisplay,
  reportToolResult,
  setSurfaceContext,
} from "./sessionSurfaces";

// A deployed application's chat (STUDIO A-18), loaded when one is picked.
const LazyAppChat = React.lazy(() => import("./AppChat"));

/** The picker's value for a runtime. */
const RUNTIME = "runtime:";

/** The picker's value for a deployed application. */
const APP = "app:";

// Lazy-load the heavy Chat component. Webpack will code-split this into
// a separate async chunk (`agentChat.vendors-xxx.chunk.js`).
const LazyChat = React.lazy(
  () => import("@datalayer/agent-runtimes/lib/chat/Chat"),
);

/** Props for the error boundary. */
interface ChatErrorBoundaryProps {
  /** Child elements to wrap. */
  children: ReactNode;
  /** Callback to retry rendering the chat. */
  onRetry: () => void;
}

/** State for the error boundary. */
interface ChatErrorBoundaryState {
  /** The caught error, if any. */
  error: Error | null;
}

/**
 * Error boundary that catches rendering errors from the lazy-loaded Chat
 * component and displays a recovery UI instead of crashing the sidebar.
 */
class ChatErrorBoundary extends Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  /** @param props - Component props. */
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  /** @inheritdoc */
  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { error };
  }

  /** @inheritdoc */
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AgentChat] Chat component error:", error, info);
  }

  /** @inheritdoc */
  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={containerStyle}>
          <p
            style={{
              ...messageStyle,
              color: "var(--vscode-errorForeground)",
            }}
          >
            Chat failed to load.
          </p>
          <p style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Authentication state pushed from the extension host. */
export interface AgentChatAuthState {
  /** Whether the user is signed in. */
  authenticated: boolean;
  /** User details or null when not authenticated. */
  user: { handle: string; email: string } | null;
}

/** Chat settings pushed from the extension host. */
export interface AgentChatSettings {
  /** Transport protocol (e.g. `vercel-ai-jupyter`). */
  protocol: string;
  /** Agent spec ID (e.g. `codeai/simple`). */
  agentSpecId: string;
}

/** Minimal runtime handle for the agent picker. */
export interface ChatAgentHandle {
  /** Kubernetes pod name — used as runtime identifier. */
  runtimeName: string;
  /** A Datalayer runtime's uid: what a session's `runsOn` names. */
  uid?: string;
  /** Ingress URL — used as `baseUrl` on `<Chat>`. */
  ingress: string;
  /** Per-runtime auth token — used as `authToken` on `<Chat>`. */
  token: string;
  /** User-friendly display name. */
  givenName: string;
  /** Environment label. */
  environmentName: string;
  /** Where it runs: `local` for a local runtime of a workspace folder, else Datalayer. */
  place?: "datalayer" | "local";
}

/** Props for the App component. */
export interface AppProps {
  /** Current VS Code theme. */
  theme: "light" | "dark";
  /** Authentication state. */
  auth: AgentChatAuthState;
  /** Chat settings from VS Code configuration. */
  settings: AgentChatSettings | null;
  /** Available runtime agents, or null while loading. */
  agents: ChatAgentHandle[] | null;
  /** Error from agent listing, if any. */
  agentsError: string | null;
  /** Bridge client implementing IAgentRuntimesClient, or null. */
  client: IAgentRuntimesClient | null;
  /**
   * True while a sidebar-initiated agent provisioning is in flight.
   * Drives the spinner shown in place of the "Create Agent" button so the
   * user gets immediate feedback during the 5–30s spin-up window.
   */
  creatingAgent: boolean;
  /** The person's deployments, each talked to or why not; null while loading. */
  deployments: AppChatChoice[] | null;
  /** Why the deployments could not be listed, if they could not. */
  deploymentsError: string | null;
  /** The ai-agents and Spacer base URLs a deployment's chat asks. */
  services: { aiAgentsUrl: string; spacerUrl: string } | null;
  /** The session the Sessions view asked to open, or null. */
  openRequest: OpenSessionRequest | null;
  /** The local runtimes' pending approvals, by runtime address (VS-07). */
  localApprovals: Record<string, ApprovalRaised[]>;
  /** Reads the editor's open file, through the extension host. */
  readEditor: () => Promise<EditorContext | undefined>;
  /** Asks the extension host to sign the person for a deployment (D-21). */
  signUser: (deploymentUid: string) => Promise<void>;
  /** Asks the extension host for a session's conversation from its record. */
  readSessionRecord: (uid: string) => Promise<TranscriptLine[]>;
  /** Callback to request agent list refresh. */
  onRefreshAgents: () => void;
  /** Callback to create a new agent runtime. */
  onCreateAgent: () => void;
  /** Callback to trigger the Datalayer sign-in flow. */
  onLogin: () => void;
}

/**
 * Root application component for the Agent Chat sidebar.
 *
 * Installs Datalayer's `vscode` theme at the top of the tree — the editor's
 * own colours on every Primer component, portals included — so components
 * that read theme tokens from React context (e.g. `ActionMenu.Overlay`
 * rendered into a portal) don't throw
 * "Cannot read properties of undefined (reading 'theme')". The actual
 * state/branching logic lives in `AppInner` (a private function in this
 * module) so the theme wrappers sit at the very root and are never
 * unmounted across renders. The `colorMode` follows the VS Code `theme`
 * prop so the chat tracks the editor's light/dark mode.
 *
 * @param props - Component props.
 *
 * @returns React element.
 */
export function App(props: AppProps): React.JSX.Element {
  return (
    <PrimerVSCodeTheme colorMode={props.theme} style={{ height: "100%" }}>
      <AppInner {...props} />
    </PrimerVSCodeTheme>
  );
}

/**
 * Inner App component containing all of the state, routing, and rendering
 * logic. Kept separate from {@link App} so that the Primer `ThemeProvider`
 * / `BaseStyles` wrappers sit at the root of the tree and are never
 * unmounted across renders.
 *
 * @param props - Component props.
 *
 * @returns React element.
 */
function AppInner(props: AppProps): React.JSX.Element {
  const {
    auth,
    settings,
    agents,
    agentsError,
    client,
    creatingAgent,
    deployments,
    deploymentsError,
    services,
    openRequest,
    localApprovals,
    readEditor,
    signUser,
    readSessionRecord,
    onRefreshAgents,
    onCreateAgent,
    onLogin,
  } = props;

  // `runtime:<pod>` or `app:<deployment uid>`.
  const [selected, setSelected] = useState<string | null>(null);
  // What the chat says of a session opened from the Sessions view.
  const [openSaid, setOpenSaid] = useState("");
  // The session open in the chat, from the Sessions view: while it is, the
  // picker is not drawn — its conversation is its runtime's, never pointed
  // at another — until the person goes back to all agents.
  const [opened, setOpened] = useState<OpenSessionRequest | null>(null);
  // A session the chat cannot talk to (a team run's seat, one on no
  // runtime): its conversation read from its record, read-only.
  const [recordRead, setRecordRead] = useState<RecordRead | null>(null);

  // A session opened from the Sessions view: the chat set to its place —
  // the local runtime of its folder, the deployment of its application, the
  // runtime it runs on at Datalayer — and the session said; none, said why.
  const handledOpen = useRef<OpenSessionRequest | null>(null);
  useEffect(() => {
    // Each request once, when the lists are read: a later pick of the
    // person's is theirs.
    if (!openRequest || handledOpen.current === openRequest) {
      return;
    }
    if (agents === null && deployments === null) {
      return;
    }
    handledOpen.current = openRequest;
    const choice = openSessionChoice(
      openRequest,
      agentsError ? [] : (agents ?? []),
      deployments ?? [],
    );
    setOpened(openRequest);
    setSelected(choice.value);
    setOpenSaid(choice.said);
    setRecordRead(choice.record ?? null);
  }, [openRequest, agents, agentsError, deployments]);

  // Back to all agents: the session closed here, the picker drawn again.
  const backToAgents = useCallback(() => {
    setOpened(null);
    setSelected(null);
    setOpenSaid("");
    setRecordRead(null);
  }, []);

  // The same deployments listed again change nothing: the conversation
  // open survives a refresh (memoized on what is talked to, not the list).
  const talkableKey = talkableKeyOf(deployments ?? []);
  const talkable = useMemo(
    () =>
      (deployments ?? []).flatMap((choice) =>
        choice.kind === "talk" ? [choice.handle] : [],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [talkableKey],
  );
  const closed = (deployments ?? []).flatMap((choice) =>
    choice.kind === "closed" ? [choice] : [],
  );
  // The runtimes failing to list hides no application: they count as none.
  const runtimes = agentsError ? [] : (agents ?? []);

  // Auto-select when there is exactly one choice, or clear a selection that
  // no longer exists in the refreshed lists. Never while a session is open:
  // what it is talked to on is its own place, or nothing.
  useEffect(() => {
    if (agents === null && talkable.length === 0) {
      return;
    }
    const values = [
      ...runtimes.map((a) => RUNTIME + a.runtimeName),
      ...talkable.map((handle) => APP + handle.uid),
    ];
    if (values.length === 1 && !opened) {
      if (selected !== values[0]) {
        setSelected(values[0]!);
      }
      return;
    }
    if (selected !== null && !values.includes(selected)) {
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, agentsError, talkable, selected, opened]);

  const selectedAgent = useMemo(() => {
    if (!agents || !selected?.startsWith(RUNTIME)) {
      return null;
    }
    const pod = selected.slice(RUNTIME.length);
    return agents.find((a) => a.runtimeName === pod) ?? null;
  }, [agents, selected]);

  // The deployment picked, as the newest listing has it (its runtime, agent
  // or version may have changed since it was picked).
  const selectedApp = useMemo(
    () =>
      selected?.startsWith(APP)
        ? pickedHandleOf(deployments ?? [], selected.slice(APP.length))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [talkableKey, selected],
  );

  const handleAgentChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSelected(event.target.value || null);
    },
    [],
  );

  // A session of a deployed application opened from the Sessions view
  // (VS-24): its conversation read by uid on the kept runtime.
  const openedApp =
    opened &&
    opened.place.kind !== "local" &&
    selectedApp &&
    Boolean(opened.appUid) &&
    selectedApp.appUid === opened.appUid
      ? opened
      : null;

  // The session opened on the runtime picked (VS-24): the Sessions view's
  // request, when it names this local runtime — its conversation read by
  // uid over the session API, the thread's menu drawn.
  const openedLocal =
    opened &&
    opened.place.kind === "local" &&
    selectedAgent?.place === "local" &&
    opened.place.url.replace(/\/+$/, "") ===
      selectedAgent.ingress.replace(/\/+$/, "")
      ? opened
      : null;

  // A session on Datalayer opened on the runtime it runs on: its
  // conversation read by uid over that runtime's session API, signed with
  // the runtime's token as the runtime pick is.
  const openedDatalayer =
    opened &&
    opened.place.kind === "datalayer" &&
    Boolean(opened.runtimeUid) &&
    selectedAgent &&
    selectedAgent.place !== "local" &&
    (selectedAgent.runtimeName === opened.runtimeUid ||
      selectedAgent.uid === opened.runtimeUid)
      ? opened
      : null;

  // The session talked to on the runtime picked, local or on Datalayer.
  const openedOnRuntime = openedLocal ?? openedDatalayer;

  // A runtime picked (not a session): its agents read from its own list,
  // once per pick — `default` on a runtime of the person's, the
  // application's own on an application's kept runtime — and the one talked
  // to spoken to on its own transport. Several: the person picks.
  const pickedRuntime = selectedAgent && !opened ? selectedAgent : null;
  const pickedRuntimeKey = pickedRuntime
    ? `${pickedRuntime.runtimeName} ${pickedRuntime.ingress}`
    : "";
  const pickedRuntimeRef = useRef(pickedRuntime);
  pickedRuntimeRef.current = pickedRuntime;
  const settingsProtocol = settings?.protocol ?? "";
  const [runtimeAgents, setRuntimeAgents] = useState<
    | { key: string; choice: RuntimeAgentChoice }
    | { key: string; error: string }
    | null
  >(null);
  const [runtimeAgentPick, setRuntimeAgentPick] = useState("");
  useEffect(() => {
    setRuntimeAgents(null);
    setRuntimeAgentPick("");
    const runtime = pickedRuntimeRef.current;
    if (!pickedRuntimeKey || !runtime) {
      return undefined;
    }
    const abort = new AbortController();
    fetchRuntimeAgents(
      runtime.ingress,
      runtime.token,
      (url, init) => fetch(url, init),
      abort.signal,
    )
      .then((answer) => {
        if (!abort.signal.aborted) {
          setRuntimeAgents({
            key: pickedRuntimeKey,
            choice: runtimeAgentOf(
              answer,
              runtime.givenName || runtime.runtimeName,
              settingsProtocol,
            ),
          });
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setRuntimeAgents({
            key: pickedRuntimeKey,
            error: RUNTIME_AGENT_WORDS.failed(
              runtime.givenName || runtime.runtimeName,
              error instanceof Error ? error.message : String(error),
            ),
          });
        }
      });
    return () => {
      abort.abort();
    };
  }, [pickedRuntimeKey, settingsProtocol]);
  const runtimeAgentsNow =
    runtimeAgents && runtimeAgents.key === pickedRuntimeKey
      ? runtimeAgents
      : null;
  const runtimeChoice =
    runtimeAgentsNow && "choice" in runtimeAgentsNow
      ? runtimeAgentsNow.choice
      : null;
  // The agent talked to on the runtime picked: the one its list names, or
  // the one the person picked of several.
  const runtimeAgent: RuntimeAgent | null =
    runtimeChoice?.kind === "agent"
      ? runtimeChoice.agent
      : runtimeChoice?.kind === "several"
        ? (runtimeChoice.agents.find(
            (agent) => agent.id === runtimeAgentPick,
          ) ?? null)
        : null;

  // What the chat talks to on the runtime picked: a session's own agent over
  // the session API, or the agent the runtime lists on its own transport.
  const runtimeTalk = !selectedAgent
    ? null
    : openedLocal
      ? {
          agentId: openedLocal.agent,
          protocol: sessionProtocol(selectedAgent.ingress, openedLocal.agent),
          baseUrl: selectedAgent.ingress,
        }
      : openedDatalayer
        ? {
            agentId: openedDatalayer.agent,
            protocol: sessionProtocol(
              agentRuntimesUrlOf(selectedAgent.ingress),
              openedDatalayer.agent,
              selectedAgent.token,
            ),
            baseUrl: agentRuntimesUrlOf(selectedAgent.ingress),
          }
        : runtimeAgent
          ? {
              agentId: runtimeAgent.id,
              protocol: runtimeAgent.protocol,
              baseUrl: selectedAgent.ingress,
            }
          : null;

  // The session the editor's surfaces are told of: a runtime's chat here
  // (an application's chat names its own in `AppChat`); none when nothing
  // is picked. The displays' renderers (a diff, a terminal) are mounted once.
  useEffect(() => {
    if (selectedAgent && (openedOnRuntime || runtimeAgent)) {
      ensureDisplayRenderers();
      setSurfaceContext({
        sessionKey: openedOnRuntime
          ? openedOnRuntime.uid
          : `runtime:${selectedAgent.runtimeName}`,
        title: openedOnRuntime?.title || selectedAgent.givenName,
        agent: openedOnRuntime?.agent ?? runtimeAgent?.id ?? "",
        harness: "",
        app: openedOnRuntime?.title || selectedAgent.givenName,
        local: selectedAgent.place === "local",
      });
      reportSessionState({ turn: "idle" });
      return () => {
        setSurfaceContext(null);
        reportNoSession();
      };
    }
    if (!selectedApp) {
      reportNoSession();
    }
    return undefined;
  }, [selectedAgent, selectedApp, openedOnRuntime, runtimeAgent]);

  // A local runtime's approvals (VS-07): the banner's source for a session
  // on this machine — read by the host over the runtime's websocket; the
  // banner listing them is what allows a decision from the notification.
  const localPending = useMemo<ApprovalRaised[]>(
    () =>
      selectedAgent?.place === "local"
        ? (localApprovals[selectedAgent.ingress.replace(/\/+$/, "")] ?? [])
        : [],
    [selectedAgent, localApprovals],
  );
  useEffect(() => {
    if (localPending.length > 0) {
      postSurface({
        type: "approval-shown",
        ids: localPending.map((approval) => approval.id),
      });
    }
  }, [localPending]);
  const decideLocal = useCallback(
    (approvalId: string, approved: boolean): void => {
      if (!selectedAgent) {
        return;
      }
      postSurface({
        type: "local-approval-decide",
        url: selectedAgent.ingress,
        id: approvalId,
        approved,
      });
    },
    [selectedAgent],
  );

  // Not authenticated — show sign-in prompt.
  if (!auth.authenticated) {
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>
          <a
            href="#"
            style={linkStyle}
            onClick={(event) => {
              event.preventDefault();
              onLogin();
            }}
          >
            Sign in to Datalayer
          </a>{" "}
          to use Agent Chat.
        </p>
      </div>
    );
  }

  // The chat drawn: the deployment picked, or the runtime picked. While a
  // session is open, only its own conversation — never another agent's.
  const sessionChatReady = !opened || Boolean(openedApp || openedOnRuntime);
  const chat = !sessionChatReady ? null : selectedApp && services && client ? (
    <ChatErrorBoundary
      onRetry={() => {
        setSelected(null);
      }}
    >
      <Suspense fallback={<LoadingChat />}>
        <AgentRuntimesClientProvider client={client}>
          <LazyAppChat
            // A new conversation for each deployment picked, or when
            // where it is kept changes; the same listing keeps it.
            // A session opened from the Sessions view is another.
            key={`${selectedApp.uid} ${selectedApp.version} ${selectedApp.url} ${selectedApp.agentId} ${openedApp?.uid ?? ""}`}
            handle={selectedApp}
            openUid={openedApp?.uid}
            services={services}
            user={auth.user}
            readEditor={readEditor}
            signUser={signUser}
          />
        </AgentRuntimesClientProvider>
      </Suspense>
    </ChatErrorBoundary>
  ) : selectedAgent && settings && client && runtimeTalk ? (
    <ChatErrorBoundary
      onRetry={() => {
        setSelected(null);
      }}
    >
      <Suspense fallback={<LoadingChat />}>
        <AgentRuntimesClientProvider client={client}>
          <LazyChat
            // A session opened from the Sessions view (VS-24): its
            // conversation, over the session API; another open is
            // another chat.
            key={
              openedOnRuntime
                ? `session:${openedOnRuntime.uid}`
                : `runtime:${selectedAgent.runtimeName}:${runtimeTalk.agentId}`
            }
            protocol={runtimeTalk.protocol}
            thread={
              openedOnRuntime
                ? {
                    id: openedOnRuntime.uid,
                    messages: [],
                    fromRuntime: true,
                  }
                : undefined
            }
            sessionActions={openedOnRuntime ? {} : undefined}
            baseUrl={runtimeTalk.baseUrl}
            authToken={selectedAgent.token}
            // A session's agent is its own (its application's agent);
            // otherwise the agent the runtime lists (`default` on a
            // runtime of the person's, the application's own on an
            // application's kept runtime), never assumed. The pod
            // identifier goes in `runtimeId` for telemetry.
            agentId={runtimeTalk.agentId}
            // The editor's theme, never the chat's own (Matrix).
            // The sidebar is narrow and the indicator at its left edge: its
            // details open below and to the right, never cut by the edge.
            kernelIndicatorPosition="se"
            runtimeId={selectedAgent.runtimeName}
            height="100%"
            showHeader={true}
            showInput={true}
            autoFocus={true}
            autoConnect={true}
            streaming={true}
            clearOnMount={true}
            // What the editor draws of the session: a terminal's
            // output in the Terminal panel, the turn in the status bar.
            onToolCallUpdate={({ display }) => {
              reportToolDisplay(display);
            }}
            onToolCallComplete={({ toolName, result }) => {
              reportToolResult(toolName, result);
            }}
            pendingApprovals={localPending}
            onApproveApproval={(approvalId) => decideLocal(approvalId, true)}
            onRejectApproval={(approvalId) => decideLocal(approvalId, false)}
            onMessageSent={() => {
              noteTurn();
              reportSessionState({ turn: "running" });
            }}
            onMessageReceived={(message) => {
              reportSessionState({
                turn: "idle",
                lastAnswer: answerTextOf(message),
              });
              reportSessionChanged();
            }}
          />
        </AgentRuntimesClientProvider>
      </Suspense>
    </ChatErrorBoundary>
  ) : null;

  // Agents loading, and no application to talk to yet.
  if (agents === null && talkable.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>Loading agents...</p>
      </div>
    );
  }

  // A session open from the Sessions view: no picker — a back control, its
  // title and state, then its conversation on its own runtime, or why not.
  if (opened) {
    return (
      <div style={columnStyle}>
        <div style={pickerBarStyle}>
          <button
            type="button"
            style={backButtonStyle}
            onClick={backToAgents}
            title="All agents"
            aria-label="All agents"
          >
            &#x2190; All agents
          </button>
          <span style={sessionTitleStyle} title={opened.title}>
            {opened.title || "This session"}
          </span>
          <span style={sessionStateStyle}>{opened.state}</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {chat ??
            (recordRead ? (
              <SessionTranscript
                key={opened.uid}
                uid={opened.uid}
                read={recordRead}
                readSessionRecord={readSessionRecord}
              />
            ) : (
              <div style={containerStyle}>
                <p style={messageStyle}>{openSaid}</p>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Error fetching agents, and no application to talk to: the error is
  // fatal only then (an application's chat does not need the runtimes).
  if (agentsError && talkable.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={{ ...messageStyle, color: "var(--vscode-errorForeground)" }}>
          Failed to load agents: {agentsError}
        </p>
        <button type="button" style={buttonStyle} onClick={onRefreshAgents}>
          Retry
        </button>
      </div>
    );
  }

  // No agents, and no application to talk to.
  if (runtimes.length === 0 && talkable.length === 0) {
    if (creatingAgent) {
      // The "Create Agent" flow is in flight (spec picker → API call →
      // pod spin-up). Provisioning takes 5–30s; without this in-place
      // feedback the empty state looks frozen and users second-guess the
      // click.
      return (
        <div style={containerStyle}>
          <div style={spinnerStyle} aria-hidden="true" />
          <p style={messageStyle}>Provisioning agent…</p>
          <p style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}>
            This usually takes a few seconds.
          </p>
        </div>
      );
    }
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>No agents available.</p>
        {deployments !== null ? (
          <p style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}>
            {deploymentsError
              ? `${APP_CHAT_WORDS.listFailed}: ${deploymentsError}`
              : noneTalkableSentence(deployments)}
          </p>
        ) : null}
        {closed.map((choice) => (
          <p
            key={choice.uid}
            style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}
          >
            {choice.why}
          </p>
        ))}
        <p style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}>
          Create an agent to start chatting.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={buttonStyle} onClick={onCreateAgent}>
            Create Agent
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={onRefreshAgents}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Agent picker + Chat.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      {/* Agent picker bar */}
      <div style={pickerBarStyle}>
        <select
          value={selected ?? ""}
          onChange={handleAgentChange}
          style={selectStyle}
          aria-label="Select agent"
        >
          <option value="">-- Select an agent --</option>
          {talkable.length > 0 ? (
            <optgroup label={APP_CHAT_WORDS.pickerGroup}>
              {talkable.map((handle) => (
                <option key={handle.uid} value={APP + handle.uid}>
                  {handle.name}
                  {handle.slug
                    ? ` (/apps/${handle.slug})`
                    : ` (${handle.target})`}
                </option>
              ))}
            </optgroup>
          ) : null}
          {closed.length > 0 ? (
            // Closed choices stay in the picker, each with why.
            <optgroup label={APP_CHAT_WORDS.closedGroup}>
              {closed.map((choice) => (
                <option key={choice.uid} value="" disabled title={choice.why}>
                  {choice.name}: {choice.why}
                </option>
              ))}
            </optgroup>
          ) : null}
          {runtimes.length > 0 ? (
            <optgroup label={APP_CHAT_WORDS.runtimesGroup}>
              {runtimes.map((a) => (
                <option key={a.runtimeName} value={RUNTIME + a.runtimeName}>
                  {a.givenName} ({a.environmentName})
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button
          type="button"
          style={refreshButtonStyle}
          onClick={onRefreshAgents}
          title="Refresh agents"
          aria-label="Refresh agents"
        >
          &#x21bb;
        </button>
      </div>
      {deploymentsError || agentsError ? (
        // Said beside the picker, whatever else is listed or picked.
        <p
          style={{
            ...messageStyle,
            fontSize: "12px",
            margin: "4px 8px",
            color: "var(--vscode-errorForeground)",
          }}
        >
          {deploymentsError
            ? `${APP_CHAT_WORDS.listFailed}: ${deploymentsError}`
            : `Failed to load agents: ${agentsError}`}
        </p>
      ) : null}

      {runtimeChoice?.kind === "several" ? (
        // Several agents on the runtime picked: the person picks one,
        // none is guessed.
        <div style={pickerBarStyle}>
          <select
            value={runtimeAgentPick}
            onChange={(event) => {
              setRuntimeAgentPick(event.target.value);
            }}
            style={{ ...selectStyle, fontSize: "12px" }}
            aria-label={RUNTIME_AGENT_WORDS.pickLabel}
          >
            <option value="">{RUNTIME_AGENT_WORDS.pickPrompt}</option>
            {runtimeChoice.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name === agent.id
                  ? agent.id
                  : `${agent.name} (${agent.id})`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Chat area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {chat ?? (
          <div style={containerStyle}>
            {!pickedRuntime ? (
              <p style={messageStyle}>
                Select an agent above to start chatting.
              </p>
            ) : !runtimeAgentsNow ? (
              <p style={{ ...messageStyle, fontSize: "12px", opacity: 0.7 }}>
                {RUNTIME_AGENT_WORDS.reading}
              </p>
            ) : "error" in runtimeAgentsNow ? (
              <p
                style={{
                  ...messageStyle,
                  color: "var(--vscode-errorForeground)",
                }}
              >
                {runtimeAgentsNow.error}
              </p>
            ) : runtimeAgentsNow.choice.kind === "none" ? (
              <p style={messageStyle}>{runtimeAgentsNow.choice.said}</p>
            ) : runtimeAgentsNow.choice.kind === "several" ? (
              <p style={messageStyle}>{RUNTIME_AGENT_WORDS.pickAbove}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Loading fallback shown while the Chat chunk is downloading.
 *
 * @returns React element.
 */
function LoadingChat(): React.JSX.Element {
  return (
    <div style={containerStyle}>
      <p style={messageStyle}>Loading chat...</p>
    </div>
  );
}

// --- Inline styles (VS Code CSS variables for theme integration) ---

const containerStyle: React.CSSProperties = {
  padding: "16px",
  fontFamily: "var(--vscode-font-family)",
  fontSize: "var(--vscode-font-size)",
  color: "var(--vscode-foreground)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  gap: "8px",
};

const messageStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--vscode-button-background)",
  color: "var(--vscode-button-foreground)",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
  fontSize: "var(--vscode-font-size)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--vscode-textLink-foreground)",
  textDecoration: "underline",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--vscode-button-secondaryBackground)",
  color: "var(--vscode-button-secondaryForeground)",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
  fontSize: "var(--vscode-font-size)",
};

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  overflow: "hidden",
};

const backButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  background: "var(--vscode-button-secondaryBackground)",
  color: "var(--vscode-button-secondaryForeground)",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
  fontSize: "var(--vscode-font-size)",
  flexShrink: 0,
};

const sessionTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  alignSelf: "center",
  fontFamily: "var(--vscode-font-family)",
  fontSize: "var(--vscode-font-size)",
  color: "var(--vscode-foreground)",
};

const sessionStateStyle: React.CSSProperties = {
  alignSelf: "center",
  flexShrink: 0,
  fontSize: "12px",
  color: "var(--vscode-descriptionForeground)",
};

const pickerBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  padding: "8px",
  borderBottom: "1px solid var(--vscode-panel-border)",
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  background: "var(--vscode-input-background)",
  color: "var(--vscode-input-foreground)",
  border: "1px solid var(--vscode-input-border, transparent)",
  borderRadius: "2px",
  fontSize: "var(--vscode-font-size)",
  fontFamily: "var(--vscode-font-family)",
};

const refreshButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  background: "var(--vscode-button-secondaryBackground)",
  color: "var(--vscode-button-secondaryForeground)",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
  fontSize: "14px",
};

// Inline `style` attributes can't define `@keyframes`, so we inject the
// spinner animation rule once at module load.
const SPINNER_KEYFRAMES_ID = "datalayer-agent-chat-spinner-kf";
if (
  typeof document !== "undefined" &&
  !document.getElementById(SPINNER_KEYFRAMES_ID)
) {
  const styleEl = document.createElement("style");
  styleEl.id = SPINNER_KEYFRAMES_ID;
  styleEl.textContent =
    "@keyframes datalayer-agent-chat-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(styleEl);
}

const spinnerStyle: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  border: "3px solid var(--vscode-progressBar-background, #007acc)",
  borderTopColor: "transparent",
  animation: "datalayer-agent-chat-spin 0.9s linear infinite",
};
