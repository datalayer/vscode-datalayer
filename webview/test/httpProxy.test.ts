/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("../services/messageHandler", () => ({
  MessageHandler: {
    instance: {
      request: vi.fn(),
    },
  },
}));

import { MessageHandler } from "../services/messageHandler";
import { proxyFetch } from "../utils/httpProxy";

const mockRequest = MessageHandler.instance.request as ReturnType<typeof vi.fn>;

describe("proxyFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a GET request by default", async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: new TextEncoder().encode('{"result": true}').buffer,
    });

    const response = await proxyFetch("https://api.example.com/data");

    expect(mockRequest).toHaveBeenCalledWith(
      {
        type: "http-request",
        body: {
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
          body: undefined,
        },
      },
      30000,
    );
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("sends a POST request with body", async () => {
    mockRequest.mockResolvedValue({
      status: 201,
      statusText: "Created",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode("{}").buffer,
    });

    await proxyFetch("https://api.example.com/items", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          method: "POST",
          body: '{"name":"test"}',
          headers: { "Content-Type": "application/json" },
        }),
      }),
      30000,
    );
  });

  it("converts Headers instance to plain object", async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
    });

    const headers = new Headers();
    headers.set("Authorization", "Bearer token123");
    headers.set("Accept", "application/json");

    await proxyFetch("https://api.example.com", { headers });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          headers: {
            authorization: "Bearer token123",
            accept: "application/json",
          },
        }),
      }),
      30000,
    );
  });

  it("converts array headers to plain object", async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
    });

    const headers: [string, string][] = [
      ["X-Custom", "value1"],
      ["X-Other", "value2"],
    ];

    await proxyFetch("https://api.example.com", { headers });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          headers: {
            "X-Custom": "value1",
            "X-Other": "value2",
          },
        }),
      }),
      30000,
    );
  });

  describe("response object", () => {
    it("sets ok=true for 2xx status codes", async () => {
      mockRequest.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
      });

      const response = await proxyFetch("https://api.example.com");
      expect(response.ok).toBe(true);
    });

    it("sets ok=false for non-2xx status codes", async () => {
      mockRequest.mockResolvedValue({
        status: 404,
        statusText: "Not Found",
        headers: {},
      });

      const response = await proxyFetch("https://api.example.com");
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it("provides json() method that parses body", async () => {
      mockRequest.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        body: new TextEncoder().encode('{"key":"value"}').buffer,
      });

      const response = await proxyFetch("https://api.example.com");
      const data = await response.json();
      expect(data).toEqual({ key: "value" });
    });

    it("json() throws when body is absent", async () => {
      mockRequest.mockResolvedValue({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: undefined,
      });

      const response = await proxyFetch("https://api.example.com");
      await expect(response.json()).rejects.toThrow("No response body");
    });

    it("provides text() method that decodes body", async () => {
      mockRequest.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        body: new TextEncoder().encode("Hello World").buffer,
      });

      const response = await proxyFetch("https://api.example.com");
      const text = await response.text();
      expect(text).toBe("Hello World");
    });

    it("text() returns empty string when body is absent", async () => {
      mockRequest.mockResolvedValue({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: undefined,
      });

      const response = await proxyFetch("https://api.example.com");
      const text = await response.text();
      expect(text).toBe("");
    });

    it("provides arrayBuffer() returning body or empty buffer", async () => {
      mockRequest.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        body: undefined,
      });

      const response = await proxyFetch("https://api.example.com");
      const buf = await response.arrayBuffer();
      expect(buf.byteLength).toBe(0);
    });

    it("exposes response headers as Headers instance", async () => {
      mockRequest.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      });

      const response = await proxyFetch("https://api.example.com");
      expect(response.headers.get("content-type")).toBe("application/json");
    });
  });
});
