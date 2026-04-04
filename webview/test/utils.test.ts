/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { getNonce, loadFromBytes, saveToBytes } from "../utils";

describe("loadFromBytes", () => {
  it("parses JSON from a Uint8Array", () => {
    const notebook = {
      cells: [{ cell_type: "code", source: "x = 1", outputs: [] }],
    };
    const raw = new TextEncoder().encode(JSON.stringify(notebook));
    const result = loadFromBytes(raw) as unknown;

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].source).toBe("x = 1");
  });

  it("joins text/html array outputs into a single string", () => {
    const notebook = {
      cells: [
        {
          cell_type: "code",
          source: "",
          outputs: [
            {
              output_type: "execute_result",
              data: { "text/html": ["<div>", "hello", "</div>"] },
            },
          ],
        },
      ],
    };
    const raw = new TextEncoder().encode(JSON.stringify(notebook));
    const result = loadFromBytes(raw) as unknown;

    expect(result.cells[0].outputs[0].data["text/html"]).toBe(
      "<div>hello</div>",
    );
  });

  it("leaves non-array text/html data untouched", () => {
    const notebook = {
      cells: [
        {
          cell_type: "code",
          source: "",
          outputs: [
            {
              output_type: "execute_result",
              data: { "text/html": "<p>already a string</p>" },
            },
          ],
        },
      ],
    };
    const raw = new TextEncoder().encode(JSON.stringify(notebook));
    const result = loadFromBytes(raw) as unknown;

    expect(result.cells[0].outputs[0].data["text/html"]).toBe(
      "<p>already a string</p>",
    );
  });

  it("handles cells without outputs", () => {
    const notebook = {
      cells: [{ cell_type: "markdown", source: "# Title" }],
    };
    const raw = new TextEncoder().encode(JSON.stringify(notebook));
    const result = loadFromBytes(raw) as unknown;

    expect(result.cells[0].source).toBe("# Title");
  });
});

describe("saveToBytes", () => {
  it("serializes an object to a Uint8Array", () => {
    const notebook = { cells: [] };
    const bytes = saveToBytes(notebook);

    expect(ArrayBuffer.isView(bytes)).toBe(true);
    const decoded = new TextDecoder().decode(bytes);
    expect(JSON.parse(decoded)).toEqual(notebook);
  });

  it("produces pretty-printed JSON with 2-space indent", () => {
    const notebook = { a: 1 };
    const bytes = saveToBytes(notebook);
    const decoded = new TextDecoder().decode(bytes);

    expect(decoded).toBe(JSON.stringify(notebook, null, 2));
  });

  it("round-trips with loadFromBytes for valid notebook data", () => {
    const notebook = {
      cells: [
        { cell_type: "code", source: "print(1)", outputs: [] },
        { cell_type: "markdown", source: "# Hello" },
      ],
    };
    const bytes = saveToBytes(notebook);
    const restored = loadFromBytes(bytes) as {
      cells: Array<{ source: string }>;
    };

    expect(restored.cells).toHaveLength(2);
    expect(restored.cells[0].source).toBe("print(1)");
    expect(restored.cells[1].source).toBe("# Hello");
  });
});

describe("getNonce", () => {
  afterEach(() => {
    const meta = document.querySelector('meta[property="csp-nonce"]');
    if (meta) {
      meta.remove();
    }
  });

  it("returns null when no meta tag exists", () => {
    expect(getNonce()).toBeNull();
  });

  it("returns the content attribute from the csp-nonce meta tag", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", "csp-nonce");
    meta.setAttribute("content", "abc123nonce");
    document.head.appendChild(meta);

    expect(getNonce()).toBe("abc123nonce");
  });

  it("returns null when content attribute is missing", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", "csp-nonce");
    document.head.appendChild(meta);

    expect(getNonce()).toBeNull();
  });
});
