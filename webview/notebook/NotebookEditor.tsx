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
import type { RuntimeJSON } from "@datalayer/core/lib/client";

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

// Extended interface for runtime with credits information
interface RuntimeWithCredits extends RuntimeJSON {
  creditsUsed?: number;
  creditsLimit?: number;
}

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
  const {
    selectedRuntime,
    kernelName,
    serviceManager,
    serviceManagerVersion,
    selectRuntime,
    selectPyodideRuntime,
  } = useRuntimeManager(selectedRuntimeFromStore);

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

  // Create notebook extensions (sidebar)
  const extensions = useMemo(() => [new CellSidebarExtension({})], []);

  // Create LLM completion provider for VS Code
  const llmProvider = useMemo(() => new VSCodeLLMProvider(), []);

  // Create stable array for inline providers to prevent re-renders
  const inlineProviders = useMemo(() => [llmProvider], [llmProvider]);

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

  // Handle messages from the extension
  // Memoize the handler to prevent re-registration on every render
  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      switch (message.type) {
        case "init": {
          const { body } = message;

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
            store.getState().setDocumentUri(body.documentUri);
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

        case "local-kernel-connected": {
          // Handle local kernel connection - bypass runtime/session creation
          const { body } = message;

          console.log(
            "[NotebookEditor] local-kernel-connected message received:",
            body,
          );

          // For local kernels, we MUST update the service manager AND set the runtime
          // The service manager update creates the proper LocalKernelServiceManager
          // which handles WebSocket communication with the extension
          if (body?.runtime) {
            console.log(
              "[NotebookEditor] Switching to local kernel runtime:",
              body.runtime,
            );
            selectRuntime(body.runtime); // This updates the service manager!
            store.getState().setRuntime(body.runtime);
          } else {
            console.warn(
              "[NotebookEditor] local-kernel-connected with no runtime",
              body,
            );
          }
          break;
        }

        case "runtime-selected":
        case "kernel-selected": {
          const { body } = message;

          console.log("[NotebookEditor] kernel-selected message received:", {
            kernelType: body?.kernelType,
            hasRuntime: !!body?.runtime,
          });

          if (body?.kernelType === "pyodide") {
            // Switch to Pyodide kernel
            console.log("[NotebookEditor] Switching to Pyodide kernel");
            selectPyodideRuntime().catch((error) => {
              console.error(
                "[NotebookEditor] Failed to switch to Pyodide kernel:",
                error,
              );
            });
          } else if (body?.runtime) {
            // Switch to local/remote runtime
            console.log("[NotebookEditor] Switching to runtime:", body.runtime);
            selectRuntime(body.runtime);
            store.getState().setRuntime(body.runtime);
          } else {
            console.warn(
              "[NotebookEditor] kernel-selected with no runtime or kernelType",
              body,
            );
          }
          break;
        }

        case "kernel-terminated": // Extension sends this when runtime is terminated
        case "runtime-terminated": // Legacy message type
          setTimeout(() => {
            selectRuntime(undefined);
            store.getState().setRuntime(undefined);
          }, 100);
          break;

        case "runtime-expired":
          // Runtime has expired - reset to mock service manager
          setTimeout(() => {
            selectRuntime(undefined);
            store.getState().setRuntime(undefined);
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
            store.getState().setRuntime(runtimeInfo);
          }
          break;
        }

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

        case "clear-all-outputs-command": {
          // Handle Clear All Outputs command from toolbar
          console.log(
            "[NotebookEditor] Clearing all outputs via notebook store",
          );

          // Use the notebook store to clear outputs via the adapter
          const currentNotebookId = documentId || notebookId;
          if (currentNotebookId) {
            notebookStore2.getState().clearAllOutputs(currentNotebookId);
          } else {
            console.warn(
              "[NotebookEditor] Cannot clear outputs: no notebook ID available",
            );
          }
          break;
        }

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
      selectRuntime,
      selectPyodideRuntime,
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
        kernelName={kernelName}
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
            // Use stable key - prevents remounting when switching runtimes
            // MutableServiceManager + proxies handle service manager changes internally
            key={documentId || notebookId || "notebook"}
            // @ts-ignore - Type mismatch between different @jupyterlab versions
            nbformat={nbformat || {}}
            id={documentId || notebookId}
            // @ts-ignore - Type mismatch between @jupyterlab/services versions
            serviceManager={serviceManager}
            serviceManagerVersion={serviceManagerVersion}
            collaborationProvider={collaborationProvider}
            // Auto-start kernel for Pyodide and remote runtimes
            // The concurrent checks and kernel existence validation will prevent errors
            startDefaultKernel={!!kernelName || !!selectedRuntime}
            height={notebookHeight}
            cellSidebarMargin={cellSidebarMargin}
            extensions={extensions}
            inlineProviders={inlineProviders}
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
