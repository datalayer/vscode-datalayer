/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Agent Chat sidebar application component.
 *
 * Renders an agent picker when multiple runtimes are available, then
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
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";

import type { IAgentRuntimesClient } from "@datalayer/agent-runtimes/lib/client/IAgentRuntimesClient";
import { AgentRuntimesClientProvider } from "@datalayer/agent-runtimes/lib/client/AgentRuntimesClientContext";
import type { Protocol } from "@datalayer/agent-runtimes/lib/types/protocol";
import { BaseStyles, ThemeProvider } from "@primer/react";

/**
 * Protocols the embedded `<Chat>` component accepts. Mirrors the upstream
 * `Protocol` type exactly — kept here as a runtime allowlist so the
 * settings string from VS Code can be narrowed safely without resorting
 * to a `as Protocol` cast that would silently let unknown values through.
 */
const SUPPORTED_PROTOCOLS = [
  "ag-ui",
  "a2a",
  "acp",
  "vercel-ai",
  "vercel-ai-jupyter",
] as const satisfies readonly Protocol[];

/** Default applied when the user's setting is missing or unrecognized. */
const DEFAULT_PROTOCOL: Protocol = "vercel-ai";

/**
 * Narrows an arbitrary settings string into the upstream {@link Protocol}
 * type. Returns {@link DEFAULT_PROTOCOL} when the value is unrecognized
 * so the chat still mounts instead of throwing on a type mismatch.
 *
 * @param raw - Protocol string read from VS Code settings.
 *
 * @returns A guaranteed-valid `Protocol` value.
 */
function narrowProtocol(raw: string): Protocol {
  return (SUPPORTED_PROTOCOLS as readonly string[]).includes(raw)
    ? (raw as Protocol)
    : DEFAULT_PROTOCOL;
}

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
  podName: string;
  /** Ingress URL — used as `baseUrl` on `<Chat>`. */
  ingress: string;
  /** Per-runtime auth token — used as `authToken` on `<Chat>`. */
  token: string;
  /** User-friendly display name. */
  givenName: string;
  /** Environment label. */
  environmentName: string;
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
 * Installs the Primer `ThemeProvider` + `BaseStyles` at the top of the
 * tree so Primer components that read theme tokens from React context
 * (e.g. `ActionMenu.Overlay` rendered into a portal) don't throw
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
    <ThemeProvider colorMode={props.theme === "dark" ? "night" : "day"}>
      <BaseStyles style={{ height: "100%" }}>
        <AppInner {...props} />
      </BaseStyles>
    </ThemeProvider>
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
    onRefreshAgents,
    onCreateAgent,
    onLogin,
  } = props;

  const [selectedPod, setSelectedPod] = useState<string | null>(null);

  // Auto-select when there is exactly one agent, or when the previously
  // selected pod no longer exists in the refreshed list.
  useEffect(() => {
    if (!agents) {
      return;
    }
    if (agents.length === 1) {
      const only = agents[0]!.podName;
      if (selectedPod !== only) {
        setSelectedPod(only);
      }
      return;
    }
    if (
      selectedPod !== null &&
      !agents.some((a) => a.podName === selectedPod)
    ) {
      setSelectedPod(null);
    }
  }, [agents, selectedPod]);

  const selectedAgent = useMemo(() => {
    if (!agents || !selectedPod) {
      return null;
    }
    return agents.find((a) => a.podName === selectedPod) ?? null;
  }, [agents, selectedPod]);

  const handleAgentChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedPod(event.target.value || null);
    },
    [],
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

  // Agents loading.
  if (agents === null) {
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>Loading agents...</p>
      </div>
    );
  }

  // Error fetching agents.
  if (agentsError) {
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

  // No agents available.
  if (agents.length === 0) {
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
          value={selectedPod ?? ""}
          onChange={handleAgentChange}
          style={selectStyle}
          aria-label="Select agent"
        >
          <option value="">-- Select an agent --</option>
          {agents.map((a) => (
            <option key={a.podName} value={a.podName}>
              {a.givenName} ({a.environmentName})
            </option>
          ))}
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

      {/* Chat area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {selectedAgent && settings && client ? (
          <ChatErrorBoundary
            onRetry={() => {
              setSelectedPod(null);
            }}
          >
            <Suspense fallback={<LoadingChat />}>
              <AgentRuntimesClientProvider client={client}>
                <LazyChat
                  protocol={narrowProtocol(settings.protocol)}
                  baseUrl={selectedAgent.ingress}
                  authToken={selectedAgent.token}
                  // The SAAS agent-runtimes server names the default agent
                  // within a pod `default`; it's not the pod name. The pod
                  // identifier goes in `runtimeId` for tracking/telemetry.
                  agentId="default"
                  runtimeId={selectedAgent.podName}
                  height="100%"
                  showHeader={true}
                  showInput={true}
                  autoFocus={true}
                  autoConnect={true}
                  streaming={true}
                  clearOnMount={true}
                />
              </AgentRuntimesClientProvider>
            </Suspense>
          </ChatErrorBoundary>
        ) : (
          <div style={containerStyle}>
            <p style={messageStyle}>Select an agent above to start chatting.</p>
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
