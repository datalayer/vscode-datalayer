/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Commands for the Datalayer Agent Chat sidebar.
 *
 * Currently exposes a single focus command that reveals the
 * `datalayerAgentChatView` webview view. It is wired into the
 * `editor/title` menu (with the AI agent icon) so users can open the chat from
 * the active editor's toolbar, mirroring how the Claude Code and OpenAI Codex
 * extensions expose their own chat panels.
 *
 * @module commands/agentChat
 */

import * as vscode from "vscode";

/**
 * Registers the Agent Chat commands on the extension context.
 *
 * @param context - VS Code extension context used to register disposables.
 */
export function registerAgentChatCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.agentChat.focus", async () => {
      // Mirrors the OpenAI Codex extension's two-step focus flow:
      //   1. Open the activity-bar container so the side bar slot is
      //      visible. `<viewId>.focus` is a no-op when the container is
      //      hidden, so we always run this first.
      //   2. Focus the specific view inside the container.
      // The IDs match the `package.json` `contributes` block:
      //   - container ID = `viewsContainers.activitybar[].id`
      //   - view ID      = `views.datalayerChat[].id`
      const CONTAINER_OPEN = "workbench.view.extension.datalayerChat";
      const VIEW_FOCUS = "datalayerAgentChatView.focus";

      try {
        await vscode.commands.executeCommand(CONTAINER_OPEN);
      } catch {
        // Older VS Code builds may not expose the container-open command;
        // fall through to the per-view focus call.
      }
      await vscode.commands.executeCommand(VIEW_FOCUS);
    }),
  );
}
