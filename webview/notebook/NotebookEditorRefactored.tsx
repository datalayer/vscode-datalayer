/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Refactored notebook editor component for VS Code webview.
 * Uses modern React patterns with hooks and centralized state management.
 *
 * @module notebook/NotebookEditorRefactored
 */

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Box } from "@primer/react";
import {
  Notebook2,
  type ICollaborationProvider,
  useJupyterReactStore,
  CellSidebarExtension,
} from "@datalayer/jupyter-react";
import { DatalayerCollaborationProvider } from "../../../core/lib/collaboration";
import {
  MessageHandlerContext,
  type ExtensionMessage,
} from "../services/messageHandler";
import { loadFromBytes, saveToBytes } from "../utils";
import { RuntimeProgressBar } from "./RuntimeProgressBar";
import { NotebookToolbar } from "./NotebookToolbar";
import { VSCodeTheme } from "../theme/VSCodeTheme";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";

// Import our new hooks and stores
import { useNotebookStore } from "../stores/notebookStore";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import { useNotebookModel } from "../hooks/useNotebookModel";
import { useNotebookResize } from "../hooks/useNotebookResize";
import { useWindowResize } from "../hooks/useWindowResize";
import {
  notebookCellStyles,
  notebookHeight,
  cellSidebarMargin,
} from "../components/NotebookStyles";

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

  // Set up resize observers
  useNotebookResize();
  useWindowResize();

  // Create notebook extensions (sidebar)
  const extensions = useMemo(() => [new CellSidebarExtension({})], []);

  // Create collaboration provider for Datalayer notebooks
  const collaborationProvider = useMemo(() => {
    if (
      store.isDatalayerNotebook &&
      store.serverUrl &&
      store.token &&
      store.documentId
    ) {
      return new DatalayerCollaborationProvider({
        runUrl: store.serverUrl,
        token: store.token,
      }) as unknown as ICollaborationProvider;
    }
    return undefined;
  }, [
    store.isDatalayerNotebook,
    store.serverUrl,
    store.token,
    store.documentId,
  ]);

  // Signal ready immediately when component mounts
  useEffect(() => {
    messageHandler.postMessage({ type: "ready" });
  }, [messageHandler]);

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      const { type, body } = message;

      switch (type) {
        case "init":
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

        case "theme-change":
          if (body.theme && body.theme !== store.theme) {
            store.setTheme(body.theme);
          }
          break;

        case "runtime-selected":
        case "kernel-selected":
          if (body?.runtime) {
            selectRuntime(body.runtime);
            store.setRuntime(body.runtime);
          }
          break;

        case "runtime-terminated":
          setTimeout(() => {
            selectRuntime(undefined);
            store.setRuntime(undefined);
          }, 100);
          break;

        case "set-runtime":
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

        case "getFileData":
          if (!store.isDatalayerNotebook) {
            const bytes = getNotebookData(store.nbformat);
            const arrayData = Array.from(bytes);

            messageHandler.postMessage({
              type: "response",
              requestId: message.requestId,
              body: arrayData,
            });

            markClean();
          }
          break;

        case "saved":
          if (!store.isDatalayerNotebook) {
            markClean();
          }
          break;
      }
    };

    const disposable = messageHandler.registerCallback(handleMessage);
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
        }}
      >
        <div>Loading notebook...</div>
      </Box>
    );
  }

  // Check if this is a Datalayer runtime (not a Jupyter server or local kernel)
  const isDatalayerRuntime =
    selectedRuntime &&
    !selectedRuntime.uid?.startsWith("jupyter-") &&
    selectedRuntime.environmentName !== "jupyter";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Runtime progress bar - only shows for Datalayer runtimes */}
      {!store.isDatalayerNotebook && (
        <RuntimeProgressBar
          runtime={selectedRuntime}
          isDatalayerRuntime={isDatalayerRuntime}
        />
      )}

      <NotebookToolbar
        notebookId={store.documentId || store.notebookId}
        isDatalayerNotebook={store.isDatalayerNotebook}
        selectedRuntime={selectedRuntime}
      />

      <Box
        style={{
          height: notebookHeight,
          width: "100%",
          position: "relative",
          flex: 1,
        }}
        id="dla-Jupyter-Notebook"
      >
        <Box className="dla-Box-Notebook" sx={notebookCellStyles}>
          <Notebook2
            nbformat={store.nbformat}
            id={store.documentId || store.notebookId}
            serviceManager={serviceManager as any}
            collaborationProvider={collaborationProvider}
            startDefaultKernel={!!selectedRuntime && !store.isDatalayerNotebook}
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
