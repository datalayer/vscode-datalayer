/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A deployed application's agent, talked to in the Agent Chat sidebar
 * (STUDIO A-18).
 *
 * The conversation is `@datalayer/agent-runtimes`' `<Chat>` over the
 * runtime's session API — an AG-UI run on
 * `<kept runtime>/api/v1/apps/agents/<agent>/ag-ui/`, each thread a session
 * (R-02), as the application's hosted page speaks to it. Every request goes
 * through the network bridge, which signs the ones the extension host lets
 * it with the person's token: the view never holds it.
 *
 * Before the chat opens, the application's Appspec is read from its Spacer
 * item, and only the version the deployment runs decides — another one is
 * refused in a sentence. One that takes only a signed user (D-21) is opened
 * once the extension host has asked ai-agents to sign the person
 * (`signUser`): the host puts the user token in each run's body as
 * `forwardedProps.loop.user_token`, and the view never holds it either;
 * what its host may pass (D-10) decides whether its
 * agent is given `host_context`, answered with the editor's open file as
 * `page`. Its approvals (R-05) are ai-agents' Tool Approvals, polled while
 * the chat is open and answered by `<Chat>`'s approval banner; its tool
 * calls are listed as the transcript's lines (A-06) under the chat. The
 * active Datalayer notebook's or document's tools are its agent's too
 * (`./documentTools`), decided by its rules: a call asked of the person is
 * shown in the same banner and answered here.
 *
 * @module webview/agentChat/AppChat
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Chat from "@datalayer/agent-runtimes/lib/chat/Chat";
import { actionOf } from "@datalayer/agent-runtimes/lib/portable/approvalCard";

import {
  agUiEndpoint,
  APP_CHAT_WORDS,
  appHostOf,
  appItemUrl,
  type AppChatApproval,
  type AppChatHandle,
  type AppHost,
  approvalUrl,
  decideApprovalUrl,
  editorContextRefusal,
  type EditorContext,
  hostContextTool,
  pendingApprovalsOf,
  pendingApprovalsUrl,
  revisionRefusal,
  takesSignedUser,
  toolLineOf,
  userTokenRefusal,
} from "../../src/chat/appChat";
import {
  ATTENTION_WORDS,
  decisionOutcome,
  stillPending,
} from "../../src/chat/attention";
import type { DocumentToolSpec } from "../../src/chat/documentTools";
import { type CallDocumentTool, useDocumentTools } from "./documentTools";
import {
  answerTextOf,
  ensureDisplayRenderers,
  noteTurn,
  postSurface,
  registerApprovalHandlers,
  reportNoSession,
  reportSessionChanged,
  reportSessionState,
  reportToolDisplay,
  reportToolResult,
  setSurfaceContext,
} from "./sessionSurfaces";

/** How often the approvals the agent waits on are read, while open. */
const APPROVALS_POLL_MS = 3_000;

/** Props for {@link AppChat}. */
export interface AppChatProps {
  /** The deployment talked to. */
  handle: AppChatHandle;
  /** The ai-agents and Spacer base URLs. */
  services: { aiAgentsUrl: string; spacerUrl: string };
  /** The person signed in. */
  user: { handle: string; email: string } | null;
  /** Reads the editor's open file, through the extension host. */
  readEditor: () => Promise<EditorContext | undefined>;
  /** The notebook and document tools the extension host lists. */
  documentTools: DocumentToolSpec[];
  /** Runs one on the active Datalayer editor, through the extension host. */
  callDocumentTool: CallDocumentTool;
  /**
   * A session of the application opened from the Sessions view (VS-24):
   * its conversation is read by uid from the kept runtime.
   */
  openUid?: string;
  /**
   * Asks the extension host to sign the person for the deployment (D-21):
   * resolves when the host holds a user token for its runs, rejects with
   * ai-agents' sentence.
   */
  signUser: (deploymentUid: string) => Promise<void>;
}

/**
 * The detail of a refused answer, or its status.
 *
 * @param response - The answer.
 * @param what - What was asked, for the sentence.
 *
 * @returns The sentence.
 */
async function refusalOf(response: Response, what: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) {
      return body.detail;
    }
  } catch {
    // The status says it.
  }
  return `${what} was refused (${response.status}).`;
}

/**
 * A deployed application's chat: its Appspec read, then `<Chat>` on its
 * session API with its approvals, `host_context` and the transcript.
 *
 * @param props - Component props.
 *
 * @returns React element.
 */
export default function AppChat(props: AppChatProps): React.JSX.Element {
  const {
    handle,
    services,
    user,
    readEditor,
    documentTools,
    callDocumentTool,
    signUser,
    openUid,
  } = props;
  const [host, setHost] = useState<AppHost | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AppChatApproval[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  // The turn as the editor's status bar is told it, and what was last
  // answered (its first line, for a finished turn's notification).
  const [running, setRunning] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const approvalsRef = useRef<AppChatApproval[]>([]);
  approvalsRef.current = approvals;

  // The session the editor's surfaces are told of (its approvals as
  // notifications, its diffs, its terminal, the status bar); the displays'
  // renderers mounted once.
  useEffect(() => {
    ensureDisplayRenderers();
    setSurfaceContext({
      sessionKey: handle.uid,
      title: handle.name,
      agent: handle.agentId,
      harness: "",
      app: handle.name,
      local: false,
    });
    return () => {
      registerApprovalHandlers(null);
      setSurfaceContext(null);
      reportNoSession();
    };
  }, [handle.uid, handle.name, handle.agentId]);

  // The Appspec, from the application's Spacer item.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(
          appItemUrl(services.spacerUrl, handle.appUid),
        );
        if (!response.ok) {
          throw new Error(await refusalOf(response, "Reading the application"));
        }
        const read = appHostOf(await response.json());
        if (live) {
          setHost(read);
        }
      } catch (error) {
        if (live) {
          setProblem(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [handle.appUid, services.spacerUrl]);

  // Only the version deployed decides who its user is and what is passed.
  const revisionRefused = host ? revisionRefusal(handle, host) : "";
  const signed = Boolean(host && !revisionRefused && takesSignedUser(host));
  const [signedRefused, setSignedRefused] = useState("");
  const [signedReady, setSignedReady] = useState(false);

  // A signed application (D-21): the extension host asks ai-agents to sign
  // the person, and sends the user token with each run.
  useEffect(() => {
    setSignedRefused("");
    setSignedReady(false);
    if (!signed) {
      return;
    }
    let live = true;
    signUser(handle.uid)
      .then(() => {
        if (live) {
          setSignedReady(true);
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setSignedRefused(
            userTokenRefusal(
              handle.name,
              error instanceof Error ? error.message : String(error),
            ),
          );
        }
      });
    return () => {
      live = false;
    };
  }, [signed, signUser, handle.uid, handle.name]);

  const refused = revisionRefused || signedRefused;

  // The approvals its agent waits on, while the chat is open.
  const readApprovals = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        pendingApprovalsUrl(services.aiAgentsUrl, handle.agentId),
      );
      if (response.ok) {
        setApprovals(pendingApprovalsOf(await response.json(), handle.agentId));
      }
    } catch {
      // Read again at the next tick.
    }
  }, [services.aiAgentsUrl, handle.agentId]);

  useEffect(() => {
    if (!host || refused) {
      return;
    }
    void readApprovals();
    const timer = setInterval(() => {
      void readApprovals();
    }, APPROVALS_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [host, refused, readApprovals]);

  const decide = useCallback(
    async (approvalId: string, approved: boolean): Promise<boolean> => {
      const response = await fetch(
        decideApprovalUrl(services.aiAgentsUrl, approvalId, approved),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      await readApprovals();
      return response.ok;
    },
    [services.aiAgentsUrl, readApprovals],
  );

  // The chat is open on the application: its approvals are said as editor
  // notifications too (each once), and the banner showing them is what
  // allows a decision from the notification.
  const chatOpen = Boolean(host && !refused);
  useEffect(() => {
    if (!chatOpen || approvals.length === 0) {
      return;
    }
    postSurface({
      type: "approval-raised",
      app: handle.name,
      sessionKey: handle.uid,
      approvals: approvals.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        args: approval.args,
        agentId: approval.agentId,
        requestedAt: approval.requestedAt,
      })),
    });
    postSurface({
      type: "approval-shown",
      ids: approvals.map((approval) => approval.id),
    });
  }, [chatOpen, approvals, handle.name, handle.uid]);

  // A decision taken from the notification: the approval read again first
  // (one answered elsewhere is said so, one gone reveals nothing), then
  // sent through the one route, and what the route answered said.
  useEffect(() => {
    if (!chatOpen) {
      return;
    }
    registerApprovalHandlers({
      decide: async (approvalId, approved) => {
        const read = await fetch(approvalUrl(services.aiAgentsUrl, approvalId));
        if (!read.ok) {
          return decisionOutcome(read.status, approved, "");
        }
        const record = (await read.json()) as {
          status?: unknown;
          tool_name?: unknown;
        };
        if (!stillPending(record)) {
          await readApprovals();
          return ATTENTION_WORDS.answeredElsewhere;
        }
        const known = approvalsRef.current.find(
          (approval) => approval.id === approvalId,
        );
        const action = actionOf(
          known?.toolName ??
            (typeof record.tool_name === "string" ? record.tool_name : ""),
        );
        const response = await fetch(
          decideApprovalUrl(services.aiAgentsUrl, approvalId, approved),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        await readApprovals();
        return decisionOutcome(response.status, approved, action);
      },
      focus: () => {
        window.focus();
      },
    });
    return () => {
      registerApprovalHandlers(null);
    };
  }, [chatOpen, services.aiAgentsUrl, readApprovals]);

  // The active Datalayer notebook's or document's tools, decided by the
  // application's rules (the runtime hands their calls back to the view).
  const editorTools = useDocumentTools(
    documentTools,
    callDocumentTool,
    handle.agentId,
    host && !revisionRefusal(handle, host) ? host : undefined,
  );
  const decideEditorTool = editorTools.decide;
  const pending = useMemo(
    () => [...approvals, ...editorTools.asks],
    [approvals, editorTools.asks],
  );
  const documentToolNames = useMemo(
    () => documentTools.map((tool) => tool.name),
    [documentTools],
  );

  // The turn's phase, for the status bar: waiting for the person while an
  // approval is pending, answering while a turn runs, idle otherwise.
  useEffect(() => {
    if (!chatOpen) {
      return;
    }
    reportSessionState({
      turn: pending.length > 0 ? "waiting" : running ? "running" : "idle",
      ...(lastAnswer ? { lastAnswer } : {}),
    });
  }, [chatOpen, pending.length, running, lastAnswer]);

  // What VS Code passes as the host (D-10): only the version deployed's
  // terms, never a guess.
  const editorLine = host ? editorContextRefusal(handle, host) : "";
  const frontendTools = useMemo(() => {
    if (!host || revisionRefusal(handle, host)) {
      return [];
    }
    const tool = hostContextTool(host, readEditor, user);
    return [...(tool ? [tool] : []), ...editorTools.frontendTools];
  }, [host, handle, readEditor, user, editorTools.frontendTools]);

  if (problem) {
    return (
      <div style={containerStyle}>
        <p style={{ ...messageStyle, color: "var(--vscode-errorForeground)" }}>
          {problem}
        </p>
      </div>
    );
  }
  if (!host || (signed && !signedReady && !signedRefused)) {
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>{APP_CHAT_WORDS.reading}</p>
      </div>
    );
  }
  if (refused) {
    return (
      <div style={containerStyle}>
        <p style={messageStyle}>{refused}</p>
      </div>
    );
  }

  return (
    <div style={columnStyle}>
      <p style={noteStyle}>
        {editorLine ? editorLine : APP_CHAT_WORDS.passesFile}
      </p>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Chat
          protocol="ag-ui"
          // The session opened from the Sessions view (VS-24), read from
          // the kept runtime by uid; the thread's menu beside the header.
          thread={
            openUid
              ? { id: openUid, messages: [], fromRuntime: true }
              : undefined
          }
          sessionActions={{}}
          baseUrl={handle.url}
          endpoint={agUiEndpoint(handle)}
          configEndpoint={`${handle.url}/api/v1/configure`}
          agentId={handle.agentId}
          // The editor's theme (the view wraps the chat in it), never the
          // chat's own (Matrix).
          // The sidebar is narrow and the indicator at its left edge: its
          // details open below and to the right, never cut by the edge.
          kernelIndicatorPosition="se"
          height="100%"
          showHeader={true}
          showInput={true}
          autoFocus={true}
          autoConnect={true}
          streaming={true}
          clearOnMount={true}
          frontendTools={frontendTools}
          onToolCallStart={({ toolName }) => {
            setLines((said) => [
              ...said,
              toolLineOf(handle.name, toolName, host, documentToolNames),
            ]);
          }}
          // What the editor draws of the session: a terminal's output in
          // the Terminal panel, the turn in the status bar.
          onToolCallUpdate={({ display }) => {
            reportToolDisplay(display);
          }}
          onToolCallComplete={({ toolName, result }) => {
            reportToolResult(toolName, result);
          }}
          onMessageSent={() => {
            noteTurn();
            setRunning(true);
          }}
          onMessageReceived={(message) => {
            setRunning(false);
            const said = answerTextOf(message);
            if (said) {
              setLastAnswer(said);
            }
            reportSessionChanged();
          }}
          pendingApprovals={pending}
          // A call of the editor's tools asked here is answered here; any
          // other approval is ai-agents'.
          onApproveApproval={async (approvalId) =>
            decideEditorTool(approvalId, true) ? true : decide(approvalId, true)
          }
          onRejectApproval={async (approvalId) =>
            decideEditorTool(approvalId, false)
              ? true
              : decide(approvalId, false)
          }
        />
      </div>
      <details style={transcriptStyle}>
        <summary>
          {APP_CHAT_WORDS.transcript} ({lines.length})
        </summary>
        {lines.length === 0 ? (
          <p style={lineStyle}>{APP_CHAT_WORDS.noLines}</p>
        ) : (
          lines.map((line, index) => (
            <p key={`${index}-${line}`} style={lineStyle}>
              {line}
            </p>
          ))
        )}
      </details>
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

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const noteStyle: React.CSSProperties = {
  margin: 0,
  padding: "4px 8px",
  fontSize: "12px",
  opacity: 0.8,
  color: "var(--vscode-descriptionForeground)",
  borderBottom: "1px solid var(--vscode-panel-border)",
};

const transcriptStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "12px",
  borderTop: "1px solid var(--vscode-panel-border)",
  maxHeight: "30%",
  overflow: "auto",
  flexShrink: 0,
};

const lineStyle: React.CSSProperties = {
  margin: "2px 0",
  fontFamily: "var(--vscode-editor-font-family)",
};
