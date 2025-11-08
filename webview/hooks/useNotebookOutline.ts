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

import { useEffect, useRef, useCallback } from "react";
import type { INotebookModel } from "@jupyterlab/notebook";
import type { ICellModel } from "@jupyterlab/cells";
import type { OutlineItem, OutlineUpdateMessage } from "../types/messages";

interface UseNotebookOutlineOptions {
  notebookModel: INotebookModel | null;
  documentUri: string;
  vscode: { postMessage: (message: OutlineUpdateMessage) => void };
}

/**
 * Custom hook to extract and send notebook outline to the extension.
 * Monitors live changes to cells and sends real-time updates.
 */
export function useNotebookOutline({
  notebookModel,
  documentUri,
  vscode,
}: UseNotebookOutlineOptions) {
  const lastOutlineRef = useRef<string>("");
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Extract outline from live notebook model.
   * Builds a hierarchical tree based on heading levels.
   */
  const extractOutlineFromLiveModel = useCallback((): OutlineItem[] => {
    console.log("[useNotebookOutline] extractOutlineFromLiveModel called", {
      hasModel: !!notebookModel,
      modelType: notebookModel ? notebookModel.constructor?.name : "null",
      hasCells: notebookModel?.cells ? true : false,
      cellCount: notebookModel?.cells?.length,
    });

    if (!notebookModel) {
      console.warn(
        "[useNotebookOutline] No notebookModel, returning empty array",
      );
      return [];
    }

    const flatItems: OutlineItem[] = [];
    const cells = notebookModel.cells;
    const cellCount = cells.length;

    console.log("[useNotebookOutline] Iterating over cells", { cellCount });

    // First pass: extract all items with their levels
    for (let i = 0; i < cellCount; i++) {
      const cell: ICellModel = notebookModel.cells.get(i);
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

    console.log("[useNotebookOutline] Extraction complete", {
      itemCount: tree.length,
      items: tree.slice(0, 3).map((i) => ({
        id: i.id,
        label: i.label,
        type: i.type,
        childCount: i.children?.length || 0,
      })),
    });

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
    console.log("[useNotebookOutline] sendOutlineUpdate called", {
      hasModel: !!notebookModel,
      documentUri,
    });

    // Don't send if documentUri is empty
    if (!documentUri) {
      console.log("[useNotebookOutline] No documentUri, skipping send");
      return;
    }

    const items = extractOutlineFromLiveModel();

    console.log("[useNotebookOutline] Extracted outline", {
      itemCount: items.length,
      items: items
        .slice(0, 5)
        .map((i) => ({ id: i.id, label: i.label, type: i.type })),
    });

    const outlineStr = JSON.stringify({ items });

    // Only send if changed (avoid unnecessary updates)
    if (outlineStr !== lastOutlineRef.current) {
      lastOutlineRef.current = outlineStr;

      const message: OutlineUpdateMessage = {
        type: "outline-update",
        documentUri,
        items,
      };

      console.log(
        "[useNotebookOutline] Sending outline-update message to extension",
        message,
      );
      vscode.postMessage(message);
    } else {
      console.log("[useNotebookOutline] Outline unchanged, skipping send");
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
    console.log("[useNotebookOutline] useEffect - setting up listeners", {
      hasModel: !!notebookModel,
      documentUri,
      modelType: notebookModel ? typeof notebookModel : "null",
    });

    if (!notebookModel) {
      console.warn("[useNotebookOutline] No notebookModel available");
      return;
    }

    console.log("[useNotebookOutline] Attaching change listeners");

    // Send initial outline
    sendOutlineUpdateRef.current();

    // Debounced update function
    const debouncedUpdate = () => {
      console.log("[useNotebookOutline] debouncedUpdate triggered");
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        console.log(
          "[useNotebookOutline] Timeout fired, calling sendOutlineUpdate",
        );
        sendOutlineUpdateRef.current();
      }, 150);
    };

    // Listen to cell list changes (add/remove/move cells)
    const cellsChangedSlot = (_list: unknown, change: unknown) => {
      console.log("[useNotebookOutline] Cells changed (add/remove/move)", {
        change,
      });

      // When cells are added, attach listeners to them
      if (
        change &&
        typeof change === "object" &&
        "type" in change &&
        change.type === "add"
      ) {
        const changeTyped = change as { newValues?: ICellModel[] };
        if (changeTyped.newValues) {
          changeTyped.newValues.forEach((cell) => {
            if (cell && cell.sharedModel && cell.sharedModel.changed) {
              console.log(
                "[useNotebookOutline] Attaching listener to new cell",
              );
              cell.sharedModel.changed.connect(cellContentChangedSlot);
            }
          });
        }
      }

      debouncedUpdate();
    };
    notebookModel.cells.changed.connect(cellsChangedSlot);

    // Listen to changes in the notebook's shared model (this captures ALL cell content changes)
    const notebookChangedSlot = () => {
      console.log("[useNotebookOutline] Notebook content changed");
      debouncedUpdate();
    };
    notebookModel.sharedModel.changed.connect(notebookChangedSlot);

    // Also listen to individual cell changes
    const cellContentChangedSlot = () => {
      console.log("[useNotebookOutline] Cell content changed");
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
    refreshOutline: sendOutlineUpdate,
  };
}
