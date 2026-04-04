/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

const mockPostMessage = vi.fn();
const mockGetState = vi.fn(() => ({}));
const mockSetState = vi.fn();

// Must be set before module import since messageHandler.ts calls acquireVsCodeApi() at module level
(globalThis as unknown).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
});

const { MessageHandler } = await import("../services/messageHandler");

describe("MessageHandler", () => {
  let handler: MessageHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    handler = new MessageHandler();
  });

  afterEach(() => {
    handler.dispose();
    vi.useRealTimers();
  });

  describe("send", () => {
    it("posts message via vscode postMessage", () => {
      handler.send({ type: "test", data: 42 });
      expect(mockPostMessage).toHaveBeenCalledWith({ type: "test", data: 42 });
    });

    it("sends any type of message", () => {
      handler.send("string-message");
      expect(mockPostMessage).toHaveBeenCalledWith("string-message");
    });
  });

  describe("request", () => {
    it("sends message with requestId via postMessage", () => {
      const promise = handler.request({ type: "fetch-data" });
      // Catch the rejection that will happen when afterEach disposes pending requests
      promise.catch(() => {});
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "fetch-data",
          requestId: expect.stringMatching(/^req-\d+$/),
        }),
      );
    });

    it("rejects on timeout", async () => {
      const promise = handler.request({ type: "slow" }, 100);
      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow("Request timed out after 100ms");
    });

    it("resolves when response message arrives", async () => {
      const promise = handler.request<unknown, string>({ type: "ask" });

      const call = mockPostMessage.mock.calls[0][0];
      const requestId = call.requestId;

      const event = new MessageEvent("message", {
        data: { requestId, body: "response-value" },
      });
      window.dispatchEvent(event);

      await expect(promise).resolves.toBe("response-value");
    });

    it("rejects when response has error field", async () => {
      const promise = handler.request({ type: "fail" });

      const call = mockPostMessage.mock.calls[0][0];
      const requestId = call.requestId;

      const event = new MessageEvent("message", {
        data: { requestId, error: "something went wrong" },
      });
      window.dispatchEvent(event);

      await expect(promise).rejects.toThrow("something went wrong");
    });
  });

  describe("on", () => {
    it("registers a handler that receives broadcast messages", () => {
      const callback = vi.fn();
      handler.on(callback);

      const event = new MessageEvent("message", {
        data: { type: "broadcast", value: 123 },
      });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalledWith({ type: "broadcast", value: 123 });
    });

    it("returns a disposable that unregisters the handler", () => {
      const callback = vi.fn();
      const disposable = handler.on(callback);

      disposable.dispose();

      const event = new MessageEvent("message", {
        data: { type: "after-dispose" },
      });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it("supports multiple handlers simultaneously", () => {
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      handler.on(callbackA);
      handler.on(callbackB);

      const event = new MessageEvent("message", {
        data: { type: "multi" },
      });
      window.dispatchEvent(event);

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });
  });

  describe("onMessage", () => {
    it("registers a handler identical to on()", () => {
      const callback = vi.fn();
      handler.onMessage(callback);

      const event = new MessageEvent("message", {
        data: { type: "via-onMessage" },
      });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalledWith({ type: "via-onMessage" });
    });

    it("returns a disposable", () => {
      const callback = vi.fn();
      const disposable = handler.onMessage(callback);

      disposable.dispose();

      const event = new MessageEvent("message", {
        data: { type: "disposed" },
      });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("clearPendingRequests", () => {
    it("rejects all pending requests with cancellation error", async () => {
      const promise = handler.request({ type: "will-cancel" });

      handler.clearPendingRequests();

      await expect(promise).rejects.toThrow("Request cancelled");
    });
  });

  describe("dispose", () => {
    it("clears pending requests and handlers", async () => {
      const callback = vi.fn();
      handler.on(callback);
      const promise = handler.request({ type: "will-dispose" });

      handler.dispose();

      await expect(promise).rejects.toThrow("Request cancelled");

      const event = new MessageEvent("message", {
        data: { type: "after-dispose" },
      });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("singleton", () => {
    it("MessageHandler.instance is defined", () => {
      expect(MessageHandler.instance).toBeInstanceOf(MessageHandler);
    });
  });
});
