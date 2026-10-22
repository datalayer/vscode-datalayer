/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A session's conversation read from its record, read-only (a team run's
 * seat, a session on Datalayer on no runtime): what the person asked, what
 * the agent answered, each tool call in one line, in the editor's colours —
 * and, under it, why it is read-only and where to act on it.
 *
 * @module agentChat/SessionTranscript
 */

import React, { useEffect, useState } from "react";

import type { RecordRead } from "../../src/chat/openSession";
import type { TranscriptLine } from "../../src/chat/sessionRecord";

/** Props of {@link SessionTranscript}. */
export interface SessionTranscriptProps {
  /** The session read. */
  uid: string;
  /** Why it is read-only, and where to act on it. */
  read: RecordRead;
  /** Asks the extension host for the session's record. */
  readSessionRecord: (uid: string) => Promise<TranscriptLine[]>;
}

type Read =
  | { kind: "reading" }
  | { kind: "read"; lines: TranscriptLine[] }
  | { kind: "failed"; error: string };

/**
 * The read-only transcript of a session.
 *
 * @param props - Component props.
 *
 * @returns React element.
 */
export function SessionTranscript(
  props: SessionTranscriptProps,
): React.JSX.Element {
  const { uid, read, readSessionRecord } = props;
  const [state, setState] = useState<Read>({ kind: "reading" });

  useEffect(() => {
    let live = true;
    setState({ kind: "reading" });
    readSessionRecord(uid).then(
      (lines) => {
        if (live) {
          setState({ kind: "read", lines });
        }
      },
      (error: unknown) => {
        if (live) {
          setState({
            kind: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [uid, readSessionRecord]);

  return (
    <div style={columnStyle}>
      <div style={scrollStyle} role="log" aria-label="Session transcript">
        {state.kind === "reading" ? (
          <p style={quietStyle}>Reading the session's conversation…</p>
        ) : state.kind === "failed" ? (
          <p style={{ ...quietStyle, color: "var(--vscode-errorForeground)" }}>
            {state.error}
          </p>
        ) : state.lines.length === 0 ? (
          <p style={quietStyle}>The session's record keeps no conversation.</p>
        ) : (
          state.lines.map((line, index) =>
            line.who === "tool" ? (
              <div key={index} style={toolStyle} title={line.text}>
                {line.text}
              </div>
            ) : (
              <div
                key={index}
                style={line.who === "person" ? personStyle : agentStyle}
              >
                <div style={whoStyle}>
                  {line.who === "person" ? "You" : "Agent"}
                </div>
                <div style={textStyle}>{line.text}</div>
              </div>
            ),
          )
        )}
      </div>
      <p style={whyStyle}>
        {read.why}
        {read.link ? (
          <>
            {" "}
            <a href={read.link.url} style={linkStyle}>
              {read.link.label}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  color: "var(--vscode-foreground)",
  fontFamily: "var(--vscode-font-family)",
  fontSize: "var(--vscode-font-size)",
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const bubbleStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: "4px",
  maxWidth: "100%",
};

const personStyle: React.CSSProperties = {
  ...bubbleStyle,
  alignSelf: "flex-end",
  background: "var(--vscode-input-background)",
  border: "1px solid var(--vscode-input-border, transparent)",
};

const agentStyle: React.CSSProperties = {
  ...bubbleStyle,
  alignSelf: "stretch",
  background: "var(--vscode-editor-background)",
  border: "1px solid var(--vscode-panel-border, transparent)",
};

const whoStyle: React.CSSProperties = {
  fontSize: "11px",
  opacity: 0.7,
  marginBottom: "2px",
};

const textStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const toolStyle: React.CSSProperties = {
  fontFamily: "var(--vscode-editor-font-family)",
  fontSize: "12px",
  opacity: 0.8,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  paddingLeft: "8px",
  borderLeft: "2px solid var(--vscode-textLink-foreground)",
};

const quietStyle: React.CSSProperties = {
  margin: "8px 0",
  opacity: 0.7,
};

const whyStyle: React.CSSProperties = {
  margin: 0,
  padding: "6px 8px",
  fontSize: "12px",
  borderTop: "1px solid var(--vscode-panel-border, transparent)",
  color: "var(--vscode-descriptionForeground)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--vscode-textLink-foreground)",
};
