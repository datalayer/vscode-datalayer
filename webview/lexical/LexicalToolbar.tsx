/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Lexical editor toolbar component.
 * Provides rich text formatting controls including styles, fonts, colors, and alignment.
 *
 * @module LexicalToolbar
 */

import React, { useCallback, useEffect, useState, useContext } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isCodeNode } from "@lexical/code";
import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  $createParagraphNode,
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
  LexicalNode,
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
import {
  INSERT_YOUTUBE_COMMAND,
  INSERT_JUPYTER_INPUT_OUTPUT_COMMAND,
  RUN_JUPYTER_CELL_COMMAND,
  RUN_ALL_JUPYTER_CELLS_COMMAND,
  RESTART_JUPYTER_KERNEL_COMMAND,
  CLEAR_ALL_OUTPUTS_COMMAND,
  InsertImageDialog,
  InsertEquationDialog,
  useModal,
  $isJupyterInputNode,
  $isJupyterInputHighlightNode,
} from "@datalayer/jupyter-lexical";
import { useJupyter } from "@datalayer/jupyter-react";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import { MessageHandlerContext } from "../services/messageHandler";
import {
  BaseToolbar,
  ToolbarButton,
  KernelSelector,
  Dropdown,
} from "../components/toolbar";
import type { ToolbarAction, DropdownItem } from "../components/toolbar";
import { InsertYouTubeDialog, InsertLinkDialog } from "../components/dialogs";

/**
 * Props for the LexicalToolbar component.
 */
export interface LexicalToolbarProps {
  /** Whether toolbar controls are disabled */
  disabled?: boolean;
  /** Currently selected runtime for kernel operations */
  selectedRuntime?: RuntimeJSON;
  /** Whether to show the runtime selector dropdown */
  showRuntimeSelector?: boolean;
  /** Whether to show the collaborative editing indicator */
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

// Font size options (8pt to 72pt, common sizes)
const FONT_SIZE_OPTIONS = [
  "8pt",
  "10pt",
  "12pt",
  "14pt",
  "16pt",
  "18pt",
  "24pt",
  "36pt",
  "72pt",
];

// Default colors for color pickers
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_HIGHLIGHT_COLOR = "#FFFF00";

/**
 * Convert any CSS color format to hex format.
 * Required because native color inputs only accept hex values.
 *
 * @param color - CSS color in any format (rgb, rgba, hex, named)
 * @returns Hex color string (e.g., "#ff0000")
 */
function colorToHex(color: string): string {
  // Already hex format
  if (color.startsWith("#")) {
    return color;
  }

  // Create a temporary element to let the browser convert the color
  const temp = document.createElement("div");
  temp.style.color = color;
  document.body.appendChild(temp);
  const computedColor = getComputedStyle(temp).color;
  document.body.removeChild(temp);

  // Parse rgb/rgba format
  const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  // Fallback to black if conversion fails
  return DEFAULT_TEXT_COLOR;
}

/**
 * Updates a specific CSS property in a style string while preserving others.
 * Ensures all style operations are additive, not replacing.
 *
 * @param currentStyle - Current style string from node.getStyle()
 * @param property - CSS property to update (e.g., "font-family", "color")
 * @param value - New value for the property
 * @returns Updated style string with all properties preserved
 *
 * @example
 * ```typescript
 * const style = "color: red; font-size: 12pt;";
 * const updated = updateStyleProperty(style, "font-family", "Arial");
 * // Result: "color: red; font-size: 12pt; font-family: Arial;"
 * ```
 */
function updateStyleProperty(
  currentStyle: string,
  property: string,
  value: string,
): string {
  // Escape special regex characters in property name for safety
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Remove existing property while preserving others
  const withoutProperty = currentStyle
    .replace(new RegExp(`${escapedProperty}:\\s*[^;]+;?\\s*`, "gi"), "")
    .replace(/;\s*;/g, ";") // Clean up double semicolons
    .replace(/^\s*;|;\s*$/g, "") // Clean up leading/trailing semicolons
    .trim();

  // Add new property value
  return withoutProperty
    ? `${withoutProperty}; ${property}: ${value};`
    : `${property}: ${value};`;
}

/**
 * Checks if a text node is inside a Jupyter input/output code block.
 * Font changes should not apply to code inside Jupyter cells.
 *
 * @param node - The text node to check
 * @returns True if the node is inside a Jupyter code block
 */
function $isInsideJupyterCode(node: LexicalNode): boolean {
  let parent = node.getParent();
  while (parent) {
    // Check if parent is a JupyterInputNode or JupyterInputHighlightNode
    if ($isJupyterInputNode(parent) || $isJupyterInputHighlightNode(parent)) {
      return true;
    }
    parent = parent.getParent();
  }
  return false;
}

/**
 * Rich text editing toolbar for Lexical editor.
 * Provides formatting controls, style dropdowns, color pickers, and alignment tools.
 * Integrates with Jupyter kernels for code execution.
 *
 * @param props - Component properties
 * @returns Toolbar component
 *
 * @example
 * ```tsx
 * <LexicalToolbar
 *   disabled={false}
 *   selectedRuntime={runtime}
 *   showRuntimeSelector={true}
 * />
 * ```
 */
export function LexicalToolbar({
  disabled = false,
  selectedRuntime,
  showRuntimeSelector = false,
  showCollaborativeLabel = false,
}: LexicalToolbarProps = {}) {
  const [editor] = useLexicalComposerContext();
  const messageHandler = useContext(MessageHandlerContext);
  const [modal, showModal] = useModal();
  const { defaultKernel } = useJupyter();

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
  const [fontSize, setFontSize] = useState("12pt");
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);

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

      // Extract current text color, highlight color, and font size from selection
      if ($isTextNode(anchorNode)) {
        const style = anchorNode.getStyle();

        // Extract text color
        const colorMatch = style.match(/color:\s*([^;]+)/);
        if (colorMatch) {
          const color = colorMatch[1].trim();
          setTextColor(colorToHex(color));
        } else {
          // No explicit color set, use theme default
          const themeColor = getComputedStyle(document.documentElement)
            .getPropertyValue("--vscode-editor-foreground")
            .trim();
          setTextColor(
            themeColor ? colorToHex(themeColor) : DEFAULT_TEXT_COLOR,
          );
        }

        // Extract highlight/background color
        const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
        if (bgColorMatch) {
          const bgColor = bgColorMatch[1].trim();
          setHighlightColor(colorToHex(bgColor));
        } else {
          // No explicit background color, use default
          setHighlightColor(DEFAULT_HIGHLIGHT_COLOR);
        }

        // Extract font size
        const fontSizeMatch = style.match(/font-size:\s*([^;]+)/);
        if (fontSizeMatch) {
          const size = fontSizeMatch[1].trim();
          // Normalize to "pt" format if needed
          const normalizedSize = size.endsWith("pt") ? size : `${size}pt`;
          setFontSize(normalizedSize);
        } else {
          // No explicit font size, use default
          setFontSize("12pt");
        }

        // Extract font family
        const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/);
        if (fontFamilyMatch) {
          const family = fontFamilyMatch[1].trim();
          // Remove quotes if present
          const cleanFamily = family.replace(/['"]/g, "");
          setFontFamily(cleanFamily);
        } else {
          // No explicit font family, use default
          setFontFamily("Arial");
        }
      } else {
        // Not a text node, reset to defaults
        const themeColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--vscode-editor-foreground")
          .trim();
        setTextColor(themeColor ? colorToHex(themeColor) : DEFAULT_TEXT_COLOR);
        setHighlightColor(DEFAULT_HIGHLIGHT_COLOR);
        setFontSize("12pt");
        setFontFamily("Arial");
      }
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

  const formatParagraph = () => {
    if (blockType !== "paragraph") {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode());
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
    if (isLink) {
      // Remove existing link
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      // Get selected text
      let selectedText = "";
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selectedText = selection.getTextContent();
        }
      });

      // Show link dialog
      showModal("Insert Link", (onClose) => (
        <InsertLinkDialog
          initialText={selectedText}
          initialUrl="https://"
          onInsert={(url, text) => {
            // Insert the link text at the selection
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(text);
              }
            });

            // Apply the link
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          }}
          onClose={onClose}
        />
      ));
    }
  };

  const insertHorizontalRule = () =>
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);

  const insertImage = () => {
    showModal("Insert Image", (onClose) => (
      <InsertImageDialog activeEditor={editor} onClose={onClose} />
    ));
  };

  const insertGif = () => {
    showModal("Insert GIF", (onClose) => (
      <InsertImageDialog activeEditor={editor} onClose={onClose} />
    ));
  };

  const insertYouTube = () => {
    showModal("Insert YouTube Video", (onClose) => (
      <InsertYouTubeDialog
        onInsert={(videoId) => {
          editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, videoId);
        }}
        onClose={onClose}
      />
    ));
  };

  const insertEquation = () => {
    showModal("Insert Equation", (onClose) => (
      <InsertEquationDialog activeEditor={editor} onClose={onClose} />
    ));
  };

  const insertJupyterCell = () => {
    editor.dispatchCommand(INSERT_JUPYTER_INPUT_OUTPUT_COMMAND, {
      code: "print('Hello Jupyter')",
      outputs: [],
      loading: "Loading...",
    });
  };

  const handleSelectRuntime = () => {
    if (messageHandler) {
      messageHandler.send({
        type: "select-runtime",
        body: { isDatalayerNotebook: true },
      });
    }
  };

  const handleRunCell = useCallback(() => {
    editor.dispatchCommand(RUN_JUPYTER_CELL_COMMAND, undefined);
  }, [editor]);

  const handleRunAll = useCallback(() => {
    editor.dispatchCommand(RUN_ALL_JUPYTER_CELLS_COMMAND, undefined);
  }, [editor]);

  const handleRestartKernel = useCallback(() => {
    editor.dispatchCommand(RESTART_JUPYTER_KERNEL_COMMAND, undefined);
  }, [editor]);

  const handleClearAllOutputs = useCallback(() => {
    editor.dispatchCommand(CLEAR_ALL_OUTPUTS_COMMAND, undefined);
  }, [editor]);

  const applyFontFamily = (font: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            // Skip font changes for nodes inside Jupyter input/output code blocks
            if ($isInsideJupyterCode(node)) {
              return;
            }
            const currentStyle = node.getStyle();
            const newStyle = updateStyleProperty(
              currentStyle,
              "font-family",
              font,
            );
            node.setStyle(newStyle);
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
            // Skip font size changes for nodes inside Jupyter input/output code blocks
            if ($isInsideJupyterCode(node)) {
              return;
            }
            const currentStyle = node.getStyle();
            const newStyle = updateStyleProperty(
              currentStyle,
              "font-size",
              size,
            );
            node.setStyle(newStyle);
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

  // Apply text color from color picker
  // Apply text color
  const applyTextColor = (color: string) => {
    setTextColor(color);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            const currentStyle = node.getStyle();
            const newStyle = updateStyleProperty(currentStyle, "color", color);
            node.setStyle(newStyle);
          }
        });
      }
    });
  };

  const applyHighlightColor = (color: string) => {
    setHighlightColor(color);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.getNodes().forEach((node) => {
          if ($isTextNode(node)) {
            const currentStyle = node.getStyle();
            const newStyle = updateStyleProperty(
              currentStyle,
              "background-color",
              color,
            );
            node.setStyle(newStyle);
          }
        });
      }
    });
  };

  // Block type dropdown items
  const blockTypeItems: DropdownItem[] = [
    {
      id: "paragraph",
      label: "Normal",
      onClick: formatParagraph,
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
    label: size.replace("pt", ""),
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

  // Insert menu dropdown items
  const insertMenuItems: DropdownItem[] = [
    {
      id: "insert-jupyter-cell",
      label: "Jupyter Cell",
      onClick: insertJupyterCell,
    },
    {
      id: "insert-equation",
      label: "Equation",
      onClick: insertEquation,
    },
    {
      id: "insert-hr",
      label: "Horizontal Rule",
      onClick: insertHorizontalRule,
      dividerBefore: true,
    },
    {
      id: "insert-image",
      label: "Image",
      onClick: insertImage,
    },
    {
      id: "insert-gif",
      label: "GIF",
      onClick: insertGif,
    },
    {
      id: "insert-youtube",
      label: "YouTube Video",
      onClick: insertYouTube,
    },
    // TODO: Add more insert options when available:
    // Page Break, Excalidraw, Table, Poll, Columns Layout,
    // Sticky Note, Collapsible container, Date, Tweet, Figma
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
    },
    {
      id: "strikethrough2",
      label: "Strikethrough",
      onClick: formatStrikethrough,
      active: isStrikethrough,
      dividerBefore: true,
    },
    {
      id: "subscript2",
      label: "Subscript",
      onClick: formatSubscript,
      active: isSubscript,
    },
    {
      id: "superscript2",
      label: "Superscript",
      onClick: formatSuperscript,
      active: isSuperscript,
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
      onClick: clearFormatting,
      dividerBefore: true,
    },
  ];

  // Toolbar actions for kernel commands (Run Cell, Run All, Clear All Outputs, Restart Kernel)
  // These will appear in the right section and collapse to overflow menu when space is limited
  const hasKernel = !!defaultKernel;
  const hasKernelSession = !!defaultKernel?.session;

  const toolbarActions: ToolbarAction[] = [
    {
      id: "runCell",
      icon: "codicon codicon-play",
      label: "Run Cell",
      title: "Run Current Cell (Shift+Enter)",
      onClick: handleRunCell,
      priority: 1,
      disabled: !hasKernel,
    },
    {
      id: "runAll",
      icon: "codicon codicon-run-all",
      label: "Run All",
      title: "Run All Cells",
      onClick: handleRunAll,
      priority: 2,
      disabled: !hasKernel,
    },
    {
      id: "clearAllOutputs",
      icon: "codicon codicon-clear-all",
      label: "Clear All Outputs",
      title: "Clear All Cell Outputs",
      onClick: handleClearAllOutputs,
      priority: 4,
      disabled: !hasKernel,
    },
    {
      id: "restartKernel",
      icon: "codicon codicon-debug-restart",
      label: "Restart",
      title: "Restart Kernel",
      onClick: handleRestartKernel,
      priority: 5,
      disabled: !hasKernelSession,
    },
  ];

  const getBlockTypeLabel = () => {
    const item = blockTypeItems.find((i) => i.active);
    return item?.label || "Normal";
  };

  // Reserved width for right content (kernel selector + collaborative label)
  // Use conservative estimates to ensure action buttons hide BEFORE overlapping
  // KernelSelector: ~140-200px (varies with runtime name length) - using 200px
  // Collaborative label: ~180px - using 200px for extra buffer
  // These estimates include gaps, padding, and safety margin
  const estimatedKernelWidth = showRuntimeSelector ? 200 : 0;
  const estimatedCollabWidth = showCollaborativeLabel ? 200 : 0;
  const reservedRightWidth = estimatedKernelWidth + estimatedCollabWidth;

  // Calculate left content width (Undo/Redo + dropdowns + +/- buttons + formatting buttons + dividers)
  // Undo: 36px, Redo: 36px, Divider: 10px
  // Block (icon only): 36px, Divider: 10px
  // Font (T icon only): 36px, Size: 32px + 2*20px (+-buttons), Divider: 10px
  // Bold, Italic, Underline, Code, Link: 5*36px = 180px, Divider: 10px
  // TextColor picker: 28px, HighlightColor picker: 28px, TextTransform (Aa): 36px, Divider: 10px
  // Insert (icon only): 36px, Divider: 10px
  // Align: 36px, Divider: 10px
  const reservedLeftWidth =
    36 +
    36 +
    10 +
    36 +
    10 +
    36 +
    32 +
    40 +
    10 +
    180 +
    10 +
    28 +
    28 +
    36 +
    10 +
    36 +
    10 +
    36 +
    10;

  return (
    <>
      {modal}
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
            <div title={`Styles: ${getBlockTypeLabel()}`}>
              <Dropdown
                buttonLabel=""
                buttonIcon="codicon codicon-symbol-keyword"
                items={blockTypeItems}
                disabled={disabled}
                ariaLabel={`Styles: ${getBlockTypeLabel()}`}
                minWidth="36px"
                showArrow={false}
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

            {/* Font family with T icon - compact version */}
            <div title={`Font: ${fontFamily}`}>
              <Dropdown
                buttonLabel=""
                buttonIcon="codicon codicon-symbol-text"
                items={fontFamilyItems}
                disabled={disabled}
                ariaLabel={`Font: ${fontFamily}`}
                minWidth="36px"
                showArrow={false}
              />
            </div>

            {/* Font size with +/- buttons - compact version */}
            <div style={{ display: "flex", alignItems: "center", gap: "0px" }}>
              <ToolbarButton
                icon="codicon codicon-remove"
                onClick={decreaseFontSize}
                disabled={disabled || FONT_SIZE_OPTIONS.indexOf(fontSize) === 0}
                title="Decrease font size"
                style={{
                  padding: "2px",
                  minWidth: "20px",
                  height: "24px",
                }}
              />
              <Dropdown
                buttonLabel={fontSize.replace("pt", "")}
                items={fontSizeItems}
                disabled={disabled}
                ariaLabel={`Font size: ${fontSize}`}
                minWidth="32px"
                showArrow={false}
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
                style={{
                  padding: "2px",
                  minWidth: "20px",
                  height: "24px",
                }}
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

            {/* Bold, Italic, Underline, Code, Link buttons (icon only with tooltips) */}
            <div title="Bold">
              <ToolbarButton
                icon="codicon codicon-bold"
                onClick={formatBold}
                disabled={disabled}
                style={{
                  backgroundColor: isBold
                    ? "var(--vscode-toolbar-hoverBackground)"
                    : "transparent",
                  color: "var(--vscode-foreground)",
                }}
              />
            </div>
            <div title="Italic">
              <ToolbarButton
                icon="codicon codicon-italic"
                onClick={formatItalic}
                disabled={disabled}
                style={{
                  backgroundColor: isItalic
                    ? "var(--vscode-toolbar-hoverBackground)"
                    : "transparent",
                  color: "var(--vscode-foreground)",
                }}
              />
            </div>
            <div title="Underline">
              <ToolbarButton
                label="U"
                onClick={formatUnderline}
                disabled={disabled}
                style={{
                  backgroundColor: isUnderline
                    ? "var(--vscode-toolbar-hoverBackground)"
                    : "transparent",
                  color: "var(--vscode-foreground)",
                  textDecoration: "underline",
                  fontWeight: "bold",
                }}
              />
            </div>
            <div title="Code">
              <ToolbarButton
                icon="codicon codicon-code"
                onClick={formatCode}
                disabled={disabled}
                style={{
                  backgroundColor: isCode
                    ? "var(--vscode-toolbar-hoverBackground)"
                    : "transparent",
                  color: "var(--vscode-foreground)",
                }}
              />
            </div>
            <div title="Link">
              <ToolbarButton
                icon="codicon codicon-link"
                onClick={insertLink}
                disabled={disabled}
                style={{
                  backgroundColor: isLink
                    ? "var(--vscode-toolbar-hoverBackground)"
                    : "transparent",
                  color: "var(--vscode-foreground)",
                }}
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

            {/* Text Color Picker */}
            <div title="Text color" style={{ position: "relative" }}>
              <input
                type="color"
                value={textColor}
                onChange={(e) => applyTextColor(e.target.value)}
                disabled={disabled}
                style={{
                  width: "24px",
                  height: "24px",
                  border: "1px solid transparent",
                  borderRadius: "2px",
                  padding: "0",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
              />
            </div>

            {/* Highlight Color Picker */}
            <div title="Highlight color" style={{ position: "relative" }}>
              <input
                type="color"
                value={highlightColor}
                onChange={(e) => applyHighlightColor(e.target.value)}
                disabled={disabled}
                style={{
                  width: "24px",
                  height: "24px",
                  border: "1px solid transparent",
                  borderRadius: "2px",
                  padding: "0",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
              />
            </div>

            {/* Text Transform dropdown (Aa) - compact */}
            <div title="Text transform">
              <Dropdown
                buttonLabel="Aa"
                items={textFormattingItems}
                disabled={disabled}
                ariaLabel="Text transform"
                minWidth="36px"
                showArrow={false}
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

            {/* Insert dropdown (+ only, no text) */}
            <div title="Insert">
              <Dropdown
                buttonLabel=""
                buttonIcon="codicon codicon-add"
                items={insertMenuItems}
                disabled={disabled}
                ariaLabel="Insert"
                minWidth="36px"
                showArrow={false}
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

            {/* Alignment dropdown at the end */}
            <div title="Alignment">
              <Dropdown
                buttonLabel=""
                buttonIcon="codicon codicon-editor-layout"
                items={alignmentItems}
                disabled={disabled}
                ariaLabel="Alignment"
                showArrow={false}
                minWidth="36px"
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
    </>
  );
}
