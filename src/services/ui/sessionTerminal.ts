/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * What a coding agent ran, in the editor's Terminal panel: one read-only
 * terminal per session, named *Datalayer: <session title>*, written as the
 * session's terminal displays arrive — the command echoed with its prompt,
 * the output as it streams, the exit when it comes — and reused for the
 * session's next command. Typing is answered in a sentence: the commands
 * are decided in the chat, never here. Disposed with the session's end.
 *
 * @module services/ui/sessionTerminal
 */

import * as vscode from "vscode";

import {
  TERMINAL_WORDS,
  type TerminalShown,
  terminalWrites,
  type TerminalWritten,
} from "../../chat/sessionDisplays";

/** One session's terminal and what was written to it. */
interface SessionTerminalEntry {
  terminal: vscode.Terminal;
  emitter: vscode.EventEmitter<string>;
  /** Each terminal display's progress, by its id. */
  written: Map<string, TerminalWritten>;
  /** The pty is open: writes reach it; before, they wait. */
  opened: boolean;
  queued: string[];
}

/**
 * The sessions' terminals.
 */
export class SessionTerminals implements vscode.Disposable {
  private readonly terminals = new Map<string, SessionTerminalEntry>();

  /**
   * Writes a terminal display to the session's terminal, created on its
   * first display and shown without taking the focus.
   *
   * @param sessionKey - Which session.
   * @param title - Its title, for the terminal's name.
   * @param display - The terminal display as it stands now.
   */
  public write(
    sessionKey: string,
    title: string,
    display: TerminalShown,
  ): void {
    const entry =
      this.terminals.get(sessionKey) ?? this.create(sessionKey, title);
    const { chunks, next } = terminalWrites(
      entry.written.get(display.terminalId),
      display,
    );
    entry.written.set(display.terminalId, next);
    if (chunks.length === 0) {
      return;
    }
    for (const chunk of chunks) {
      if (entry.opened) {
        entry.emitter.fire(chunk);
      } else {
        entry.queued.push(chunk);
      }
    }
    entry.terminal.show(true);
  }

  /**
   * Disposes the session's terminal, when the session ends.
   *
   * @param sessionKey - Which session.
   */
  public end(sessionKey: string): void {
    const entry = this.terminals.get(sessionKey);
    if (entry) {
      this.terminals.delete(sessionKey);
      entry.terminal.dispose();
      entry.emitter.dispose();
    }
  }

  /** The sessions that have a terminal. */
  public get sessions(): string[] {
    return [...this.terminals.keys()];
  }

  /**
   * Makes the session's terminal, its pty read-only.
   *
   * @param sessionKey - Which session.
   * @param title - Its title, for the terminal's name.
   *
   * @returns The entry, kept by session.
   */
  private create(sessionKey: string, title: string): SessionTerminalEntry {
    const emitter = new vscode.EventEmitter<string>();
    const entry: SessionTerminalEntry = {
      terminal: undefined as unknown as vscode.Terminal,
      emitter,
      written: new Map(),
      opened: false,
      queued: [],
    };
    const pty: vscode.Pseudoterminal = {
      onDidWrite: emitter.event,
      open: () => {
        entry.opened = true;
        for (const chunk of entry.queued) {
          emitter.fire(chunk);
        }
        entry.queued = [];
      },
      close: () => {
        // Closed by the person: forgotten, made again on the next display.
        if (this.terminals.get(sessionKey) === entry) {
          this.terminals.delete(sessionKey);
        }
        emitter.dispose();
      },
      handleInput: (data: string) => {
        // Read-only: typing is answered, never run.
        if (data.includes("\r") || data.includes("\n")) {
          emitter.fire(`\r\n${TERMINAL_WORDS.readOnly}\r\n`);
        }
      },
    };
    entry.terminal = vscode.window.createTerminal({
      name: TERMINAL_WORDS.name(title || sessionKey),
      pty,
    });
    this.terminals.set(sessionKey, entry);
    return entry;
  }

  /** @inheritdoc */
  public dispose(): void {
    for (const key of [...this.terminals.keys()]) {
      this.end(key);
    }
  }
}
