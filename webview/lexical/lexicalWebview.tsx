/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module lexicalWebview
 * Main webview entry point for the Lexical editor in VS Code.
 *
 * Responsibilities:
 * - VS Code API communication
 * - Content state management
 * - Collaboration configuration
 * - Editor initialization
 *
 * @packageDocumentation
 */

import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Jupyter } from "@datalayer/jupyter-react";
import type { ServiceManager } from "@jupyterlab/services";
import { LexicalEditor } from "./LexicalEditor";
import { vsCodeAPI } from "../services/messageHandler";
import { createServiceManager } from "../services/serviceManager";
import { createMockServiceManager } from "../services/mockServiceManager";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import "@vscode/codicons/dist/codicon.css";
import "./LexicalEditor.css";

// Configure webpack public path for WASM loading
declare let __webpack_public_path__: string;
if (
  typeof __webpack_public_path__ !== "undefined" &&
  !(window as any).__webpack_public_path__
) {
  const baseUri = document.querySelector("base")?.getAttribute("href");
  if (baseUri) {
    __webpack_public_path__ = baseUri;
    (window as any).__webpack_public_path__ = baseUri;
  }
}

/**
 * VS Code API singleton - imported from messageHandler to avoid double acquisition
 * @hidden
 */
const vscode = vsCodeAPI;

/**
 * Collaboration configuration from extension
 * @interface CollaborationConfig
 */
interface CollaborationConfig {
  /** Whether collaboration is enabled */
  enabled: boolean;
  /** WebSocket URL for collaboration server */
  websocketUrl?: string;
  /** Unique document identifier */
  documentId?: string;
  /** Collaboration session ID */
  sessionId?: string;
  /** Current user's display name */
  username?: string;
  /** User's cursor/selection color */
  userColor?: string;
}

/**
 * Message interface for communication with VS Code extension.
 *
 * @interface WebviewMessage
 * @property {string} type - Message type identifier
 * @property {any} [body] - Message payload
 * @property {number} [requestId] - Request ID for response tracking
 * @property {number[]} [content] - File content as byte array
 * @property {boolean} [editable] - Whether the editor is editable
 * @property {CollaborationConfig} [collaboration] - Collaboration configuration
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
 * Inner webview component that has access to Jupyter context.
 * Manages content loading, saving, and dirty state tracking.
 *
 * @function LexicalWebviewInner
 * @returns {React.ReactElement} The Lexical editor with Jupyter integration
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
            // This is the initial load from the file
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
          // Send current content back as Uint8Array
          const currentContent = vscode.getState()?.content || content;
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
          // Update selected runtime via callback to parent
          if (message.body?.runtime) {
            onRuntimeSelected(message.body.runtime);
          }
          break;
        }
        case "runtime-terminated": {
          // Clear selected runtime via callback to parent
          onRuntimeSelected(undefined);
          break;
        }
      }
    };

    window.addEventListener("message", messageHandler);

    // Check if we have saved state
    const savedState = vscode.getState();
    if (savedState?.content) {
      setContent(savedState.content);
      setIsReady(true);
      setIsInitialLoad(true);
    }

    // Tell the extension we're ready
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", messageHandler);
  }, [content]);

  const handleSave = useCallback((newContent: string) => {
    // Save to VS Code state
    vscode.setState({ content: newContent });
    setContent(newContent);

    // Trigger VS Code save command
    vscode.postMessage({
      type: "save",
    });
  }, []);

  const handleContentChange = useCallback(
    (newContent: string) => {
      // Update local state
      setContent(newContent);
      vscode.setState({ content: newContent });

      // Don't notify about changes if we're in collaborative mode
      // as changes are handled by the collaboration plugin
      if (!collaborationConfig.enabled) {
        // Only notify extension about content change if it's not the initial load
        if (!isInitialLoad) {
          vscode.postMessage({
            type: "contentChanged",
            content: newContent,
          });
        } else {
          // After the first change event, it's no longer initial load
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
 * Manages service manager creation based on runtime selection.
 *
 * @function LexicalWebview
 * @returns {React.ReactElement} The Lexical editor wrapped with Jupyter context
 */
function LexicalWebview() {
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [selectedRuntime, setSelectedRuntime] = useState<
    RuntimeJSON | undefined
  >();

  // Handle runtime selection - create service manager when runtime changes
  const handleRuntimeSelected = useCallback(
    (runtime: RuntimeJSON | undefined) => {
      console.log("Runtime selected in LexicalWebview:", runtime);

      if (runtime) {
        console.log("Runtime ingress:", runtime.ingress);
        console.log("Runtime token:", runtime.token ? "present" : "missing");

        // Create real service manager with runtime's ingress and token
        const manager = createServiceManager(
          runtime.ingress || "",
          runtime.token || "",
        );
        console.log("Created service manager:", manager);
        setServiceManager(manager);
        setSelectedRuntime(runtime);
        // Force remount when runtime changes
        setRuntimeKey((prev) => {
          console.log("Updating runtime key from", prev, "to", prev + 1);
          return prev + 1;
        });
      } else {
        console.log("Runtime cleared, switching to mock service manager");
        // Switch to mock service manager when runtime is terminated
        const mockManager = createMockServiceManager();
        setServiceManager(mockManager);
        setSelectedRuntime(undefined);
        setRuntimeKey((prev) => prev + 1);
      }
    },
    [],
  );

  useEffect(() => {
    // Start with mock service manager
    console.log("Initializing with mock service manager");
    const mockManager = createMockServiceManager();
    setServiceManager(mockManager);
  }, []);

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

  console.log("Rendering Jupyter with:");
  console.log("  - startDefaultKernel:", !!selectedRuntime);
  console.log(
    "  - serviceManager baseUrl:",
    serviceManager?.serverSettings?.baseUrl,
  );
  console.log(
    "  - serviceManager token:",
    serviceManager?.serverSettings?.token ? "present" : "missing",
  );

  return (
    <Jupyter
      key={runtimeKey}
      serviceManager={serviceManager as any}
      startDefaultKernel={!!selectedRuntime}
      defaultKernelName="python"
    >
      <LexicalWebviewInner
        selectedRuntime={selectedRuntime}
        onRuntimeSelected={handleRuntimeSelected}
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
    // Try to show an error message in the container
    container.innerHTML = `
      <div style="padding: 20px; color: var(--vscode-errorForeground); font-family: var(--vscode-editor-font-family);">
        <h3>Failed to load Lexical Editor</h3>
        <p>Error: ${error}</p>
        <p>Please try reloading the editor.</p>
      </div>
    `;
  }
}
