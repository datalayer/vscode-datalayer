/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Notebook editor component for VS Code webview.
 * Uses modern React patterns with hooks and centralized state management.
 *
 * @module notebook/NotebookEditor
 */

import React, { useContext, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Box } from "@primer/react";
import {
  Notebook2,
  type ICollaborationProvider,
  useJupyterReactStore,
  CellSidebarExtension,
} from "@datalayer/jupyter-react";
import { DatalayerCollaborationProvider } from "@datalayer/core/lib/collaboration";
import {
  MessageHandlerContext,
  type ExtensionMessage,
} from "../services/messageHandler";
import { loadFromBytes } from "../utils";
import { initializeRequireJSStub } from "../utils/requirejsStub";
import { RuntimeProgressBar } from "../components/RuntimeProgressBar";

// Initialize RequireJS stub for ClassicWidgetManager
initializeRequireJSStub();
import { NotebookToolbar } from "./NotebookToolbar";
import { VSCodeTheme } from "../theme/VSCodeTheme";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";

// Import our new hooks and stores
import { useNotebookStore } from "../stores/notebookStore";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import { useNotebookModel } from "../hooks/useNotebookModel";
import { useNotebookResize } from "../hooks/useNotebookResize";
import {
  notebookCellStyles,
  notebookHeight,
  cellSidebarMargin,
} from "../components/notebookStyles";

// Extended interface for runtime with credits information
interface RuntimeWithCredits extends RuntimeJSON {
  creditsUsed?: number;
  creditsLimit?: number;
}

/**
 * Core notebook editor component using centralized state
 */
function NotebookEditorCore(): JSX.Element {
  const messageHandler = useContext(MessageHandlerContext);
  const store = useNotebookStore();
  const { setColormode } = useJupyterReactStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Runtime management with hook
  const { selectedRuntime, serviceManager, selectRuntime } = useRuntimeManager(
    store.selectedRuntime,
  );

  // Notebook model management
  const { handleNotebookModelChanged, getNotebookData, markClean } =
    useNotebookModel({
      isDatalayerNotebook: store.isDatalayerNotebook,
      messageHandler,
    });

  // Set up resize observer
  const notebookId = store.documentId || store.notebookId || "";
  useNotebookResize(notebookId, containerRef);

  // Create notebook extensions (sidebar)
  const extensions = useMemo(() => [new CellSidebarExtension({})], []);

  // Create collaboration provider for Datalayer notebooks
  const collaborationProvider = useMemo(() => {
    console.log("[NotebookEditor] Collaboration provider check:", {
      isDatalayerNotebook: store.isDatalayerNotebook,
      hasServerUrl: !!store.serverUrl,
      serverUrl: store.serverUrl,
      hasToken: !!store.token,
      hasDocumentId: !!store.documentId,
      documentId: store.documentId,
    });

    if (
      store.isDatalayerNotebook &&
      store.serverUrl &&
      store.token &&
      store.documentId
    ) {
      console.log("[NotebookEditor] Creating DatalayerCollaborationProvider");
      return new DatalayerCollaborationProvider({
        runUrl: store.serverUrl,
        token: store.token,
      }) as unknown as ICollaborationProvider;
    }
    console.log(
      "[NotebookEditor] Not creating collaboration provider - missing requirements",
    );
    return undefined;
  }, [
    store.isDatalayerNotebook,
    store.serverUrl,
    store.token,
    store.documentId,
  ]);

  // Signal ready immediately when component mounts
  useEffect(() => {
    messageHandler.send({ type: "ready" });
  }, [messageHandler]);

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      switch (message.type) {
        case "init": {
          const { body } = message;
          console.log("[NotebookEditor] Received init message:", {
            isDatalayerNotebook: body.isDatalayerNotebook,
            hasDocumentId: !!body.documentId,
            documentId: body.documentId,
            hasServerUrl: !!body.serverUrl,
            serverUrl: body.serverUrl,
            hasToken: !!body.token,
            hasNotebookId: !!body.notebookId,
          });

          // Handle theme
          if (body.theme) {
            store.setTheme(body.theme);
          }

          // Handle notebook data
          if (body.isDatalayerNotebook) {
            store.setIsDatalayerNotebook(true);
          }

          if (body.documentId) {
            store.setDocumentId(body.documentId);
          }

          if (body.serverUrl) {
            store.setServerUrl(body.serverUrl);
          }

          if (body.notebookId) {
            store.setNotebookId(body.notebookId);
          }

          if (body.token) {
            store.setToken(body.token);
          }

          if (body.untitled) {
            store.setNbformat({});
          } else {
            const loadedNbformat = loadFromBytes(body.value);
            store.setNbformat(loadedNbformat);
          }

          store.setIsInitialized(true);
          break;
        }

        case "theme-change": {
          const { body } = message;
          if (body.theme && body.theme !== store.theme) {
            store.setTheme(body.theme);
          }
          break;
        }

        case "runtime-selected":
        case "kernel-selected": {
          const { body } = message;
          console.log("[NotebookEditor] Received kernel-selected message:", {
            hasBody: !!body,
            hasRuntime: !!body?.runtime,
            runtime: body?.runtime,
          });
          if (body?.runtime) {
            selectRuntime(body.runtime);
            store.setRuntime(body.runtime);
          } else {
            console.warn(
              "[NotebookEditor] No runtime in kernel-selected message body",
            );
          }
          break;
        }

        case "kernel-terminated": // Extension sends this when runtime is terminated
        case "runtime-terminated": // Legacy message type
          console.log(
            "[NotebookEditor] Runtime terminated, clearing selection",
          );
          setTimeout(() => {
            selectRuntime(undefined);
            store.setRuntime(undefined);
          }, 100);
          break;

        case "runtime-expired":
          // Runtime has expired - reset to mock service manager
          setTimeout(() => {
            selectRuntime(undefined);
            store.setRuntime(undefined);
          }, 100);
          break;

        case "set-runtime": {
          const { body } = message;
          if (body.baseUrl) {
            const runtimeInfo: RuntimeWithCredits = {
              uid: "local-runtime",
              givenName: "Jupyter Server",
              ingress: body.baseUrl,
              token: body.token || "",
              podName: "local",
              environmentName: "jupyter",
              environmentTitle: "Jupyter",
              type: "notebook",
              burningRate: 0,
              startedAt: new Date().toISOString(),
              expiredAt: "",
            };
            selectRuntime(runtimeInfo);
            store.setRuntime(runtimeInfo);
          }
          break;
        }

        case "getFileData": {
          if (!store.isDatalayerNotebook) {
            const bytes = getNotebookData(store.nbformat);
            const arrayData = Array.from(bytes);

            messageHandler.send({
              type: "response",
              requestId: message.requestId,
              body: arrayData,
            });

            markClean();
          }
          break;
        }

        case "saved":
          if (!store.isDatalayerNotebook) {
            markClean();
          }
          break;
      }
    };

    const disposable = messageHandler.on(
      handleMessage as (message: unknown) => void,
    );
    return () => disposable.dispose();
  }, [messageHandler, store, selectRuntime, getNotebookData, markClean]);

  // Sync colormode with theme changes
  useEffect(() => {
    setColormode(store.theme);
  }, [store.theme, setColormode]);

  // Block Cmd/Ctrl+S for collaborative Datalayer notebooks
  useEffect(() => {
    if (store.isDatalayerNotebook) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
        }
      };

      document.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }
    return undefined;
  }, [store.isDatalayerNotebook]);

  // Loading state
  if (!store.isInitialized || !store.nbformat) {
    return (
      <Box
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--vscode-editor-background)",
          color: "var(--vscode-editor-foreground)",
        }}
      >
        <div>Loading notebook...</div>
      </Box>
    );
  }

  // Check if this is a Datalayer runtime (not a local Jupyter server)
  // Datalayer runtimes have an ingress URL and environment name that's not "jupyter"
  const isDatalayerRuntime = Boolean(
    selectedRuntime &&
      selectedRuntime.ingress &&
      selectedRuntime.environmentName &&
      selectedRuntime.environmentName !== "jupyter",
  );

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--vscode-editor-background)",
        margin: 0,
        padding: 0,
      }}
    >
      {/* Runtime progress bar - shows for all Datalayer runtimes */}
      <RuntimeProgressBar
        runtime={selectedRuntime}
        isDatalayerRuntime={isDatalayerRuntime}
      />

      <NotebookToolbar
        notebookId={store.documentId || store.notebookId}
        isDatalayerNotebook={store.isDatalayerNotebook}
        selectedRuntime={selectedRuntime}
      />

      <Box
        ref={containerRef}
        style={{
          height: notebookHeight,
          width: "100%",
          position: "relative",
          flex: 1,
          backgroundColor: "var(--vscode-editor-background)",
        }}
        id="dla-Jupyter-Notebook"
      >
        <Box className="dla-Box-Notebook" sx={notebookCellStyles}>
          <Notebook2
            // Use stable key - MutableServiceManager handles runtime switching internally
            // Remounting would lose notebook state and cause race conditions
            key={store.documentId || store.notebookId || "notebook"}
            // @ts-ignore - Type mismatch between different @jupyterlab versions
            nbformat={store.nbformat || {}}
            id={store.documentId || store.notebookId}
            // @ts-ignore - Type mismatch between @jupyterlab/services versions
            serviceManager={serviceManager}
            collaborationProvider={collaborationProvider}
            // Start kernel when we have a real runtime selected
            // Collaboration and execution are orthogonal:
            // - collaborationProvider syncs notebook content with Datalayer platform
            // - serviceManager + kernel handles cell execution (same for local and remote)
            startDefaultKernel={!!selectedRuntime}
            height={notebookHeight}
            cellSidebarMargin={cellSidebarMargin}
            extensions={extensions}
            onNotebookModelChanged={
              !store.isDatalayerNotebook
                ? handleNotebookModelChanged
                : undefined
            }
          />
        </Box>
      </Box>
    </div>
  );
}

/**
 * Main notebook component with theme provider
 */
function NotebookEditor(): JSX.Element {
  const theme = useNotebookStore((state) => state.theme);

  return (
    <VSCodeTheme
      colorMode={theme === "dark" ? "dark" : "light"}
      loadJupyterLabCss={true}
    >
      <NotebookEditorCore />
    </VSCodeTheme>
  );
}

// Initialize the React app
document.addEventListener("DOMContentLoaded", () => {
  const root = createRoot(
    document.getElementById("notebook-editor") ?? document.body,
  );
  root.render(<NotebookEditor />);
});
