/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Stub module for the vscode API in webview test environment.
 * Used as a Vitest resolve alias so tests work cross-platform.
 */
export const Uri = {
  parse: (value: string): { toString: () => string } => ({
    toString: () => value,
  }),
};

/** The event emitter the extension's providers hold (a field, never fired here). */
export class EventEmitter<T> {
  private readonly listeners: Array<(value: T) => void> = [];

  /** Subscribes a listener. */
  readonly event = (listener: (value: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  /** Fires the event to every listener. */
  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  /** Forgets every listener. */
  dispose(): void {
    this.listeners.length = 0;
  }
}
