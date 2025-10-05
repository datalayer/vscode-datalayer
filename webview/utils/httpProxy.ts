/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * HTTP proxy utility for making requests from webview through VS Code extension.
 * Bypasses CORS by proxying requests through the extension host.
 *
 * @module utils/httpProxy
 */

import { MessageHandler } from "../services/messageHandler";

/**
 * Make an HTTP request proxied through the VS Code extension.
 * This bypasses CORS restrictions by having the extension host make the request.
 *
 * @param url - URL to fetch
 * @param init - Fetch init options
 * @param messageHandler - Message handler instance to use
 * @returns Promise resolving to Response-like object
 */
export async function proxyFetch(
  url: string,
  init: RequestInit = {},
  messageHandler: MessageHandler = MessageHandler.instance,
): Promise<Response> {
  const { method = "GET", headers, body } = init;

  // Convert headers to plain object
  const headersObj: Record<string, string> = {};
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        headersObj[key] = value;
      });
    } else {
      Object.assign(headersObj, headers);
    }
  }

  // Send request through message handler
  const response = await messageHandler.request<
    {
      type: "http-request";
      body: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string | ArrayBuffer;
      };
    },
    {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body?: ArrayBuffer;
    }
  >(
    {
      type: "http-request",
      body: {
        url,
        method,
        headers: headersObj,
        body: body as string | ArrayBuffer | undefined,
      },
    },
    30000, // 30 second timeout
  );

  // Create Response-like object
  const result: Partial<Response> = {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
    arrayBuffer: async () => response.body || new ArrayBuffer(0),
    json: async () => {
      if (!response.body) {
        throw new Error("No response body");
      }
      const text = new TextDecoder().decode(response.body);
      return JSON.parse(text);
    },
    text: async () => {
      if (!response.body) {
        return "";
      }
      return new TextDecoder().decode(response.body);
    },
  };

  return result as Response;
}
