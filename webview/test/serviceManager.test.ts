/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("vscode", () => ({
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

vi.mock("../services/messageHandler", () => ({
  MessageHandler: {
    instance: {
      request: vi.fn(),
      send: vi.fn(),
      on: vi.fn(() => ({ dispose: vi.fn() })),
    },
  },
  vsCodeAPI: { postMessage: vi.fn() },
}));

vi.mock("../../src/constants/kernelConstants", () => ({
  isLocalKernelUrl: vi.fn(
    (url: string) =>
      url.includes("local-kernel-") && url.includes(".localhost"),
  ),
  LOCAL_KERNEL_URL_PREFIX: "local-kernel-",
}));

vi.mock("@jupyterlab/services", () => ({
  ServerConnection: {
    makeSettings: vi.fn(() => ({
      baseUrl: "http://localhost:8888/",
      appUrl: "",
      wsUrl: "ws://localhost:8888/",
      token: "",
      init: {},
      fetch: globalThis.fetch,
      WebSocket: globalThis.WebSocket,
      appendToken: false,
    })),
  },
  ServiceManager: vi.fn(),
}));

import { MessageHandler } from "../services/messageHandler";
import { ProxiedWebSocket } from "../services/serviceManager";

describe("ProxiedWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the static counter between tests for predictable IDs
    // @ts-ignore - accessing private static
    ProxiedWebSocket._clientCounter = 0;
  });

  describe("constructor", () => {
    it("creates a websocket with valid ws URL", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(ws.url).toBe("ws://example.com/ws");
      expect(ws.clientId).toBe("ws-0");
      expect(ws.protocol).toBe("");
      expect(ws.binaryType).toBe("blob");
    });

    it("creates a websocket with valid wss URL", () => {
      const ws = new ProxiedWebSocket("wss://example.com/ws");
      expect(ws.url).toBe("wss://example.com/ws");
    });

    it("increments client IDs", () => {
      const ws1 = new ProxiedWebSocket("ws://example.com/a");
      const ws2 = new ProxiedWebSocket("ws://example.com/b");
      expect(ws1.clientId).toBe("ws-0");
      expect(ws2.clientId).toBe("ws-1");
    });

    it("throws on invalid URL scheme", () => {
      expect(() => new ProxiedWebSocket("http://example.com/ws")).toThrow(
        "The URL's scheme must be either 'ws' or 'wss'",
      );
    });

    it("throws on URL with fragment", () => {
      expect(
        () => new ProxiedWebSocket("ws://example.com/ws#fragment"),
      ).toThrow("Fragment identifiers are not allowed");
    });

    it("throws on duplicate protocols", () => {
      expect(
        () => new ProxiedWebSocket("ws://example.com/ws", ["proto", "proto"]),
      ).toThrow("The subprotocol 'proto' is duplicated");
    });

    it("filters v1.kernel.websocket.jupyter.org protocol", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws", [
        "v1.kernel.websocket.jupyter.org",
        "custom-proto",
      ]);
      expect(ws.protocol).toBe("custom-proto");
    });

    it("accepts a string protocol", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws", "my-protocol");
      expect(ws.protocol).toBe("my-protocol");
    });

    it("sends websocket-open on construction", () => {
      const sendMock = MessageHandler.instance.send as ReturnType<typeof vi.fn>;
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(sendMock).toHaveBeenCalledWith({
        type: "websocket-open",
        id: ws.clientId,
        body: {
          origin: "ws://example.com/ws",
          protocol: "",
        },
      });
    });

    it("opens synchronously for local kernel URLs", () => {
      const ws = new ProxiedWebSocket("ws://local-kernel-abc.localhost/ws");
      expect(ws.readyState).toBe(ProxiedWebSocket.OPEN);
    });
  });

  describe("static constants", () => {
    it("has correct WebSocket state constants", () => {
      expect(ProxiedWebSocket.CONNECTING).toBe(0);
      expect(ProxiedWebSocket.OPEN).toBe(1);
      expect(ProxiedWebSocket.CLOSING).toBe(2);
      expect(ProxiedWebSocket.CLOSED).toBe(3);
    });
  });

  describe("event listeners", () => {
    it("registers and dispatches event listeners", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const listener = vi.fn();
      ws.addEventListener("message", listener);

      const event = new MessageEvent("message", { data: "test" });
      ws.dispatchEvent(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it("removes event listeners", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const listener = vi.fn();
      ws.addEventListener("message", listener);
      ws.removeEventListener("message", listener);

      ws.dispatchEvent(new MessageEvent("message", { data: "test" }));
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners for the same event", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      ws.addEventListener("open", listener1);
      ws.addEventListener("open", listener2);

      ws.dispatchEvent(new Event("open"));
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("ignores non-function listeners", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      // @ts-ignore - testing invalid input
      ws.addEventListener("open", "not-a-function");
      expect(ws.dispatchEvent(new Event("open"))).toBe(false);
    });

    it("returns false when no listeners for event type", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(ws.dispatchEvent(new Event("custom"))).toBe(false);
    });
  });

  describe("onopen/onmessage/onclose/onerror setters", () => {
    it("sets and gets onopen listener", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const fn = vi.fn();
      ws.onopen = fn;
      ws.dispatchEvent(new Event("open"));
      expect(fn).toHaveBeenCalled();
    });

    it("sets and gets onmessage listener", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const fn = vi.fn();
      ws.onmessage = fn;
      ws.dispatchEvent(new MessageEvent("message", { data: "hi" }));
      expect(fn).toHaveBeenCalled();
    });

    it("sets and gets onclose listener", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const fn = vi.fn();
      ws.onclose = fn;
      ws.dispatchEvent(new CloseEvent("close"));
      expect(fn).toHaveBeenCalled();
    });

    it("sets and gets onerror listener", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const fn = vi.fn();
      ws.onerror = fn;
      ws.dispatchEvent(new Event("error"));
      expect(fn).toHaveBeenCalled();
    });

    it("replaces old listener when setting new one", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      ws.onopen = fn1;
      ws.onopen = fn2;
      ws.dispatchEvent(new Event("open"));
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });
  });

  describe("send", () => {
    it("sends data via MessageHandler", () => {
      const sendMock = MessageHandler.instance.send as ReturnType<typeof vi.fn>;
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      // Manually set readyState to OPEN
      // @ts-ignore - accessing private
      ws._readyState = ProxiedWebSocket.OPEN;
      sendMock.mockClear();

      ws.send("test message");

      expect(sendMock).toHaveBeenCalledWith({
        type: "websocket-message",
        id: ws.clientId,
        body: {
          origin: "ws://example.com/ws",
          data: "test message",
        },
      });
    });

    it("throws when sending on a closed websocket", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      // @ts-ignore - accessing private
      ws._readyState = ProxiedWebSocket.CLOSED;
      expect(() => ws.send("data")).toThrow(
        "WebSocket is already in CLOSING or CLOSED state",
      );
    });

    it("throws when sending on a closing websocket", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      // @ts-ignore - accessing private
      ws._readyState = ProxiedWebSocket.CLOSING;
      expect(() => ws.send("data")).toThrow(
        "WebSocket is already in CLOSING or CLOSED state",
      );
    });
  });

  describe("close", () => {
    it("throws on invalid close code", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(() => ws.close(999)).toThrow(
        "The code must be either 1000, or between 3000 and 4999",
      );
    });

    it("accepts code 1000", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(() => ws.close(1000)).not.toThrow();
    });

    it("accepts code 3000", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(() => ws.close(3000)).not.toThrow();
    });

    it("accepts code 4999", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(() => ws.close(4999)).not.toThrow();
    });

    it("throws when reason is too long", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      const longReason = "a".repeat(200);
      expect(() => ws.close(1000, longReason)).toThrow(
        "The message must not be greater than 123 bytes",
      );
    });

    it("accepts a short reason", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(() => ws.close(1000, "bye")).not.toThrow();
    });

    it("is a no-op when already closed", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      // @ts-ignore - accessing private
      ws._readyState = ProxiedWebSocket.CLOSED;
      const sendMock = MessageHandler.instance.send as ReturnType<typeof vi.fn>;
      sendMock.mockClear();
      ws.close();
      // Should not send websocket-close message
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("instance constants", () => {
    it("has correct instance-level WebSocket state constants", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(ws.CONNECTING).toBe(0);
      expect(ws.OPEN).toBe(1);
      expect(ws.CLOSING).toBe(2);
      expect(ws.CLOSED).toBe(3);
    });

    it("has bufferedAmount of 0", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(ws.bufferedAmount).toBe(0);
    });

    it("has empty extensions", () => {
      const ws = new ProxiedWebSocket("ws://example.com/ws");
      expect(ws.extensions).toBe("");
    });
  });
});
