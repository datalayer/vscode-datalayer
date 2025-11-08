/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Lexical plugin for handling navigation to outline items.
 * Scrolls to and positions cursor at the target heading or code block.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $setSelection,
  $createRangeSelection,
  $createPoint,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";

interface NavigationPluginProps {
  navigationTarget: string | null;
  onNavigated: () => void;
}

/**
 * Plugin that handles navigation to outline items.
 * Scrolls to the target node and positions cursor at the beginning of the line.
 */
export function NavigationPlugin({
  navigationTarget,
  onNavigated,
}: NavigationPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }

    // Parse the item ID to get the index
    // Format: "heading-X" or "jupyter-cell-X"
    const match = navigationTarget.match(/(heading|jupyter-cell)-(\d+)/);
    if (!match) {
      console.warn("[NavigationPlugin] Invalid item ID:", navigationTarget);
      onNavigated();
      return;
    }

    const itemIndex = parseInt(match[2], 10);

    editor.update(() => {
      const root = $getRoot();
      let currentIndex = 0;

      // Iterate through nodes to find the target
      for (const node of root.getChildren()) {
        let isTargetNode = false;
        const nodeType = node.getType();

        if ($isHeadingNode(node)) {
          if (currentIndex === itemIndex) {
            isTargetNode = true;
          }
          currentIndex++;
        } else if (nodeType === "jupyter-input") {
          if (currentIndex === itemIndex) {
            isTargetNode = true;
          }
          currentIndex++;
        }

        if (isTargetNode) {
          // Get the DOM element for the node
          const domElement = editor.getElementByKey(node.getKey());
          if (domElement) {
            // Scroll to the element
            domElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });

            // Set cursor at the beginning of the node
            setTimeout(() => {
              editor.update(() => {
                // Create a selection at the beginning of the node
                const selection = $createRangeSelection();
                const point = $createPoint(node.getKey(), 0, "element");
                selection.anchor = point;
                selection.focus = point;
                $setSelection(selection);

                // Focus the editor
                editor.focus();
              });
            }, 300); // Wait for scroll to complete
          }

          break;
        }
      }
    });

    // Clear the navigation target after processing
    onNavigated();
  }, [navigationTarget, editor, onNavigated]);

  return null;
}
