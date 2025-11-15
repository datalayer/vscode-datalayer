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

import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Box } from "@primer/react";
import {
  Notebook2,
  type ICollaborationProvider,
  useJupyterReactStore,
  CellSidebarExtension,
  notebookStore2,
} from "@datalayer/jupyter-react";
import { DatalayerCollaborationProvider } from "@datalayer/core/lib/collaboration";
import {
  MessageHandlerContext,
  type ExtensionMessage,
  vsCodeAPI,
} from "../services/messageHandler";
import { loadFromBytes } from "../utils";
import { initializeRequireJSStub } from "../utils/requirejsStub";
import { proxyFetch } from "../utils/httpProxy";
import { RuntimeProgressBar } from "../components/RuntimeProgressBar";

// Initialize RequireJS stub for ClassicWidgetManager
initializeRequireJSStub();
import { NotebookToolbar } from "./NotebookToolbar";
import { VSCodeTheme } from "../theme/VSCodeTheme";

// Import our new hooks and stores
import { createNotebookStore } from "../stores/notebookStore";
import { useRuntimeManager } from "../hooks/useRuntimeManager";
import { useNotebookModel } from "../hooks/useNotebookModel";
import { useNotebookResize } from "../hooks/useNotebookResize";
import { useNotebookOutline } from "../hooks/useNotebookOutline";
import {
  notebookCellStyles,
  notebookHeight,
  cellSidebarMargin,
} from "../components/notebookStyles";
import { VSCodeLLMProvider } from "../services/completion/vscodeLLMProvider";
import { createRuntimeMessageHandlers } from "../utils/runtimeMessageHandlers";

/**
 * Core notebook editor component using centralized state
 */
function NotebookEditorCore({
  store,
}: {
  store: ReturnType<typeof createNotebookStore>;
}): JSX.Element {
  const messageHandler = useContext(MessageHandlerContext);
  // Track this notebook's ID to detect when webview is reused for a different document
  // CRITICAL: Use ref instead of state to avoid stale closure issues!
  const notebookIdRef = useRef<string | null>(null);
  const notebookModelRef = useRef<unknown>(null);
  const { setColormode } = useJupyterReactStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the store as a hook for reactive values
  const selectedRuntimeFromStore = store((state) => state.selectedRuntime);
  const isDatalayerNotebook = store((state) => state.isDatalayerNotebook);
  const documentId = store((state) => state.documentId);
  const documentUri = store((state) => state.documentUri);
  const notebookId = store((state) => state.notebookId);
  const serverUrl = store((state) => state.serverUrl);
  const token = store((state) => state.token);
  const theme = store((state) => state.theme);
  const isInitialized = store((state) => state.isInitialized);
  const nbformat = store((state) => state.nbformat);

  // Runtime management with hook
  const { selectedRuntime, serviceManager, selectRuntime } = useRuntimeManager(
    selectedRuntimeFromStore,
  );

  // Notebook model management
  const { handleNotebookModelChanged, getNotebookData, markClean } =
    useNotebookModel({
      isDatalayerNotebook,
      messageHandler,
    });

  // Track notebook model in state for outline hook reactivity
  const [notebookModel, setNotebookModel] = useState<unknown>(null);

  // Wrap handleNotebookModelChanged to capture the model for outline
  const handleNotebookModelChangedWithOutline = useCallback(
    (model: unknown) => {
      console.log("[NotebookEditor] Model changed, updating state", {
        hasModel: !!model,
      });
      notebookModelRef.current = model;
      setNotebookModel(model); // Update state to trigger re-render
      handleNotebookModelChanged(model);
    },
    [handleNotebookModelChanged],
  );

  // Set up resize observer
  const notebookIdForResize = documentId || notebookId || "";
  useNotebookResize(notebookIdForResize, containerRef);

  // Memoize vscode API object to prevent unnecessary re-renders
  const vscodeApi = useMemo(
    () => ({
      postMessage: (msg: any) => messageHandler.send(msg),
    }),
    [messageHandler],
  );

  // Document URI for outline
  // Outline extraction hook
  useNotebookOutline({
    notebookModel: notebookModel as any, // Use state, not ref, for reactivity
    documentUri, // Use documentUri from store (set via init message)
    vscode: vscodeApi,
  });

  // Log documentUri for debugging
  useEffect(() => {
    console.log("[NotebookEditor] documentUri from store:", documentUri);
  }, [documentUri]);

  // Create notebook extensions (sidebar)
  const extensions = useMemo(() => [new CellSidebarExtension({})], []);

  // Create LLM completion provider for VS Code
  const llmProvider = useMemo(() => {
    console.log("[NotebookEditor] Creating VSCodeLLMProvider");
    return new VSCodeLLMProvider();
  }, []);

  // Create collaboration provider for Datalayer notebooks
  const collaborationProvider = useMemo(() => {
    if (isDatalayerNotebook && serverUrl && token && documentId) {
      return new DatalayerCollaborationProvider({
        runUrl: serverUrl,
        token: token,
        // Use proxy fetch to avoid CORS issues in VS Code webview
        fetchFn: proxyFetch as unknown as typeof fetch,
      }) as unknown as ICollaborationProvider;
    }
    return undefined;
  }, [isDatalayerNotebook, serverUrl, token, documentId]);

  // Signal ready immediately when component mounts
  useEffect(() => {
    // CRITICAL: Clear any stale VS Code state from recycled webviews
    // This prevents content from previous documents appearing in new documents
    vsCodeAPI.setState(null);
    messageHandler.send({ type: "ready" });
  }, [messageHandler]);

  // Create runtime message handlers using shared utilities
  const runtimeHandlers = useMemo(
    () =>
      createRuntimeMessageHandlers(selectRuntime, (runtime) =>
        store.getState().setRuntime(runtime),
      ),
    [selectRuntime, store],
  );

  // Handle messages from the extension
  // Memoize the handler to prevent re-registration on every render
  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      switch (message.type) {
        case "init": {
          const { body } = message;

          console.log("[NotebookEditor] Received init message", {
            hasDocumentUri: !!body.documentUri,
            documentUri: body.documentUri,
            notebookId: body.notebookId,
          });

          // CRITICAL: Detect when webview is reused for a different document
          if (
            body.notebookId &&
            notebookIdRef.current &&
            body.notebookId !== notebookIdRef.current
          ) {
            // Reset store to clear stale content from previous document
            store.getState().reset();
            // Clear VS Code state
            vsCodeAPI.setState(null);
            // Update to new notebook ID
            notebookIdRef.current = body.notebookId;
          }

          // First init - save our notebook ID
          if (body.notebookId && !notebookIdRef.current) {
            notebookIdRef.current = body.notebookId;
          }

          // Reset JupyterConfig singleton (applied via patch)
          // This ensures fresh config with correct serverUrl/token when webview is reused
          // resetJupyterConfig(); // TODO: Re-enable when function is exported

          // Handle theme
          if (body.theme) {
            store.getState().setTheme(body.theme);
          }

          // Handle notebook data
          if (body.isDatalayerNotebook) {
            store.getState().setIsDatalayerNotebook(true);
          }

          if (body.documentId) {
            store.getState().setDocumentId(body.documentId);
          }

          if (body.documentUri) {
            console.log(
              "[NotebookEditor] Setting documentUri in store",
              body.documentUri,
            );
            store.getState().setDocumentUri(body.documentUri);
          } else {
            console.warn("[NotebookEditor] No documentUri in init message!");
          }

          if (body.serverUrl) {
            store.getState().setServerUrl(body.serverUrl);
          }

          if (body.notebookId) {
            store.getState().setNotebookId(body.notebookId);
          }

          if (body.token) {
            store.getState().setToken(body.token);
          }

          if (body.untitled) {
            store.getState().setNbformat({});
          } else {
            const loadedNbformat = loadFromBytes(body.value);
            store.getState().setNbformat(loadedNbformat);
          }

          store.getState().setIsInitialized(true);
          break;
        }

        case "theme-change": {
          const { body } = message;
          if (body.theme && body.theme !== theme) {
            store.getState().setTheme(body.theme);
          }
          break;
        }

        case "runtime-selected":
        case "kernel-selected":
          runtimeHandlers.onRuntimeSelected(message);
          break;

        case "kernel-terminated":
        case "runtime-terminated":
          runtimeHandlers.onRuntimeTerminated();
          break;

        case "runtime-expired":
          runtimeHandlers.onRuntimeExpired();
          break;

        case "set-runtime":
          runtimeHandlers.onSetRuntime(message);
          break;

        case "getFileData": {
          if (!isDatalayerNotebook) {
            const bytes = getNotebookData(nbformat);
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
          if (!isDatalayerNotebook) {
            markClean();
          }
          break;

        case "outline-navigate": {
          // Handle navigation to outline item
          if (message.itemId && notebookModelRef.current) {
            // Extract cell index from itemId (format: "cell-X" or "cell-X-hY-Z" for headings)
            const match = message.itemId.match(/cell-(\d+)/);
            if (match) {
              const cellIndex = parseInt(match[1], 10);

              // Scroll to the cell
              setTimeout(() => {
                const notebookElement = document.querySelector(".jp-Notebook");

                if (notebookElement) {
                  const cells = notebookElement.querySelectorAll(".jp-Cell");
                  const targetCell = cells[cellIndex] as HTMLElement;

                  if (targetCell) {
                    // Scroll into view
                    targetCell.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }
                }
              }, 100);
            }
          }
          break;
        }
      }
    },
    [
      runtimeHandlers,
      getNotebookData,
      markClean,
      theme,
      isDatalayerNotebook,
      nbformat,
    ],
  );

  // Register message handler
  useEffect(() => {
    const disposable = messageHandler.on(
      handleMessage as (message: unknown) => void,
    );
    return () => disposable.dispose();
  }, [messageHandler, handleMessage]);

  // Sync colormode with theme changes
  useEffect(() => {
    setColormode(theme);
  }, [theme, setColormode]);

  // Block Cmd/Ctrl+S for collaborative Datalayer notebooks
  useEffect(() => {
    if (isDatalayerNotebook) {
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
  }, [isDatalayerNotebook]);

  // Handle Cmd+Z/Ctrl+Z (undo) and Cmd+Shift+Z/Ctrl+Y (redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentNotebookId = documentId || notebookId;
      if (!currentNotebookId) return;

      // Cmd+Z (macOS) or Ctrl+Z (Windows/Linux) - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        notebookStore2.getState().undo(currentNotebookId);
        return;
      }

      // Cmd+Shift+Z (macOS) or Ctrl+Y (Windows/Linux) - Redo
      if (
        ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) ||
        (e.ctrlKey && e.key === "y" && !e.metaKey)
      ) {
        e.preventDefault();
        notebookStore2.getState().redo(currentNotebookId);
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [documentId, notebookId]);

  // Loading state
  if (!isInitialized || !nbformat) {
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
        notebookId={documentId || notebookId}
        isDatalayerNotebook={isDatalayerNotebook}
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
            key={documentId || notebookId || "notebook"}
            // @ts-ignore - Type mismatch between different @jupyterlab versions
            nbformat={nbformat || {}}
            id={documentId || notebookId}
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
            inlineProviders={(() => {
              console.log(
                "[NotebookEditor] Passing inlineProviders to Notebook2:",
                [llmProvider],
              );
              return [llmProvider];
            })()}
            onNotebookModelChanged={handleNotebookModelChangedWithOutline}
          />
        </Box>
      </Box>
    </div>
  );
}

/**
 * Main notebook component with theme provider.
 * Creates the store at this level so theme can be shared between
 * VSCodeTheme wrapper and NotebookEditorCore.
 */
function NotebookEditor(): JSX.Element {
  // Create per-instance store - prevents global state sharing
  const [store] = React.useState(() => createNotebookStore());
  // Subscribe to theme changes from the store
  const theme = store((state) => state.theme);

  return (
    <VSCodeTheme colorMode={theme} loadJupyterLabCss={true}>
      <NotebookEditorCore store={store} />
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
