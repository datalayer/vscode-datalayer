/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for message type discriminators and structure validation.
 * Since messages.ts is purely type definitions, we test that objects
 * conforming to each interface have the expected shape at runtime.
 */

import type {
  ExtensionMessage,
  ExtensionToWebviewMessage,
  GetFileDataRequestMessage,
  HttpRequestMessage,
  HttpResponseMessage,
  InitMessage,
  InsertCellMessage,
  KernelReadyMessage,
  KernelSelectedMessage,
  KernelStartingMessage,
  KernelTerminatedMessage,
  OutlineItem,
  OutlineUpdateMessage,
  ReadyMessage,
  ThemeChangeMessage,
  WebviewToExtensionMessage,
} from "../types/messages";

describe("message types", () => {
  describe("ExtensionToWebviewMessage discriminator", () => {
    it("InitMessage has type 'init'", () => {
      const msg: InitMessage = {
        type: "init",
        body: { value: new Uint8Array([]) },
      };
      expect(msg.type).toBe("init");
    });

    it("ThemeChangeMessage has type 'theme-change'", () => {
      const msg: ThemeChangeMessage = {
        type: "theme-change",
        body: { theme: "dark" },
      };
      expect(msg.type).toBe("theme-change");
      expect(msg.body.theme).toBe("dark");
    });

    it("KernelSelectedMessage has type 'kernel-selected'", () => {
      const msg: KernelSelectedMessage = {
        type: "kernel-selected",
        body: { runtime: {} as KernelSelectedMessage["body"]["runtime"] },
      };
      expect(msg.type).toBe("kernel-selected");
    });

    it("KernelStartingMessage has type 'kernel-starting'", () => {
      const msg: KernelStartingMessage = {
        type: "kernel-starting",
        body: { runtime: {} as KernelStartingMessage["body"]["runtime"] },
      };
      expect(msg.type).toBe("kernel-starting");
    });

    it("KernelTerminatedMessage has type 'kernel-terminated'", () => {
      const msg: KernelTerminatedMessage = {
        type: "kernel-terminated",
      };
      expect(msg.type).toBe("kernel-terminated");
    });

    it("KernelReadyMessage has type 'kernel-ready'", () => {
      const msg: KernelReadyMessage = {
        type: "kernel-ready",
        body: {},
      };
      expect(msg.type).toBe("kernel-ready");
    });

    it("GetFileDataRequestMessage has type 'getFileData'", () => {
      const msg: GetFileDataRequestMessage = {
        type: "getFileData",
        requestId: "req-1",
        body: {},
      };
      expect(msg.type).toBe("getFileData");
      expect(msg.requestId).toBe("req-1");
    });

    it("InsertCellMessage has type 'insert-cell'", () => {
      const msg: InsertCellMessage = {
        type: "insert-cell",
        body: { cellType: "code", source: "print(1)" },
      };
      expect(msg.type).toBe("insert-cell");
      expect(msg.body.cellType).toBe("code");
      expect(msg.body.source).toBe("print(1)");
    });
  });

  describe("WebviewToExtensionMessage discriminator", () => {
    it("ReadyMessage has type 'ready'", () => {
      const msg: ReadyMessage = { type: "ready" };
      expect(msg.type).toBe("ready");
    });

    it("HttpRequestMessage has type 'http-request'", () => {
      const msg: HttpRequestMessage = {
        type: "http-request",
        requestId: "req-2",
        body: { url: "http://localhost", method: "GET" },
      };
      expect(msg.type).toBe("http-request");
      expect(msg.body.method).toBe("GET");
    });
  });

  describe("HttpResponseMessage", () => {
    it("includes status and headers", () => {
      const msg: HttpResponseMessage = {
        type: "http-response",
        requestId: "req-3",
        body: {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        },
      };
      expect(msg.body.status).toBe(200);
      expect(msg.body.headers["content-type"]).toBe("application/json");
    });
  });

  describe("OutlineItem", () => {
    it("supports nested children", () => {
      const item: OutlineItem = {
        id: "h1-1",
        label: "Introduction",
        type: "h1",
        level: 1,
        children: [
          {
            id: "h2-1",
            label: "Background",
            type: "h2",
            level: 2,
          },
        ],
      };
      expect(item.children).toHaveLength(1);
      expect(item.children![0].type).toBe("h2");
    });
  });

  describe("OutlineUpdateMessage", () => {
    it("contains document URI and items", () => {
      const msg: OutlineUpdateMessage = {
        type: "outline-update",
        documentUri: "file:///test.ipynb",
        items: [],
      };
      expect(msg.type).toBe("outline-update");
      expect(msg.documentUri).toBe("file:///test.ipynb");
    });
  });

  describe("discriminated union type narrowing", () => {
    it("can narrow ExtensionToWebviewMessage by type field", () => {
      const msg: ExtensionToWebviewMessage = {
        type: "theme-change",
        body: { theme: "light" },
      };

      if (msg.type === "theme-change") {
        expect(msg.body.theme).toBe("light");
      } else {
        // Should never reach here
        expect.unreachable("Expected theme-change");
      }
    });

    it("can narrow WebviewToExtensionMessage by type field", () => {
      const msg: WebviewToExtensionMessage = {
        type: "ready",
      };

      if (msg.type === "ready") {
        expect(msg.type).toBe("ready");
      } else {
        expect.unreachable("Expected ready");
      }
    });

    it("ExtensionMessage is a union of both directions", () => {
      const msg1: ExtensionMessage = {
        type: "init",
        body: { value: new Uint8Array([]) },
      };
      const msg2: ExtensionMessage = { type: "ready" };
      expect(msg1.type).toBe("init");
      expect(msg2.type).toBe("ready");
    });
  });
});
