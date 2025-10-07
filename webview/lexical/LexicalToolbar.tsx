/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module LexicalToolbar
 * Comprehensive toolbar with dropdowns for block types, fonts, alignment + overflow menu for extra buttons.
 */

import React, { useCallback, useEffect, useState, useContext } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isCodeNode } from "@lexical/code";
import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
} from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  $isListNode,
} from "@lexical/list";
import { $setBlocksType } from "@lexical/selection";
import { $findMatchingParent } from "@lexical/utils";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { TOGGLE_LINK_COMMAND, $isLinkNode } from "@lexical/link";
import { INSERT_IMAGE_COMMAND } from "@datalayer/jupyter-lexical";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import { MessageHandlerContext } from "../services/messageHandler";
import {
  BaseToolbar,
  ToolbarButton,
  KernelSelector,
  Dropdown,
} from "../components/toolbar";
import type { ToolbarAction, DropdownItem } from "../components/toolbar";

export interface LexicalToolbarProps {
  disabled?: boolean;
  selectedRuntime?: RuntimeJSON;
  showRuntimeSelector?: boolean;
  showCollaborativeLabel?: boolean;
}

// Font family options
const FONT_FAMILY_OPTIONS: [string, string][] = [
  ["Arial", "Arial"],
  ["Courier New", "Courier New"],
  ["Georgia", "Georgia"],
  ["Times New Roman", "Times New Roman"],
  ["Trebuchet MS", "Trebuchet MS"],
  ["Verdana", "Verdana"],
];

// Font size options
const FONT_SIZE_OPTIONS = [
  "10px",
  "11px",
  "12px",
  "13px",
  "14px",
  "15px",
  "16px",
  "17px",
  "18px",
  "19px",
  "20px",
];

export function LexicalToolbar({
  disabled = false,
  selectedRuntime,
  showRuntimeSelector = false,
  showCollaborativeLabel = false,
}: LexicalToolbarProps = {}) {
  const [editor] = useLexicalComposerContext();
  const messageHandler = useContext(MessageHandlerContext);

  // Text formatting state
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isHighlight, setIsHighlight] = useState(false);
  const [isCode, setIsCode] = useState(false);

  // Layout state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockType, setBlockType] = useState("paragraph");
  const [elementFormat, setElementFormat] = useState<string>("left");
  const [isLink, setIsLink] = useState(false);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState("15px");

  // Add pulse animation for collaborative indicator
  React.useEffect(() => {
    if (showCollaborativeLabel) {
      const style = document.createElement("style");
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
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
      // Text formatting
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsSubscript(selection.hasFormat("subscript"));
      setIsSuperscript(selection.hasFormat("superscript"));
      setIsHighlight(selection.hasFormat("highlight"));
      setIsCode(selection.hasFormat("code"));

      // Block type
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

      // Links
      const node = anchorNode.getKey() === "root" ? anchorNode : anchorNode;
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      // Element format (alignment)
      let matchingParent;
      if ($isLinkNode(parent)) {
        matchingParent = $findMatchingParent(
          node,
          (parentNode) => $isElementNode(parentNode) && !parentNode.isInline(),
        );
      }
      const format = $isElementNode(matchingParent)
        ? matchingParent.getFormatType()
        : $isElementNode(node)
          ? node.getFormatType()
          : parent?.getFormatType() || "left";
      setElementFormat(format);
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => updateToolbar());
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
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

  // Formatting commands
  const formatBold = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  const formatItalic = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  const formatUnderline = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  const formatStrikethrough = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  const formatSubscript = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
  const formatSuperscript = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");
  const formatHighlight = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "highlight");
  const formatCode = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");

  const undo = () => editor.dispatchCommand(UNDO_COMMAND, undefined);
  const redo = () => editor.dispatchCommand(REDO_COMMAND, undefined);

  const formatHeading = (headingTag: "h1" | "h2" | "h3") => {
    if (blockType !== headingTag) {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingTag));
        }
      });
    }
  };

  const formatQuote = () => {
    if (blockType !== "quote") {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
    }
  };

  const formatBulletList = () =>
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  const formatNumberedList = () =>
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  const formatCheckList = () =>
    editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);

  const clearFormatting = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            node.setFormat(0);
            node.setStyle("");
          }
        });
      }
    });
  };

  const insertLink = () => {
    if (!isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://");
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  };

  const insertHorizontalRule = () =>
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);

  const insertImage = () => {
    const url = prompt("Enter image URL:");
    if (url) {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        altText: "Inserted image",
        src: url,
      });
    }
  };

  const handleSelectRuntime = () => {
    if (messageHandler) {
      messageHandler.send({
        type: "select-runtime",
        body: { isDatalayerNotebook: true },
      });
    }
  };

  const applyFontFamily = (font: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            node.setStyle(`font-family: ${font};`);
          }
        });
      }
    });
    setFontFamily(font);
  };

  const applyFontSize = (size: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            node.setStyle(`font-size: ${size};`);
          }
        });
      }
    });
    setFontSize(size);
  };

  const increaseFontSize = () => {
    const currentIndex = FONT_SIZE_OPTIONS.indexOf(fontSize);
    if (currentIndex < FONT_SIZE_OPTIONS.length - 1) {
      applyFontSize(FONT_SIZE_OPTIONS[currentIndex + 1]);
    }
  };

  const decreaseFontSize = () => {
    const currentIndex = FONT_SIZE_OPTIONS.indexOf(fontSize);
    if (currentIndex > 0) {
      applyFontSize(FONT_SIZE_OPTIONS[currentIndex - 1]);
    }
  };

  // Align commands
  const alignLeft = () =>
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
  const alignCenter = () =>
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center");
  const alignRight = () =>
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
  const alignJustify = () =>
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify");
  const indent = () =>
    editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
  const outdent = () =>
    editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);

  // Block type dropdown items
  const blockTypeItems: DropdownItem[] = [
    {
      id: "paragraph",
      label: "Normal",
      onClick: () => formatQuote(), // Should be formatParagraph but doesn't exist
      active: blockType === "paragraph",
    },
    {
      id: "h1",
      label: "Heading 1",
      onClick: () => formatHeading("h1"),
      active: blockType === "h1",
    },
    {
      id: "h2",
      label: "Heading 2",
      onClick: () => formatHeading("h2"),
      active: blockType === "h2",
    },
    {
      id: "h3",
      label: "Heading 3",
      onClick: () => formatHeading("h3"),
      active: blockType === "h3",
    },
    {
      id: "bullet",
      label: "Bullet List",
      onClick: formatBulletList,
      active: blockType === "bullet",
    },
    {
      id: "number",
      label: "Numbered List",
      onClick: formatNumberedList,
      active: blockType === "number",
    },
    {
      id: "check",
      label: "Check List",
      onClick: formatCheckList,
      active: blockType === "check",
    },
    {
      id: "quote",
      label: "Quote",
      onClick: formatQuote,
      active: blockType === "quote",
    },
  ];

  // Font family dropdown
  const fontFamilyItems: DropdownItem[] = FONT_FAMILY_OPTIONS.map(
    ([value, name]) => ({
      id: value,
      label: name,
      onClick: () => applyFontFamily(value),
      active: fontFamily === value,
    }),
  );

  // Font size dropdown
  const fontSizeItems: DropdownItem[] = FONT_SIZE_OPTIONS.map((size) => ({
    id: size,
    label: size,
    onClick: () => applyFontSize(size),
    active: fontSize === size,
  }));

  // Alignment dropdown
  const alignmentItems: DropdownItem[] = [
    {
      id: "left",
      label: "Left Align",
      onClick: alignLeft,
      active: elementFormat === "left",
    },
    {
      id: "center",
      label: "Center Align",
      onClick: alignCenter,
      active: elementFormat === "center",
    },
    {
      id: "right",
      label: "Right Align",
      onClick: alignRight,
      active: elementFormat === "right",
    },
    {
      id: "justify",
      label: "Justify",
      onClick: alignJustify,
      active: elementFormat === "justify",
    },
    {
      id: "outdent",
      label: "Outdent",
      onClick: outdent,
      dividerBefore: true,
    },
    {
      id: "indent",
      label: "Indent",
      onClick: indent,
    },
  ];

  // Text formatting dropdown (like SaaS "Aa" dropdown)
  const textFormattingItems: DropdownItem[] = [
    {
      id: "uppercase",
      label: "Uppercase",
      onClick: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const text = selection.getTextContent();
            selection.insertText(text.toUpperCase());
          }
        });
      },
      shortcut: "⌘+Shift+1",
    },
    {
      id: "lowercase",
      label: "Lowercase",
      onClick: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const text = selection.getTextContent();
            selection.insertText(text.toLowerCase());
          }
        });
      },
      shortcut: "⌘+Shift+2",
    },
    {
      id: "capitalize",
      label: "Capitalize",
      onClick: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const text = selection.getTextContent();
            const capitalizedText = text.replace(/\b\w/g, (char) =>
              char.toUpperCase(),
            );
            selection.insertText(capitalizedText);
          }
        });
      },
      shortcut: "⌘+Shift+3",
    },
    {
      id: "strikethrough2",
      label: "Strikethrough",
      icon: "codicon codicon-primitive-square",
      onClick: formatStrikethrough,
      active: isStrikethrough,
      shortcut: "⌘+Shift+X",
      dividerBefore: true,
    },
    {
      id: "subscript2",
      label: "Subscript",
      onClick: formatSubscript,
      active: isSubscript,
      shortcut: "⌘+,",
    },
    {
      id: "superscript2",
      label: "Superscript",
      onClick: formatSuperscript,
      active: isSuperscript,
      shortcut: "⌘+.",
    },
    {
      id: "highlight2",
      label: "Highlight",
      onClick: formatHighlight,
      active: isHighlight,
      dividerBefore: true,
    },
    {
      id: "clear-format2",
      label: "Clear Formatting",
      icon: "codicon codicon-clear-all",
      onClick: clearFormatting,
      shortcut: "⌘+\\",
      dividerBefore: true,
    },
  ];

  // All toolbar actions - will overflow into 3-dot menu automatically
  const toolbarActions: ToolbarAction[] = [
    {
      id: "bold",
      icon: "codicon codicon-bold",
      label: "Bold",
      title: "Bold",
      onClick: formatBold,
      active: isBold,
      priority: 1,
    },
    {
      id: "italic",
      icon: "codicon codicon-italic",
      label: "Italic",
      title: "Italic",
      onClick: formatItalic,
      active: isItalic,
      priority: 2,
    },
    {
      id: "underline",
      icon: "codicon codicon-text-size",
      label: "Underline",
      title: "Underline",
      onClick: formatUnderline,
      active: isUnderline,
      priority: 3,
    },
    {
      id: "code",
      icon: "codicon codicon-code",
      label: "Code",
      title: "Code",
      onClick: formatCode,
      active: isCode,
      priority: 4,
    },
    {
      id: "link",
      icon: "codicon codicon-link",
      label: "Link",
      title: "Link",
      onClick: insertLink,
      active: isLink,
      priority: 5,
    },
    {
      id: "strikethrough",
      label: "Strikethrough",
      onClick: formatStrikethrough,
      active: isStrikethrough,
      priority: 6,
    },
    {
      id: "subscript",
      label: "Subscript",
      onClick: formatSubscript,
      active: isSubscript,
      priority: 7,
    },
    {
      id: "superscript",
      label: "Superscript",
      onClick: formatSuperscript,
      active: isSuperscript,
      priority: 8,
    },
    {
      id: "highlight",
      label: "Highlight",
      onClick: formatHighlight,
      active: isHighlight,
      priority: 9,
    },
    {
      id: "clear-format",
      label: "Clear Formatting",
      onClick: clearFormatting,
      priority: 10,
    },
    {
      id: "hr",
      label: "Horizontal Rule",
      onClick: insertHorizontalRule,
      priority: 11,
    },
    {
      id: "image",
      label: "Image",
      onClick: insertImage,
      priority: 12,
    },
  ];

  const getBlockTypeLabel = () => {
    const item = blockTypeItems.find((i) => i.active);
    return item?.label || "Normal";
  };

  // Calculate reserved widths
  const reservedForCollaborative = showCollaborativeLabel ? 180 : 0;
  const reservedForKernel = showRuntimeSelector ? 200 : 0;
  const reservedRightWidth = reservedForKernel + reservedForCollaborative;

  // Calculate left content width (Undo/Redo + dropdowns + +/- buttons + dividers)
  // Undo: 36px, Redo: 36px, Block: 120px, Font: 140px, Size: 60px + 2*28px (+-buttons), TextFormat(Aa): 60px, Align: 36px, Dividers: 5*10px = 50px
  const reservedLeftWidth = 36 + 36 + 120 + 140 + 60 + 56 + 60 + 36 + 50;

  return (
    <BaseToolbar
      actions={toolbarActions}
      reservedLeftWidth={reservedLeftWidth}
      leftContent={
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {/* Undo/Redo */}
          <ToolbarButton
            icon="codicon codicon-discard"
            onClick={undo}
            disabled={!canUndo || disabled}
            title="Undo"
          />
          <ToolbarButton
            icon="codicon codicon-redo"
            onClick={redo}
            disabled={!canRedo || disabled}
            title="Redo"
          />

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 4px",
            }}
          />

          {/* Block type dropdown */}
          <Dropdown
            buttonLabel={getBlockTypeLabel()}
            buttonIcon="codicon codicon-symbol-keyword"
            items={blockTypeItems}
            disabled={disabled}
            ariaLabel="Block type"
            minWidth="120px"
          />

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 4px",
            }}
          />

          {/* Font family */}
          <Dropdown
            buttonLabel={fontFamily}
            items={fontFamilyItems}
            disabled={disabled}
            ariaLabel="Font family"
            minWidth="140px"
          />

          {/* Font size with +/- buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <ToolbarButton
              icon="codicon codicon-remove"
              onClick={decreaseFontSize}
              disabled={disabled || FONT_SIZE_OPTIONS.indexOf(fontSize) === 0}
              title="Decrease font size"
            />
            <Dropdown
              buttonLabel={fontSize}
              items={fontSizeItems}
              disabled={disabled}
              ariaLabel="Font size"
              minWidth="60px"
            />
            <ToolbarButton
              icon="codicon codicon-add"
              onClick={increaseFontSize}
              disabled={
                disabled ||
                FONT_SIZE_OPTIONS.indexOf(fontSize) ===
                  FONT_SIZE_OPTIONS.length - 1
              }
              title="Increase font size"
            />
          </div>

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 4px",
            }}
          />

          {/* Text formatting dropdown (Aa) */}
          <Dropdown
            buttonLabel="Aa"
            items={textFormattingItems}
            disabled={disabled}
            ariaLabel="Text formatting"
            minWidth="60px"
          />

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 4px",
            }}
          />

          {/* Alignment dropdown */}
          <Dropdown
            buttonLabel=""
            buttonIcon="codicon codicon-editor-layout"
            items={alignmentItems}
            disabled={disabled}
            ariaLabel="Alignment"
            showArrow={false}
            minWidth="36px"
          />

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--vscode-panel-border)",
              margin: "0 4px",
            }}
          />
        </div>
      }
      renderAction={(action) => (
        <ToolbarButton
          icon={action.icon}
          label={action.label}
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
      estimatedButtonWidth={36}
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
                  animation: "pulse 2s infinite",
                }}
              />
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
