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
 * calls are listed as the transcript's lines (A-06) under the chat.
 *
 * @module webview/agentChat/AppChat
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import Chat from "@datalayer/agent-runtimes/lib/chat/Chat";

import {
  agUiEndpoint,
  APP_CHAT_WORDS,
  appHostOf,
  appItemUrl,
  type AppChatApproval,
  type AppChatHandle,
  type AppHost,
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
  const { handle, services, user, readEditor, signUser } = props;
  const [host, setHost] = useState<AppHost | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AppChatApproval[]>([]);
  const [lines, setLines] = useState<string[]>([]);

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

  // What VS Code passes as the host (D-10): only the version deployed's
  // terms, never a guess.
  const editorLine = host ? editorContextRefusal(handle, host) : "";
  const frontendTools = useMemo(() => {
    if (!host || revisionRefusal(handle, host)) {
      return [];
    }
    const tool = hostContextTool(host, readEditor, user);
    return tool ? [tool] : [];
  }, [host, handle, readEditor, user]);

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
          baseUrl={handle.url}
          endpoint={agUiEndpoint(handle)}
          configEndpoint={`${handle.url}/api/v1/configure`}
          agentId={handle.agentId}
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
              toolLineOf(handle.name, toolName, host),
            ]);
          }}
          pendingApprovals={approvals}
          onApproveApproval={(approvalId) => decide(approvalId, true)}
          onRejectApproval={(approvalId) => decide(approvalId, false)}
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
