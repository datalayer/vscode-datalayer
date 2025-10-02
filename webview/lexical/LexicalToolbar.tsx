/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module LexicalToolbar
 * Toolbar component for the Lexical editor providing formatting controls.
 * Includes buttons for text formatting, headings, lists, and alignment options.
 * Automatically syncs with the current editor selection state.
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
  FORMAT_ELEMENT_COMMAND,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $createHeadingNode } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { $isListNode } from "@lexical/list";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import { MessageHandlerContext } from "../services/messageHandler";

/**
 * Properties for individual toolbar buttons.
 *
 * @interface ToolbarButtonProps
 * @property {() => void} onClick - Click handler for the button
 * @property {boolean} [isActive=false] - Whether the button represents an active format
 * @property {boolean} [disabled=false] - Whether the button is disabled
 * @property {string} title - Tooltip text for the button
 * @property {React.ReactNode} children - Button content (icon or text)
 */
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

/**
 * Individual toolbar button component with VS Code theme integration.
 * Provides visual feedback for active and hover states.
 *
 * @hidden
 * @function ToolbarButton
 * @param {ToolbarButtonProps} props - Button properties
 * @returns {React.ReactElement} Styled button element
 */
function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "4px 8px",
        margin: "0 2px",
        backgroundColor: isActive
          ? "var(--vscode-button-background)"
          : "transparent",
        color: isActive
          ? "var(--vscode-button-foreground)"
          : "var(--vscode-editor-foreground)",
        border: "1px solid",
        borderColor: isActive
          ? "var(--vscode-button-border, var(--vscode-button-background))"
          : "transparent",
        borderRadius: "3px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: "14px",
        fontFamily: "var(--vscode-editor-font-family)",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isActive) {
          (e.target as HTMLButtonElement).style.backgroundColor =
            "var(--vscode-toolbar-hoverBackground)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !isActive) {
          (e.target as HTMLButtonElement).style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

/**
 * Visual divider component for separating toolbar button groups.
 *
 * @hidden
 * @function Divider
 * @returns {React.ReactElement} Vertical line divider
 */
function Divider() {
  return (
    <span
      style={{
        width: "1px",
        height: "20px",
        backgroundColor: "var(--vscode-panel-border)",
        margin: "0 4px",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}

/**
 * Properties for the LexicalToolbar component.
 *
 * @interface LexicalToolbarProps
 * @property {boolean} [disabled=false] - Whether all toolbar buttons should be disabled
 * @property {RuntimeJSON} [selectedRuntime] - Selected runtime information for Datalayer documents
 * @property {boolean} [showRuntimeSelector=false] - Whether to show the runtime selector button
 * @hidden
 */
export interface LexicalToolbarProps {
  disabled?: boolean;
  selectedRuntime?: RuntimeJSON;
  showRuntimeSelector?: boolean;
}

/**
 * Main toolbar component for the Lexical editor.
 * Provides a comprehensive set of formatting controls including text formatting,
 * headings, lists, and alignment options. Automatically syncs with the current
 * editor selection to show active formats.
 *
 * @function LexicalToolbar
 * @param {LexicalToolbarProps} props - Toolbar properties
 * @returns {React.ReactElement} The rendered toolbar with all formatting controls
 *
 * @example
 * ```tsx
 * <LexicalComposer initialConfig={editorConfig}>
 *   <LexicalToolbar disabled={false} />
 *   <RichTextPlugin ... />
 * </LexicalComposer>
 * ```
 */
export function LexicalToolbar({
  disabled = false,
  selectedRuntime,
  showRuntimeSelector = false,
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
  const [selectedKernel, setSelectedKernel] = useState<string>("Select Kernel");
  const [kernelStatus, setKernelStatus] = useState<string>("disconnected");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      // Update block type
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        const tag = element.getTag();
        setBlockType(tag);
      } else if ($isListNode(element)) {
        const listType = element.getListType();
        setBlockType(listType);
      } else if ($isCodeNode(element)) {
        setBlockType("code");
      } else {
        const type = element.getType();
        setBlockType(type);
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

  const formatBold = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  };

  const formatItalic = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  };

  const formatUnderline = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  };

  const formatStrikethrough = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  };

  const formatCode = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
  };

  const undo = () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  };

  const redo = () => {
    editor.dispatchCommand(REDO_COMMAND, undefined);
  };

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
          // If already this heading type, convert to paragraph
          element.replace(
            $createHeadingNode("h1").replace($createHeadingNode("h1")),
            true,
          );
        } else {
          // Convert to heading
          const heading = $createHeadingNode(headingTag);
          element.replace(heading, true);
        }
      }
    });
  };

  const insertBulletList = () => {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  };

  const insertNumberedList = () => {
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  };

  const formatAlignLeft = () => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
  };

  const formatAlignCenter = () => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center");
  };

  const formatAlignRight = () => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
  };

  // Update kernel display based on selected runtime
  useEffect(() => {
    if (selectedRuntime) {
      const runtimeName =
        selectedRuntime.givenName ||
        selectedRuntime.environmentTitle ||
        selectedRuntime.environmentName ||
        selectedRuntime.uid ||
        "Runtime";
      setSelectedKernel(`Datalayer: ${runtimeName}`);
      setKernelStatus("idle");
    } else {
      setSelectedKernel("Select Kernel");
      setKernelStatus("disconnected");
    }
  }, [selectedRuntime]);

  const handleSelectRuntime = () => {
    if (messageHandler) {
      messageHandler.send({
        type: "select-runtime",
        body: {
          isDatalayerNotebook: true,
        },
      });
    }
  };

  const handleTerminateRuntime = () => {
    if (messageHandler && selectedRuntime) {
      messageHandler.send({
        type: "terminate-runtime",
        body: {
          runtime: selectedRuntime,
        },
      });
    }
  };

  const getKernelStatusIcon = () => {
    if (kernelStatus === "connecting") {
      return "codicon-loading codicon-modifier-spin";
    }
    return "codicon-server-environment";
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px",
        backgroundColor: "var(--vscode-editor-background)",
        gap: "4px",
        opacity: disabled ? 0.5 : 1,
        width: "100%",
      }}
    >
      <ToolbarButton
        onClick={undo}
        disabled={disabled || !canUndo}
        title="Undo (Cmd/Ctrl+Z)"
      >
        <span className="codicon codicon-discard" />
      </ToolbarButton>
      <ToolbarButton
        onClick={redo}
        disabled={disabled || !canRedo}
        title="Redo (Cmd/Ctrl+Shift+Z)"
      >
        <span className="codicon codicon-redo" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={formatBold}
        isActive={isBold}
        disabled={disabled}
        title="Bold (Cmd/Ctrl+B)"
      >
        <span className="codicon codicon-bold" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatItalic}
        isActive={isItalic}
        disabled={disabled}
        title="Italic (Cmd/Ctrl+I)"
      >
        <span className="codicon codicon-italic" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatUnderline}
        isActive={isUnderline}
        disabled={disabled}
        title="Underline (Cmd/Ctrl+U)"
      >
        <span className="codicon codicon-symbol-color" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatStrikethrough}
        isActive={isStrikethrough}
        disabled={disabled}
        title="Strikethrough"
      >
        <span className="codicon codicon-text-strikethrough" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatCode}
        isActive={isCode}
        disabled={disabled}
        title="Inline Code"
      >
        <span className="codicon codicon-code" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => formatHeading("h1")}
        isActive={blockType === "h1"}
        disabled={disabled}
        title="Heading 1"
      >
        <span className="codicon codicon-symbol-text" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => formatHeading("h2")}
        isActive={blockType === "h2"}
        disabled={disabled}
        title="Heading 2"
      >
        <span className="codicon codicon-symbol-string" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => formatHeading("h3")}
        isActive={blockType === "h3"}
        disabled={disabled}
        title="Heading 3"
      >
        <span className="codicon codicon-symbol-keyword" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={insertBulletList}
        isActive={blockType === "bullet"}
        disabled={disabled}
        title="Bullet List"
      >
        <span className="codicon codicon-list-unordered" />
      </ToolbarButton>
      <ToolbarButton
        onClick={insertNumberedList}
        isActive={blockType === "number"}
        disabled={disabled}
        title="Numbered List"
      >
        <span className="codicon codicon-list-ordered" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={formatAlignLeft}
        disabled={disabled}
        title="Align Left"
      >
        <span className="codicon codicon-arrow-small-left" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatAlignCenter}
        disabled={disabled}
        title="Align Center"
      >
        <span className="codicon codicon-chrome-minimize" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatAlignRight}
        disabled={disabled}
        title="Align Right"
      >
        <span className="codicon codicon-arrow-small-right" />
      </ToolbarButton>

      {/* Runtime selector - shown on the right side if enabled */}
      {showRuntimeSelector && (
        <>
          <div style={{ flex: 1 }} />

          {/* Terminate Runtime button - only show when runtime is connected */}
          {selectedRuntime &&
            selectedKernel !== "Select Kernel" &&
            selectedKernel.startsWith("Datalayer:") && (
              <>
                <button
                  onClick={handleTerminateRuntime}
                  disabled={disabled}
                  title="Terminate Runtime"
                  style={{
                    padding: "4px",
                    margin: "0 2px",
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    borderRadius: "3px",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 0.8,
                    fontSize: "14px",
                    fontFamily: "var(--vscode-editor-font-family)",
                    color: "var(--vscode-foreground)",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled) {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "var(--vscode-toolbar-hoverBackground)";
                      (e.target as HTMLButtonElement).style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled) {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "transparent";
                      (e.target as HTMLButtonElement).style.opacity = "0.8";
                    }
                  }}
                >
                  <span
                    className="codicon codicon-x"
                    style={{ fontSize: "16px" }}
                  />
                </button>
                <Divider />
              </>
            )}

          <button
            onClick={
              kernelStatus === "disconnected" ? handleSelectRuntime : undefined
            }
            disabled={disabled}
            title={
              kernelStatus === "disconnected"
                ? "Select Datalayer Runtime"
                : `Connected to ${selectedKernel}`
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              margin: "0 8px 0 2px",
              backgroundColor: "transparent",
              border: "1px solid transparent",
              borderRadius: "3px",
              cursor:
                kernelStatus === "disconnected" && !disabled
                  ? "pointer"
                  : "default",
              opacity: disabled ? 0.5 : 1,
              fontSize: "13px",
              fontFamily: "var(--vscode-editor-font-family)",
              color: "var(--vscode-foreground)",
              minWidth: "140px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!disabled && kernelStatus === "disconnected") {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  "var(--vscode-toolbar-hoverBackground)";
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  "transparent";
              }
            }}
          >
            <span
              className={`codicon ${getKernelStatusIcon()}`}
              style={{
                fontSize: "16px",
                minWidth: "16px",
              }}
            />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedKernel}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
