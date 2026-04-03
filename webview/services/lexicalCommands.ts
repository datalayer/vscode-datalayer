/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Event emitter for Lexical formatting commands from VS Code.
 * Allows the extension to trigger format commands in the webview editor.
 *
 * @module services/lexicalCommands
 */

/**
 * Function type for handling Lexical commands.
 */
export type CommandHandler = (command: string) => void;

/**
 * Event emitter for Lexical editor commands.
 * Manages subscriptions and broadcasts commands to all handlers.
 */
export class LexicalCommandEmitter {
  /**
   * Array of registered command handler functions.
   */
  private handlers: CommandHandler[] = [];

  /**
   * Subscribe to command events.
   * @param handler - Callback invoked when a command is emitted.
   *
   * @returns Unsubscribe function to remove the handler.
   */
  subscribe(handler: CommandHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Emit a command to all subscribers.
   * @param command - The command string to broadcast.
   */
  emit(command: string): void {
    this.handlers.forEach((handler) => handler(command));
  }
}

/**
 * Singleton instance of LexicalCommandEmitter for broadcasting formatting commands
 * From the VS Code extension to the Lexical editor webview.
 *
 */
export const lexicalCommands = new LexicalCommandEmitter();
