/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Lexical plugin for extracting document outline.
 * Monitors the editor and sends outline updates to the extension.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalOutline } from "../../hooks/useLexicalOutline";
import type { OutlineUpdateMessage } from "../../types/messages";

interface OutlinePluginProps {
  documentUri: string;
  vscode: { postMessage: (message: OutlineUpdateMessage) => void };
}

/**
 * Plugin that extracts and sends outline data to the extension.
 */
export function OutlinePlugin({ documentUri, vscode }: OutlinePluginProps) {
  const [editor] = useLexicalComposerContext();

  // Use the outline hook with the editor instance
  useLexicalOutline({
    editor,
    documentUri,
    vscode,
  });

  return null;
}
