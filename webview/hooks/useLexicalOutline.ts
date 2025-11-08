/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

import { useEffect, useRef, useCallback } from "react";
import { LexicalEditor, $getRoot } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { OutlineItem, OutlineUpdateMessage } from "../types/messages";

interface UseLexicalOutlineProps {
  editor: LexicalEditor | null;
  documentUri: string;
  vscode: { postMessage: (message: OutlineUpdateMessage) => void };
}

/**
 * Hook to extract and send outline data from a Lexical editor.
 * Monitors the editor state and extracts headings and code blocks.
 */
export function useLexicalOutline({
  editor,
  documentUri,
  vscode,
}: UseLexicalOutlineProps): void {
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastOutlineRef = useRef<string>("");

  /**
   * Extract outline from current editor state.
   */
  const extractOutlineFromEditor = useCallback((): OutlineItem[] => {
    if (!editor) {
      return [];
    }

    const flatItems: OutlineItem[] = [];

    editor.getEditorState().read(() => {
      const root = $getRoot();

      let itemIndex = 0;
      let lastHeadingLevel = 0; // Track the level of the last heading seen

      root.getChildren().forEach((node) => {
        let item: OutlineItem | null = null;

        // Get node type for checking
        const nodeType = node.getType();

        // Check for headings
        if ($isHeadingNode(node)) {
          const tag = node.getTag(); // h1, h2, h3, etc.
          const level = parseInt(tag.substring(1)); // Extract number from "h1" -> 1
          const text = node.getTextContent().trim();

          if (text) {
            item = {
              id: `heading-${itemIndex}`,
              label: text.length > 50 ? text.substring(0, 47) + "..." : text,
              type: tag as "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
              level,
              line: itemIndex,
            };
            lastHeadingLevel = level; // Update last heading level
          }
        }
        // Check for Jupyter input cells (executable code cells)
        else if (nodeType === "jupyter-input") {
          // Get the input content from the Jupyter cell's children
          const inputContent = node.getTextContent().trim();
          const firstLine = inputContent.split("\n")[0] || "";
          const preview =
            firstLine.length > 40
              ? firstLine.substring(0, 37) + "..."
              : firstLine;

          // Nest under the last heading by using a level one deeper than it
          // If no heading seen yet, use level 999 to appear at root
          const cellLevel = lastHeadingLevel > 0 ? lastHeadingLevel + 1 : 999;

          item = {
            id: `jupyter-cell-${itemIndex}`,
            label: preview || "(empty jupyter cell)",
            type: "code-cell",
            level: cellLevel,
            line: itemIndex,
          };
        }

        if (item) {
          flatItems.push(item);
          itemIndex++;
        }
      });
    });

    // Build hierarchical structure from flat items
    const hierarchicalItems = buildHierarchy(flatItems);

    return hierarchicalItems;
  }, [editor]);

  /**
   * Build hierarchical tree from flat list of items.
   * Same algorithm as used in notebook outline.
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
   * Send outline update to extension.
   * Debounced and deduplicated to avoid unnecessary updates.
   */
  const sendOutlineUpdate = useCallback(() => {
    // Don't send outline if documentUri is not set (during initialization or reset)
    if (!documentUri) {
      return;
    }

    const items = extractOutlineFromEditor();

    // Deduplicate: only send if outline actually changed OR documentUri changed
    const outlineSignature = JSON.stringify({
      items: items.map((i: OutlineItem) => ({
        id: i.id,
        label: i.label,
        type: i.type,
      })),
      documentUri, // Include documentUri in signature to detect document switches
    });

    if (outlineSignature === lastOutlineRef.current) {
      return;
    }

    lastOutlineRef.current = outlineSignature;

    vscode.postMessage({
      type: "outline-update",
      documentUri,
      items,
    });
  }, [extractOutlineFromEditor, documentUri, vscode]);

  /**
   * Clear last outline ref and immediately send update when documentUri changes.
   */
  useEffect(() => {
    // When documentUri changes, clear the last outline signature
    // and immediately send an update for the new document
    lastOutlineRef.current = "";
    sendOutlineUpdate();
  }, [documentUri, sendOutlineUpdate]);

  /**
   * Set up editor listener for content and selection changes.
   */
  useEffect(() => {
    if (!editor) {
      return;
    }

    // Send initial outline
    sendOutlineUpdate();

    // Listen to all editor updates (content changes, selection changes, etc.)
    const removeUpdateListener = editor.registerUpdateListener(() => {
      // Debounce updates to avoid spam during rapid typing
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(sendOutlineUpdate, 200);
    });

    return () => {
      // Cleanup
      removeUpdateListener();
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [editor, sendOutlineUpdate]);
}
