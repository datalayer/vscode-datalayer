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
import {
  $getRoot,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  EditorState,
} from "lexical";
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
import { ServiceManager } from "@jupyterlab/services";
import {
  JupyterInputNode,
  JupyterInputHighlightNode,
  JupyterOutputNode,
  JupyterCellNode,
  InlineCompletionNode,
  CounterNode,
  ComponentPickerMenuPlugin,
  JupyterCellPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  FloatingTextFormatToolbarPlugin,
  CodeBlockHighlightPlugin,
  LexicalInlineCompletionPlugin,
  EquationNode,
  ImageNode,
  YouTubeNode,
  ImagesPlugin,
  HorizontalRulePlugin,
  EquationsPlugin,
  YouTubePlugin,
  AutoLinkPlugin,
  FloatingLinkEditorPlugin,
  AutoEmbedPlugin,
  AutoIndentPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  CommentThreadNode,
  CommentPlugin,
  EmbedHandlersContext,
  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
  CollapsiblePlugin,
  ExcalidrawNode,
  ExcalidrawPlugin,
  TablePlugin,
  TableActionMenuPlugin,
  TableHoverActionsV2Plugin,
  TableScrollShadowPlugin,
  TableCellResizerPlugin,
  CommentsProvider,
  useComments,
  LSPTabCompletionPlugin,
  LexicalLSPCompletionProvider,
  LSPDocumentSyncPlugin,
  commentTheme,
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
import { vsCodeAPI } from "../services/messageHandler";

/**
 * Debug plugin to trace slash command (ComponentPickerMenuPlugin) behavior.
 * Tests the trigger mechanism and checks for module duplication issues.
 *
 * @hidden
 */
function SlashCommandDebugPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Store editor reference for comparison with ComponentPickerMenuPlugin
    (window as any).__slashDebugEditor = editor;
    console.log("[SlashCmdDebug] MOUNTED - editor key:", (editor as any)._key);

    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
          const anchor = selection.anchor;
          if (anchor.type !== "text") return;
          const anchorNode = anchor.getNode();
          const text = anchorNode.getTextContent().slice(0, anchor.offset);

          if (text.includes("/")) {
            console.log(
              "[SlashCmdDebug] SLASH detected:",
              JSON.stringify(text),
            );

            // Immediate DOM check
            const typeaheadDiv = document.getElementById("typeahead-menu");
            const ariaLabels = document.querySelectorAll(
              '[aria-label="Typeahead menu"]',
            );
            console.log(
              "[SlashCmdDebug]   #typeahead-menu (immediate):",
              !!typeaheadDiv,
            );
            console.log(
              "[SlashCmdDebug]   aria-label Typeahead count:",
              ariaLabels.length,
            );
            if (ariaLabels.length > 0) {
              const anchor = ariaLabels[0] as HTMLElement;
              console.log(
                "[SlashCmdDebug]   anchor children:",
                anchor.childNodes.length,
              );
              console.log(
                "[SlashCmdDebug]   anchor innerHTML length:",
                anchor.innerHTML.length,
              );
            }

            // DELAYED check - after React processes startTransition state update
            setTimeout(() => {
              const delayedAnchor = document.querySelector(
                '[aria-label="Typeahead menu"]',
              ) as HTMLElement;
              const delayedId = document.getElementById("typeahead-menu");
              console.log("[SlashCmdDebug] DELAYED (500ms):");
              console.log("[SlashCmdDebug]   #typeahead-menu:", !!delayedId);
              if (delayedAnchor) {
                console.log("[SlashCmdDebug]   anchor.id:", delayedAnchor.id);
                console.log(
                  "[SlashCmdDebug]   anchor.className:",
                  delayedAnchor.className,
                );
                console.log(
                  "[SlashCmdDebug]   anchor childNodes:",
                  delayedAnchor.childNodes.length,
                );
                console.log(
                  "[SlashCmdDebug]   anchor innerHTML (first 200):",
                  delayedAnchor.innerHTML.substring(0, 200),
                );
                const rect = delayedAnchor.getBoundingClientRect();
                console.log("[SlashCmdDebug]   anchor rect:", {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                });
                const styles = window.getComputedStyle(delayedAnchor);
                console.log("[SlashCmdDebug]   anchor computed:", {
                  position: styles.position,
                  display: styles.display,
                  visibility: styles.visibility,
                  opacity: styles.opacity,
                  overflow: styles.overflow,
                  zIndex: styles.zIndex,
                  top: styles.top,
                  left: styles.left,
                  width: styles.width,
                  height: styles.height,
                });
                // Check first child (the Primer content)
                const firstChild =
                  delayedAnchor.firstElementChild as HTMLElement;
                if (firstChild) {
                  const childRect = firstChild.getBoundingClientRect();
                  const childStyles = window.getComputedStyle(firstChild);
                  console.log(
                    "[SlashCmdDebug]   firstChild tag:",
                    firstChild.tagName,
                  );
                  console.log("[SlashCmdDebug]   firstChild rect:", {
                    top: childRect.top,
                    left: childRect.left,
                    width: childRect.width,
                    height: childRect.height,
                  });
                  console.log("[SlashCmdDebug]   firstChild computed:", {
                    display: childStyles.display,
                    visibility: childStyles.visibility,
                    opacity: childStyles.opacity,
                    zIndex: childStyles.zIndex,
                    background: childStyles.backgroundColor,
                  });
                } else {
                  console.log(
                    "[SlashCmdDebug]   NO firstChild - menu did NOT render!",
                  );
                }
              } else {
                console.log("[SlashCmdDebug]   NO anchor found at all!");
              }
              // Also check body overflow
              const bodyStyles = window.getComputedStyle(document.body);
              console.log(
                "[SlashCmdDebug]   body overflow:",
                bodyStyles.overflow,
                bodyStyles.overflowX,
                bodyStyles.overflowY,
              );
            }, 500);
          }
        });
      },
    );

    return () => removeUpdateListener();
  }, [editor]);

  return null;
}

/**
 * Wrapper around ComponentPickerMenuPlugin to debug its lifecycle.
 * Stores the editor reference so we can check if it's the same one.
 *
 * @hidden
 */
function DebugComponentPickerWrapper() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    (window as any).__componentPickerEditor = editor;
    console.log("[SlashCmdDebug] ComponentPickerWrapper MOUNTED");
    console.log("[SlashCmdDebug]   wrapper editor key:", (editor as any)._key);
    console.log(
      "[SlashCmdDebug]   wrapper editor === debug editor:",
      editor === (window as any).__slashDebugEditor,
    );
    console.log(
      "[SlashCmdDebug]   wrapper editor editable:",
      editor.isEditable(),
    );
    console.log(
      "[SlashCmdDebug]   wrapper editor root:",
      !!editor.getRootElement(),
    );

    return () => {
      console.log("[SlashCmdDebug] ComponentPickerWrapper UNMOUNTED");
    };
  }, [editor]);

  console.log("[SlashCmdDebug] ComponentPickerWrapper RENDERED");
  return <ComponentPickerMenuPlugin />;
}

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
  completionConfig?: any; // Inline completion configuration from extension
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
  previousRootRef,
}: {
  content?: string;
  skipLoad?: boolean;
  previousRootRef?: React.MutableRefObject<string | null>;
}) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip loading if collaboration is enabled - content will come from collaboration provider
    if (skipLoad || !content || !isFirstRender.current) {
      return;
    }

    isFirstRender.current = false;

    // Defer to next microtask to avoid flushSync warning during lifecycle
    queueMicrotask(() => {
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
          // Sync previousRootRef with the loaded content so that subsequent
          // OnChangePlugin callbacks don't see a stale empty-state diff and
          // falsely mark the document as dirty.
          if (previousRootRef) {
            const loadedRoot = JSON.stringify(editorState.toJSON().root);
            previousRootRef.current = loadedRoot;
          }
        } else {
          throw new Error("Invalid Lexical editor state format");
        }
      } catch (error) {
        console.error("[LoadContentPlugin] Error loading content:", error);
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
    });
  }, [content, editor, skipLoad, previousRootRef]);

  return null;
}

/**
 * Wrapper component for kernel-dependent Jupyter plugins.
 * Uses useJupyter hook with serviceManager to get the default kernel.
 * Remounts when runtime changes (via key prop).
 */
function JupyterKernelPlugins({
  serviceManager,
  startDefaultKernel,
  disableInterrupt,
}: {
  serviceManager: ServiceManager.IManager;
  startDefaultKernel: boolean;
  disableInterrupt?: boolean;
}) {
  const { defaultKernel } = useJupyter({
    serviceManager,
    startDefaultKernel,
    defaultKernelName: "python",
  });

  return (
    <>
      {/* @ts-ignore - Type mismatch between duplicate Kernel types from different module instances */}
      <JupyterInputOutputPlugin
        kernel={defaultKernel}
        disableInterrupt={disableInterrupt}
      />
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
  completionConfig,
}: LexicalEditorProps) {
  // Log completion config for debugging
  console.log(
    "[LexicalEditor] 🎯 Rendering with completion config:",
    completionConfig,
  );

  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const [isLinkEditMode, setIsLinkEditMode] = useState(false);

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

  /**
   * LSP completion provider instance for Tab dropdown completions.
   * Integrates Pylance and Markdown language servers with Lexical editor.
   */
  const lexicalLSPProvider = React.useMemo(() => {
    return new LexicalLSPCompletionProvider(
      lexicalId || documentUri || "",
      vscode,
    );
  }, [lexicalId, documentUri, vscode]);

  // Dispose provider on unmount or when deps change
  React.useEffect(() => {
    return () => {
      lexicalLSPProvider.dispose();
    };
  }, [lexicalLSPProvider]);

  /**
   * Handler for YouTube embeds in VS Code.
   * Opens videos in external browser (Simple Browser has sandbox restrictions).
   */
  const handleYouTubeClick = useCallback((videoID: string) => {
    vsCodeAPI.postMessage({
      type: "open-external-url",
      url: `https://www.youtube.com/watch?v=${videoID}`,
      useSimpleBrowser: false,
    });
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

  // DEBUG: Log all node types to find which one is undefined or wrong
  const allNodes = [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    LinkNode,
    AutoLinkNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    HashtagNode,
    MarkNode,
    OverflowNode,
    HorizontalRuleNode,
    CommentThreadNode,
    CollapsibleContainerNode,
    CollapsibleContentNode,
    CollapsibleTitleNode,
    EquationNode,
    ExcalidrawNode,
    ImageNode,
    YouTubeNode,
    CounterNode,
    JupyterCellNode,
    JupyterInputNode,
    JupyterInputHighlightNode,
    JupyterOutputNode,
    InlineCompletionNode,
  ];

  // Validate nodes array
  allNodes.forEach((node, index) => {
    if (!node || typeof node.getType !== "function") {
      console.error(`[LexicalEditor] Invalid node at index ${index}:`, node);
    }
  });

  const editorConfig = {
    namespace: "VSCodeLexicalEditor",
    editable,
    nodes: allNodes,
    theme: {
      ...commentTheme,
      // VS Code-specific overrides
      draggableBlockMenu: "vscode-draggable-block-menu",
      draggableBlockTargetLine: "vscode-draggable-block-target-line",
    },
    onError(error: Error) {
      console.error("[LexicalEditor] Error caught by onError handler:", error);
      console.error("[LexicalEditor] Error stack:", error.stack);
      console.error("[LexicalEditor] Error message:", error.message);
      // Also log registered nodes for debugging
      console.log(
        "[LexicalEditor] Registered nodes:",
        editorConfig.nodes.map((n) => (n.getType ? n.getType() : n.name)),
      );
    },
  };

  // Track previous root content to detect actual content changes (not just cursor movements)
  const previousRootRef = useRef<string | null>(null);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      try {
        // Only serialize the root (content) to compare, not the entire EditorState
        // EditorState includes selection (cursor position) which changes on every cursor movement
        // We only want to mark dirty when actual content changes
        const currentRoot = JSON.stringify(editorState.toJSON().root);

        // Check if content actually changed (not just cursor movement)
        if (currentRoot !== previousRootRef.current) {
          previousRootRef.current = currentRoot;

          // Serialize full EditorState for storage
          const jsonString = JSON.stringify(editorState);
          if (onContentChange) {
            onContentChange(jsonString);
          }
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
        <EmbedHandlersContext.Provider
          value={{ onYouTubeClick: handleYouTubeClick }}
        >
          <LexicalComposer initialConfig={editorConfig}>
            {/* CRITICAL: LexicalStatePlugin registers the adapter in the store */}
            <LexicalStatePlugin />
            <CommentsProvider>
              <LexicalEditorInner
                showToolbar={showToolbar}
                collaboration={collaboration}
                editable={editable}
                selectedRuntime={selectedRuntime}
                showRuntimeSelector={showRuntimeSelector}
                lexicalId={lexicalId}
                kernelInitializing={kernelInitializing}
                onRef={onRef}
                handleChange={handleChange}
                onSave={onSave}
                initialContent={initialContent}
                serviceManager={serviceManager}
                documentUri={documentUri}
                vscode={vscode}
                navigationTarget={navigationTarget}
                onNavigated={onNavigated}
                userInfo={userInfo}
                floatingAnchorElem={floatingAnchorElem}
                isLinkEditMode={isLinkEditMode}
                setIsLinkEditMode={setIsLinkEditMode}
                lexicalLLMProvider={lexicalLLMProvider}
                lexicalLSPProvider={lexicalLSPProvider}
                completionConfig={completionConfig}
                previousRootRef={previousRootRef}
              />
            </CommentsProvider>
          </LexicalComposer>
        </EmbedHandlersContext.Provider>
      </LexicalConfigProvider>
    </div>
  );
}

/**
 * Inner component wrapped in CommentsProvider to enable useComments hook
 */
function LexicalEditorInner({
  showToolbar,
  collaboration,
  editable,
  selectedRuntime,
  showRuntimeSelector,
  lexicalId,
  kernelInitializing,
  onRef,
  handleChange,
  onSave,
  initialContent,
  serviceManager,
  documentUri,
  vscode,
  navigationTarget,
  onNavigated,
  userInfo,
  floatingAnchorElem,
  isLinkEditMode,
  setIsLinkEditMode,
  lexicalLLMProvider,
  lexicalLSPProvider,
  completionConfig,
  previousRootRef,
}: any) {
  const { showComments, toggleComments } = useComments();

  return (
    <>
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
              showCommentsPanel={showComments}
              onToggleComments={toggleComments}
              lexicalId={lexicalId || undefined}
              kernelInitializing={kernelInitializing}
              setIsLinkEditMode={setIsLinkEditMode}
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
        <TablePlugin />
        <TableCellResizerPlugin />
        <TableActionMenuPlugin />
        <TableHoverActionsV2Plugin />
        <TableScrollShadowPlugin />
        <LinkPlugin
          validateUrl={(url: string) => {
            return /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/.test(
              url,
            );
          }}
        />
        <AutoLinkPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <SavePlugin onSave={editable ? onSave : undefined} />
        <LoadContentPlugin
          content={initialContent}
          skipLoad={collaboration?.enabled}
          previousRootRef={previousRootRef}
        />
        <CodeBlockHighlightPlugin />
        <ImagesPlugin captionsEnabled={false} />
        <HorizontalRulePlugin />
        <EquationsPlugin />
        <YouTubePlugin />
        <CollapsiblePlugin />
        <ExcalidrawPlugin />
        <AutoEmbedPlugin />
        <JupyterCellPlugin />
        <AutoIndentPlugin defaultLanguage="python" debug={false} />
        {/* Debug plugin to trace slash command behavior */}
        <SlashCommandDebugPlugin />
        {/* Slash command menu - wrapped with debug logging */}
        <DebugComponentPickerWrapper />
        {/* Kernel plugins - remount when runtime changes */}
        <JupyterKernelPlugins
          key={selectedRuntime?.ingress || "no-runtime"}
          serviceManager={serviceManager}
          startDefaultKernel={!!selectedRuntime}
          disableInterrupt={selectedRuntime?.ingress === "http://pyodide-local"}
        />
        <LexicalInlineCompletionPlugin
          providers={[lexicalLLMProvider]}
          debounceMs={200}
          enabled={editable}
          config={completionConfig}
        />
        {/* LSP Tab completion plugin for dropdown completions */}
        <LSPTabCompletionPlugin
          providers={[lexicalLSPProvider]}
          disabled={!editable}
        />
        {/* LSP document sync plugin to keep temp files updated */}
        {lexicalId && vscode && (
          <LSPDocumentSyncPlugin
            lexicalId={lexicalId}
            onDocumentOpen={(data) => {
              vscode.postMessage({
                type: "lsp-document-open",
                cellId: data.cellId,
                notebookId: data.notebookId,
                content: data.content,
                language: data.language,
                source: "lexical",
              });
            }}
            onDocumentSync={(data) => {
              vscode.postMessage({
                type: "lsp-document-sync",
                cellId: data.cellId,
                content: data.content,
                version: data.version,
                source: "lexical",
                lexicalId: lexicalId,
              });
            }}
            onDocumentClose={(cellId) => {
              vscode.postMessage({
                type: "lsp-document-close",
                cellId: cellId,
                source: "lexical",
              });
            }}
            disabled={!editable}
          />
        )}
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
                showFloatingAddButton={false}
              />
              {/* Context Menu Plugin - Right-click to add comments */}
              <ContextMenuPlugin />
            </CollaborationContext.Provider>
          );
        })()}
        {floatingAnchorElem && (
          <>
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
            <FloatingLinkEditorPlugin
              anchorElem={floatingAnchorElem}
              isLinkEditMode={isLinkEditMode}
              setIsLinkEditMode={setIsLinkEditMode}
            />
            <FloatingTextFormatToolbarPlugin
              anchorElem={floatingAnchorElem}
              setIsLinkEditMode={setIsLinkEditMode}
            />
          </>
        )}
        {collaboration?.enabled &&
          (() => {
            const username = userInfo?.username || collaboration?.username;
            const userColor = userInfo?.userColor || collaboration?.userColor;
            const docId = collaboration?.documentId || documentUri || "local";

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
    </>
  );
}
