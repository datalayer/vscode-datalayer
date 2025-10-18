/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Plugin to handle format commands from VS Code native toolbar.
 * Subscribes to command events and dispatches appropriate Lexical commands.
 *
 * @module lexical/plugins/CommandHandlerPlugin
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND } from "lexical";
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from "@lexical/list";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from "@lexical/rich-text";
import { $getSelection, $isRangeSelection } from "lexical";
import { lexicalCommands } from "../../services/lexicalCommands";

/**
 * Plugin that listens to format commands from the VS Code toolbar
 * and executes the corresponding Lexical editor commands.
 */
export function CommandHandlerPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleCommand = (command: string) => {
      switch (command) {
        // Undo/Redo
        case "undo":
          editor.dispatchCommand(UNDO_COMMAND, undefined);
          break;
        case "redo":
          editor.dispatchCommand(REDO_COMMAND, undefined);
          break;

        // Text formatting
        case "bold":
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
          break;
        case "italic":
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
          break;
        case "underline":
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
          break;
        case "strikethrough":
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
          break;
        case "code":
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
          break;

        // Headings
        case "heading1":
          formatHeading("h1");
          break;
        case "heading2":
          formatHeading("h2");
          break;
        case "heading3":
          formatHeading("h3");
          break;

        // Lists
        case "bulletList":
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
          break;
        case "numberedList":
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
          break;

        // Quote
        case "quote":
          formatQuote();
          break;

        // Link - for now just show a message, full implementation needs dialog
        case "link":
          // TODO: Show link insertion dialog
          break;
      }
    };

    function formatHeading(headingSize: HeadingTagType) {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize));
        }
      });
    }

    function formatQuote() {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
    }

    const unsubscribe = lexicalCommands.subscribe(handleCommand);
    return unsubscribe;
  }, [editor]);

  return null;
}
