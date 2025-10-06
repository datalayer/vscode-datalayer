/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module LexicalToolbar
 * Toolbar component for the Lexical editor with smart responsive overflow.
 * Shows as many buttons as fit, hides overflow in ... menu.
 */

import React, { useCallback, useEffect, useState, useContext } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isCodeNode } from "@lexical/code";
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from "lexical";
import { $isHeadingNode, $createHeadingNode } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  $isListNode,
} from "@lexical/list";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import { MessageHandlerContext } from "../services/messageHandler";
import {
  BaseToolbar,
  ToolbarButton,
  KernelSelector,
} from "../components/toolbar";
import type { ToolbarAction } from "../components/toolbar";

export interface LexicalToolbarProps {
  disabled?: boolean;
  selectedRuntime?: RuntimeJSON;
  showRuntimeSelector?: boolean;
  showCollaborativeLabel?: boolean;
}

export function LexicalToolbar({
  disabled = false,
  selectedRuntime,
  showRuntimeSelector = false,
  showCollaborativeLabel = false,
}: LexicalToolbarProps = {}) {
  const [editor] = useLexicalComposerContext();
  const messageHandler = useContext(MessageHandlerContext);

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockType, setBlockType] = useState("paragraph");

  // Add pulse animation styles for collaborative indicator
  React.useEffect(() => {
    if (showCollaborativeLabel) {
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
  }, [showCollaborativeLabel]);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else if ($isListNode(element)) {
        setBlockType(element.getListType());
      } else if ($isCodeNode(element)) {
        setBlockType("code");
      } else {
        setBlockType(element.getType());
      }
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  const formatBold = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  const formatItalic = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  const formatUnderline = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  const formatStrikethrough = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  const formatCode = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
  const undo = () => editor.dispatchCommand(UNDO_COMMAND, undefined);
  const redo = () => editor.dispatchCommand(REDO_COMMAND, undefined);

  const formatHeading = (headingTag: "h1" | "h2" | "h3") => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === "root"
            ? anchorNode
            : anchorNode.getTopLevelElementOrThrow();

        if ($isHeadingNode(element) && element.getTag() === headingTag) {
          element.replace(
            $createHeadingNode("h1").replace($createHeadingNode("h1")),
            true,
          );
        } else {
          const heading = $createHeadingNode(headingTag);
          element.replace(heading, true);
        }
      }
    });
  };

  const insertBulletList = () =>
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  const insertNumberedList = () =>
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);

  const handleSelectRuntime = () => {
    if (messageHandler) {
      messageHandler.send({
        type: "select-runtime",
        body: { isDatalayerNotebook: true },
      });
    }
  };

  // Define all toolbar actions
  const actions: ToolbarAction[] = [
    {
      id: "undo",
      icon: "codicon codicon-discard",
      label: "Undo",
      onClick: undo,
      disabled: !canUndo,
      priority: 1,
    },
    {
      id: "redo",
      icon: "codicon codicon-redo",
      label: "Redo",
      onClick: redo,
      disabled: !canRedo,
      priority: 2,
    },
    {
      id: "bold",
      icon: "codicon codicon-bold",
      label: "Bold",
      onClick: formatBold,
      active: isBold,
      priority: 3,
    },
    {
      id: "italic",
      icon: "codicon codicon-italic",
      label: "Italic",
      onClick: formatItalic,
      active: isItalic,
      priority: 4,
    },
    {
      id: "underline",
      label: "U",
      title: "Underline",
      onClick: formatUnderline,
      active: isUnderline,
      priority: 5,
    },
    {
      id: "strikethrough",
      label: "S",
      title: "Strikethrough",
      onClick: formatStrikethrough,
      active: isStrikethrough,
      priority: 6,
    },
    {
      id: "code",
      icon: "codicon codicon-code",
      label: "Code",
      onClick: formatCode,
      active: isCode,
      priority: 7,
    },
    {
      id: "h1",
      label: "H1",
      title: "Heading 1",
      onClick: () => formatHeading("h1"),
      active: blockType === "h1",
      priority: 8,
    },
    {
      id: "h2",
      label: "H2",
      title: "Heading 2",
      onClick: () => formatHeading("h2"),
      active: blockType === "h2",
      priority: 9,
    },
    {
      id: "h3",
      label: "H3",
      title: "Heading 3",
      onClick: () => formatHeading("h3"),
      active: blockType === "h3",
      priority: 10,
    },
    {
      id: "bullet",
      icon: "codicon codicon-list-unordered",
      label: "Bullet List",
      onClick: insertBulletList,
      active: blockType === "bullet",
      priority: 11,
    },
    {
      id: "numbered",
      icon: "codicon codicon-list-ordered",
      label: "Numbered List",
      onClick: insertNumberedList,
      active: blockType === "number",
      priority: 12,
    },
    {
      id: "quote",
      icon: "codicon codicon-quote",
      label: "Quote",
      onClick: formatCode,
      priority: 13,
    },
    {
      id: "link",
      icon: "codicon codicon-link",
      label: "Insert Link",
      onClick: formatCode,
      priority: 14,
    },
  ];

  // Calculate reserved right width
  const reservedForCollaborative = showCollaborativeLabel ? 180 : 0;
  const reservedForKernel = showRuntimeSelector ? 200 : 0;
  const reservedRightWidth = reservedForKernel + reservedForCollaborative;

  return (
    <BaseToolbar
      actions={actions}
      renderAction={(action) => (
        <ToolbarButton
          icon={action.icon}
          label={!action.icon ? action.label : undefined}
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title || action.label}
          style={{
            backgroundColor: action.active
              ? "var(--vscode-button-background)"
              : "transparent",
            color: action.active
              ? "var(--vscode-button-foreground)"
              : "inherit",
          }}
        />
      )}
      estimatedButtonWidth={35}
      reservedRightWidth={reservedRightWidth}
      disabled={disabled}
      rightContent={
        <>
          {showCollaborativeLabel && (
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
          {showRuntimeSelector && (
            <KernelSelector
              selectedRuntime={selectedRuntime}
              onClick={handleSelectRuntime}
              disabled={disabled}
            />
          )}
        </>
      }
    />
  );
}
