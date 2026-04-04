/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { LexicalCommandEmitter } from "../services/lexicalCommands";

describe("LexicalCommandEmitter", () => {
  let emitter: LexicalCommandEmitter;

  beforeEach(() => {
    emitter = new LexicalCommandEmitter();
  });

  describe("subscribe()", () => {
    it("returns an unsubscribe function", () => {
      const unsubscribe = emitter.subscribe(vi.fn());
      expect(typeof unsubscribe).toBe("function");
    });

    it("handler is called when command is emitted", () => {
      const handler = vi.fn();
      emitter.subscribe(handler);
      emitter.emit("format:bold");
      expect(handler).toHaveBeenCalledWith("format:bold");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("emit()", () => {
    it("calls all registered handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      emitter.subscribe(handler1);
      emitter.subscribe(handler2);

      emitter.emit("format:italic");

      expect(handler1).toHaveBeenCalledWith("format:italic");
      expect(handler2).toHaveBeenCalledWith("format:italic");
    });

    it("does nothing when no handlers are registered", () => {
      // Should not throw
      expect(() => emitter.emit("format:bold")).not.toThrow();
    });

    it("passes different commands correctly", () => {
      const handler = vi.fn();
      emitter.subscribe(handler);

      emitter.emit("format:bold");
      emitter.emit("format:italic");
      emitter.emit("insert:link");

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, "format:bold");
      expect(handler).toHaveBeenNthCalledWith(2, "format:italic");
      expect(handler).toHaveBeenNthCalledWith(3, "insert:link");
    });
  });

  describe("unsubscribe", () => {
    it("removes handler so it no longer receives events", () => {
      const handler = vi.fn();
      const unsubscribe = emitter.subscribe(handler);

      emitter.emit("cmd1");
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      emitter.emit("cmd2");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("only removes the specific handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = emitter.subscribe(handler1);
      emitter.subscribe(handler2);

      unsub1();
      emitter.emit("test");

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith("test");
    });

    it("is safe to call unsubscribe multiple times", () => {
      const handler = vi.fn();
      const unsubscribe = emitter.subscribe(handler);

      unsubscribe();
      unsubscribe(); // Should not throw

      emitter.emit("test");
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
