/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module LexicalEditor
 * React component for the Lexical rich text editor with VS Code theme integration.
 * Provides a full-featured text editor with support for rich formatting, lists, links,
 * and markdown shortcuts. Includes optional toolbar and automatic saving functionality.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { $getRoot, $createParagraphNode, EditorState } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { HashtagNode } from "@lexical/hashtag";
import { MarkNode } from "@lexical/mark";
import { OverflowNode } from "@lexical/overflow";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { useJupyter } from "@datalayer/jupyter-react";
import {
  JupyterInputNode,
  JupyterInputHighlightNode,
  JupyterOutputNode,
  JupyterCellNode,
  ComponentPickerMenuPlugin,
  JupyterCellPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  registerCodeHighlighting,
  EquationNode,
  ImageNode,
  YouTubeNode,
  ImagesPlugin,
  HorizontalRulePlugin,
  EquationsPlugin,
  YouTubePlugin,
  AutoLinkPlugin,
  AutoEmbedPlugin,
} from "@datalayer/jupyter-lexical";
import { LexicalToolbar } from "./LexicalToolbar";
import { RuntimeProgressBar } from "../components/RuntimeProgressBar";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import { LoroCollaborationPlugin } from "@datalayer/lexical-loro";
import { createVSCodeLoroProvider } from "../services/loro/providerFactory";

/**
 * Collaboration configuration for Lexical documents
 *
 * @interface CollaborationConfig
 */
interface CollaborationConfig {
  enabled: boolean;
  websocketUrl?: string;
  documentId?: string;
  sessionId?: string;
  username?: string;
  userColor?: string;
}

/**
 * Properties for the LexicalEditor component.
 *
 * @interface LexicalEditorProps
 * @property {string} [initialContent] - Initial JSON content to load in the editor
 * @property {(content: string) => void} [onSave] - Callback when save is triggered (Cmd/Ctrl+S)
 * @property {(content: string) => void} [onContentChange] - Callback when content changes
 * @property {string} [className] - Additional CSS class names
 * @property {boolean} [showToolbar=true] - Whether to show the formatting toolbar
 * @property {boolean} [editable=true] - Whether the editor should be editable or read-only
 * @property {CollaborationConfig} [collaboration] - Collaboration configuration
 * @property {RuntimeJSON} [selectedRuntime] - Selected runtime information for execution
 * @property {boolean} [showRuntimeSelector=false] - Whether to show runtime selector in toolbar
 * @hidden
 */
export interface LexicalEditorProps {
  initialContent?: string;
  onSave?: (content: string) => void;
  onContentChange?: (content: string) => void;
  className?: string;
  showToolbar?: boolean;
  editable?: boolean;
  collaboration?: CollaborationConfig;
  selectedRuntime?: RuntimeJSON;
  showRuntimeSelector?: boolean;
}

/**
 * Lexical plugin for handling save operations.
 * Listens for Cmd/Ctrl+S keyboard shortcut and triggers the save callback
 * with the current editor state serialized as JSON.
 *
 * @hidden
 * @param {object} props - Plugin properties
 * @param {(content: string) => void} [props.onSave] - Callback function when save is triggered
 * @returns {null} This is a React effect-only component
 */
function SavePlugin({ onSave }: { onSave?: (content: string) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        const editorState = editor.getEditorState();
        const jsonString = JSON.stringify(editorState);
        if (onSave) {
          onSave(jsonString);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, onSave]);

  return null;
}

/**
 * Lexical plugin for Jupyter code syntax highlighting.
 * Registers the code highlighting functionality for JupyterInputNode cells.
 *
 * @hidden
 * @returns {null} This is a React effect-only component
 */
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

/**
 * Lexical plugin for loading initial content into the editor.
 * Parses JSON content and sets it as the editor state on first render.
 * Falls back to an empty paragraph if parsing fails.
 * Importantly, this does NOT add the initial load to the undo history.
 * SKIPS loading if collaboration is enabled (content comes from collaboration provider).
 *
 * @hidden
 * @param {object} props - Plugin properties
 * @param {string} [props.content] - JSON string representing the initial editor state
 * @param {boolean} [props.skipLoad] - Skip loading content (for collaborative mode)
 * @returns {null} This is a React effect-only component
 */
function LoadContentPlugin({
  content,
  skipLoad,
}: {
  content?: string;
  skipLoad?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip loading if collaboration is enabled - content will come from collaboration provider
    if (skipLoad || !content || !isFirstRender.current) {
      return;
    }

    isFirstRender.current = false;
    try {
      // First try to parse as JSON to validate format
      const parsed = JSON.parse(content);

      // Check if it's a valid Lexical editor state
      if (parsed && typeof parsed === "object" && parsed.root) {
        const editorState = editor.parseEditorState(content);
        // Use setEditorState with skipHistoryPush option to avoid adding to undo stack
        editor.setEditorState(editorState, {
          tag: "history-merge",
        });
      } else {
        throw new Error("Invalid Lexical editor state format");
      }
    } catch (error) {
      // Create a default empty state if parsing fails
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        },
        {
          tag: "history-merge",
        },
      );
    }
  }, [content, editor, skipLoad]);

  return null;
}

/**
 * Main Lexical editor component with VS Code theme integration.
 * Provides a rich text editing experience with support for various formatting options,
 * lists, links, and markdown shortcuts. Includes an optional toolbar for visual formatting.
 *
 * @function LexicalEditor
 * @param {LexicalEditorProps} props - Component properties
 * @returns {React.ReactElement} The rendered Lexical editor
 *
 * @example
 * ```tsx
 * <LexicalEditor
 *   initialContent={savedContent}
 *   onSave={(content) => saveToFile(content)}
 *   onContentChange={(content) => setDirtyState(true)}
 *   showToolbar={true}
 * />
 * ```
 */
export function LexicalEditor({
  initialContent,
  onSave,
  onContentChange,
  className = "",
  showToolbar = true,
  editable = true,
  collaboration,
  selectedRuntime,
  showRuntimeSelector = false,
}: LexicalEditorProps) {
  // Get ONLY the defaultKernel from Jupyter context
  // DO NOT use serviceManager from useJupyter - we already have our MutableServiceManager!
  const { defaultKernel } = useJupyter();
  const [localKernel, setLocalKernel] = React.useState<any>(null);

  // When runtime is terminated, we should use undefined kernel instead of defaultKernel
  // This ensures the JupyterInputOutputPlugin knows there's no kernel available
  const activeKernel = selectedRuntime?.ingress ? defaultKernel : undefined;

  // Kernel management is handled by Jupyter React when we have a runtime selected
  // We don't need to manually start kernels - the library does it for us
  // Just clean up local kernel if we had one
  React.useEffect(() => {
    // Cleanup kernel on unmount or runtime change
    return () => {
      if (localKernel) {
        localKernel.shutdown().catch((err: any) => {
          console.error("Failed to shutdown kernel:", err);
        });
        setLocalKernel(null);
      }
    };
  }, [selectedRuntime, localKernel]);

  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  // DEBUG: Log element positions and styles to find the gap
  React.useEffect(() => {
    const debugElements = () => {
      // Debug logging removed - re-enable if needed for layout debugging
      // const container = document.querySelector(".lexical-editor-container");
      // const toolbarWrapper = document.querySelector(".lexical-toolbar-wrapper");
      // const editorInner = document.querySelector(".lexical-editor-inner");
    };

    // Run after a short delay to ensure everything is rendered
    const timer = setTimeout(debugElements, 500);
    return () => clearTimeout(timer);
  }, []);

  const editorConfig = {
    namespace: "VSCodeLexicalEditor",
    editable,
    nodes: [
      // Basic rich text nodes
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
      // Table nodes
      TableNode,
      TableCellNode,
      TableRowNode,
      // Additional nodes from @lexical packages (for collaboration compatibility)
      HashtagNode,
      MarkNode,
      OverflowNode,
      HorizontalRuleNode,
      // Jupyter lexical nodes (must match SaaS editor for collaboration)
      EquationNode,
      ImageNode,
      YouTubeNode,
      JupyterCellNode,
      JupyterInputNode,
      JupyterInputHighlightNode,
      JupyterOutputNode,
    ],
    theme: {
      root: "lexical-editor-root",
      link: "lexical-editor-link",
      text: {
        bold: "lexical-editor-bold",
        underline: "lexical-editor-underline",
        italic: "lexical-editor-italic",
        strikethrough: "lexical-editor-strikethrough",
        code: "lexical-editor-code",
      },
      code: "lexical-editor-code-block",
      paragraph: "lexical-editor-paragraph",
      heading: {
        h1: "lexical-editor-h1",
        h2: "lexical-editor-h2",
        h3: "lexical-editor-h3",
        h4: "lexical-editor-h4",
        h5: "lexical-editor-h5",
        h6: "lexical-editor-h6",
      },
      list: {
        listitem: "lexical-editor-listitem",
        listitemChecked: "lexical-editor-listitem-checked",
        listitemUnchecked: "lexical-editor-listitem-unchecked",
        nested: {
          listitem: "lexical-editor-nested-listitem",
        },
        ol: "lexical-editor-ol",
        ul: "lexical-editor-ul",
      },
      quote: "lexical-editor-quote",
      codeHighlight: {
        atrule: "token-atrule",
        attr: "token-attr",
        boolean: "token-boolean",
        builtin: "token-builtin",
        cdata: "token-cdata",
        char: "token-char",
        class: "token-class",
        "class-name": "token-class-name",
        comment: "token-comment",
        constant: "token-constant",
        deleted: "token-deleted",
        doctype: "token-doctype",
        entity: "token-entity",
        function: "token-function",
        important: "token-important",
        inserted: "token-inserted",
        keyword: "token-keyword",
        namespace: "token-namespace",
        number: "token-number",
        operator: "token-operator",
        prolog: "token-prolog",
        property: "token-property",
        punctuation: "token-punctuation",
        regex: "token-regex",
        selector: "token-selector",
        string: "token-string",
        "triple-quoted-string": "token-string", // Python docstrings
        symbol: "token-symbol",
        tag: "token-tag",
        url: "token-url",
        variable: "token-variable",
      },
    },
    onError(_error: Error) {
      // Silently handle Lexical errors
    },
  };

  const handleChange = useCallback(
    (editorState: EditorState) => {
      try {
        const jsonString = JSON.stringify(editorState);
        if (onContentChange) {
          onContentChange(jsonString);
        }
      } catch (error) {
        // Ignore serialization errors (e.g., JupyterOutputNode without kernel)
        // This can happen in collaborative mode without a connected kernel
        console.debug("Editor state serialization skipped:", error);
      }
    },
    [onContentChange],
  );

  // Check if this is a Datalayer runtime (has uid property)
  const isDatalayerRuntime = !!selectedRuntime?.uid;

  return (
    <div className={`lexical-editor-container ${className}`}>
      {/* Runtime progress bar */}
      <RuntimeProgressBar
        runtime={selectedRuntime}
        isDatalayerRuntime={isDatalayerRuntime}
      />
      <LexicalComposer initialConfig={editorConfig}>
        {(showToolbar || collaboration?.enabled) && (
          <div
            className="lexical-toolbar-wrapper"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              backgroundColor: "var(--vscode-editor-background)",
              width: "100%",
              maxWidth: "100%",
              overflow: "hidden",
              border: "none !important",
              outline: "none !important",
              boxShadow: "none !important",
            }}
          >
            {showToolbar && (
              <LexicalToolbar
                disabled={!editable}
                selectedRuntime={selectedRuntime}
                showRuntimeSelector={showRuntimeSelector}
                showCollaborativeLabel={collaboration?.enabled}
              />
            )}
          </div>
        )}
        <div className="lexical-editor-inner" ref={onRef}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-editor-content"
                aria-label="Lexical Editor"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={handleChange} />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <AutoLinkPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <SavePlugin onSave={editable ? onSave : undefined} />
          <LoadContentPlugin
            content={initialContent}
            skipLoad={collaboration?.enabled}
          />
          <CodeHighlightPlugin />
          <ImagesPlugin captionsEnabled={false} />
          <HorizontalRulePlugin />
          <EquationsPlugin />
          <YouTubePlugin />
          <AutoEmbedPlugin />
          <JupyterCellPlugin />
          <ComponentPickerMenuPlugin kernel={activeKernel} />
          <JupyterInputOutputPlugin kernel={activeKernel} />
          {floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}
          {collaboration?.enabled && collaboration.documentId && (
            <LoroCollaborationPlugin
              id={collaboration.documentId}
              shouldBootstrap
              providerFactory={createVSCodeLoroProvider}
              websocketUrl={collaboration.websocketUrl || ""}
              username={collaboration.username}
              cursorColor={collaboration.userColor}
              onInitialization={(_isInitialized) => {}}
            />
          )}
        </div>
      </LexicalComposer>
    </div>
  );
}
