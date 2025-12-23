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
import { Jupyter, useJupyter } from "@datalayer/jupyter-react";
import { ServiceManager } from "@jupyterlab/services";
import {
  JupyterInputNode,
  JupyterInputHighlightNode,
  JupyterOutputNode,
  JupyterCellNode,
  InlineCompletionNode,
  ComponentPickerMenuPlugin,
  JupyterCellPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  registerCodeHighlighting,
  LexicalInlineCompletionPlugin,
  EquationNode,
  ImageNode,
  YouTubeNode,
  ImagesPlugin,
  HorizontalRulePlugin,
  EquationsPlugin,
  YouTubePlugin,
  AutoLinkPlugin,
  AutoEmbedPlugin,
  AutoIndentPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  CommentThreadNode,
  CommentPlugin,
} from "@datalayer/jupyter-lexical";
import { LexicalToolbar } from "./LexicalToolbar";
import { RuntimeProgressBar } from "../components/RuntimeProgressBar";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import {
  LoroCollaborationPlugin,
  CollaborationContext,
  type CollaborationContextType,
} from "@datalayer/lexical-loro";
import { createVSCodeLoroProvider } from "../services/loro/providerFactory";
import { LexicalVSCodeLLMProvider } from "../services/completion/lexicalLLMProvider";
import { OutlinePlugin } from "./plugins/OutlinePlugin";
import { NavigationPlugin } from "./plugins/NavigationPlugin";
import { InternalCommandsPlugin } from "./plugins/InternalCommandsPlugin";
import { ContextMenuPlugin } from "./plugins/ContextMenuPlugin";
import type { OutlineUpdateMessage } from "../types/messages";

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
  userInfo?: { username: string; userColor: string } | null;
  selectedRuntime?: RuntimeJSON;
  showRuntimeSelector?: boolean;
  documentUri?: string;
  vscode?: { postMessage: (message: OutlineUpdateMessage) => void };
  navigationTarget?: string | null;
  onNavigated?: () => void;
  serviceManager: ServiceManager.IManager;
  lexicalId?: string | null;
  kernelInitializing?: boolean;
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

        // REMOVE ALL COMPLETION NODES BEFORE SAVING
        editor.update(() => {
          const root = $getRoot();
          root.getChildren().forEach((child) => {
            if (child.getType() === "jupyter-input") {
              // Cast to any to access getChildren - we know it's a JupyterInputNode
              const jupyterNode = child as any;
              jupyterNode.getChildren().forEach((grandchild: any) => {
                if (grandchild.getType() === "inline-completion") {
                  grandchild.remove();
                  console.warn(
                    "[SavePlugin] 🧹 Removed inline completion node before save",
                  );
                }
              });
            }
          });
        });

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
 * Wrapper component for kernel-dependent Jupyter plugins.
 * This component is wrapped with Jupyter provider and uses runtime ingress as key,
 * so only these plugins remount when runtime changes (not the entire editor).
 */
function JupyterKernelPlugins() {
  const { defaultKernel } = useJupyter();

  return (
    <>
      <ComponentPickerMenuPlugin kernel={defaultKernel} />
      <JupyterInputOutputPlugin kernel={defaultKernel} />
    </>
  );
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
  userInfo,
  selectedRuntime,
  showRuntimeSelector = false,
  documentUri,
  vscode,
  navigationTarget,
  onNavigated,
  serviceManager,
  lexicalId,
  kernelInitializing = false,
}: LexicalEditorProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const [showCommentsPanel, setShowCommentsPanel] = useState(false);

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  /**
   * LLM completion provider instance for inline code suggestions.
   * Integrates VS Code Language Model API (Copilot) with Lexical editor.
   */
  const lexicalLLMProvider = React.useMemo(() => {
    return new LexicalVSCodeLLMProvider();
  }, []);

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
      // Comment nodes (for commenting plugin)
      CommentThreadNode,
      // Jupyter lexical nodes (must match SaaS editor for collaboration)
      EquationNode,
      ImageNode,
      YouTubeNode,
      JupyterCellNode,
      JupyterInputNode,
      JupyterInputHighlightNode,
      JupyterOutputNode,
      InlineCompletionNode,
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
      draggableBlockMenu: "vscode-draggable-block-menu",
      draggableBlockTargetLine: "vscode-draggable-block-target-line",
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
      <LexicalConfigProvider
        lexicalId={lexicalId || documentUri || ""}
        serviceManager={serviceManager}
      >
        <LexicalComposer initialConfig={editorConfig}>
          {/* CRITICAL: LexicalStatePlugin registers the adapter in the store */}
          <LexicalStatePlugin />
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
                  showCommentsPanel={showCommentsPanel}
                  onToggleComments={() =>
                    setShowCommentsPanel(!showCommentsPanel)
                  }
                  lexicalId={lexicalId || undefined}
                  kernelInitializing={kernelInitializing}
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
            <AutoIndentPlugin defaultLanguage="python" debug={true} />
            {/* Wrap kernel plugins with Jupyter provider - only these remount on runtime change */}
            <Jupyter
              key={selectedRuntime?.ingress || "no-runtime"}
              // @ts-ignore - Type mismatch between @jupyterlab/services versions
              serviceManager={serviceManager}
              startDefaultKernel={!!selectedRuntime}
              defaultKernelName="python"
              lite={false}
              collaborative={false}
              terminals={false}
            >
              <JupyterKernelPlugins />
            </Jupyter>
            <LexicalInlineCompletionPlugin
              providers={[lexicalLLMProvider]}
              debounceMs={200}
              enabled={editable}
            />
            {documentUri && vscode && (
              <OutlinePlugin documentUri={documentUri} vscode={vscode} />
            )}
            {navigationTarget && onNavigated && (
              <NavigationPlugin
                navigationTarget={navigationTarget}
                onNavigated={onNavigated}
              />
            )}
            <InternalCommandsPlugin
              vscode={vscode as { postMessage: (message: unknown) => void }}
              lexicalId={lexicalId}
            />
            {/* Comments Plugin - Wrapped in CollaborationContext for username */}
            {(() => {
              const username =
                userInfo?.username || collaboration?.username || "Anonymous";
              const userColor =
                userInfo?.userColor || collaboration?.userColor || "#808080";

              // Create CollaborationContext value for CommentPlugin
              // This provides username/color WITHOUT full Loro sync
              const collabContextValue: CollaborationContextType = {
                clientID: 0, // Not needed for local comments
                color: userColor,
                isCollabActive: collaboration?.enabled || false,
                name: username,
                docMap: new Map(), // Empty map for local files
              };

              return (
                <CollaborationContext.Provider value={collabContextValue}>
                  <CommentPlugin
                    providerFactory={undefined}
                    showCommentsPanel={showCommentsPanel}
                    showFloatingAddButton={false}
                    showToggleButton={false}
                  />
                  {/* Context Menu Plugin - Right-click to add comments */}
                  <ContextMenuPlugin />
                </CollaborationContext.Provider>
              );
            })()}
            {floatingAnchorElem && (
              <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
            )}
            {collaboration?.enabled &&
              (() => {
                const username = userInfo?.username || collaboration?.username;
                const userColor =
                  userInfo?.userColor || collaboration?.userColor;
                const docId =
                  collaboration?.documentId || documentUri || "local";

                console.log(
                  "[LexicalEditor] Rendering LoroCollaborationPlugin",
                );

                return (
                  <LoroCollaborationPlugin
                    id={docId}
                    shouldBootstrap
                    providerFactory={createVSCodeLoroProvider}
                    websocketUrl={collaboration?.websocketUrl || ""}
                    username={username}
                    cursorColor={userColor}
                    onInitialization={(_isInitialized) => {}}
                  />
                );
              })()}
          </div>
        </LexicalComposer>
      </LexicalConfigProvider>
    </div>
  );
}
