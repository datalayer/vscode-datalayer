/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("vscode", () => ({
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

const mockPostMessage = vi.hoisted(() => vi.fn());

vi.mock("../services/messageHandler", () => ({
  vsCodeAPI: { postMessage: mockPostMessage },
}));

import { LSPCompletionProvider } from "../services/completion/lspProvider";

describe("LSPCompletionProvider", () => {
  let provider: LSPCompletionProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LSPCompletionProvider();
  });

  afterEach(() => {
    provider.dispose();
  });

  describe("properties", () => {
    it("has correct name", () => {
      expect(provider.name).toBe("LSP (Python & Markdown)");
    });

    it("has correct identifier", () => {
      expect(provider.identifier).toBe("@datalayer/lsp-provider");
    });

    it("has schema with default configuration", () => {
      const schema = provider.schema;
      expect(schema.default.debouncerDelay).toBe(100);
      expect(schema.default.timeout).toBe(1000);
    });
  });

  describe("offsetToPosition", () => {
    it("converts offset 0 to line 0, character 0", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("hello", 0);
      expect(pos).toEqual({ line: 0, character: 0 });
    });

    it("converts offset within first line", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("hello world", 5);
      expect(pos).toEqual({ line: 0, character: 5 });
    });

    it("handles newlines correctly", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("line1\nline2\nline3", 8);
      // offset 8: l(0) i(1) n(2) e(3) 1(4) \n(5=line break) l(6->0) i(7->1) n(8->2)
      expect(pos).toEqual({ line: 1, character: 2 });
    });

    it("handles offset at newline character", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("abc\ndef", 4);
      // a(0) b(1) c(2) \n(3=line break) d(4->0)
      expect(pos).toEqual({ line: 1, character: 0 });
    });

    it("handles empty text", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("", 0);
      expect(pos).toEqual({ line: 0, character: 0 });
    });

    it("handles offset beyond text length", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("hi", 10);
      expect(pos).toEqual({ line: 0, character: 2 });
    });

    it("handles multiple newlines", () => {
      // @ts-ignore - accessing private method
      const pos = provider.offsetToPosition("a\nb\nc\nd", 6);
      // a(0) \n(1) b(2,line1,char0) \n(3) c(4,line2,char0) \n(5) d(6,line3,char0)
      expect(pos).toEqual({ line: 3, character: 0 });
    });
  });

  describe("detectCellLanguage", () => {
    it("returns unknown when no widget", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({});
      expect(lang).toBe("unknown");
    });

    it("returns unknown when no content", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({ widget: {} });
      expect(lang).toBe("unknown");
    });

    it("returns unknown when no activeCell", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({
        widget: { content: {} },
      });
      expect(lang).toBe("unknown");
    });

    it("returns markdown for markdown cells", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({
        widget: {
          content: {
            activeCell: { model: { type: "markdown" } },
          },
        },
      });
      expect(lang).toBe("markdown");
    });

    it("returns python for code cells with text/x-python mime", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({
        widget: {
          content: {
            activeCell: {
              model: { type: "code", mimeType: "text/x-python" },
            },
          },
        },
      });
      expect(lang).toBe("python");
    });

    it("returns python for code cells with text/x-ipython mime", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({
        widget: {
          content: {
            activeCell: {
              model: { type: "code", mimeType: "text/x-ipython" },
            },
          },
        },
      });
      expect(lang).toBe("python");
    });

    it("returns unknown for code cells with non-python mime", () => {
      // @ts-ignore - accessing private method
      const lang = provider.detectCellLanguage({
        widget: {
          content: {
            activeCell: {
              model: { type: "code", mimeType: "text/x-javascript" },
            },
          },
        },
      });
      expect(lang).toBe("unknown");
    });
  });

  describe("getCellId", () => {
    it("returns null when no widget", () => {
      // @ts-ignore - accessing private method
      const id = provider.getCellId({});
      expect(id).toBeNull();
    });

    it("returns null when no active cell", () => {
      // @ts-ignore - accessing private method
      const id = provider.getCellId({
        widget: { content: {} },
      });
      expect(id).toBeNull();
    });

    it("returns cell id when available", () => {
      // @ts-ignore - accessing private method
      const id = provider.getCellId({
        widget: {
          content: {
            activeCell: { model: { id: "cell-123" } },
          },
        },
      });
      expect(id).toBe("cell-123");
    });

    it("returns null when model.id is empty", () => {
      // @ts-ignore - accessing private method
      const id = provider.getCellId({
        widget: {
          content: {
            activeCell: { model: { id: "" } },
          },
        },
      });
      expect(id).toBeNull();
    });
  });

  describe("fetch", () => {
    it("returns empty items for unknown language", async () => {
      const result = await provider.fetch({}, {});
      expect(result).toEqual({ items: [] });
    });

    it("returns empty items when no cellId", async () => {
      const context = {
        widget: {
          content: {
            activeCell: {
              model: { type: "code", mimeType: "text/x-python", id: "" },
            },
          },
        },
      };
      const result = await provider.fetch({}, context);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("handleMessage", () => {
    it("resolves pending request on lsp-completion-response", async () => {
      const context = {
        widget: {
          content: {
            activeCell: {
              model: {
                type: "code",
                mimeType: "text/x-python",
                id: "cell-1",
              },
            },
          },
        },
      };

      // Start a fetch that will send a request
      const fetchPromise = provider.fetch({ text: "pri", offset: 3 }, context);

      // Get the requestId from the posted message
      const call = mockPostMessage.mock.calls[0][0];
      const requestId = call.requestId;

      // Simulate response from extension host
      const responseEvent = new MessageEvent("message", {
        data: {
          type: "lsp-completion-response",
          requestId,
          completions: [{ label: "print", insertText: "print" }],
        },
      });
      window.dispatchEvent(responseEvent);

      const result = await fetchPromise;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].insertText).toBe("print");
    });

    it("resolves with empty array on lsp-error", async () => {
      const context = {
        widget: {
          content: {
            activeCell: {
              model: {
                type: "code",
                mimeType: "text/x-python",
                id: "cell-1",
              },
            },
          },
        },
      };

      const fetchPromise = provider.fetch({ text: "pri", offset: 3 }, context);

      const call = mockPostMessage.mock.calls[0][0];
      const requestId = call.requestId;

      const errorEvent = new MessageEvent("message", {
        data: {
          type: "lsp-error",
          requestId,
          error: "Server error",
        },
      });
      window.dispatchEvent(errorEvent);

      const result = await fetchPromise;
      expect(result.items).toEqual([]);
    });
  });
});
