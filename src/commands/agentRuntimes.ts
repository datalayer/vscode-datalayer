/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Commands for Agent Runtime chat operations.
 * Provides commands to open, clear, and manage agent chat.
 *
 * @module commands/agentRuntimes
 */

import * as vscode from "vscode";
import { Logger } from "../services/logging/loggers";
import { AgentChatProvider } from "../providers/agentChatProvider";

/**
 * Registers all agent runtime commands.
 *
 * @param context - Extension context for subscriptions
 * @param agentChatProvider - Agent chat provider instance
 */
export function registerAgentRuntimeCommands(
  context: vscode.ExtensionContext,
  agentChatProvider: AgentChatProvider
): void {
  Logger.info("[Commands] Registering agent runtime commands");

  // Command: Open Agent Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.agentChat.open", async () => {
      try {
        Logger.debug("[Commands] Opening agent chat");

        // Focus the datalayer view container
        await vscode.commands.executeCommand(
          "workbench.view.extension.datalayer"
        );

        // Focus the agent chat view
        await vscode.commands.executeCommand("datalayer.agentChat.focus");

        Logger.info("[Commands] Agent chat opened successfully");
      } catch (error) {
        Logger.error("[Commands] Failed to open agent chat", error as Error);
        vscode.window.showErrorMessage(
          `Failed to open agent chat: ${(error as Error).message}`
        );
      }
    })
  );

  // Command: Clear Agent Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.agentChat.clear", async () => {
      try {
        Logger.debug("[Commands] Clearing agent chat");

        const view = agentChatProvider.view;
        if (!view) {
          vscode.window.showWarningMessage("Agent chat is not currently open");
          return;
        }

        // Post clear message to webview
        view.webview.postMessage({ type: "agent-clear" });

        Logger.info("[Commands] Agent chat cleared successfully");
      } catch (error) {
        Logger.error("[Commands] Failed to clear agent chat", error as Error);
        vscode.window.showErrorMessage(
          `Failed to clear agent chat: ${(error as Error).message}`
        );
      }
    })
  );

  // Command: New Agent Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.agentChat.newChat", async () => {
      try {
        Logger.debug("[Commands] Starting new agent chat");

        const view = agentChatProvider.view;
        if (!view) {
          vscode.window.showWarningMessage("Agent chat is not currently open");
          return;
        }

        // Post new chat message to webview
        view.webview.postMessage({ type: "agent-new-chat" });

        Logger.info("[Commands] New agent chat started successfully");
      } catch (error) {
        Logger.error(
          "[Commands] Failed to start new agent chat",
          error as Error
        );
        vscode.window.showErrorMessage(
          `Failed to start new chat: ${(error as Error).message}`
        );
      }
    })
  );

  Logger.info("[Commands] Agent runtime commands registered successfully");
}
