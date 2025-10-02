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
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { useJupyter } from "@datalayer/jupyter-react";
import {
  JupyterInputNode,
  JupyterInputHighlightNode,
  JupyterOutputNode,
  ComponentPickerMenuPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
} from "@datalayer/jupyter-lexical";
import { LexicalToolbar } from "./LexicalToolbar";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";
import {
  createWebsocketProvider,
  LoroCollaborationPlugin,
} from "@datalayer/lexical-loro";

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
interface LexicalEditorProps {
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
  // Debug logging to understand content flow
  React.useEffect(() => {}, [initialContent, collaboration]);
  const { defaultKernel, serviceManager } = useJupyter();
  const [localKernel, setLocalKernel] = React.useState<any>(null);

  // Create kernel connection when runtime is selected
  React.useEffect(() => {
    if (selectedRuntime && serviceManager && !defaultKernel) {
      console.log("Creating kernel for runtime:", selectedRuntime);

      // Start a new kernel
      serviceManager.kernels
        .startNew({ name: "python" })
        .then((kernel) => {
          console.log("Kernel started:", kernel);
          setLocalKernel(kernel);
        })
        .catch((error) => {
          console.error("Failed to start kernel:", error);
        });
    }

    // Cleanup kernel on unmount or runtime change
    return () => {
      if (localKernel && !selectedRuntime) {
        console.log("Shutting down kernel");
        localKernel.shutdown().catch((err: any) => {
          console.error("Failed to shutdown kernel:", err);
        });
        setLocalKernel(null);
      }
    };
  }, [selectedRuntime, serviceManager, defaultKernel, localKernel]);

  console.log("LexicalEditor - defaultKernel:", defaultKernel);
  console.log("LexicalEditor - selectedRuntime:", selectedRuntime);
  console.log("LexicalEditor - localKernel:", localKernel);

  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const editorConfig = {
    namespace: "VSCodeLexicalEditor",
    editable,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
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

  return (
    <div className={`lexical-editor-container ${className}`}>
      <LexicalComposer initialConfig={editorConfig}>
        {(showToolbar || collaboration?.enabled) && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--vscode-panel-border)",
              backgroundColor: "var(--vscode-editor-background)",
            }}
          >
            {showToolbar && (
              <LexicalToolbar
                disabled={!editable}
                selectedRuntime={selectedRuntime}
                showRuntimeSelector={showRuntimeSelector}
              />
            )}
            {collaboration?.enabled && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  margin: "8px 24px 8px 0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    fontFamily: "var(--vscode-font-family)",
                    color: "var(--vscode-editor-foreground)",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor:
                        "var(--vscode-debugIcon-startForeground, var(--vscode-terminal-ansiGreen, var(--vscode-charts-green)))",
                      borderRadius: "50%",
                      display: "inline-block",
                    }}
                  ></span>
                  <span>Collaborative</span>
                </div>
                <button
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--vscode-editor-foreground)",
                    border:
                      "1px solid var(--vscode-button-border, transparent)",
                    padding: "4px 12px",
                    borderRadius: "2px",
                    fontSize: "13px",
                    fontFamily: "var(--vscode-font-family)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "background-color 0.1s, border-color 0.1s",
                    height: "28px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginRight: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--vscode-toolbar-hoverBackground)";
                    e.currentTarget.style.borderColor =
                      "var(--vscode-button-border, var(--vscode-contrastBorder, transparent))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.borderColor =
                      "var(--vscode-button-border, transparent)";
                  }}
                  title="Select a runtime for code execution"
                >
                  <span>Select Runtime</span>
                </button>
              </div>
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
          <LinkPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <SavePlugin onSave={editable ? onSave : undefined} />
          <LoadContentPlugin
            content={initialContent}
            skipLoad={collaboration?.enabled}
          />
          <ComponentPickerMenuPlugin kernel={defaultKernel} />
          <JupyterInputOutputPlugin kernel={defaultKernel} />
          {floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}
          {collaboration?.enabled &&
            collaboration.websocketUrl &&
            collaboration.documentId && (
              <LoroCollaborationPlugin
                id={collaboration.documentId}
                shouldBootstrap
                providerFactory={createWebsocketProvider}
                websocketUrl={collaboration.websocketUrl}
                onInitialization={(_isInitialized) => {
                  // Collaboration initialized
                }}
              />
            )}
        </div>
      </LexicalComposer>
    </div>
  );
}
