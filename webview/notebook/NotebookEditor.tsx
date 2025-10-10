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
  resetJupyterConfig,
} from "@datalayer/jupyter-react";
import { DatalayerCollaborationProvider } from "@datalayer/core/lib/collaboration";
import {
  MessageHandlerContext,
  type ExtensionMessage,
} from "../services/messageHandler";
import { loadFromBytes } from "../utils";
import { initializeRequireJSStub } from "../utils/requirejsStub";
import { proxyFetch } from "../utils/httpProxy";
import { RuntimeProgressBar } from "../components/RuntimeProgressBar";
import { NotebookActions } from "@jupyterlab/notebook";
import { notebookStore2 } from "@datalayer/jupyter-react";

// Initialize RequireJS stub for ClassicWidgetManager
initializeRequireJSStub();
import { NotebookToolbar } from "./NotebookToolbar";
import { VSCodeTheme } from "../theme/VSCodeTheme";
import type { RuntimeJSON } from "@datalayer/core/lib/client/models/Runtime";

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
    if (
      store.isDatalayerNotebook &&
      store.serverUrl &&
      store.token &&
      store.documentId
    ) {
      return new DatalayerCollaborationProvider({
        runUrl: store.serverUrl,
        token: store.token,
        // Use proxy fetch to avoid CORS issues in VS Code webview
        fetchFn: proxyFetch as unknown as typeof fetch,
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
    messageHandler.send({ type: "ready" });
  }, [messageHandler]);

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = async (message: ExtensionMessage) => {
      switch (message.type) {
        case "init": {
          const { body } = message;

          // Reset store to clear any stale state from previous document
          store.reset();

          // Reset JupyterConfig singleton (applied via patch)
          // This ensures fresh config with correct serverUrl/token when webview is reused
          resetJupyterConfig();

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
          if (body?.runtime) {
            selectRuntime(body.runtime);
            store.setRuntime(body.runtime);
          }
          break;
        }

        case "kernel-terminated": // Extension sends this when runtime is terminated
        case "runtime-terminated": // Legacy message type
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

        case "insert-cell": {
          const { body } = message;
          const { cellType, cellSource, cellIndex } = body;

          console.log("[Webview] Received insert-cell message:", {
            cellType,
            cellIndex,
            notebookId,
          });

          // Poll for notebook to be ready
          const waitForNotebook = async () => {
            const maxAttempts = 20; // 10 seconds max (20 * 500ms)
            for (let i = 0; i < maxAttempts; i++) {
              const notebookState = notebookStore2.getState();
              const notebook = notebookState.notebooks.get(notebookId);

              console.log(
                `[Webview] Checking notebook readiness, attempt ${i + 1}/${maxAttempts}:`,
                {
                  notebookId,
                  hasNotebook: !!notebook,
                  hasAdapter: !!notebook?.adapter,
                  hasPanel: !!notebook?.adapter?.panel,
                  hasContent: !!notebook?.adapter?.panel?.content,
                },
              );

              if (notebook?.adapter?.panel?.content) {
                console.log("[Webview] Notebook is ready!");
                return notebook;
              }

              console.log(`[Webview] Notebook not ready, waiting 500ms...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            return null;
          };

          const notebook = await waitForNotebook();

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;

            // Set selection to target index if specified, otherwise append to end
            if (cellIndex !== undefined && cellIndex >= 0) {
              notebookWidget.activeCellIndex = Math.min(
                cellIndex,
                notebookWidget.model!.cells.length,
              );
            } else {
              // Move to end for appending
              notebookWidget.activeCellIndex =
                notebookWidget.model!.cells.length - 1;
            }

            // Insert cell below current position
            NotebookActions.insertBelow(notebookWidget);
            NotebookActions.changeCellType(notebookWidget, cellType);

            // Set cell content
            const activeCell = notebookWidget.activeCell;
            if (activeCell && activeCell.model.sharedModel) {
              activeCell.model.sharedModel.source = cellSource;
              console.log(
                "[Webview] Cell inserted successfully at index:",
                notebookWidget.activeCellIndex,
              );
            } else {
              console.warn(
                "[Webview] Could not set cell content - activeCell or sharedModel missing",
              );
            }
          } else {
            console.error(
              "[Webview] Could not insert cell - notebook widget not found after waiting 10 seconds",
            );
          }
          break;
        }

        case "delete-cell": {
          const { body } = message;
          const { cellIndex } = body;

          console.log("[Webview] Received delete-cell message:", {
            cellIndex,
            notebookId,
          });

          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;
            const cellCount = notebookWidget.model!.cells.length;

            if (cellIndex >= 0 && cellIndex < cellCount) {
              // Set active cell to the one we want to delete
              notebookWidget.activeCellIndex = cellIndex;
              // Delete the cell
              NotebookActions.deleteCells(notebookWidget);
              console.log(
                "[Webview] Cell deleted successfully at index:",
                cellIndex,
              );
            } else {
              console.error(
                `[Webview] Cell index ${cellIndex} out of range (0-${cellCount - 1})`,
              );
            }
          } else {
            console.error(
              "[Webview] Notebook widget not found for delete-cell",
            );
          }
          break;
        }

        case "overwrite-cell": {
          const { body } = message;
          const { cellIndex, cellSource } = body;

          console.log("[Webview] Received overwrite-cell message:", {
            cellIndex,
            notebookId,
          });

          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;
            const cellCount = notebookWidget.model!.cells.length;

            if (cellIndex >= 0 && cellIndex < cellCount) {
              const cell = notebookWidget.model!.cells.get(cellIndex);
              if (cell?.sharedModel) {
                cell.sharedModel.source = cellSource;
                console.log(
                  "[Webview] Cell source overwritten successfully at index:",
                  cellIndex,
                );
              } else {
                console.error(
                  "[Webview] Cell or sharedModel not found for overwrite",
                );
              }
            } else {
              console.error(
                `[Webview] Cell index ${cellIndex} out of range (0-${cellCount - 1})`,
              );
            }
          } else {
            console.error(
              "[Webview] Notebook widget not found for overwrite-cell",
            );
          }
          break;
        }

        case "read-cell-request": {
          const { body, requestId } = message;
          const { cellIndex } = body;

          console.log("[Webview] Received read-cell-request:", {
            cellIndex,
            requestId,
            notebookId,
          });

          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;
            const cellCount = notebookWidget.model!.cells.length;

            if (cellIndex >= 0 && cellIndex < cellCount) {
              const cell = notebookWidget.model!.cells.get(cellIndex);
              if (cell) {
                const cellType =
                  cell.type === "code"
                    ? "code"
                    : cell.type === "markdown"
                      ? "markdown"
                      : "raw";
                const source = cell.sharedModel?.source || "";

                // Extract outputs for code cells
                let outputs: string[] | undefined;
                if (cell.type === "code" && (cell as any).model?.outputs) {
                  outputs = [];
                  const outputList = (cell as any).model.outputs;
                  for (let i = 0; i < outputList.length; i++) {
                    const output = outputList.get(i);
                    const outputType = output.type;

                    if (outputType === "stream") {
                      outputs.push(output.text || "");
                    } else if (
                      outputType === "execute_result" ||
                      outputType === "display_data"
                    ) {
                      outputs.push(
                        output.data?.["text/plain"] || "[non-text output]",
                      );
                    } else if (outputType === "error") {
                      outputs.push(
                        output.traceback?.join("\n") || "[error output]",
                      );
                    } else {
                      outputs.push(`[${outputType} output]`);
                    }
                  }
                }

                // Send response
                messageHandler.send({
                  type: "read-cell-response",
                  requestId,
                  body: {
                    index: cellIndex,
                    type: cellType,
                    source,
                    outputs,
                  },
                });

                console.log(
                  "[Webview] Sent read-cell-response for index:",
                  cellIndex,
                );
              }
            } else {
              console.error(
                `[Webview] Cell index ${cellIndex} out of range (0-${cellCount - 1})`,
              );
            }
          } else {
            console.error(
              "[Webview] Notebook widget not found for read-cell-request",
            );
          }
          break;
        }

        case "read-all-cells-request": {
          const { requestId } = message;

          console.log("[Webview] Received read-all-cells-request:", {
            requestId,
            notebookId,
          });

          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            const notebookWidget = notebook.adapter.panel.content;
            const cells: Array<{
              index: number;
              type: string;
              source: string;
              outputs?: string[];
            }> = [];

            const cellCount = notebookWidget.model!.cells.length;
            for (let i = 0; i < cellCount; i++) {
              const cell = notebookWidget.model!.cells.get(i);
              if (cell) {
                const cellType =
                  cell.type === "code"
                    ? "code"
                    : cell.type === "markdown"
                      ? "markdown"
                      : "raw";
                const source = cell.sharedModel?.source || "";

                // Extract outputs for code cells
                let outputs: string[] | undefined;
                if (cell.type === "code" && (cell as any).model?.outputs) {
                  outputs = [];
                  const outputList = (cell as any).model.outputs;
                  for (let j = 0; j < outputList.length; j++) {
                    const output = outputList.get(j);
                    const outputType = output.type;

                    if (outputType === "stream") {
                      outputs.push(output.text || "");
                    } else if (
                      outputType === "execute_result" ||
                      outputType === "display_data"
                    ) {
                      outputs.push(
                        output.data?.["text/plain"] || "[non-text output]",
                      );
                    } else if (outputType === "error") {
                      outputs.push(
                        output.traceback?.join("\n") || "[error output]",
                      );
                    } else {
                      outputs.push(`[${outputType} output]`);
                    }
                  }
                }

                cells.push({
                  index: i,
                  type: cellType,
                  source,
                  outputs,
                });
              }
            }

            // Send response
            messageHandler.send({
              type: "read-all-cells-response",
              requestId,
              body: cells,
            });

            console.log(
              "[Webview] Sent read-all-cells-response with",
              cells.length,
              "cells",
            );
          } else {
            console.error(
              "[Webview] Notebook widget not found for read-all-cells-request",
            );
          }
          break;
        }
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
