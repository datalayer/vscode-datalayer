/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module NotebookToolbar
 * VS Code-style toolbar for the Jupyter notebook.
 * Uses shared toolbar components to maintain consistency with LexicalToolbar.
 */

import React, { useState, useEffect, useContext } from "react";
import { notebookStore2 } from "@datalayer/jupyter-react";
import { NotebookActions } from "@jupyterlab/notebook";
import { MessageHandlerContext } from "../services/messageHandler";
import type { RuntimeJSON } from "@datalayer/core/lib/client/models/Runtime";

// Import shared toolbar components
import {
  BaseToolbar,
  ToolbarButton,
  KernelSelector,
} from "../components/toolbar";
import type { ToolbarAction } from "../components/toolbar";

/**
 * Props for the NotebookToolbar component
 */
export interface NotebookToolbarProps {
  /** ID of the notebook */
  notebookId: string;
  /** Whether this is a Datalayer cloud notebook */
  isDatalayerNotebook?: boolean;
  /** Selected runtime information for Datalayer notebooks */
  selectedRuntime?: RuntimeJSON;
}

/**
 * Toolbar component for Jupyter notebook operations.
 * Uses shared components to ensure consistent appearance with LexicalToolbar.
 */
export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebookId,
  isDatalayerNotebook = false,
  selectedRuntime,
}) => {
  const messageHandler = useContext(MessageHandlerContext);
  const [kernelStatus, setKernelStatus] = useState<string>("disconnected");
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [notebook, setNotebook] = useState<any>(null);

  // Monitor notebook state from notebookStore2
  useEffect(() => {
    if (!notebookId) return undefined;

    const unsubscribe = notebookStore2.subscribe((state) => {
      const notebook = state.notebooks.get(notebookId);
      if (notebook) {
        setNotebook(notebook);
      }
    });

    return () => unsubscribe();
  }, [notebookId]);

  // Add pulse animation styles for collaborative indicator
  React.useEffect(() => {
    if (isDatalayerNotebook) {
      const style = document.createElement("style");
      style.textContent = `
        @keyframes pulse {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
    return undefined;
  }, [isDatalayerNotebook]);

  // Add scroll detection for shadow effect
  React.useEffect(() => {
    let scrollListener: any = null;
    let observer: MutationObserver | null = null;

    const setupScrollDetection = () => {
      const handleScroll = () => {
        const toolbar = document.querySelector("[data-notebook-toolbar]");
        if (toolbar) {
          const rect = toolbar.getBoundingClientRect();
          const pageScrolled =
            window.pageYOffset > 10 || document.documentElement.scrollTop > 10;
          const toolbarAtTop = rect.top <= 5;

          setIsScrolled(pageScrolled && toolbarAtTop);
        }
      };

      scrollListener = () => {
        requestAnimationFrame(handleScroll);
      };

      window.addEventListener("scroll", scrollListener, true);
      document.addEventListener("scroll", scrollListener, true);

      const notebook = document.querySelector(
        ".jp-Notebook, .jp-WindowedPanel, #notebook-editor",
      );
      if (notebook) {
        notebook.addEventListener("scroll", scrollListener);
        const parent = notebook.parentElement;
        if (parent) {
          parent.addEventListener("scroll", scrollListener);
        }
      }

      handleScroll();
    };

    observer = new MutationObserver(() => {
      const notebook = document.querySelector(
        ".jp-Notebook, .jp-WindowedPanel",
      );
      if (notebook) {
        setupScrollDetection();
        observer?.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setupScrollDetection();

    return () => {
      if (scrollListener) {
        window.removeEventListener("scroll", scrollListener, true);
        document.removeEventListener("scroll", scrollListener, true);
      }
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedRuntime) {
      if (notebook?.adapter?.kernel?.connection) {
        const kernelConnection = notebook.adapter.kernel.connection;
        setKernelStatus(kernelConnection.status || "idle");
      } else {
        setKernelStatus("idle");
      }
    } else if (notebook?.adapter?.kernel?.connection) {
      const kernelConnection = notebook.adapter.kernel.connection;
      setKernelStatus(kernelConnection.status || "idle");
    } else {
      setKernelStatus("disconnected");
    }
  }, [notebook, isDatalayerNotebook, selectedRuntime]);

  const handleRunAll = () => {
    if (notebookId) {
      notebookStore2.getState().runAll(notebookId);
    }
  };

  const handleAddCodeCell = () => {
    if (notebookId && notebook?.adapter?.panel?.content) {
      NotebookActions.insertBelow(notebook.adapter.panel.content);
      NotebookActions.changeCellType(notebook.adapter.panel.content, "code");
    }
  };

  const handleAddMarkdownCell = () => {
    if (notebookId && notebook?.adapter?.panel?.content) {
      NotebookActions.insertBelow(notebook.adapter.panel.content);
      NotebookActions.changeCellType(
        notebook.adapter.panel.content,
        "markdown",
      );
    }
  };

  const handleSelectRuntime = () => {
    if (messageHandler) {
      messageHandler.send({
        type: "select-runtime",
        body: {
          isDatalayerNotebook: isDatalayerNotebook,
        },
      });
    }
  };

  // Define all toolbar actions with priorities
  const actions: ToolbarAction[] = [
    {
      id: "code",
      icon: "codicon codicon-add",
      label: "Code",
      title: "Add Code Cell",
      onClick: handleAddCodeCell,
      priority: 1,
    },
    {
      id: "markdown",
      icon: "codicon codicon-add",
      label: "Markdown",
      title: "Add Markdown Cell",
      onClick: handleAddMarkdownCell,
      priority: 2,
    },
    {
      id: "runAll",
      icon: "codicon codicon-run-all",
      label: "Run All",
      title: "Run All Cells",
      onClick: handleRunAll,
      priority: 3,
    },
  ];

  // Calculate reserved right width for overflow calculation
  const reservedForCollaborative = isDatalayerNotebook ? 180 : 0;
  const reservedForKernel = 200;
  const reservedRightWidth = reservedForKernel + reservedForCollaborative;

  return (
    <div
      data-notebook-toolbar="true"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: isScrolled
          ? "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)"
          : "none",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <BaseToolbar
        actions={actions}
        renderAction={(action) => (
          <ToolbarButton
            icon={action.icon}
            label={action.label}
            onClick={action.onClick}
            title={action.title}
            disabled={action.disabled}
          />
        )}
        estimatedButtonWidth={80}
        reservedRightWidth={reservedRightWidth}
        rightContent={
          <>
            {/* Collaborative status indicator for Datalayer notebooks */}
            {isDatalayerNotebook && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0 8px",
                  backgroundColor: "transparent",
                  color: "var(--vscode-foreground)",
                  fontSize: "11px",
                  opacity: 0.8,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "var(--vscode-terminal-ansiGreen)",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "pulse 2s infinite",
                  }}
                ></span>
                <span>Collaborative • Auto-saved</span>
              </div>
            )}

            <KernelSelector
              selectedRuntime={selectedRuntime}
              kernelStatus={
                kernelStatus as "idle" | "busy" | "disconnected" | undefined
              }
              onClick={handleSelectRuntime}
              disabled={
                kernelStatus !== "disconnected" && !!notebook?.adapter?.kernel
              }
            />
          </>
        }
      />
    </div>
  );
};

export default NotebookToolbar;
