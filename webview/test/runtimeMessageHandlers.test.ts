/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type {
  KernelSelectedMessage,
  KernelStartingMessage,
  RuntimeSelectedMessage,
  SetRuntimeMessage,
} from "../types/messages";
import {
  createRuntimeMessageHandlers,
  handleKernelStarting,
  handleRuntimeExpired,
  handleRuntimeSelected,
  handleRuntimeTerminated,
  handleSetRuntime,
} from "../utils/runtimeMessageHandlers";

describe("runtimeMessageHandlers", () => {
  describe("handleKernelStarting()", () => {
    it("sets kernel initializing to true", () => {
      const setKernelInitializing = vi.fn();
      const message = {
        type: "kernel-starting",
        body: { runtime: {} },
      } as KernelStartingMessage;

      handleKernelStarting(message, setKernelInitializing);
      expect(setKernelInitializing).toHaveBeenCalledWith(true);
    });
  });

  describe("handleRuntimeSelected()", () => {
    it("calls selectRuntime with the runtime from the message", () => {
      const selectRuntime = vi.fn();
      const runtime = { ingress: "http://localhost:8888", token: "abc" };
      const message = {
        type: "kernel-selected",
        body: { runtime },
      } as KernelSelectedMessage;

      handleRuntimeSelected(message, selectRuntime);
      expect(selectRuntime).toHaveBeenCalledWith(runtime);
    });

    it("calls updateStore when provided", () => {
      const selectRuntime = vi.fn();
      const updateStore = vi.fn();
      const runtime = { ingress: "http://localhost:8888" };
      const message = {
        type: "kernel-selected",
        body: { runtime },
      } as KernelSelectedMessage;

      handleRuntimeSelected(message, selectRuntime, updateStore);
      expect(updateStore).toHaveBeenCalledWith(runtime);
    });

    it("clears kernel initializing for local/remote kernels", () => {
      const selectRuntime = vi.fn();
      const setKernelInitializing = vi.fn();
      const runtime = { ingress: "http://localhost:8888" };
      const message = {
        type: "kernel-selected",
        body: { runtime },
      } as KernelSelectedMessage;

      handleRuntimeSelected(
        message,
        selectRuntime,
        undefined,
        setKernelInitializing,
      );
      expect(setKernelInitializing).toHaveBeenCalledWith(false);
    });

    it("keeps kernel initializing for pyodide kernels", () => {
      const selectRuntime = vi.fn();
      const setKernelInitializing = vi.fn();
      const runtime = { ingress: "http://pyodide-local" };
      const message = {
        type: "kernel-selected",
        body: { runtime },
      } as KernelSelectedMessage;

      handleRuntimeSelected(
        message,
        selectRuntime,
        undefined,
        setKernelInitializing,
      );
      expect(setKernelInitializing).not.toHaveBeenCalled();
    });

    it("keeps kernel initializing for datalayer cloud kernels", () => {
      const selectRuntime = vi.fn();
      const setKernelInitializing = vi.fn();
      const runtime = { ingress: "https://example.datalayer.run/api" };
      const message = {
        type: "kernel-selected",
        body: { runtime },
      } as KernelSelectedMessage;

      handleRuntimeSelected(
        message,
        selectRuntime,
        undefined,
        setKernelInitializing,
      );
      expect(setKernelInitializing).not.toHaveBeenCalled();
    });

    it("does nothing when body.runtime is falsy", () => {
      const selectRuntime = vi.fn();
      const message = {
        type: "runtime-selected",
        body: {},
      } as RuntimeSelectedMessage;

      handleRuntimeSelected(message, selectRuntime);
      expect(selectRuntime).not.toHaveBeenCalled();
    });
  });

  describe("handleRuntimeTerminated()", () => {
    it("calls selectRuntime with undefined", () => {
      const selectRuntime = vi.fn();
      handleRuntimeTerminated(selectRuntime);
      expect(selectRuntime).toHaveBeenCalledWith(undefined);
    });

    it("calls updateStore with undefined when provided", () => {
      const selectRuntime = vi.fn();
      const updateStore = vi.fn();
      handleRuntimeTerminated(selectRuntime, updateStore);
      expect(updateStore).toHaveBeenCalledWith(undefined);
    });
  });

  describe("handleRuntimeExpired()", () => {
    it("calls selectRuntime with undefined after delay", () => {
      vi.useFakeTimers();
      const selectRuntime = vi.fn();
      handleRuntimeExpired(selectRuntime);
      expect(selectRuntime).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(selectRuntime).toHaveBeenCalledWith(undefined);
      vi.useRealTimers();
    });

    it("supports custom delay", () => {
      vi.useFakeTimers();
      const selectRuntime = vi.fn();
      handleRuntimeExpired(selectRuntime, undefined, 500);
      vi.advanceTimersByTime(499);
      expect(selectRuntime).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(selectRuntime).toHaveBeenCalledWith(undefined);
      vi.useRealTimers();
    });

    it("calls updateStore with undefined after delay", () => {
      vi.useFakeTimers();
      const selectRuntime = vi.fn();
      const updateStore = vi.fn();
      handleRuntimeExpired(selectRuntime, updateStore);
      vi.advanceTimersByTime(100);
      expect(updateStore).toHaveBeenCalledWith(undefined);
      vi.useRealTimers();
    });
  });

  describe("handleSetRuntime()", () => {
    it("creates a RuntimeJSON and calls selectRuntime", () => {
      const selectRuntime = vi.fn();
      const message = {
        type: "set-runtime",
        body: { baseUrl: "http://localhost:8888", token: "mytoken" },
      } as SetRuntimeMessage;

      handleSetRuntime(message, selectRuntime);
      expect(selectRuntime).toHaveBeenCalledTimes(1);
      const arg = selectRuntime.mock.calls[0][0];
      expect(arg.ingress).toBe("http://localhost:8888");
      expect(arg.token).toBe("mytoken");
      expect(arg.uid).toBe("local-runtime");
    });

    it("uses empty token when not provided", () => {
      const selectRuntime = vi.fn();
      const message = {
        type: "set-runtime",
        body: { baseUrl: "http://localhost:8888" },
      } as SetRuntimeMessage;

      handleSetRuntime(message, selectRuntime);
      const arg = selectRuntime.mock.calls[0][0];
      expect(arg.token).toBe("");
    });

    it("does nothing when baseUrl is empty", () => {
      const selectRuntime = vi.fn();
      const message = {
        type: "set-runtime",
        body: { baseUrl: "" },
      } as SetRuntimeMessage;

      handleSetRuntime(message, selectRuntime);
      expect(selectRuntime).not.toHaveBeenCalled();
    });

    it("calls updateStore when provided", () => {
      const selectRuntime = vi.fn();
      const updateStore = vi.fn();
      const message = {
        type: "set-runtime",
        body: { baseUrl: "http://localhost:8888" },
      } as SetRuntimeMessage;

      handleSetRuntime(message, selectRuntime, updateStore);
      expect(updateStore).toHaveBeenCalledTimes(1);
    });
  });

  describe("createRuntimeMessageHandlers()", () => {
    it("returns an object with all handler methods", () => {
      const handlers = createRuntimeMessageHandlers(vi.fn(), vi.fn());
      expect(typeof handlers.onKernelStarting).toBe("function");
      expect(typeof handlers.onRuntimeSelected).toBe("function");
      expect(typeof handlers.onRuntimeTerminated).toBe("function");
      expect(typeof handlers.onRuntimeExpired).toBe("function");
      expect(typeof handlers.onSetRuntime).toBe("function");
    });

    it("onKernelStarting delegates to handleKernelStarting", () => {
      const setKernelInitializing = vi.fn();
      const handlers = createRuntimeMessageHandlers(
        vi.fn(),
        setKernelInitializing,
      );
      const message = {
        type: "kernel-starting",
        body: { runtime: {} },
      } as KernelStartingMessage;
      handlers.onKernelStarting(message);
      expect(setKernelInitializing).toHaveBeenCalledWith(true);
    });

    it("onRuntimeTerminated delegates to handleRuntimeTerminated", () => {
      const selectRuntime = vi.fn();
      const handlers = createRuntimeMessageHandlers(selectRuntime, vi.fn());
      handlers.onRuntimeTerminated();
      expect(selectRuntime).toHaveBeenCalledWith(undefined);
    });

    it("onSetRuntime delegates to handleSetRuntime", () => {
      const selectRuntime = vi.fn();
      const handlers = createRuntimeMessageHandlers(selectRuntime, vi.fn());
      const message = {
        type: "set-runtime",
        body: { baseUrl: "http://localhost:9999" },
      } as SetRuntimeMessage;
      handlers.onSetRuntime(message);
      expect(selectRuntime).toHaveBeenCalled();
    });
  });
});
