/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Context menu plugin for adding comments via right-click.
 * Shows a "Add Comment" option when text is selected.
 */

import React, { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection } from "lexical";
import { INSERT_INLINE_COMMAND } from "@datalayer/jupyter-lexical";

interface ContextMenuPosition {
  x: number;
  y: number;
}

export function ContextMenuPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null,
  );
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      // Check if we have a text selection
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          // We have a selection - show context menu
          event.preventDefault();
          setMenuPosition({ x: event.clientX, y: event.clientY });
          setHasSelection(true);
        } else {
          // No selection - use default browser context menu
          setMenuPosition(null);
          setHasSelection(false);
        }
      });
    };

    const handleClick = () => {
      // Close menu on any click
      setMenuPosition(null);
    };

    const editorElement = editor.getRootElement();
    if (editorElement) {
      editorElement.addEventListener("contextmenu", handleContextMenu);
      document.addEventListener("click", handleClick);

      return () => {
        editorElement.removeEventListener("contextmenu", handleContextMenu);
        document.removeEventListener("click", handleClick);
      };
    }

    return undefined;
  }, [editor]);

  const handleAddComment = () => {
    editor.dispatchCommand(INSERT_INLINE_COMMAND, undefined);
    setMenuPosition(null);
  };

  if (!menuPosition || !hasSelection) {
    return <></>;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: menuPosition.y,
        left: menuPosition.x,
        backgroundColor: "var(--vscode-menu-background)",
        border: "1px solid var(--vscode-menu-border)",
        borderRadius: "3px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        zIndex: 1000,
        minWidth: "150px",
      }}
    >
      <button
        onClick={handleAddComment}
        style={{
          width: "100%",
          padding: "8px 12px",
          backgroundColor: "transparent",
          border: "none",
          color: "var(--vscode-menu-foreground)",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            "var(--vscode-menu-selectionBackground)";
          e.currentTarget.style.color =
            "var(--vscode-menu-selectionForeground)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--vscode-menu-foreground)";
        }}
      >
        <i className="codicon codicon-comment-add" />
        Add Comment
      </button>
    </div>
  );
}
