/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Types and interfaces for document services.
 * Defines shared context and handler patterns for document providers.
 *
 * @module services/document/types
 */

import * as vscode from "vscode";
import type { ExtensionMessage } from "../../types/vscode/messages";

/**
 * Context object passed to all message handlers.
 * Contains everything needed to handle a message from a webview.
 */
export interface DocumentContext {
  /**
   * URI of the document (as string for map keys).
   */
  documentUri: string;

  /**
   * The webview that sent the message.
   * Always available for both NotebookProvider and CustomEditorProvider.
   */
  webview: vscode.Webview;

  /**
   * The webview panel (for CustomEditorProvider).
   * Optional because NotebookProvider doesn't have panels.
   */
  webviewPanel?: vscode.WebviewPanel;

  /**
   * Whether this document is from Datalayer (remote) or local file.
   */
  isFromDatalayer: boolean;
}

/**
 * Message handler function signature.
 * Handlers receive the message and context, and can be async.
 */
export type MessageHandler = (
  message: ExtensionMessage,
  context: DocumentContext,
) => Promise<void> | void;

/**
 * Map of message types to their handlers.
 */
export type MessageHandlerMap = Map<string, MessageHandler>;
