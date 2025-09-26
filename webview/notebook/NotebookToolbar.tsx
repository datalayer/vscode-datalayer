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
import useNotebookStore from "@datalayer/jupyter-react/lib/components/notebook/NotebookState";
import { MessageHandlerContext } from "../services/messageHandler";
import { NotebookActions } from "@jupyterlab/notebook";

/** Runtime information for Datalayer notebooks */
interface RuntimeInfo {
  uid: string;
  name: string;
  status?: string;
  url?: string;
  token?: string;
  environment?: string;
  creditsUsed?: number;
  creditsLimit?: number;
}

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
  selectedRuntime?: RuntimeInfo;
}

/**
 * Toolbar component for Jupyter notebook operations
 */
export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebookId,
  isDatalayerNotebook = false,
  selectedRuntime,
}) => {
  const notebookStore = useNotebookStore();
  const [notebook, setNotebook] = useState<any>(null);
  const [notebookWidget, setNotebookWidget] = useState<any>(null);
  const messageHandler = useContext(MessageHandlerContext);
  const [selectedKernel, setSelectedKernel] = useState<string>("No Kernel");
  const [kernelStatus, setKernelStatus] = useState<string>("disconnected");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  // Attempt to find notebook widget through various approaches
  useEffect(() => {
    let attemptCount = 0;
    const maxAttempts = 20; // 2 seconds max

    const findNotebookWidget = () => {
      attemptCount++;

      // Try multiple approaches to find the notebook
      const approaches = [
        // 1. Look for Lumino NotebookPanel widget by ID
        () => {
          const container = document.getElementById(notebookId);
          if (container) {
            const notebookPanel = container.querySelector(".jp-NotebookPanel");
            if (notebookPanel && (notebookPanel as any).lumino_widget) {
              return (notebookPanel as any).lumino_widget;
            }
          }
          return null;
        },

        // 2. Look for any NotebookPanel in DOM
        () => {
          const notebookPanels = document.querySelectorAll(".jp-NotebookPanel");
          for (const panel of notebookPanels) {
            if ((panel as any).lumino_widget) {
              return (panel as any).lumino_widget;
            }
          }
          return null;
        },

        // 3. Check global window for notebook references
        () => {
          const debugNotebook = (window as any).debugNotebook;
          if (debugNotebook) {
            return debugNotebook;
          }
          return null;
        },

        // 4. Look for notebook widget through different DOM patterns
        () => {
          const notebook = document.querySelector(".jp-Notebook");
          if (notebook && (notebook as any).lumino_widget) {
            return (notebook as any).lumino_widget;
          }
          // Try parent element
          if (
            notebook &&
            notebook.parentElement &&
            (notebook.parentElement as any).lumino_widget
          ) {
            return (notebook.parentElement as any).lumino_widget;
          }
          return null;
        },

        // 5. Try notebook store as fallback
        () => {
          const storeNotebook = notebookStore.selectNotebook(notebookId);
          return storeNotebook;
        },
      ];

      for (const approach of approaches) {
        const result = approach();
        if (
          result &&
          result !== null &&
          result !== undefined &&
          !Array.isArray(result)
        ) {
          setNotebookWidget(result);
          setNotebook(result);
          return;
        }
      }

      if (attemptCount < maxAttempts) {
        setTimeout(findNotebookWidget, 100);
      }
    };

    findNotebookWidget();
  }, [notebookId, notebookStore]);

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
        ".jp-Notebook, .jp-WindowedPanel, #notebook-editor"
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
        ".jp-Notebook, .jp-WindowedPanel"
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
    // For Datalayer notebooks, always show the runtime name
    if (isDatalayerNotebook && selectedRuntime) {
      // Format as "Datalayer: Runtime Name"
      const runtimeName = selectedRuntime.name || "Select Runtime";
      const displayName = `Datalayer: ${runtimeName}`;
      setSelectedKernel(displayName);

      // Check if we have an active kernel connection to determine status
      if (notebook?.adapter?.kernel?.connection) {
        const kernelConnection = notebook.adapter.kernel.connection;
        setKernelStatus(kernelConnection.status || "idle");
        setIsConnecting(false);
      } else if (selectedRuntime.status === "connecting") {
        setKernelStatus("connecting");
        setIsConnecting(true);
      } else {
        setKernelStatus(selectedRuntime.status || "disconnected");
        setIsConnecting(false);
      }
    } else if (!isDatalayerNotebook && notebook?.adapter?.kernel?.connection) {
      // For local notebooks, show kernel info
      const kernelConnection = notebook.adapter.kernel.connection;
      const displayName = kernelConnection.name || "Unknown Kernel";
      setSelectedKernel(displayName);
      setKernelStatus(kernelConnection.status || "idle");
      setIsConnecting(false);
    } else {
      // Show "No Kernel" when nothing is selected
      setSelectedKernel(isDatalayerNotebook ? "Select Runtime" : "No Kernel");
      setKernelStatus("disconnected");
      setIsConnecting(false);
    }
  }, [notebook, isDatalayerNotebook, selectedRuntime]);

  const handleRunAll = () => {
    try {
      // Use the widget we found directly
      const widget = notebookWidget?.content || notebookWidget;
      const sessionContext =
        notebookWidget?.sessionContext ||
        notebookWidget?.context?.sessionContext;

      if (widget && sessionContext) {
        NotebookActions.runAll(widget, sessionContext);
      } else {
        // Fallback to the store method
        notebookStore.runAll(notebookId);
      }
    } catch (error) {
      console.error("[NotebookToolbar] Error running all cells:", error);
    }
  };

  const handleAddCodeCell = () => {
    // Try to find widget one more time if we don't have it
    if (!notebookWidget) {
      const container = document.getElementById(notebookId);
      const notebookPanel = container?.querySelector(".jp-NotebookPanel");
      if (notebookPanel && (notebookPanel as any).lumino_widget) {
        const immediateWidget = (notebookPanel as any).lumino_widget;
        setNotebookWidget(immediateWidget);
      }
    }

    try {
      // Use the widget we found directly
      const widget = notebookWidget?.content || notebookWidget;

      if (widget) {
        NotebookActions.insertBelow(widget);
        NotebookActions.changeCellType(widget, "code");
      } else {
        // Fallback to store method
        notebookStore.insertBelow({
          notebookId: notebookId,
          cellType: "code",
          activeCellId: null,
        });
      }
    } catch (error) {
      console.error("[NotebookToolbar] Error adding code cell:", error);
    }
  };

  const handleAddMarkdownCell = () => {
    try {
      // Use the widget we found directly
      const widget = notebookWidget?.content || notebookWidget;

      if (widget) {
        NotebookActions.insertBelow(widget);
        NotebookActions.changeCellType(widget, "markdown");
      } else {
        // Fallback to store method
        notebookStore.insertBelow({
          id: notebookId,
          cellType: "markdown" as any,
          source: "",
        });
      }
    } catch (error) {
      console.error("[NotebookToolbar] Error adding markdown cell:", error);
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
    switch (kernelStatus) {
      case "idle":
        return "codicon-circle-filled";
      case "busy":
        return "codicon-loading codicon-modifier-spin";
      case "disconnected":
        return "codicon-circle-slash";
      case "connecting":
        return "codicon-loading codicon-modifier-spin";
      default:
        return "codicon-circle-outline";
    }
  };

  const getKernelStatusColor = () => {
    if (isConnecting) {
      return "var(--vscode-terminal-ansiYellow)";
    }
    switch (kernelStatus) {
      case "idle":
        return "var(--vscode-terminal-ansiGreen)";
      case "busy":
        return "var(--vscode-terminal-ansiYellow)";
      case "disconnected":
        return "var(--vscode-errorForeground)";
      case "connecting":
        return "var(--vscode-terminal-ansiYellow)";
      default:
        return "var(--vscode-foreground)";
    }
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
            style={{ fontSize: "14px" }}
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
            style={{ fontSize: "14px" }}
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
              fontSize: "11px",
              color: getKernelStatusColor(),
              minWidth: "12px",
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
