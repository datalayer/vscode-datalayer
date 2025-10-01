/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module NotebookToolbar
 * VS Code-style toolbar for the Jupyter notebook
 */

import React, { useState, useEffect, useContext } from "react";
import { notebookStore2 } from "@datalayer/jupyter-react";
import { NotebookActions } from "@jupyterlab/notebook";
import { MessageHandlerContext } from "../services/messageHandler";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";

/**
 * Props for the NotebookToolbar component
 * @hidden
 */
interface NotebookToolbarProps {
  /** ID of the notebook */
  notebookId: string;
  /** Whether this is a Datalayer cloud notebook */
  isDatalayerNotebook?: boolean;
  /** Selected runtime information for Datalayer notebooks */
  selectedRuntime?: RuntimeJSON;
}

/**
 * Toolbar component for Jupyter notebook operations
 */
export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebookId,
  isDatalayerNotebook = false,
  selectedRuntime,
}) => {
  const messageHandler = useContext(MessageHandlerContext);
  const [selectedKernel, setSelectedKernel] = useState<string>("No Kernel");
  const [kernelStatus, setKernelStatus] = useState<string>("disconnected");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [notebook, setNotebook] = useState<any>(null);

  // Monitor notebook state from notebookStore2
  useEffect(() => {
    if (!notebookId) return;

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
  }, [isDatalayerNotebook]);

  // Add scroll detection for shadow effect
  React.useEffect(() => {
    let scrollListener: any = null;
    let observer: MutationObserver | null = null;

    const setupScrollDetection = () => {
      const handleScroll = () => {
        // Check if toolbar is not at top of viewport
        const toolbar = document.querySelector("[data-notebook-toolbar]");
        if (toolbar) {
          const rect = toolbar.getBoundingClientRect();
          // If toolbar is pinned to top (due to sticky) but page is scrolled
          const pageScrolled =
            window.pageYOffset > 10 || document.documentElement.scrollTop > 10;
          const toolbarAtTop = rect.top <= 5;

          // Show shadow when scrolled and toolbar is stuck at top
          setIsScrolled(pageScrolled && toolbarAtTop);
        }
      };

      // Listen to multiple scroll events
      scrollListener = () => {
        requestAnimationFrame(handleScroll);
      };

      // Add listeners to window and document
      window.addEventListener("scroll", scrollListener, true);
      document.addEventListener("scroll", scrollListener, true);

      // Try to find notebook container and add listener
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

      // Initial check
      handleScroll();
    };

    // Use MutationObserver to wait for notebook to be ready
    observer = new MutationObserver(() => {
      const notebook = document.querySelector(
        ".jp-Notebook, .jp-WindowedPanel",
      );
      if (notebook) {
        setupScrollDetection();
        observer?.disconnect();
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also set up immediately in case notebook is already loaded
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
    // Check if we have a selected runtime (works for both Datalayer and local notebooks)
    if (selectedRuntime) {
      // Show "Datalayer: {Runtime name}" to clearly indicate it's a Datalayer runtime
      // Use givenName first, then fallback to environmentTitle, then environmentName, then UID
      const runtimeName =
        selectedRuntime.givenName ||
        selectedRuntime.environmentTitle ||
        selectedRuntime.environmentName ||
        selectedRuntime.uid ||
        "Runtime";

      setSelectedKernel(`Datalayer: ${runtimeName}`);

      // Check if we have an active kernel connection to determine status
      if (notebook?.adapter?.kernel?.connection) {
        const kernelConnection = notebook.adapter.kernel.connection;
        setKernelStatus(kernelConnection.status || "idle");
        setIsConnecting(false);
      } else {
        // Runtime is selected, so show it as idle/ready
        setKernelStatus("idle");
        setIsConnecting(false);
      }
    } else if (notebook?.adapter?.kernel?.connection) {
      // Fallback: No selectedRuntime but we have a kernel connection
      const kernelConnection = notebook.adapter.kernel.connection;
      const displayName = kernelConnection.name || "Python";
      setSelectedKernel(displayName);
      setKernelStatus(kernelConnection.status || "idle");
      setIsConnecting(false);
    } else {
      // Show "Select Kernel" when nothing is selected, matching native VS Code
      setSelectedKernel("Select Kernel");
      setKernelStatus("disconnected");
      setIsConnecting(false);
    }
  }, [notebook, isDatalayerNotebook, selectedRuntime]);

  const handleRunAll = (e: React.MouseEvent) => {
    e.preventDefault();
    if (notebookId) {
      notebookStore2.getState().runAll(notebookId);
    }
  };

  const handleAddCodeCell = (e: React.MouseEvent) => {
    e.preventDefault();
    if (notebookId && notebook?.adapter?.panel?.content) {
      // Use NotebookActions to insert a code cell below
      NotebookActions.insertBelow(notebook.adapter.panel.content);
      NotebookActions.changeCellType(notebook.adapter.panel.content, "code");
    }
  };

  const handleAddMarkdownCell = (e: React.MouseEvent) => {
    e.preventDefault();
    if (notebookId && notebook?.adapter?.panel?.content) {
      // Use NotebookActions to insert a markdown cell below
      NotebookActions.insertBelow(notebook.adapter.panel.content);
      NotebookActions.changeCellType(notebook.adapter.panel.content, "markdown");
    }
  };

  const handleSelectRuntime = () => {
    if (messageHandler) {
      // Send message to extension to show runtime selection dialog
      messageHandler.postMessage({
        type: "select-runtime",
        body: {
          isDatalayerNotebook: isDatalayerNotebook,
        },
      });
    }
  };

  const getKernelStatusIcon = () => {
    if (isConnecting) {
      return "codicon-loading codicon-modifier-spin";
    }
    // Use server icon to match native VS Code notebook
    switch (kernelStatus) {
      case "idle":
      case "busy":
        return "codicon-server-environment"; // Connected kernel icon
      case "disconnected":
        return "codicon-server-environment"; // Same icon but will show "Select Kernel"
      case "connecting":
        return "codicon-loading codicon-modifier-spin";
      default:
        return "codicon-server-environment";
    }
  };

  const getKernelStatusColor = () => {
    // Match native VS Code notebook - icon color is always foreground
    return "var(--vscode-foreground)";
  };

  return (
    <div
      data-notebook-toolbar="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "2px 8px",
        backgroundColor: "var(--vscode-editor-background)",
        fontSize: "var(--vscode-font-size)",
        fontFamily: "var(--vscode-font-family)",
        minHeight: "32px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        // Add shadow only when scrolled, no border
        boxShadow: isScrolled
          ? "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)"
          : "none",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Left side actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        {/* Add Code Cell button */}
        <button
          onClick={handleAddCodeCell}
          title="Add Code Cell"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "3px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "var(--vscode-font-size)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--vscode-toolbar-hoverBackground)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <span
            className="codicon codicon-add"
            style={{ fontSize: "16px" }}
          ></span>
          <span>Code</span>
        </button>

        {/* Add Markdown Cell button */}
        <button
          onClick={handleAddMarkdownCell}
          title="Add Markdown Cell"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "3px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "var(--vscode-font-size)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--vscode-toolbar-hoverBackground)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <span
            className="codicon codicon-add"
            style={{ fontSize: "16px" }}
          ></span>
          <span>Markdown</span>
        </button>

        {/* Divider */}
        <div
          style={{
            width: "1px",
            height: "20px",
            backgroundColor: "var(--vscode-widget-border)",
            margin: "0 4px",
          }}
        />

        {/* Run All button */}
        <button
          onClick={handleRunAll}
          title="Run All Cells"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "3px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "var(--vscode-font-size)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--vscode-toolbar-hoverBackground)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <span
            className="codicon codicon-run-all"
            style={{ fontSize: "16px" }}
          ></span>
          <span>Run All</span>
        </button>
      </div>

      {/* Right side - Kernel selector and collaborative indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

        {/* Terminate Runtime button - only show for Datalayer runtimes */}
        {selectedRuntime &&
          selectedKernel !== "Select Kernel" &&
          selectedKernel.startsWith("Datalayer:") && (
            <button
              onClick={() => {
                if (messageHandler) {
                  messageHandler.postMessage({
                    type: "terminate-runtime",
                    body: {
                      runtime: selectedRuntime,
                    },
                  });
                }
              }}
              title="Terminate Runtime"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--vscode-foreground)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                fontSize: "var(--vscode-font-size)",
                opacity: 0.8,
                transition: "opacity 0.1s ease, background-color 0.1s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--vscode-toolbar-hoverBackground)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.opacity = "0.8";
              }}
            >
              <span
                className="codicon codicon-x"
                style={{ fontSize: "16px" }}
              ></span>
            </button>
          )}

        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "2px 6px",
            borderRadius: "3px",
            backgroundColor: "transparent",
            border: "none",
            cursor:
              kernelStatus === "disconnected" || !notebook?.adapter?.kernel
                ? "pointer"
                : "default",
            color: "var(--vscode-foreground)",
            fontSize: "var(--vscode-font-size)",
            fontFamily: "var(--vscode-font-family)",
            minWidth: "120px",
            transition: "background-color 0.1s ease",
          }}
          onClick={
            kernelStatus === "disconnected" || !notebook?.adapter?.kernel
              ? handleSelectRuntime
              : undefined
          }
          title={
            notebook?.adapter?.kernel
              ? `Connected to ${selectedKernel}`
              : isDatalayerNotebook
                ? "Select Datalayer Runtime"
                : "Select Kernel"
          }
          onMouseEnter={(e) => {
            if (kernelStatus === "disconnected" || !notebook?.adapter?.kernel) {
              e.currentTarget.style.backgroundColor =
                "var(--vscode-toolbar-hoverBackground)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span
            className={`codicon ${getKernelStatusIcon()}`}
            style={{
              fontSize: "16px",
              color: getKernelStatusColor(),
              minWidth: "16px",
            }}
          />
          <span
            style={{
              flex: 1,
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedKernel}
          </span>
          {/* Never show chevron - this is not a dropdown */}
        </button>
      </div>
    </div>
  );
};

export default NotebookToolbar;
