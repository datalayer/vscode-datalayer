/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Command handlers for Lexical editor formatting and actions.
 * These commands are contributed to the editor/title menu for .lexical files.
 *
 * @module commands/lexical
 */

import * as vscode from "vscode";

// Store reference to active webview panels
const activeWebviews = new Map<string, vscode.Webview>();

/**
 * Register a webview for command handling
 * Called by LexicalProvider when webview is created
 */
export function registerLexicalWebview(uri: string, webview: vscode.Webview) {
  activeWebviews.set(uri, webview);
}

/**
 * Unregister a webview when it's disposed
 * Called by LexicalProvider when webview is disposed
 */
export function unregisterLexicalWebview(uri: string) {
  activeWebviews.delete(uri);
}

/**
 * Sends a formatting command to the active Lexical webview
 */
function sendLexicalCommand(command: string) {
  // Get the active text editor
  const activeEditor = vscode.window.activeTextEditor;

  // For custom editors, we need to find the webview differently
  // Try to find an active webview that matches a .lexical file
  if (activeWebviews.size === 0) {
    vscode.window.showWarningMessage("No Lexical document is currently open.");
    return;
  }

  // If there's only one webview, use it
  if (activeWebviews.size === 1) {
    const [webview] = Array.from(activeWebviews.values());
    webview.postMessage({
      type: "format-command",
      body: { command },
    });
    return;
  }

  // If multiple webviews, try to find one matching the active document
  if (activeEditor) {
    const uri = activeEditor.document.uri.toString();
    const webview = activeWebviews.get(uri);
    if (webview) {
      webview.postMessage({
        type: "format-command",
        body: { command },
      });
      return;
    }
  }

  // Fallback: show a warning
  vscode.window.showWarningMessage(
    "Please click on a Lexical document to use this command.",
  );
}

/**
 * Registers all Lexical editor commands
 */
export function registerLexicalCommands(
  context: vscode.ExtensionContext,
): void {
  // Undo/Redo
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.undo", () =>
      sendLexicalCommand("undo"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.redo", () =>
      sendLexicalCommand("redo"),
    ),
  );

  // Text formatting
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.bold", () =>
      sendLexicalCommand("bold"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.italic", () =>
      sendLexicalCommand("italic"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.underline", () =>
      sendLexicalCommand("underline"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.strikethrough", () =>
      sendLexicalCommand("strikethrough"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.code", () =>
      sendLexicalCommand("code"),
    ),
  );

  // Block types
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.heading1", () =>
      sendLexicalCommand("heading1"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.heading2", () =>
      sendLexicalCommand("heading2"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.heading3", () =>
      sendLexicalCommand("heading3"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.bulletList", () =>
      sendLexicalCommand("bulletList"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.numberedList", () =>
      sendLexicalCommand("numberedList"),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.quote", () =>
      sendLexicalCommand("quote"),
    ),
  );

  // Insert elements
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.lexical.link", () =>
      sendLexicalCommand("link"),
    ),
  );
}
