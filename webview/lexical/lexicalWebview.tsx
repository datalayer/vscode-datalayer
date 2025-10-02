/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Lexical webview component for VS Code.
 * Uses modern React patterns with hooks and no forced remounts.
 *
 * @module lexical/lexicalWebview
 */

import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Jupyter } from "@datalayer/jupyter-react";
import { LexicalEditor } from "./LexicalEditor";
import { vsCodeAPI } from "../services/messageHandler";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import "@vscode/codicons/dist/codicon.css";
import "./LexicalEditor.css";

// Configure webpack public path for WASM loading
declare let __webpack_public_path__: string;
declare global {
  interface Window {
    __webpack_public_path__?: string;
  }
}

if (
  typeof __webpack_public_path__ !== "undefined" &&
  !window.__webpack_public_path__
) {
  const baseUri = document.querySelector("base")?.getAttribute("href");
  if (baseUri) {
    __webpack_public_path__ = baseUri;
    window.__webpack_public_path__ = baseUri;
  }
}

/**
 * VS Code API singleton - imported from messageHandler to avoid double acquisition
 */
const vscode = vsCodeAPI;

/**
 * Collaboration configuration from extension
 */
interface CollaborationConfig {
  enabled: boolean;
  websocketUrl?: string;
  documentId?: string;
  sessionId?: string;
  username?: string;
  userColor?: string;
}

/**
 * Message interface for communication with VS Code extension
 */
interface WebviewMessage {
  type: string;
  body?: any;
  requestId?: number;
  content?: number[];
  editable?: boolean;
  collaboration?: CollaborationConfig;
}

/**
 * Inner webview component that has access to Jupyter context
 */
function LexicalWebviewInner({
  selectedRuntime,
  onRuntimeSelected,
}: {
  selectedRuntime?: RuntimeJSON;
  onRuntimeSelected: (runtime: RuntimeJSON | undefined) => void;
}) {
  const [content, setContent] = useState<string>("");
  const [isEditable, setIsEditable] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [collaborationConfig, setCollaborationConfig] =
    useState<CollaborationConfig>({
      enabled: false,
    });

  useEffect(() => {
    const messageHandler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "update": {
          if (message.content && message.content.length > 0) {
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(new Uint8Array(message.content));
            setContent(jsonString);
            setIsReady(true);
            setIsInitialLoad(true);
          }
          if (message.editable !== undefined) {
            setIsEditable(message.editable);
          }
          if (message.collaboration) {
            setCollaborationConfig(message.collaboration);
          }
          break;
        }
        case "getFileData": {
          const state = vscode.getState() as { content?: string };
          const currentContent = state?.content || content;
          const encoder = new TextEncoder();
          const encoded = encoder.encode(currentContent);
          vscode.postMessage({
            type: "response",
            requestId: message.requestId,
            body: Array.from(encoded),
          });
          break;
        }
        case "runtime-selected": {
          if (message.body?.runtime) {
            onRuntimeSelected(message.body.runtime);
          }
          break;
        }
        case "runtime-terminated": {
          onRuntimeSelected(undefined);
          break;
        }
      }
    };

    window.addEventListener("message", messageHandler);

    // Check if we have saved state
    const savedState = vscode.getState() as { content?: string };
    if (savedState?.content) {
      setContent(savedState.content);
      setIsReady(true);
      setIsInitialLoad(true);
    }

    // Tell the extension we're ready
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", messageHandler);
  }, [content, onRuntimeSelected]);

  const handleSave = useCallback((newContent: string) => {
    vscode.setState({ content: newContent });
    setContent(newContent);
    vscode.postMessage({
      type: "save",
    });
  }, []);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      vscode.setState({ content: newContent });

      if (!collaborationConfig.enabled) {
        if (!isInitialLoad) {
          vscode.postMessage({
            type: "contentChanged",
            content: newContent,
          });
        } else {
          setIsInitialLoad(false);
        }
      }
    },
    [isInitialLoad, collaborationConfig.enabled],
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
      }}
    >
      {isReady ? (
        <LexicalEditor
          initialContent={content}
          onSave={handleSave}
          onContentChange={handleContentChange}
          showToolbar={true}
          editable={isEditable}
          collaboration={collaborationConfig}
          selectedRuntime={selectedRuntime}
          showRuntimeSelector={true}
        />
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          Loading editor...
        </div>
      )}
    </div>
  );
}

/**
 * Outer webview component that wraps the editor with Jupyter provider.
 * Uses runtime manager hook instead of manual state management.
 */
function LexicalWebview() {
  // Use the runtime manager hook - no forced remounts!
  const { selectedRuntime, serviceManager, selectRuntime } =
    useRuntimeManager();

  if (!serviceManager) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          color: "var(--vscode-descriptionForeground)",
        }}
      >
        Initializing...
      </div>
    );
  }

  // No key prop = no forced remount! State is preserved.
  return (
    <Jupyter
      // @ts-ignore - Type mismatch between @jupyterlab/services versions
      serviceManager={serviceManager}
      startDefaultKernel={!!selectedRuntime}
      defaultKernelName="python"
    >
      <LexicalWebviewInner
        selectedRuntime={selectedRuntime}
        onRuntimeSelected={selectRuntime}
      />
    </Jupyter>
  );
}

// Initialize the React app
const container = document.getElementById("root");
if (container) {
  try {
    const root = ReactDOM.createRoot(container);
    root.render(<LexicalWebview />);
  } catch (error) {
    container.innerHTML = `
      <div style="padding: 20px; color: var(--vscode-errorForeground); font-family: var(--vscode-editor-font-family);">
        <h3>Failed to load Lexical Editor</h3>
        <p>Error: ${error}</p>
        <p>Please try reloading the editor.</p>
      </div>
    `;
  }
}
