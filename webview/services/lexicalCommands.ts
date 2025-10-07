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

type CommandHandler = (command: string) => void;

class LexicalCommandEmitter {
  private handlers: CommandHandler[] = [];

  /**
   * Subscribe to command events
   */
  subscribe(handler: CommandHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Emit a command to all subscribers
   */
  emit(command: string): void {
    this.handlers.forEach((handler) => handler(command));
  }
}

export const lexicalCommands = new LexicalCommandEmitter();
