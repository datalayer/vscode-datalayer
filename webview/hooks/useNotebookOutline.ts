/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Hook for extracting and sending live notebook outline to extension.
 * Tracks markdown headings and code cells in real-time.
 *
 * @module notebook/hooks/useNotebookOutline
 */

import { useCallback, useEffect, useRef } from "react";

import type { OutlineItem, OutlineUpdateMessage } from "../types/messages";

// Use minimal type definitions to avoid JupyterLab peer dependency issues
// These types match the JupyterLab INotebookModel and ICellModel interfaces

/**
 * Signal interface providing connect and disconnect for change notifications.
 * @template T - Slot function signature for signal handlers.
 */
export interface SignalConnection<T extends (...args: never[]) => void> {
  /** Connects a slot function to the signal. */
  connect: (slot: T) => void;
  /** Disconnects a slot function from the signal. */
  disconnect: (slot: T) => void;
}

/** Minimal cell model interface matching JupyterLab ICellModel. */
export interface CellModel {
  /** Cell type identifier. */
  type: "code" | "markdown" | "raw";
  /** Shared model providing source access and change signals. */
  sharedModel: {
    /** Returns the cell source text. */
    getSource: () => string;
    /** Signal emitted when the cell content changes. */
    changed: SignalConnection<() => void>;
  };
}

/** Minimal notebook model interface matching JupyterLab INotebookModel. */
export interface NotebookModel {
  /** Cell list with indexed access and change notification. */
  cells: {
    /** Number of cells in the notebook. */
    length: number;
    /** Returns the cell model at the given index. */
    get: (index: number) => CellModel;
    /** Signal emitted when cells are added, removed, or reordered. */
    changed: SignalConnection<(list: unknown, change: unknown) => void>;
  };
  /** Shared model providing document-level change signals. */
  sharedModel: {
    /** Signal emitted when the shared model changes. */
    changed: SignalConnection<() => void>;
  };
}

/** VS Code API subset for posting outline messages to the extension host. */
export interface OutlineMessageSender {
  /** Sends an outline update message to the extension host. */
  postMessage: (message: OutlineUpdateMessage) => void;
}

/** Options for the useNotebookOutline hook controlling outline extraction and messaging. */
export interface UseNotebookOutlineOptions {
  /** Live notebook model to extract outline from. */
  notebookModel: NotebookModel | null;
  /** URI of the document for outline identification. */
  documentUri: string;
  /** VS Code API for posting outline messages. */
  vscode: OutlineMessageSender;
}

/** Return value from the useNotebookOutline hook. */
export interface UseNotebookOutlineResult {
  /** Triggers a manual refresh of the notebook outline sent to the extension host. */
  refreshOutline: () => void;
}

/**
 * Extracts and sends a live notebook outline to the extension, monitoring cell changes in real-time.
 * @param props - Hook configuration properties.
 * @param props.notebookModel - Live notebook model to extract outline from.
 * @param props.documentUri - URI of the document for outline identification.
 * @param props.vscode - VS Code API for posting outline messages.
 *
 * @returns The current outline items array.
 *
 */
export function useNotebookOutline({
  notebookModel,
  documentUri,
  vscode,
}: UseNotebookOutlineOptions): UseNotebookOutlineResult {
  const lastOutlineRef = useRef<string>("");
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Extract outline from live notebook model.
   * Builds a hierarchical tree based on heading levels.
   */
  const extractOutlineFromLiveModel = useCallback((): OutlineItem[] => {
    if (!notebookModel) {
      return [];
    }

    const flatItems: OutlineItem[] = [];
    const cells = notebookModel.cells;
    const cellCount = cells.length;

    // console.log("[useNotebookOutline] Iterating over cells", { cellCount });

    // First pass: extract all items with their levels
    for (let i = 0; i < cellCount; i++) {
      const cell: CellModel = notebookModel.cells.get(i);
      const cellType = cell.type;

      if (cellType === "code") {
        // Get live source from cell model
        const source = cell.sharedModel.getSource();
        const lines = source.split("\n");
        const preview =
          (lines[0]?.slice(0, 40) || "Empty").trim() +
          (lines[0]?.length > 40 ? "..." : "");

        flatItems.push({
          id: `cell-${i}`,
          label: preview,
          type: "code-cell",
          cellIndex: i,
          level: 999, // Code cells go under the last heading
        });
      } else if (cellType === "markdown") {
        // Get live markdown source
        const source = cell.sharedModel.getSource();

        // Extract headings from live markdown content
        const headings = extractHeadingsFromMarkdown(source, i);

        if (headings.length > 0) {
          flatItems.push(...headings);
        }
        // Skip markdown cells without headings - they're not useful in outline
      }
    }

    // Second pass: build hierarchical structure
    const tree = buildHierarchy(flatItems);

    return tree;
  }, [notebookModel]);

  /**
   * Build hierarchical tree from flat list of items.
   */
  const buildHierarchy = useCallback(
    (flatItems: OutlineItem[]): OutlineItem[] => {
      const root: OutlineItem[] = [];
      const stack: OutlineItem[] = [];

      for (const item of flatItems) {
        // Find the correct parent for this item
        while (stack.length > 0) {
          const parent = stack[stack.length - 1];
          const parentLevel = parent.level || 1;
          const itemLevel = item.level || 1;

          // If item is deeper than parent, it's a child
          if (itemLevel > parentLevel) {
            if (!parent.children) {
              parent.children = [];
            }
            parent.children.push(item);
            stack.push(item);
            break;
          } else {
            // Item is same level or higher, pop parent
            stack.pop();
          }
        }

        // If stack is empty, this is a root item
        if (stack.length === 0) {
          root.push(item);
          stack.push(item);
        }
      }

      return root;
    },
    [],
  );

  /**
   * Extract headings from markdown source.
   */
  const extractHeadingsFromMarkdown = useCallback(
    (source: string, cellIndex: number): OutlineItem[] => {
      const headings: OutlineItem[] = [];
      const lines = source.split("\n");

      lines.forEach((line, lineIdx) => {
        // Match markdown headings: # Title, ## Subtitle, etc.
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2].trim();

          headings.push({
            id: `cell-${cellIndex}-h${level}-${lineIdx}`,
            label: text,
            type: "heading",
            level,
            cellIndex,
            line: lineIdx,
          });
        }
      });

      return headings;
    },
    [],
  );

  /**
   * Send outline update to extension.
   */
  const sendOutlineUpdate = useCallback(() => {
    // Don't send if documentUri is empty
    if (!documentUri) {
      return;
    }

    const items = extractOutlineFromLiveModel();

    const outlineStr = JSON.stringify({ items });

    // Only send if changed (avoid unnecessary updates)
    if (outlineStr !== lastOutlineRef.current) {
      lastOutlineRef.current = outlineStr;

      const message: OutlineUpdateMessage = {
        type: "outline-update",
        documentUri,
        items,
      };

      vscode.postMessage(message);
    } else {
      // console.log("[useNotebookOutline] Outline unchanged, skipping send");
    }
  }, [extractOutlineFromLiveModel, documentUri, vscode]);

  // Use a ref to always access the latest sendOutlineUpdate
  const sendOutlineUpdateRef = useRef(sendOutlineUpdate);
  useEffect(() => {
    sendOutlineUpdateRef.current = sendOutlineUpdate;
  }, [sendOutlineUpdate]);

  /**
   * Set up listeners for notebook changes.
   */
  useEffect(() => {
    if (!notebookModel) {
      return;
    }

    // console.log("[useNotebookOutline] Attaching change listeners");

    // Send initial outline
    sendOutlineUpdateRef.current();

    // Debounced update function
    const debouncedUpdate = (): void => {
      // console.log("[useNotebookOutline] debouncedUpdate triggered");
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        sendOutlineUpdateRef.current();
      }, 150);
    };

    // Listen to cell list changes (add/remove/move cells)
    const cellsChangedSlot = (_list: unknown, change: unknown): void => {
      // When cells are added, attach listeners to them
      if (
        change &&
        typeof change === "object" &&
        "type" in change &&
        change.type === "add"
      ) {
        const changeTyped = change as { newValues?: CellModel[] };
        if (changeTyped.newValues) {
          changeTyped.newValues.forEach((cell) => {
            if (cell && cell.sharedModel && cell.sharedModel.changed) {
              cell.sharedModel.changed.connect(cellContentChangedSlot);
            }
          });
        }
      }

      debouncedUpdate();
    };
    notebookModel.cells.changed.connect(cellsChangedSlot);

    // Listen to changes in the notebook's shared model (this captures ALL cell content changes)
    const notebookChangedSlot = (): void => {
      // console.log("[useNotebookOutline] Notebook content changed");
      debouncedUpdate();
    };
    notebookModel.sharedModel.changed.connect(notebookChangedSlot);

    // Also listen to individual cell changes
    const cellContentChangedSlot = (): void => {
      // console.log("[useNotebookOutline] Cell content changed");
      debouncedUpdate();
    };

    // Listen to content changes on all cells
    const cells = notebookModel.cells;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell && cell.sharedModel && cell.sharedModel.changed) {
        cell.sharedModel.changed.connect(cellContentChangedSlot);
      }
    }

    return () => {
      // Cleanup timeout on unmount
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Disconnect signal listeners
      notebookModel.cells.changed.disconnect(cellsChangedSlot);
      notebookModel.sharedModel.changed.disconnect(notebookChangedSlot);

      // Disconnect individual cell listeners
      const cells = notebookModel.cells;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells.get(i);
        if (cell && cell.sharedModel && cell.sharedModel.changed) {
          cell.sharedModel.changed.disconnect(cellContentChangedSlot);
        }
      }
    };
  }, [notebookModel]); // Only notebookModel - sendOutlineUpdate accessed via ref

  /**
   * Send update when active cell changes
   */
  useEffect(() => {
    sendOutlineUpdate();
  }, [sendOutlineUpdate]);

  return {
    /** Triggers a manual refresh of the notebook outline sent to the extension host. */
    refreshOutline: sendOutlineUpdate,
  };
}
