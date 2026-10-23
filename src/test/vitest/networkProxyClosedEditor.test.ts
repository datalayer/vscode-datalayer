/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * An answer arriving after its notebook editor was closed is dropped (there
 * is nobody to tell), and a socket streaming to that editor is closed.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/logging/loggers", () => ({
  ServiceLoggers: {
    runtime: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  },
}));

import { NotebookNetworkService } from "../../services/network/networkProxy";

/** A panel whose webview is gone, as VS Code's is once disposed. */
const closedPanel = {
  get webview(): never {
    throw new Error("Webview is disposed");
  },
};

type Internals = {
  postMessage: (
    panel: unknown,
    type: string,
    body: unknown,
    id?: string,
  ) => void;
  _websockets: Map<string, { close: () => void }>;
};

describe("NotebookNetworkService and a closed editor", () => {
  it("drops an HTTP answer instead of throwing", () => {
    const service = new NotebookNetworkService() as unknown as Internals;
    expect(() =>
      service.postMessage(closedPanel, "http-response", {}, "r1"),
    ).not.toThrow();
  });

  it("closes the socket that streamed to it", () => {
    const service = new NotebookNetworkService() as unknown as Internals;
    const close = vi.fn();
    service._websockets.set("ws1", { close });
    service.postMessage(closedPanel, "websocket-message", {}, "ws1");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("still posts to an open editor", () => {
    const service = new NotebookNetworkService() as unknown as Internals;
    const postMessage = vi.fn(() => Promise.resolve(true));
    service.postMessage(
      { webview: { postMessage } },
      "http-response",
      { ok: true },
      "r2",
    );
    expect(postMessage).toHaveBeenCalledWith({
      type: "http-response",
      body: { ok: true },
      requestId: "r2",
    });
  });
});
