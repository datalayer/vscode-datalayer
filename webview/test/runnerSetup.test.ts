/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("vscode", () => ({
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

vi.mock("@datalayer/jupyter-react", () => ({
  formatResponse: vi.fn(
    (result: unknown, _format: string) => `formatted:${String(result)}`,
  ),
}));

import { formatResponse } from "@datalayer/jupyter-react";

import {
  createLexicalRunner,
  createNotebookRunner,
  setupToolExecutionListener,
  WebviewRunner,
} from "../services/runnerSetup";

describe("WebviewRunner", () => {
  const operations = {
    addCell: vi.fn(),
    deleteCell: vi.fn(),
    runCell: vi.fn(),
  };

  describe("getAvailableOperations", () => {
    it("returns all operation names", () => {
      const runner = new WebviewRunner(operations);
      expect(runner.getAvailableOperations()).toEqual([
        "addCell",
        "deleteCell",
        "runCell",
      ]);
    });

    it("returns empty array for empty operations", () => {
      const runner = new WebviewRunner({});
      expect(runner.getAvailableOperations()).toEqual([]);
    });
  });

  describe("hasOperation", () => {
    it("returns true for existing operation", () => {
      const runner = new WebviewRunner(operations);
      expect(runner.hasOperation("addCell")).toBe(true);
    });

    it("returns false for non-existing operation", () => {
      const runner = new WebviewRunner(operations);
      expect(runner.hasOperation("nonExistent")).toBe(false);
    });
  });

  describe("execute", () => {
    it("throws when executor is not available", async () => {
      const runner = new WebviewRunner(operations);
      await expect(runner.execute("addCell", {})).rejects.toThrow(
        "Executor not available for operation: addCell",
      );
    });

    it("executes via executor and formats result as toon", async () => {
      const executor = { execute: vi.fn().mockResolvedValue("result-data") };
      const runner = new WebviewRunner(operations, executor);

      const result = await runner.execute("addCell", { id: "1" });

      expect(executor.execute).toHaveBeenCalledWith("addCell", { id: "1" });
      expect(formatResponse).toHaveBeenCalledWith("result-data", "toon");
      expect(result).toBe("formatted:result-data");
    });

    it("returns raw result for json format", async () => {
      vi.mocked(formatResponse).mockReset();
      const executor = {
        execute: vi.fn().mockResolvedValue({ key: "value" }),
      };
      const runner = new WebviewRunner(operations, executor);

      const result = await runner.execute("addCell", {}, "json");

      expect(result).toEqual({ key: "value" });
      expect(formatResponse).not.toHaveBeenCalled();
    });

    it("defaults to toon format", async () => {
      const executor = { execute: vi.fn().mockResolvedValue("data") };
      const runner = new WebviewRunner(operations, executor);

      await runner.execute("addCell", {});

      expect(formatResponse).toHaveBeenCalledWith("data", "toon");
    });
  });
});

describe("createNotebookRunner", () => {
  it("creates a WebviewRunner with given operations and executor", () => {
    const ops = { run: vi.fn() };
    const executor = { execute: vi.fn() };
    const runner = createNotebookRunner(ops, executor);

    expect(runner).toBeInstanceOf(WebviewRunner);
    expect(runner.hasOperation("run")).toBe(true);
  });
});

describe("createLexicalRunner", () => {
  it("creates a WebviewRunner with given operations and executor", () => {
    const ops = { format: vi.fn() };
    const executor = { execute: vi.fn() };
    const runner = createLexicalRunner(ops, executor);

    expect(runner).toBeInstanceOf(WebviewRunner);
    expect(runner.hasOperation("format")).toBe(true);
  });
});

describe("setupToolExecutionListener", () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let vscodeAPI: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPostMessage = vi.fn();
    vscodeAPI = { postMessage: mockPostMessage };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a cleanup function", () => {
    const runner = new WebviewRunner({});
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("handles tool-execution message for known operation", async () => {
    const executor = { execute: vi.fn().mockResolvedValue("exec-result") };
    const runner = new WebviewRunner({ myOp: vi.fn() }, executor);
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);

    const messageEvent = new MessageEvent("message", {
      data: {
        type: "tool-execution",
        requestId: "req-1",
        operationName: "myOp",
        args: { foo: "bar" },
        format: "json",
      },
    });
    window.dispatchEvent(messageEvent);

    // Wait for async execution
    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: "tool-execution-response",
        requestId: "req-1",
        result: "exec-result",
      });
    });

    cleanup();
  });

  it("handles unknown operation with error response", async () => {
    const runner = new WebviewRunner({ knownOp: vi.fn() });
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);

    const messageEvent = new MessageEvent("message", {
      data: {
        type: "tool-execution",
        requestId: "req-2",
        operationName: "unknownOp",
        args: {},
      },
    });
    window.dispatchEvent(messageEvent);

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool-execution-response",
          requestId: "req-2",
          error: expect.stringContaining("Unknown operation: unknownOp"),
        }),
      );
    });

    cleanup();
  });

  it("handles executor error with error response", async () => {
    const executor = {
      execute: vi.fn().mockRejectedValue(new Error("execution failed")),
    };
    const runner = new WebviewRunner({ failOp: vi.fn() }, executor);
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);

    const messageEvent = new MessageEvent("message", {
      data: {
        type: "tool-execution",
        requestId: "req-3",
        operationName: "failOp",
        args: {},
      },
    });
    window.dispatchEvent(messageEvent);

    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: "tool-execution-response",
        requestId: "req-3",
        error: "execution failed",
      });
    });

    cleanup();
  });

  it("handles switch-to-pyodide message", () => {
    const runner = new WebviewRunner({});
    const mutableServiceManager = { updateToPyodide: vi.fn() };
    const cleanup = setupToolExecutionListener(
      runner,
      vscodeAPI,
      mutableServiceManager,
    );

    const messageEvent = new MessageEvent("message", {
      data: { type: "switch-to-pyodide" },
    });
    window.dispatchEvent(messageEvent);

    expect(mutableServiceManager.updateToPyodide).toHaveBeenCalled();
    cleanup();
  });

  it("defaults to toon format when format not specified", async () => {
    const executor = { execute: vi.fn().mockResolvedValue("result") };
    const runner = new WebviewRunner({ op: vi.fn() }, executor);
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);

    const messageEvent = new MessageEvent("message", {
      data: {
        type: "tool-execution",
        requestId: "req-4",
        operationName: "op",
        args: {},
        // no format specified
      },
    });
    window.dispatchEvent(messageEvent);

    await vi.waitFor(() => {
      expect(formatResponse).toHaveBeenCalledWith("result", "toon");
    });

    cleanup();
  });

  it("removes listener on cleanup", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const runner = new WebviewRunner({});
    const cleanup = setupToolExecutionListener(runner, vscodeAPI);
    cleanup();
    expect(spy).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
