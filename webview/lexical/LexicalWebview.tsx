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

import React, { useEffect, useState, useCallback, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Jupyter } from "@datalayer/jupyter-react";
import { LexicalEditor } from "./LexicalEditor";
import { vsCodeAPI } from "../services/messageHandler";
import type { RuntimeJSON } from "@datalayer/core/lib/client/models/Runtime";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import {
  createLexicalStore,
  type CollaborationConfig,
} from "../stores/lexicalStore";
import "@vscode/codicons/dist/codicon.css";
import "@datalayer/jupyter-lexical/style/index.css";
// Import Prism language grammars explicitly (webpack needs this!)
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
// Import base Prism CSS (provides default token structure)
// Our custom CSS will override the colors with theme-aware versions
import "prismjs/themes/prism.css";
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
  theme?: "light" | "dark";
  documentUri?: string; // For logging only
  documentId?: string; // Unique ID for document validation
}

/**
 * Inner webview component that has access to Jupyter context.
 * IMPORTANT: Each instance creates its own isolated store to prevent content mixing.
 */
function LexicalWebviewInner({
  selectedRuntime,
  onRuntimeSelected,
}: {
  selectedRuntime?: RuntimeJSON;
  onRuntimeSelected: (runtime: RuntimeJSON | undefined) => void;
}) {
  // Create per-instance store - prevents global state sharing
  const [store] = useState(() => createLexicalStore());
  // Track this document's unique ID to validate incoming messages
  // CRITICAL: Use ref instead of state to avoid stale closure issues!
  // The messageHandler closure needs to see the LATEST value, not the value when useEffect ran.
  const documentIdRef = useRef<string | null>(null);

  useEffect(() => {
    console.log(
      `[LexicalWebview] useEffect running. Current documentId: ${documentIdRef.current}`,
    );

    const messageHandler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;
      console.log(
        `[LexicalWebview] Received message type: ${message.type}, documentId: ${message.documentId}, current documentId: ${documentIdRef.current}`,
      );

      switch (message.type) {
        case "update": {
          console.log(
            `[LexicalWebview] Processing update. Content length: ${message.content?.length || 0}`,
          );

          // CRITICAL: Detect when webview is reused for a different document
          if (
            message.documentId &&
            documentIdRef.current &&
            message.documentId !== documentIdRef.current
          ) {
            console.log(
              `[LexicalWebview] Webview reused for different document. Resetting store. Old: ${documentIdRef.current}, New: ${message.documentId}`,
            );
            // Reset store to clear stale content from previous document
            store.getState().reset();
            // Clear VS Code state
            vscode.setState(null);
            // Update to new document ID
            documentIdRef.current = message.documentId;

            // CRITICAL: Send ready message again to request content for new document
            console.log(
              "[LexicalWebview] Sending ready message for new document",
            );
            vscode.postMessage({ type: "ready" });
          }

          // First update - save our document ID
          if (message.documentId && !documentIdRef.current) {
            console.log(
              `[LexicalWebview] First update, saving documentId: ${message.documentId}`,
            );
            documentIdRef.current = message.documentId;
          }

          // Handle content (even if empty)
          let jsonString = "";
          if (message.content && message.content.length > 0) {
            const decoder = new TextDecoder();
            jsonString = decoder.decode(new Uint8Array(message.content));
            console.log(
              `[LexicalWebview] Decoded content length: ${jsonString.length}`,
            );
          } else {
            console.log("[LexicalWebview] No content in message");
          }
          store.getState().setContent(jsonString);
          store.getState().setIsReady(true); // Always set ready, even for empty files
          store.getState().setIsInitialLoad(true);

          if (message.editable !== undefined) {
            store.getState().setIsEditable(message.editable);
          }
          if (message.collaboration) {
            store.getState().setCollaborationConfig(message.collaboration);
          }
          if (message.theme) {
            store.setTheme(message.theme);
          }
          break;
        }
        case "theme-change": {
          if (message.theme) {
            store.setTheme(message.theme);
          }
          break;
        }
        case "getFileData": {
          const state = vscode.getState() as { content?: string };
          const currentContent = state?.content || store.getState().content;

          // Pretty-print JSON for readability (git-friendly diffs, easier debugging)
          let formattedContent = currentContent;
          try {
            const parsed = JSON.parse(currentContent);
            formattedContent = JSON.stringify(parsed, null, 2);
          } catch (error) {
            console.warn(
              "[LexicalWebview] Failed to format JSON, using raw content:",
              error,
            );
          }

          const encoder = new TextEncoder();
          const encoded = encoder.encode(formattedContent);
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

    // CRITICAL: Clear any stale VS Code state from recycled webviews
    // This prevents content from previous documents appearing in new documents
    console.log(
      "[LexicalWebview] Clearing VS Code state and sending ready message",
    );
    vscode.setState(null);

    // Tell the extension we're ready
    vscode.postMessage({ type: "ready" });
    console.log("[LexicalWebview] Ready message sent");

    return () => {
      console.log("[LexicalWebview] Cleanup: removing message listener");
      window.removeEventListener("message", messageHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRuntimeSelected]); // store access doesn't need to be in deps - Zustand handles reactivity

  const handleSave = useCallback(
    (newContent: string) => {
      vscode.setState({ content: newContent });
      store.getState().setContent(newContent);
      vscode.postMessage({
        type: "save",
      });
    },
    [store], // Depend on store (but it's stable from useState)
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      // Access store state directly (store is from useState, always the same instance)
      store.getState().setContent(newContent);
      vscode.setState({ content: newContent });

      if (!store.getState().collaborationConfig.enabled) {
        if (!store.getState().isInitialLoad) {
          vscode.postMessage({
            type: "contentChanged",
            content: newContent,
          });
        } else {
          store.getState().setIsInitialLoad(false);
        }
      }
    },
    [store], // Depend on store (but it's stable from useState)
  );

  // Use the store as a hook for reactive values in JSX
  const isReady = store((state) => state.isReady);
  const content = store((state) => state.content);
  const isEditable = store((state) => state.isEditable);
  const collaborationConfig = store((state) => state.collaborationConfig);

  return (
    <div
      data-theme={store.theme}
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
