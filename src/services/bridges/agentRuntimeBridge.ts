/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Bridge service for Agent Runtime communication.
 * Routes messages between webview and agent-runtimes API.
 *
 * @module services/bridges/agentRuntimeBridge
 */

import * as vscode from "vscode";
import { Logger } from "../logging/loggers";

/**
 * Chat message structure from @datalayer/agent-runtimes.
 */
interface ChatMessage {
  role: string;
  content: string;
  [key: string]: any;
}

/**
 * Agent message structure for internal communication.
 */
interface AgentMessage {
  type: string;
  content?: string;
  messages?: ChatMessage[];
  options?: any;
  requestId?: number;
  error?: string;
}

/**
 * Bridge service for routing messages between webview and agent-runtimes API.
 * Implements singleton pattern for centralized message handling.
 */
export class AgentRuntimeBridge {
  private static instance: AgentRuntimeBridge;
  private agentEndpoint: string;

  private constructor() {
    // Get agent runtime URL from configuration
    this.agentEndpoint = vscode.workspace
      .getConfiguration("datalayer")
      .get("agentRuntimeUrl", "http://localhost:8765/api/v1/ag-ui");

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("datalayer.agentRuntimeUrl")) {
        this.agentEndpoint = vscode.workspace
          .getConfiguration("datalayer")
          .get("agentRuntimeUrl", "http://localhost:8765/api/v1/ag-ui");
        Logger.info(
          `[AgentRuntimeBridge] Endpoint updated: ${this.agentEndpoint}`
        );
      }
    });

    Logger.info(
      `[AgentRuntimeBridge] Initialized with endpoint: ${this.agentEndpoint}`
    );
  }

  /**
   * Gets the singleton instance of AgentRuntimeBridge.
   */
  static getInstance(): AgentRuntimeBridge {
    if (!AgentRuntimeBridge.instance) {
      AgentRuntimeBridge.instance = new AgentRuntimeBridge();
    }
    return AgentRuntimeBridge.instance;
  }

  /**
   * Handles incoming messages from the webview.
   *
   * @param message - Message from webview
   * @param webview - Webview instance for sending responses
   */
  async handleMessage(
    message: AgentMessage,
    webview: vscode.Webview
  ): Promise<void> {
    const { type, content, messages, options, requestId } = message;

    Logger.debug(`[AgentRuntimeBridge] Received message type: ${type}`);

    switch (type) {
      case "agent-send-message":
        await this.sendToAgent(content!, messages!, requestId!, webview, options);
        break;

      case "webview-ready":
        Logger.info("[AgentRuntimeBridge] Webview ready");
        break;

      default:
        Logger.warn(`[AgentRuntimeBridge] Unknown message type: ${type}`);
    }
  }

  /**
   * Sends a message to the agent-runtimes API and returns the response.
   *
   * @param content - Message content
   * @param messages - Chat history
   * @param requestId - Request ID for response routing
   * @param webview - Webview for sending response
   * @param options - Additional options
   */
  private async sendToAgent(
    content: string,
    messages: ChatMessage[],
    requestId: number,
    webview: vscode.Webview,
    options?: any
  ): Promise<void> {
    try {
      Logger.debug(`[AgentRuntimeBridge] Sending to agent: ${content}`);

      // Get streaming preference from configuration
      const enableStreaming = vscode.workspace
        .getConfiguration("datalayer")
        .get("agentChat.enableStreaming", true);

      // Call agent-runtimes API
      const response = await fetch(`${this.agentEndpoint}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          messages,
          streaming: enableStreaming,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      Logger.debug(
        `[AgentRuntimeBridge] Received response from agent: ${data.response?.substring(0, 100)}...`
      );

      // Send response back to webview
      webview.postMessage({
        type: "agent-response",
        requestId,
        content: data.response || data.content || "",
      });
    } catch (error) {
      Logger.error("[AgentRuntimeBridge] Error calling agent API:", error as Error);

      // Send error back to webview
      webview.postMessage({
        type: "agent-response",
        requestId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Clears the chat history in the webview.
   *
   * @param webview - Webview to send clear message to
   */
  clearChat(webview: vscode.Webview): void {
    webview.postMessage({
      type: "agent-clear",
    });
    Logger.info("[AgentRuntimeBridge] Chat cleared");
  }

  /**
   * Starts a new chat session in the webview.
   *
   * @param webview - Webview to send new chat message to
   */
  newChat(webview: vscode.Webview): void {
    webview.postMessage({
      type: "agent-new-chat",
    });
    Logger.info("[AgentRuntimeBridge] New chat started");
  }
}
