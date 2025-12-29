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
  notebookToolOperations,
  type ToolOperation,
  DefaultExecutor,
  useNotebookStore2,
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
import {
  createNotebookRunner,
  setupToolExecutionListener,
} from "../services/runnerSetup";

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
    serviceManager,
    selectRuntime,
    mutableServiceManager,
  } = useRuntimeManager(selectedRuntimeFromStore);

  // Notebook model management
  const { handleNotebookModelChanged, getNotebookData, markClean } =
    useNotebookModel({
      isDatalayerNotebook,
      messageHandler,
    });

  // Track notebook model in state for outline hook reactivity
  const [notebookModel, setNotebookModel] = useState<unknown>(null);

  // Track kernel initialization state for showing spinner in toolbar
  const [kernelInitializing, setKernelInitializing] = useState<boolean>(false);

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
  const llmProvider = useMemo(() => {
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
      createRuntimeMessageHandlers(
        selectRuntime,
        setKernelInitializing,
        async (runtime) => {
          store.getState().setRuntime(runtime);
        },
        mutableServiceManager || undefined,
        () => selectedRuntime, // getCurrentRuntime callback
      ),
    [selectRuntime, store, mutableServiceManager, selectedRuntime],
  );

  // Handle messages from the extension
  // Memoize the handler to prevent re-registration on every render
  const handleMessage = useCallback(
    async (message: ExtensionMessage) => {
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

        case "kernel-starting":
          runtimeHandlers.onKernelStarting(message);
          break;

        case "runtime-selected":
        case "kernel-selected":
          runtimeHandlers.onRuntimeSelected(message);
          break;

        case "kernel-terminated":
        case "runtime-terminated":
          runtimeHandlers.onRuntimeTerminated();
          break;

        case "runtime-pre-termination":
          // 5 seconds before termination - dispose while server is still alive
          runtimeHandlers.onRuntimePreTermination();
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

        case "insert-cell": {
          const { body } = message;
          const { cellType, source, index } = body;

          // GUARD: Validate source exists
          if (source === undefined || source === null) {
            console.error(
              `[NotebookEditor] insert-cell: 'source' is ${source}! Message body:`,
              body,
              "This indicates internal.insertCell sent undefined/null source.",
            );
            throw new Error(
              `insert-cell requires 'source' field. Got: ${source}`,
            );
          }

          // Poll for notebook to be ready
          const waitForNotebook = async () => {
            const maxAttempts = 20; // 10 seconds max (20 * 500ms)
            for (let i = 0; i < maxAttempts; i++) {
              const notebookState = notebookStore2.getState();
              const notebook = notebookState.notebooks.get(notebookId);

              if (notebook?.adapter?.panel?.content) {
                return notebook;
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            return null;
          };

          const notebook = await waitForNotebook();

          if (notebook?.adapter?.panel?.content) {
            // Use insertCell when index is provided, insertBelow otherwise
            if (index !== undefined) {
              notebookStore2
                .getState()
                .insertCell(notebookId, cellType, index, source);
            } else {
              notebookStore2
                .getState()
                .insertBelow(notebookId, cellType, source);
            }
          }
          break;
        }

        case "delete-cell": {
          const { body } = message;
          const { index } = body;

          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;
            const cellCount = notebookWidget.model!.cells.length;

            if (index >= 0 && index < cellCount) {
              // Delete cell directly through the model
              notebookWidget.model!.sharedModel.deleteCell(index);
            }
          }
          break;
        }

        case "overwrite-cell": {
          const { body } = message;
          const { index, source } = body;

          try {
            // Update cell directly through the model
            const notebookState = notebookStore2.getState();
            const notebook = notebookState.notebooks.get(notebookId);
            if (notebook?.adapter?.panel?.content) {
              const notebookWidget = notebook.adapter.panel.content;
              const cell = notebookWidget.model!.cells.get(index);
              if (cell) {
                cell.sharedModel.setSource(source);
              }
            }
          } catch (error) {
            console.error("[Webview] Failed to overwrite cell:", error);
          }
          break;
        }

        case "set-active-cell": {
          const { body } = message;
          const { index } = body;

          // Poll for notebook to be ready
          const waitForNotebook = async () => {
            const maxAttempts = 20; // 10 seconds max
            for (let i = 0; i < maxAttempts; i++) {
              const notebookState = notebookStore2.getState();
              const notebook = notebookState.notebooks.get(notebookId);

              if (notebook?.adapter?.panel?.content) {
                return notebook;
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            return null;
          };

          const notebook = await waitForNotebook();

          if (notebook?.adapter?.panel?.content) {
            try {
              const notebookWidget = notebook.adapter.panel.content;
              const cellCount = notebookWidget.model!.cells.length;

              if (index >= 0 && index < cellCount) {
                notebookWidget.activeCellIndex = index;
              }
            } catch (error) {
              console.error("[Webview] Failed to set active cell:", error);
            }
          }
          break;
        }

        case "read-cell-request": {
          const { body, requestId } = message;
          const { index } = body;

          try {
            // Read cell directly from the model
            const notebookState = notebookStore2.getState();
            const notebook = notebookState.notebooks.get(notebookId);
            let cellData: any = null;

            if (notebook?.adapter?.panel?.content) {
              const notebookWidget = notebook.adapter.panel.content;
              const cell = notebookWidget.model!.cells.get(index);
              if (cell) {
                cellData = {
                  type: cell.type,
                  source: cell.sharedModel.getSource(),
                  outputs:
                    cell.type === "code"
                      ? Array.from((cell as any).outputs || [])
                      : undefined,
                };
              }
            }

            if (cellData) {
              // Convert outputs to string format for the response
              let outputs: string[] | undefined;
              if (cellData.outputs && cellData.outputs.length > 0) {
                outputs = cellData.outputs.map((output: any) => {
                  if (output.output_type === "stream") {
                    return output.text || "";
                  } else if (
                    output.output_type === "execute_result" ||
                    output.output_type === "display_data"
                  ) {
                    return output.data?.["text/plain"] || "[non-text output]";
                  } else if (output.output_type === "error") {
                    return output.traceback?.join("\n") || "[error output]";
                  } else {
                    return `[${output.output_type} output]`;
                  }
                });
              }

              // Send response
              messageHandler.send({
                type: "response",
                requestId,
                body: {
                  index: index,
                  type: cellData.type,
                  source: cellData.source,
                  outputs,
                },
              });
            } else {
              console.error("[Webview] Cell not found at index:", index);
            }
          } catch (error) {
            console.error("[Webview] Failed to read cell:", error);
          }
          break;
        }

        case "get-cells-request": {
          const { requestId } = message;

          try {
            const allCells = notebookStore2
              .getState()
              .readAllCells(notebookId, "detailed");
            const cells = allCells.map((cellData) => ({
              id: `cell-${cellData.index}`,
              cell_type: cellData.type,
              source: cellData.source,
              outputs: cellData.outputs,
            }));

            messageHandler.send({
              type: "response",
              requestId,
              body: cells,
            });
          } catch (error) {
            console.error("[Webview] Failed to get cells:", error);
          }
          break;
        }

        case "get-notebook-info-request": {
          const { requestId } = message;

          try {
            const allCells = notebookStore2
              .getState()
              .readAllCells(notebookId, "brief");
            const cellCount = allCells.length;

            // Count cell types
            const cellTypes = { code: 0, markdown: 0, raw: 0 };
            allCells.forEach((cell) => {
              if (cell.type === "code") cellTypes.code++;
              else if (cell.type === "markdown") cellTypes.markdown++;
              else if (cell.type === "raw") cellTypes.raw++;
            });

            // Send response
            messageHandler.send({
              type: "response",
              requestId,
              body: {
                path: notebookId,
                cellCount,
                cellTypes,
              },
            });
          } catch (error) {
            console.error("[Webview] Failed to get notebook info:", error);
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

  // CRITICAL: Restart SessionContext when switching between ANY runtimes
  // When we switch service managers, SessionContext keeps the old kernel session cached
  // This causes "Kernel is disposed" errors when cells try to execute
  // Solution: Force SessionContext to shutdown and reconnect with the new service manager's kernel
  useEffect(() => {
    if (!selectedRuntime || !notebookId) return;

    // Track previous runtime to detect switches
    const prevRuntimeKey = `prevRuntime_${documentId || notebookId}`;
    const prevRuntimeStr = sessionStorage.getItem(prevRuntimeKey);
    const prevRuntime = prevRuntimeStr ? JSON.parse(prevRuntimeStr) : null;

    // Detect if runtime actually changed
    const runtimeChanged =
      !prevRuntime || prevRuntime.ingress !== selectedRuntime.ingress;

    // Store current runtime for next comparison
    sessionStorage.setItem(prevRuntimeKey, JSON.stringify(selectedRuntime));

    // Skip restart if runtime hasn't changed
    if (!runtimeChanged) return;

    // Get SessionContext from notebook adapter
    const notebookState = notebookStore2.getState();
    const notebook = notebookState.notebooks.get(documentId || notebookId);

    if (!notebook?.adapter?.panel?.sessionContext) {
      return;
    }

    const sessionContext = notebook.adapter.panel.sessionContext;

    // Check if switching TO Pyodide
    const isPyodide = selectedRuntime.ingress === "http://pyodide-local";

    // Shutdown and reconnect SessionContext
    // This kills the old session and connects to the new running kernel
    (async () => {
      try {
        // Special handling: Don't shutdown SessionContext when switching TO Pyodide
        // Notebook2 will start the Pyodide kernel naturally
        if (isPyodide) {
          return;
        }

        // For non-Pyodide runtimes: shutdown old SessionContext first
        await sessionContext.shutdown();

        // Wait for kernel to be running (useRuntimeManager starts it asynchronously)
        // Retry up to 10 times with 200ms delays (2 seconds total)
        let newKernel = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const runningKernels =
            mutableServiceManager.current.kernels.running();
          const kernelsArray = Array.from(runningKernels);

          if (kernelsArray.length > 0) {
            newKernel = kernelsArray[0];
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (!newKernel) {
          console.error(
            "[NotebookEditor] No running kernel found after waiting",
          );
          return;
        }

        // Connect to the running kernel (creates new session)
        await sessionContext.changeKernel({ id: newKernel.id });
      } catch (error) {
        console.error(
          "[NotebookEditor] ❌ Error restarting SessionContext:",
          error,
        );
      }
    })();
  }, [selectedRuntime, documentId, notebookId]);

  // Monitor kernel readiness for Pyodide and Datalayer runtimes
  // When kernel becomes ready (status='idle' AND sessionContext.isReady), send "kernel-ready" message
  useEffect(() => {
    // Only monitor if we're in kernel initializing state
    if (!kernelInitializing) {
      return undefined;
    }

    // Get notebook from store
    const currentNotebookId = documentId || notebookId;
    if (!currentNotebookId) {
      return undefined;
    }

    const notebook = notebookStore2.getState().notebooks.get(currentNotebookId);
    if (!notebook?.adapter) {
      return undefined;
    }

    const context = (notebook.adapter as any)._context;
    const sessionContext = context?.sessionContext;
    if (!sessionContext) {
      return undefined;
    }

    // Function to check if kernel is ready
    const checkKernelReady = () => {
      const session = sessionContext.session;
      const kernel = session?.kernel;
      const isReady = sessionContext.isReady;
      const kernelStatus = kernel?.status;

      // Kernel is ready when:
      // 1. SessionContext is ready (sessionContext.isReady = true)
      // 2. Kernel status is 'idle' (not 'starting', 'unknown', etc.)
      // 3. We were previously in kernel initializing state
      if (kernel && kernelStatus === "idle" && isReady && kernelInitializing) {
        // Send kernel-ready message to extension
        messageHandler.send({
          type: "kernel-ready",
          body: {},
        });

        // Clear kernel initializing state
        setKernelInitializing(false);
      }
    };

    // Check immediately
    checkKernelReady();

    // Track kernel status subscription
    let currentKernelStatusHandler: (() => void) | null = null;
    let currentKernel: any = null;

    // Function to subscribe to kernel status changes
    const subscribeToKernel = () => {
      // Unsubscribe from previous kernel if any
      if (currentKernel && currentKernelStatusHandler) {
        currentKernel.statusChanged?.disconnect(currentKernelStatusHandler);
      }

      // Subscribe to new kernel
      const session = sessionContext.session;
      const kernel = session?.kernel;

      if (kernel) {
        currentKernel = kernel;
        currentKernelStatusHandler = () => {
          checkKernelReady();
        };
        kernel.statusChanged?.connect(currentKernelStatusHandler);

        // Check immediately after subscribing
        checkKernelReady();
      }
    };

    // Subscribe to session changes
    const onSessionChanged = () => {
      subscribeToKernel(); // Re-subscribe to the new kernel
    };
    sessionContext.sessionChanged?.connect(onSessionChanged);

    // Subscribe to sessionContext status changes (when isReady changes)
    const onStatusChanged = () => {
      checkKernelReady();
    };
    sessionContext.statusChanged?.connect(onStatusChanged);

    // Subscribe to initial kernel if it exists
    subscribeToKernel();

    return () => {
      sessionContext.sessionChanged?.disconnect(onSessionChanged);
      sessionContext.statusChanged?.disconnect(onStatusChanged);
      if (currentKernel && currentKernelStatusHandler) {
        currentKernel.statusChanged?.disconnect(currentKernelStatusHandler);
      }
    };
  }, [kernelInitializing, documentId, notebookId, messageHandler]);

  // Get notebook store for DefaultExecutor
  const notebookStoreState = useNotebookStore2();

  // Set up tool execution listener using Runner pattern
  useEffect(() => {
    // Wait for notebookId to be available
    if (!notebookId) {
      return;
    }

    // Create DefaultExecutor for direct state manipulation
    const executor = new DefaultExecutor(notebookId, notebookStoreState);

    // Create runner with notebook operations, notebookId, AND executor
    const runner = createNotebookRunner(
      notebookToolOperations as Record<string, ToolOperation<unknown, unknown>>,
      notebookId,
      executor,
    );

    // Set up listener for tool-execution messages from extension
    const cleanup = setupToolExecutionListener(
      runner,
      vsCodeAPI,
      mutableServiceManager || undefined,
    );

    return cleanup;
  }, [notebookId, notebookStoreState, mutableServiceManager]); // Recreate runner when notebookId or store changes

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
        kernelInitializing={kernelInitializing}
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
            // CRITICAL: Pass runtime ingress as kernelId to force useKernelId to re-run
            // when runtime changes. Without this, useKernelId's useEffect won't re-run
            // because serviceManager.kernels is a stable proxy reference.
            // This fixes the bug where switching runtimes multiple times doesn't start kernels.
            kernelId={selectedRuntime?.ingress}
            // Start kernel when we have a real runtime selected
            // Collaboration and execution are orthogonal:
            // - collaborationProvider syncs notebook content with Datalayer platform
            // - serviceManager + kernel handles cell execution (same for local and remote)
            startDefaultKernel={!!selectedRuntime}
            height={notebookHeight}
            cellSidebarMargin={cellSidebarMargin}
            extensions={extensions}
            inlineProviders={[llmProvider]}
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
