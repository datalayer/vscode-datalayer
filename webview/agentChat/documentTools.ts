/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The notebook and document tools of the chat's agent (`chat/documentTools`):
 * each tool the extension host lists is given to `<Chat frontendTools>`,
 * whose run lists it in its `tools`; a call the runtime hands back is
 * decided here (run, asked in the chat's approval banner, or refused, as
 * the application's rules say), then run by the extension host on the
 * active Datalayer notebook or document, and its outcome — the editor it
 * ran on and what the tool answered — goes back to the run.
 *
 * @module webview/agentChat/documentTools
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AppChatApproval,
  AppChatFrontendTool,
  AppHost,
} from "../../src/chat/appChat";
import {
  DOCUMENT_TOOL_WORDS,
  documentToolAskId,
  documentToolDecision,
  type DocumentToolOutcome,
  type DocumentToolSpec,
  isDocumentToolAsk,
} from "../../src/chat/documentTools";

/** Runs a tool through the extension host. */
export type CallDocumentTool = (
  name: string,
  args: Record<string, unknown>,
) => Promise<DocumentToolOutcome>;

/** What {@link useDocumentTools} gives the chat. */
export interface DocumentTools {
  /** The tools, as `<Chat frontendTools>` takes them. */
  frontendTools: AppChatFrontendTool[];
  /** The calls asked of the person, as `<Chat pendingApprovals>` takes them. */
  asks: AppChatApproval[];
  /**
   * Answers an ask: `true` when the id was one of the chat's (then
   * decided), `false` when it is another approval's.
   */
  decide: (approvalId: string, approved: boolean) => boolean;
}

/** A call asked of the person, waiting on the answer. */
interface Ask {
  approval: AppChatApproval;
  answer: (approved: boolean) => void;
}

/** The view's count of its asks: each its own id. */
let askCount = 0;

/**
 * The tool's answer to the run: what the host answered, or why not.
 *
 * @param outcome - What the extension host answered.
 *
 * @returns The value handed back to the run.
 */
function answerOf(outcome: DocumentToolOutcome): Record<string, unknown> {
  if (outcome.error) {
    return {
      success: false,
      error: outcome.error,
      ...(outcome.editor ? { editor: outcome.editor } : {}),
    };
  }
  return { success: true, editor: outcome.editor, result: outcome.result };
}

/**
 * The editor's tools of a chat: its frontend tools, the calls asked of the
 * person and how they are answered.
 *
 * @param specs - The tools the extension host lists.
 * @param call - Runs one through the extension host.
 * @param agentId - The agent talked to, for the approval banner.
 * @param host - The application's Appspec (its rules); none for an agent
 *   of the person's own runtime.
 *
 * @returns The tools, the asks and their answer.
 */
export function useDocumentTools(
  specs: readonly DocumentToolSpec[],
  call: CallDocumentTool,
  agentId: string,
  host?: Pick<AppHost, "rules">,
): DocumentTools {
  const [asks, setAsks] = useState<Ask[]>([]);
  const asksRef = useRef<Ask[]>([]);
  asksRef.current = asks;

  // A chat closed, or another agent talked to, with calls still asked:
  // each declined, so no run waits, and none shown to the next agent's chat.
  useEffect(
    () => () => {
      for (const ask of asksRef.current) {
        ask.answer(false);
      }
      asksRef.current = [];
      setAsks([]);
    },
    [agentId],
  );

  const ask = useCallback(
    (spec: DocumentToolSpec, args: Record<string, unknown>) =>
      new Promise<boolean>((resolve) => {
        askCount += 1;
        const approval: AppChatApproval = {
          id: documentToolAskId(askCount),
          toolName: spec.name,
          toolDescription: DOCUMENT_TOOL_WORDS.asked(spec.name, ""),
          args,
          agentId,
          requestedAt: new Date().toISOString(),
        };
        setAsks((current) => [...current, { approval, answer: resolve }]);
      }),
    [agentId],
  );

  const frontendTools = useMemo<AppChatFrontendTool[]>(
    () =>
      specs.map((spec) => ({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        location: "frontend",
        // Never throws: a run whose tool threw would wait on it forever.
        handler: async (args: Record<string, unknown>) => {
          const decision = documentToolDecision(spec, host);
          if (decision === "leave_to_me") {
            return answerOf({
              error: DOCUMENT_TOOL_WORDS.leftToPerson(spec.name),
            });
          }
          if (decision === "ask_first" && !(await ask(spec, args ?? {}))) {
            return answerOf({ error: DOCUMENT_TOOL_WORDS.refused(spec.name) });
          }
          try {
            return answerOf(await call(spec.name, args ?? {}));
          } catch (error) {
            return answerOf({
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      })),
    [specs, host, call, ask],
  );

  const decide = useCallback((approvalId: string, approved: boolean) => {
    if (!isDocumentToolAsk(approvalId)) {
      return false;
    }
    const found = asksRef.current.find(
      (entry) => entry.approval.id === approvalId,
    );
    if (found) {
      found.answer(approved);
      setAsks((current) =>
        current.filter((entry) => entry.approval.id !== approvalId),
      );
    }
    return true;
  }, []);

  const pending = useMemo(() => asks.map((entry) => entry.approval), [asks]);

  return { frontendTools, asks: pending, decide };
}
