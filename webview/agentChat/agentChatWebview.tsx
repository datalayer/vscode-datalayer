/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for Agent Chat webview.
 * Renders the ChatSidebar component from @datalayer/agent-runtimes.
 *
 * @module webview/agentChat/agentChatWebview
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@primer/react";
import { ChatSidebar } from "@datalayer/agent-runtimes";
import type { ChatMessage } from "@datalayer/agent-runtimes";
import { MessageHandler } from "./messageHandler";

// Initialize message handler for communication with extension
const messageHandler = new MessageHandler();

/**
 * Main Agent Chat application component.
 * Wraps the ChatSidebar with theme provider and custom message handling.
 */
function AgentChatApp() {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Notify extension that webview is ready
    messageHandler.postMessage({ type: "webview-ready" });
    setIsReady(true);
  }, []);

  /**
   * Custom message handler for sending messages to the agent.
   * Routes messages through the extension's AgentRuntimeBridge.
   */
  const handleSendMessage = async (
    content: string,
    allMessages: ChatMessage[],
    options?: any
  ): Promise<string> => {
    try {
      // Send message to extension
      const response = await messageHandler.request({
        type: "agent-send-message",
        content,
        messages: allMessages,
        options,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.content || "";
    } catch (error) {
      console.error("[AgentChat] Error sending message:", error);
      throw error;
    }
  };

  if (!isReady) {
    return <div>Loading Agent Chat...</div>;
  }

  return (
    <ThemeProvider colorMode="auto">
      <ChatSidebar
        title="Datalayer Agent"
        defaultOpen={true}
        position="right"
        width="100%"
        onSendMessage={handleSendMessage}
        enableStreaming={true}
        placeholder="Ask the agent..."
        description="Chat with your Datalayer AI agent"
        showPoweredBy={true}
        poweredByProps={{
          brandName: "Datalayer",
          brandUrl: "https://datalayer.ai",
        }}
      />
    </ThemeProvider>
  );
}

// Render the application
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<AgentChatApp />);
