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

import "../styles/collapsible-vscode.css";

import React, { useEffect, useState, useCallback, useRef } from "react";
import ReactDOM from "react-dom/client";
import { ServiceManager } from "@jupyterlab/services";
import { LexicalEditor } from "./LexicalEditor";
import { vsCodeAPI } from "../services/messageHandler";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import {
  createLexicalStore,
  type CollaborationConfig,
} from "../stores/lexicalStore";
import { lexicalStore } from "@datalayer/jupyter-lexical";
import { createRuntimeMessageHandlers } from "../utils/runtimeMessageHandlers";
import type {
  KernelSelectedMessage,
  RuntimeSelectedMessage,
} from "../types/messages";
import { VSCodeTheme } from "../theme/VSCodeTheme";
import { ThemeProvider } from "../contexts/ThemeContext";
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
  userInfo?: { username: string; userColor: string }; // User info for comments (always sent if logged in)
  theme?: "light" | "dark";
  documentUri?: string; // For logging only
  documentId?: string; // Unique ID for document validation
  itemId?: string; // For outline navigation
  lexicalId?: string; // Lexical ID for tool execution context
}

/**
 * Inner webview component that has access to Jupyter context.
 * IMPORTANT: Each instance creates its own isolated store to prevent content mixing.
 */
function LexicalWebviewInner({
  selectedRuntime,
  onRuntimeSelected,
  serviceManager,
}: {
  selectedRuntime?: RuntimeJSON;
  onRuntimeSelected: (runtime: RuntimeJSON | undefined) => void;
  serviceManager: ServiceManager.IManager;
}) {
  // Create per-instance store - prevents global state sharing
  const [store] = useState(() => {
    return createLexicalStore();
  });
  // Track this document's unique ID to validate incoming messages
  // CRITICAL: Use ref instead of state to avoid stale closure issues!
  // The messageHandler closure needs to see the LATEST value, not the value when useEffect ran.
  const documentIdRef = useRef<string | null>(null);

  // Track kernel initialization state for showing spinner in toolbar
  const [kernelInitializing, setKernelInitializing] = useState<boolean>(false);

  // Create runtime message handlers using shared utilities
  const runtimeHandlers = React.useMemo(
    () =>
      createRuntimeMessageHandlers(onRuntimeSelected, setKernelInitializing),
    [onRuntimeSelected],
  );

  useEffect(() => {
    const messageHandler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "update": {
          // CRITICAL: Detect when webview is reused for a different document
          if (
            message.documentId &&
            documentIdRef.current &&
            message.documentId !== documentIdRef.current
          ) {
            // Reset store to clear stale content from previous document
            store.getState().reset();
            // Clear VS Code state
            vscode.setState(null);
            // Update to new document ID
            documentIdRef.current = message.documentId;

            // CRITICAL: Send ready message again to request content for new document
            vscode.postMessage({ type: "ready" });
          }

          // First update - save our document ID
          if (message.documentId && !documentIdRef.current) {
            documentIdRef.current = message.documentId;
          }

          // Store the document URI for outline
          if (message.documentUri) {
            store.getState().setDocumentUri(message.documentUri);
          }

          // Store lexicalId for tool execution context
          if (message.lexicalId) {
            store.getState().setLexicalId(message.lexicalId);
          } else {
            console.warn("[LexicalWebview] No lexicalId in message");
          }

          // Handle content (even if empty)
          let jsonString = "";
          if (message.content && message.content.length > 0) {
            const decoder = new TextDecoder();
            jsonString = decoder.decode(new Uint8Array(message.content));
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
          if (message.userInfo) {
            store.getState().setUserInfo(message.userInfo);
          } else {
            // Clear userInfo if not present (user logged out)
            store.getState().setUserInfo(null);
          }
          if (message.theme) {
            store.getState().setTheme(message.theme);
          }
          break;
        }
        case "theme-change": {
          if (message.theme) {
            store.getState().setTheme(message.theme);
          }
          break;
        }
        case "user-info-update": {
          // Handle real-time userInfo updates (login/logout events)
          if (message.userInfo) {
            store.getState().setUserInfo(message.userInfo);
          } else {
            store.getState().setUserInfo(null);
          }
          break;
        }
        case "outline-navigate": {
          // Handle navigation to outline item
          // Store the navigation request in the store so the editor can respond
          if (message.itemId) {
            store.getState().setNavigationTarget(message.itemId);
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
            // Failed to format JSON, using raw content
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
        case "kernel-starting":
          runtimeHandlers.onKernelStarting(message as any);
          break;

        case "kernel-selected":
        case "runtime-selected":
          runtimeHandlers.onRuntimeSelected(
            message as KernelSelectedMessage | RuntimeSelectedMessage,
          );
          break;

        case "kernel-terminated":
        case "runtime-terminated":
          runtimeHandlers.onRuntimeTerminated();
          break;

        case "runtime-expired":
          runtimeHandlers.onRuntimeExpired();
          break;
      }
    };

    window.addEventListener("message", messageHandler);

    // CRITICAL: Clear any stale VS Code state from recycled webviews
    // This prevents content from previous documents appearing in new documents
    vscode.setState(null);

    // Tell the extension we're ready
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", messageHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeHandlers]); // store access doesn't need to be in deps - Zustand handles reactivity

  // Monitor kernel readiness for Pyodide and Datalayer runtimes
  // When kernel becomes ready (status='idle'), send "kernel-ready" message
  useEffect(() => {
    // Only monitor if we're in kernel initializing state
    if (!kernelInitializing) {
      return undefined;
    }

    // Get lexicalId from store
    const lexicalId = store.getState().lexicalId;
    if (!lexicalId) {
      return undefined;
    }

    // Track kernel status subscription
    let currentKernelStatusHandler: (() => void) | null = null;
    let currentKernelConnection: any = null;

    // Function to check if kernel is ready and subscribe to status changes
    const checkAndSubscribe = async () => {
      // Get current lexical from store
      const lexical = lexicalStore.getState().lexicals.get(lexicalId);
      const adapter = lexical?.adapter;
      if (!adapter) {
        return;
      }

      // Access serviceManager from adapter (now exposed as public getter)
      const serviceManager = (adapter as any).serviceManager;
      if (!serviceManager) {
        return;
      }

      try {
        // Refresh running kernels and get the first one
        await serviceManager.kernels.refreshRunning();
        const runningKernels = Array.from(
          serviceManager.kernels.running(),
        ) as any[];

        if (runningKernels.length === 0) {
          return;
        }

        // Connect to the first running kernel
        const kernelModel = runningKernels[0];

        // Check if we're already connected to this kernel by comparing kernel IDs
        const isNewKernel =
          !currentKernelConnection ||
          currentKernelConnection.id !== kernelModel.id;

        // Only connect if it's a new kernel
        if (isNewKernel) {
          const kernelConnection = await serviceManager.kernels.connectTo({
            model: kernelModel,
          });
          // Unsubscribe from previous kernel if any
          if (currentKernelConnection && currentKernelStatusHandler) {
            currentKernelConnection.statusChanged?.disconnect(
              currentKernelStatusHandler,
            );
          }

          currentKernelConnection = kernelConnection;

          // Function to check if kernel is ready
          const checkKernelReady = () => {
            const kernelStatus = kernelConnection.status;

            // Kernel is ready when status is 'idle' AND we were in initializing state
            if (kernelStatus === "idle" && kernelInitializing) {
              // Send kernel-ready message to extension
              vscode.postMessage({
                type: "kernel-ready",
                body: {},
              });

              // Clear kernel initializing state
              setKernelInitializing(false);
            }
          };

          // Subscribe to kernel status changes
          currentKernelStatusHandler = () => {
            checkKernelReady();
          };
          kernelConnection.statusChanged?.connect(currentKernelStatusHandler);

          // Check immediately after subscribing
          checkKernelReady();
        }
      } catch (error) {}
    };

    // Check immediately
    checkAndSubscribe();

    // Poll for kernel appearance with exponential backoff
    // Starts at 100ms, doubles each time up to 5000ms max
    let pollDelay = 100;
    const maxPollDelay = 5000;
    let pollTimeout: number | undefined;

    const schedulePoll = () => {
      pollTimeout = window.setTimeout(async () => {
        await checkAndSubscribe();
        pollDelay = Math.min(pollDelay * 2, maxPollDelay);
        schedulePoll();
      }, pollDelay);
    };

    schedulePoll();

    return () => {
      if (pollTimeout !== undefined) {
        clearTimeout(pollTimeout);
      }
      if (currentKernelConnection && currentKernelStatusHandler) {
        currentKernelConnection.statusChanged?.disconnect(
          currentKernelStatusHandler,
        );
      }
    };
  }, [kernelInitializing, store]);

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
  const userInfo = store((state) => state.userInfo);
  const theme = store((state) => state.theme);
  const documentUri = store((state) => state.documentUri);
  const navigationTarget = store((state) => state.navigationTarget);
  const lexicalId = store((state) => state.lexicalId);

  // Callback to clear navigation target after navigating
  const handleNavigated = useCallback(() => {
    store.getState().setNavigationTarget(null);
  }, [store]);

  return (
    <VSCodeTheme colorMode={theme}>
      <ThemeProvider theme={theme}>
        <div
          data-theme={theme}
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
          {isReady
            ? (() => {
                return (
                  <LexicalEditor
                    initialContent={content}
                    onSave={handleSave}
                    onContentChange={handleContentChange}
                    showToolbar={true}
                    editable={isEditable}
                    collaboration={collaborationConfig}
                    userInfo={userInfo}
                    selectedRuntime={selectedRuntime}
                    showRuntimeSelector={true}
                    documentUri={documentUri}
                    vscode={{ postMessage: (msg) => vscode.postMessage(msg) }}
                    navigationTarget={navigationTarget}
                    onNavigated={handleNavigated}
                    serviceManager={serviceManager}
                    lexicalId={lexicalId}
                    kernelInitializing={kernelInitializing}
                  />
                );
              })()
            : (() => {
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
                    Loading editor...
                  </div>
                );
              })()}
        </div>
      </ThemeProvider>
    </VSCodeTheme>
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
  // startDefaultKernel triggers kernel start when we have a runtime

  // Pass serviceManager and selectedRuntime to LexicalWebviewInner
  // The Jupyter wrapper will be INSIDE LexicalEditor, wrapping only kernel plugins
  // This prevents the entire editor from remounting when runtime changes
  return (
    <LexicalWebviewInner
      selectedRuntime={selectedRuntime}
      onRuntimeSelected={selectRuntime}
      serviceManager={serviceManager}
    />
  );
}

// Initialize the React app
const container = document.getElementById("root");
if (container) {
  try {
    const root = ReactDOM.createRoot(container);
    root.render(<LexicalWebview />);
  } catch (error) {
    console.error(
      "[LexicalWebview] Failed to create/render React root:",
      error,
    );
    container.innerHTML = `
      <div style="padding: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-errorForeground); font-family: var(--vscode-editor-font-family); min-height: 100vh;">
        <h3>Failed to load Lexical Editor</h3>
        <p>Error: ${error}</p>
        <p>Please try reloading the editor.</p>
      </div>
    `;
  }
} else {
  console.error("[LexicalWebview] Root element not found!");
  document.body.innerHTML = `
    <div style="padding: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-errorForeground); font-family: var(--vscode-editor-font-family); min-height: 100vh;">
      <h3>Failed to load Lexical Editor</h3>
      <p>Error: Root element not found</p>
      <p>Please try reloading the editor.</p>
    </div>
  `;
}
