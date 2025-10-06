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
import {
  useLexicalStore,
  type CollaborationConfig,
} from "../stores/lexicalStore";
import "@vscode/codicons/dist/codicon.css";
import "@datalayer/jupyter-lexical/style/index.css";
import "prismjs/themes/prism-tomorrow.css"; // Syntax highlighting theme
// Import Prism language grammars explicitly (webpack needs this!)
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
import "./LexicalEditor.css";

/**
 * VS Code API singleton - imported from messageHandler to avoid double acquisition
 */
const vscode = vsCodeAPI;

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
 * Uses centralized state management via useLexicalStore
 */
function LexicalWebviewInner({
  selectedRuntime,
  onRuntimeSelected,
}: {
  selectedRuntime?: RuntimeJSON;
  onRuntimeSelected: (runtime: RuntimeJSON | undefined) => void;
}) {
  const store = useLexicalStore();

  useEffect(() => {
    const messageHandler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "update": {
          if (message.content && message.content.length > 0) {
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(new Uint8Array(message.content));
            store.setContent(jsonString);
            store.setIsReady(true);
            store.setIsInitialLoad(true);
          }
          if (message.editable !== undefined) {
            store.setIsEditable(message.editable);
          }
          if (message.collaboration) {
            store.setCollaborationConfig(message.collaboration);
          }
          break;
        }
        case "getFileData": {
          const state = vscode.getState() as { content?: string };
          const currentContent = state?.content || store.content;
          const encoder = new TextEncoder();
          const encoded = encoder.encode(currentContent);
          vscode.postMessage({
            type: "response",
            requestId: message.requestId,
            body: Array.from(encoded),
          });
          break;
        }
        case "kernel-selected": {
          const body = message.body as { runtime?: RuntimeJSON } | undefined;
          if (body?.runtime) {
            onRuntimeSelected(body.runtime);
          }
          break;
        }
        case "kernel-terminated": {
          console.log(
            "[LexicalWebview] Received kernel-terminated, clearing runtime",
          );
          onRuntimeSelected(undefined);
          break;
        }
        case "runtime-expired": {
          // Runtime has expired - reset to mock service manager
          console.log(
            "[LexicalWebview] Received runtime-expired from progress bar, clearing runtime",
          );
          onRuntimeSelected(undefined);
          break;
        }
      }
    };

    window.addEventListener("message", messageHandler);

    // Check if we have saved state
    const savedState = vscode.getState() as { content?: string };
    if (savedState?.content) {
      store.setContent(savedState.content);
      store.setIsReady(true);
      store.setIsInitialLoad(true);
    }

    // Tell the extension we're ready
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", messageHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRuntimeSelected]); // store access doesn't need to be in deps - Zustand handles reactivity

  const handleSave = useCallback(
    (newContent: string) => {
      vscode.setState({ content: newContent });
      store.setContent(newContent);
      vscode.postMessage({
        type: "save",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // store access doesn't need to be in deps - Zustand handles reactivity
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      store.setContent(newContent);
      vscode.setState({ content: newContent });

      if (!store.collaborationConfig.enabled) {
        if (!store.isInitialLoad) {
          vscode.postMessage({
            type: "contentChanged",
            content: newContent,
          });
        } else {
          store.setIsInitialLoad(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // store access doesn't need to be in deps - Zustand handles reactivity
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        maxWidth: "100vw",
        overflow: "hidden",
        overflowX: "hidden",
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
        boxSizing: "border-box",
        margin: 0,
        padding: 0,
      }}
    >
      {store.isReady ? (
        <LexicalEditor
          initialContent={store.content}
          onSave={handleSave}
          onContentChange={handleContentChange}
          showToolbar={true}
          editable={store.isEditable}
          collaboration={store.collaborationConfig}
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
            backgroundColor: "var(--vscode-editor-background)",
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
  const [isReady, setIsReady] = useState(false);

  // NOTE: We do NOT call setJupyterServerUrl/setJupyterServerToken here!
  // We pass a custom serviceManager to the Jupyter component, which already
  // has the correct URL and token configured. Calling these functions would
  // cause the library to create a second ServiceManager with native fetch/WebSocket.

  // Wait for ServiceManager to be ready
  useEffect(() => {
    if (!serviceManager) {
      setIsReady(false);
      return;
    }

    // Check if ServiceManager has a ready property
    const sm = serviceManager as unknown as { ready?: Promise<void> };
    if (sm.ready) {
      sm.ready
        .then(() => {
          setIsReady(true);
        })
        .catch((error) => {
          console.error("[LexicalWebview] ServiceManager failed:", error);
          // Still set as ready to allow UI to render
          setIsReady(true);
        });
    } else {
      // No ready promise, assume ready immediately
      setIsReady(true);
    }
  }, [serviceManager]);

  if (!serviceManager || !isReady) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "var(--vscode-editor-background)",
          color: "var(--vscode-descriptionForeground)",
        }}
      >
        Initializing...
      </div>
    );
  }

  // No key prop = no forced remount! State is preserved.
  // IMPORTANT: We ALWAYS provide serviceManager (mock or real via useRuntimeManager)
  // MUST set lite=false to tell the library to use our serviceManager
  // Start kernel when runtime is selected (selectedRuntime exists and has ingress)
  const shouldStartKernel = !!selectedRuntime?.ingress;

  // CRITICAL: Force remount when runtime URL changes!
  // The Jupyter React library caches config in useMemo with empty deps [],
  // so we MUST force a full remount to reload config with new URL.
  const jupyterKey = selectedRuntime?.ingress || "no-runtime";

  return (
    <Jupyter
      key={jupyterKey}
      // @ts-ignore - Type mismatch between @jupyterlab/services versions
      serviceManager={serviceManager}
      // IMPORTANT: DO NOT pass jupyterServerUrl and jupyterServerToken when using custom serviceManager!
      // Passing these causes Jupyter React to create its OWN ServiceManager using native fetch/WebSocket,
      // which bypasses our proxying system and causes CORS errors.
      // The serviceManager already has the correct URL and token baked in.
      startDefaultKernel={shouldStartKernel}
      defaultKernelName="python"
      lite={false}
      collaborative={false}
      terminals={false}
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
      <div style="padding: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-errorForeground); font-family: var(--vscode-editor-font-family); min-height: 100vh;">
        <h3>Failed to load Lexical Editor</h3>
        <p>Error: ${error}</p>
        <p>Please try reloading the editor.</p>
      </div>
    `;
  }
}
