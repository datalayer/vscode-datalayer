/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * An *ask me first* decision, said as an editor notification beside the
 * chat's banner: *<Application> asks to Run git push (execute) — Approve ·
 * Decline · Show*. The action's class is said, never its arguments (the
 * phone's rule). *Show* focuses the chat with the request whole; *Approve*
 * and *Decline* go through the one route each, after the approval is read
 * again — and only once the chat has shown the request at least once;
 * before that the person is sent to the chat. What the route answered is
 * said: done, answered elsewhere (409), gone (404, revealing nothing).
 *
 * The decision itself is the chat's to send (it holds the approval's
 * source — ai-agents for a session on Datalayer, the local runtime for one
 * on this machine); this service asks it through {@link ApprovalDecider}.
 *
 * @module services/ui/approvalNotifications
 */

import * as vscode from "vscode";

import {
  approvalNotification,
  type ApprovalRaised,
  ATTENTION_WORDS,
  decisionAllowed,
  newlyRaised,
} from "../../chat/attention";
import { ServiceLoggers } from "../logging/loggers";

/** How a decision from the notification reaches the one route. */
export interface ApprovalDecider {
  /**
   * Decides the approval after reading it again; resolves with the sentence
   * to say (done, answered elsewhere, gone, refused).
   */
  decide(id: string, approved: boolean): Promise<string>;
  /** Focuses the chat on the request, whole. */
  show(id: string): void;
}

/**
 * The notifications of the approvals raised, each once.
 */
export class ApprovalNotifications {
  /** The approvals notified already. */
  private readonly notified = new Set<string>();

  /** The approvals the chat has shown whole at least once. */
  private readonly shown = new Set<string>();

  /**
   * Notifies the approvals not notified before.
   *
   * @param app - The application asking.
   * @param approvals - The approvals pending now.
   * @param decider - How a decision is sent, and the chat focused.
   */
  public raised(
    app: string,
    approvals: readonly ApprovalRaised[],
    decider: ApprovalDecider,
  ): void {
    for (const approval of newlyRaised(this.notified, approvals)) {
      this.notified.add(approval.id);
      void this.notify(app, approval, decider);
    }
  }

  /**
   * The chat showed these approvals whole: a decision from the notification
   * is allowed from now on.
   *
   * @param ids - The approvals shown.
   */
  public shownInChat(ids: readonly string[]): void {
    for (const id of ids) {
      this.shown.add(id);
    }
  }

  /**
   * Whether a decision from a notification is allowed for this approval.
   *
   * @param id - Which approval.
   *
   * @returns Whether the chat has shown it.
   */
  public allowed(id: string): boolean {
    return decisionAllowed(this.shown, id);
  }

  /**
   * Says one approval, and does what the person chose on it.
   *
   * @param app - The application asking.
   * @param approval - What it asks.
   * @param decider - How a decision is sent, and the chat focused.
   */
  private async notify(
    app: string,
    approval: ApprovalRaised,
    decider: ApprovalDecider,
  ): Promise<void> {
    const { message, actions } = approvalNotification(app, approval);
    ServiceLoggers.main.info("[Approvals] raised", {
      id: approval.id,
      message,
    });
    const chosen = await vscode.window.showInformationMessage(
      message,
      ...actions,
    );
    if (chosen === "Show") {
      decider.show(approval.id);
      return;
    }
    if (chosen !== "Approve" && chosen !== "Decline") {
      return;
    }
    if (!this.allowed(approval.id)) {
      void vscode.window.showWarningMessage(ATTENTION_WORDS.notShown);
      decider.show(approval.id);
      return;
    }
    try {
      const said = await decider.decide(approval.id, chosen === "Approve");
      void vscode.window.showInformationMessage(said);
    } catch (error) {
      void vscode.window.showWarningMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
