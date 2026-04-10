/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extension-host handler that answers `net.fetch.*` and `net.ws.*` messages
 * posted by the Agent Chat webview's `installNetworkBridge` override.
 *
 * The webview cannot reach external origins because of CORS. This handler
 * opens the real HTTP/WebSocket connection in the Node.js extension host
 * (where CORS does not apply) and relays streaming chunks / WebSocket
 * messages back to the webview through `postMessage`.
 *
 * Wire protocol — see `webview/agentChat/networkBridge.ts` module doc.
 *
 * Security note: this bridge runs in the extension host's network identity
 * (no CORS, no SOP) so a compromised webview that controls these envelopes
 * could otherwise pivot through it as an SSRF primitive. To keep that
 * surface small the handler:
 *   1. Validates every inbound message envelope (`net.fetch.request`,
 *      `net.ws.open`, etc.) against a strict shape — non-string IDs,
 *      missing fields, and wrong-typed bodies are dropped silently.
 *   2. Rejects any URL whose scheme is not in the allowlist. Only
 *      `https:` is accepted for `fetch()` and only `wss:` for
 *      `WebSocket`. This excludes `file:`, `data:` and plain `http:`,
 *      which closes off the most common SSRF schemes — but note that
 *      this check is scheme-only: a compromised webview can still
 *      reach any externally reachable HTTPS host (including misconfigured
 *      internal services exposed over TLS). A host/IP allowlist tied to
 *      the active runtime ingress is a follow-up if stricter isolation
 *      is required.
 *   3. Bounds the amount of error-response body buffered for diagnostic
 *      logging so a misbehaving endpoint cannot inflate host memory.
 *
 * @module bridges/agentChatNetworkBridge
 */

import * as vscode from "vscode";
import { type RawData, WebSocket } from "ws";

import { ServiceLoggers } from "../services/logging/loggers";

/** Request envelope for an HTTP tunnel call from the webview. */
interface FetchRequestMessage {
  type: "net.fetch.request";
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
}

/**
 * Webview -> host envelope to cancel an in-flight bridged fetch.
 * Triggered when the webview-side caller's `AbortSignal` fires or when
 * the consumer calls `reader.cancel()` on the response stream. The
 * host aborts its `AbortController` so it stops reading the upstream
 * body and frees the socket.
 */
interface FetchAbortMessage {
  type: "net.fetch.abort";
  requestId: string;
}

/** Request envelope to open a WebSocket tunnel. */
interface WsOpenMessage {
  type: "net.ws.open";
  socketId: string;
  url: string;
  protocols: string[];
}

/** Webview -> host send envelope. */
interface WsSendMessage {
  type: "net.ws.send";
  socketId: string;
  data: ArrayBuffer | string;
  isBinary: boolean;
}

/** Webview -> host close envelope. */
interface WsCloseMessage {
  type: "net.ws.close";
  socketId: string;
  code?: number;
  reason?: string;
}

/**
 * Maximum number of bytes of a non-2xx response body that the bridge will
 * read for diagnostic logging. Any larger error page (HTML 5xx, etc.) is
 * truncated to this limit so a misbehaving endpoint cannot inflate the
 * extension host's memory footprint.
 */
const MAX_LOGGED_ERROR_BODY_BYTES = 1024;

/**
 * Returns true when an outbound URL is allowed through the network bridge.
 *
 * The bridge runs in the extension host with no CORS, no SOP, and no
 * keyring scoping — every URL it dials is reachable from the user's
 * machine and is signed implicitly by the host's network identity. To
 * keep that surface small we restrict the bridge to the two protocols
 * the embedded `<Chat>` actually uses (HTTPS for REST + SSE, WSS for the
 * collaboration WebSocket) and reject anything else: `file://`, plain
 * `http://`, `data:`, `blob:`, and unknown custom schemes. The check is
 * scheme-only — it does NOT block externally reachable HTTPS hosts on
 * its own, so any SSRF resistance against TLS-exposed internal services
 * still relies on the network/firewall layer.
 *
 * @param raw - URL string from the webview.
 * @param allowedProtocols - Set of protocols (with trailing colon) to accept.
 *
 * @returns Validated URL when allowed; otherwise `undefined`.
 */
function validateBridgeUrl(
  raw: unknown,
  allowedProtocols: ReadonlySet<string>,
): URL | undefined {
  if (typeof raw !== "string" || raw.length === 0) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (!allowedProtocols.has(parsed.protocol)) {
    return undefined;
  }
  return parsed;
}

/**
 * Returns true when `value` is a plain object whose entries are strings.
 *
 * @param value - Candidate to inspect.
 *
 * @returns Whether `value` is a string-valued record.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * Type-guard for the inbound fetch request envelope.
 *
 * @param raw - Candidate envelope from the webview.
 *
 * @returns Whether the envelope matches {@link FetchRequestMessage}.
 */
function isFetchRequest(raw: unknown): raw is FetchRequestMessage {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const m = raw as Record<string, unknown>;
  if (m.type !== "net.fetch.request") {
    return false;
  }
  if (typeof m.requestId !== "string" || m.requestId.length === 0) {
    return false;
  }
  if (typeof m.url !== "string") {
    return false;
  }
  if (typeof m.method !== "string") {
    return false;
  }
  if (!isStringRecord(m.headers)) {
    return false;
  }
  if (m.body !== undefined && !(m.body instanceof ArrayBuffer)) {
    return false;
  }
  return true;
}

/**
 * Type-guard for the inbound fetch abort envelope.
 *
 * @param raw - Candidate envelope from the webview.
 *
 * @returns Whether the envelope matches {@link FetchAbortMessage}.
 */
function isFetchAbort(raw: unknown): raw is FetchAbortMessage {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const m = raw as Record<string, unknown>;
  if (m.type !== "net.fetch.abort") {
    return false;
  }
  if (typeof m.requestId !== "string" || m.requestId.length === 0) {
    return false;
  }
  return true;
}

/**
 * Type-guard for the inbound websocket open envelope.
 *
 * @param raw - Candidate envelope from the webview.
 *
 * @returns Whether the envelope matches {@link WsOpenMessage}.
 */
function isWsOpen(raw: unknown): raw is WsOpenMessage {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const m = raw as Record<string, unknown>;
  if (m.type !== "net.ws.open") {
    return false;
  }
  if (typeof m.socketId !== "string" || m.socketId.length === 0) {
    return false;
  }
  if (typeof m.url !== "string") {
    return false;
  }
  if (
    !Array.isArray(m.protocols) ||
    !m.protocols.every((p) => typeof p === "string")
  ) {
    return false;
  }
  return true;
}

/**
 * Type-guard for the inbound websocket send envelope.
 *
 * @param raw - Candidate envelope from the webview.
 *
 * @returns Whether the envelope matches {@link WsSendMessage}.
 */
function isWsSend(raw: unknown): raw is WsSendMessage {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const m = raw as Record<string, unknown>;
  if (m.type !== "net.ws.send") {
    return false;
  }
  if (typeof m.socketId !== "string" || m.socketId.length === 0) {
    return false;
  }
  if (typeof m.isBinary !== "boolean") {
    return false;
  }
  if (m.isBinary) {
    return m.data instanceof ArrayBuffer;
  }
  return typeof m.data === "string";
}

/**
 * Type-guard for the inbound websocket close envelope.
 *
 * @param raw - Candidate envelope from the webview.
 *
 * @returns Whether the envelope matches {@link WsCloseMessage}.
 */
function isWsClose(raw: unknown): raw is WsCloseMessage {
  if (raw === null || typeof raw !== "object") {
    return false;
  }
  const m = raw as Record<string, unknown>;
  if (m.type !== "net.ws.close") {
    return false;
  }
  if (typeof m.socketId !== "string" || m.socketId.length === 0) {
    return false;
  }
  if (m.code !== undefined && typeof m.code !== "number") {
    return false;
  }
  if (m.reason !== undefined && typeof m.reason !== "string") {
    return false;
  }
  return true;
}

/** HTTPS-only allowlist for outbound `fetch()` calls. */
const ALLOWED_FETCH_PROTOCOLS: ReadonlySet<string> = new Set(["https:"]);

/** WSS-only allowlist for outbound `WebSocket` connections. */
const ALLOWED_WS_PROTOCOLS: ReadonlySet<string> = new Set(["wss:"]);

/**
 * Handles `net.*` messages from the Agent Chat webview by relaying them to
 * real HTTP/WebSocket endpoints from the extension host.
 */
export class AgentChatNetworkBridge {
  /** All WebSocket connections owned by this handler, keyed by socketId. */
  private readonly sockets = new Map<string, WebSocket>();

  /** AbortControllers for in-flight fetches, keyed by requestId. */
  private readonly aborts = new Map<string, AbortController>();

  /**
   * Attaches the handler to a webview.
   *
   * @param webview - The webview whose incoming messages will be handled.
   *
   * @returns A disposable that detaches the listener and closes all sockets.
   */
  public attach(webview: vscode.Webview): vscode.Disposable {
    const sub = webview.onDidReceiveMessage((raw: unknown) => {
      this.handleMessage(webview, raw);
    });
    return new vscode.Disposable(() => {
      sub.dispose();
      this.disposeAll();
    });
  }

  /**
   * Routes a raw message to the appropriate handler.
   *
   * @param webview - The webview to reply on.
   * @param raw - The raw message envelope from the webview.
   */
  private handleMessage(webview: vscode.Webview, raw: unknown): void {
    if (raw === null || typeof raw !== "object") {
      return;
    }
    const type = (raw as { type?: unknown }).type;
    // Each branch validates the full envelope shape *before* triggering any
    // network I/O. A malformed message (or a compromised webview trying to
    // smuggle non-string fields) is dropped silently — the bridge must
    // never open an HTTP/WS connection with input that has not been
    // validated against the corresponding type-guard above.
    switch (type) {
      case "net.fetch.request":
        if (!isFetchRequest(raw)) {
          ServiceLoggers.main.warn(
            "[AgentChatNetBridge] dropped malformed fetch envelope",
          );
          return;
        }
        void this.handleFetch(webview, raw);
        return;
      case "net.fetch.abort":
        if (!isFetchAbort(raw)) {
          ServiceLoggers.main.warn(
            "[AgentChatNetBridge] dropped malformed fetch-abort envelope",
          );
          return;
        }
        this.handleFetchAbort(raw);
        return;
      case "net.ws.open":
        if (!isWsOpen(raw)) {
          ServiceLoggers.main.warn(
            "[AgentChatNetBridge] dropped malformed ws-open envelope",
          );
          return;
        }
        this.handleWsOpen(webview, raw);
        return;
      case "net.ws.send":
        if (!isWsSend(raw)) {
          ServiceLoggers.main.warn(
            "[AgentChatNetBridge] dropped malformed ws-send envelope",
          );
          return;
        }
        this.handleWsSend(raw);
        return;
      case "net.ws.close":
        if (!isWsClose(raw)) {
          ServiceLoggers.main.warn(
            "[AgentChatNetBridge] dropped malformed ws-close envelope",
          );
          return;
        }
        this.handleWsClose(raw);
        return;
      default:
        return;
    }
  }

  /**
   * Performs the real `fetch()` and streams the response back in chunks.
   *
   * @param webview - The webview to relay responses to.
   * @param msg - The validated fetch request envelope.
   */
  private async handleFetch(
    webview: vscode.Webview,
    msg: FetchRequestMessage,
  ): Promise<void> {
    const { requestId, url, method, headers, body } = msg;

    // Reject non-HTTPS targets up front so a compromised webview cannot use
    // the bridge as an SSRF primitive (file://, internal HTTP, custom
    // schemes, etc.). The Datalayer agent runtime ingress is always HTTPS.
    const validated = validateBridgeUrl(url, ALLOWED_FETCH_PROTOCOLS);
    if (!validated) {
      ServiceLoggers.main.warn(
        "[AgentChatNetBridge] rejected fetch with disallowed URL",
        { urlPrefix: url.slice(0, 64) },
      );
      void webview.postMessage({
        type: "net.fetch.error",
        requestId,
        message: "URL scheme not allowed (only https:// is bridged)",
      });
      return;
    }

    const controller = new AbortController();
    this.aborts.set(requestId, controller);

    ServiceLoggers.main.debug("[AgentChatNetBridge] fetch", {
      direction: "→",
      method,
      url: validated.href,
      bodyBytes: body ? body.byteLength : 0,
    });

    try {
      const response = await fetch(validated.href, {
        method,
        headers,
        body: body ? Buffer.from(body) : undefined,
        signal: controller.signal,
        // Relevant for streaming: do NOT buffer.
        // @ts-expect-error — Node 22 accepts this; TS lib dom may not list it.
        duplex: "half",
      });

      // Send head frame.
      const outHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      ServiceLoggers.main.debug("[AgentChatNetBridge] response", {
        direction: "←",
        url,
        status: response.status,
        statusText: response.statusText,
      });
      void webview.postMessage({
        type: "net.fetch.head",
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });

      // For non-2xx responses, capture only a bounded snippet of the body
      // so operators can diagnose 4xx/5xx without buffering large error
      // pages (e.g. 5xx HTML responses) into the extension host's memory.
      if (response.status >= 400 && response.body) {
        await this.logBoundedErrorBody(validated.href, response);
      }

      // Stream the body.
      if (!response.body) {
        void webview.postMessage({ type: "net.fetch.end", requestId });
        this.aborts.delete(requestId);
        return;
      }
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            // value is Uint8Array; post as ArrayBuffer for structured clone.
            const copy = value.slice().buffer;
            void webview.postMessage({
              type: "net.fetch.chunk",
              requestId,
              chunk: copy,
            });
          }
        }
        void webview.postMessage({ type: "net.fetch.end", requestId });
      } catch (streamError) {
        const message =
          streamError instanceof Error
            ? streamError.message
            : String(streamError);
        void webview.postMessage({
          type: "net.fetch.error",
          requestId,
          message,
        });
      } finally {
        this.aborts.delete(requestId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ServiceLoggers.main.warn("[AgentChatNetBridge] fetch failed", {
        url,
        method,
        message,
      });
      void webview.postMessage({
        type: "net.fetch.error",
        requestId,
        message,
      });
      this.aborts.delete(requestId);
    }
  }

  /**
   * Cancels an in-flight bridged fetch in response to webview-side
   * abort/cancellation. Aborts the matching `AbortController` (which
   * unblocks the streaming reader and releases the upstream socket) and
   * removes it from the registry.
   *
   * Idempotent: if the request already completed/errored the entry is
   * gone and this is a no-op.
   *
   * @param msg - Abort envelope.
   */
  private handleFetchAbort(msg: FetchAbortMessage): void {
    const controller = this.aborts.get(msg.requestId);
    if (!controller) {
      return;
    }
    this.aborts.delete(msg.requestId);
    controller.abort();
  }

  /**
   * Opens a real WebSocket and wires events back to the webview.
   *
   * @param webview - The webview to relay events to.
   * @param msg - Open request envelope.
   */
  private handleWsOpen(webview: vscode.Webview, msg: WsOpenMessage): void {
    const { socketId, url, protocols } = msg;

    // WebSocket targets are restricted to `wss://` for the same reason as
    // fetch — the bridge runs in the host's network identity and must not
    // accept arbitrary schemes from the webview.
    const validated = validateBridgeUrl(url, ALLOWED_WS_PROTOCOLS);
    if (!validated) {
      ServiceLoggers.main.warn(
        "[AgentChatNetBridge] rejected ws-open with disallowed URL",
        { urlPrefix: url.slice(0, 64) },
      );
      // Pair the error with an explicit `close` (code 1006, abnormal) so
      // every `net.ws.open` request gets a terminal close frame even when
      // we reject before constructing a real socket. Without this the
      // webview-side `BridgedWebSocket` would stay in CONNECTING (the
      // webview has its own synthesized-close fallback on error, but
      // sending close from the host removes the dependency on that
      // fallback and matches how `ws` behaves for real connection errors).
      void webview.postMessage({
        type: "net.ws.error",
        socketId,
        message: "URL scheme not allowed (only wss:// is bridged)",
      });
      void webview.postMessage({
        type: "net.ws.close",
        socketId,
        code: 1006,
        reason: "URL scheme not allowed",
      });
      return;
    }

    try {
      const ws = new WebSocket(
        validated.href,
        protocols.length > 0 ? protocols : undefined,
      );
      this.sockets.set(socketId, ws);

      ws.on("open", () => {
        void webview.postMessage({ type: "net.ws.open.ack", socketId });
      });
      ws.on("message", (data: RawData, isBinary: boolean) => {
        let payload: ArrayBuffer | string;
        if (isBinary) {
          if (Array.isArray(data)) {
            const merged = Buffer.concat(data);
            payload = merged.buffer.slice(
              merged.byteOffset,
              merged.byteOffset + merged.byteLength,
            ) as ArrayBuffer;
          } else if (Buffer.isBuffer(data)) {
            payload = data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength,
            ) as ArrayBuffer;
          } else {
            payload = (data as ArrayBuffer).slice(0);
          }
        } else {
          payload = data.toString("utf8");
        }
        void webview.postMessage({
          type: "net.ws.message",
          socketId,
          data: payload,
          isBinary,
        });
      });
      ws.on("close", (code: number, reason: Buffer) => {
        this.sockets.delete(socketId);
        void webview.postMessage({
          type: "net.ws.close",
          socketId,
          code,
          reason: reason.toString("utf8"),
        });
      });
      ws.on("error", (err: Error) => {
        // The webview-side `BridgedWebSocket` treats `net.ws.error` as
        // terminal (it pairs the error with a synthetic `close` and
        // drops its registry entry). The host must do the same: forcibly
        // close the underlying `ws` and remove it from `this.sockets` so
        // we don't leak a live socket. Fire `net.ws.close` after the
        // error frame for symmetry with the URL-rejection / constructor
        // failure paths and so any future webview that doesn't synth its
        // own close still transitions to CLOSED.
        const wasTracked = this.sockets.delete(socketId);
        try {
          ws.terminate();
        } catch {
          // Already torn down — ignore.
        }
        void webview.postMessage({
          type: "net.ws.error",
          socketId,
          message: err.message,
        });
        if (wasTracked) {
          void webview.postMessage({
            type: "net.ws.close",
            socketId,
            code: 1006,
            reason: err.message,
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ServiceLoggers.main.warn("[AgentChatNetBridge] ws open failed", {
        url,
        message,
      });
      // Same pairing as the URL-rejection path: emit `error` followed by
      // a terminal `close` so the webview's `BridgedWebSocket` always
      // reaches CLOSED instead of staying stuck in CONNECTING.
      void webview.postMessage({
        type: "net.ws.error",
        socketId,
        message,
      });
      void webview.postMessage({
        type: "net.ws.close",
        socketId,
        code: 1006,
        reason: message,
      });
    }
  }

  /**
   * Forwards a send frame from the webview to the real socket.
   *
   * @param msg - Send envelope.
   */
  private handleWsSend(msg: WsSendMessage): void {
    const ws = this.sockets.get(msg.socketId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (msg.isBinary && msg.data instanceof ArrayBuffer) {
      ws.send(Buffer.from(msg.data));
    } else if (typeof msg.data === "string") {
      ws.send(msg.data);
    }
  }

  /**
   * Closes the underlying WebSocket on request.
   *
   * @param msg - Close envelope.
   */
  private handleWsClose(msg: WsCloseMessage): void {
    const ws = this.sockets.get(msg.socketId);
    if (!ws) {
      return;
    }
    try {
      ws.close(msg.code, msg.reason);
    } catch {
      // Already closing; ignore.
    }
  }

  /**
   * Reads at most {@link MAX_LOGGED_ERROR_BODY_BYTES} from a non-2xx
   * response body and emits a warning with the snippet. Bounded so that a
   * misbehaving endpoint returning a multi-megabyte HTML error page does
   * not balloon the extension host's heap.
   *
   * Uses `response.clone()` so the original body is still available for
   * the streaming relay above.
   *
   * @param url - URL the request was made to (for log context).
   * @param response - The non-2xx fetch response.
   */
  private async logBoundedErrorBody(
    url: string,
    response: Response,
  ): Promise<void> {
    const contentLengthHeader = response.headers.get("content-length");
    const declaredLength = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : Number.NaN;

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_LOGGED_ERROR_BODY_BYTES
    ) {
      ServiceLoggers.main.warn("[AgentChatNetBridge] error body", {
        url,
        status: response.status,
        bodySnippet: "[skipped: body too large to sample safely]",
        bodyLength: declaredLength,
      });
      return;
    }

    const cloned = response.clone();
    const reader = cloned.body?.getReader();
    if (!reader) {
      return;
    }
    try {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_LOGGED_ERROR_BODY_BYTES) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!value || value.length === 0) {
          continue;
        }
        const remaining = MAX_LOGGED_ERROR_BODY_BYTES - total;
        const slice =
          value.length > remaining ? value.slice(0, remaining) : value;
        chunks.push(slice);
        total += slice.length;
        if (slice.length < value.length) {
          // Hit the cap mid-chunk — stop reading so we don't buffer more.
          break;
        }
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const text = new TextDecoder().decode(merged);
      ServiceLoggers.main.warn("[AgentChatNetBridge] error body", {
        url,
        status: response.status,
        bodySnippet: text.length > 500 ? `${text.slice(0, 500)}…` : text,
        bodyLength: total,
      });
    } catch {
      // Ignore — body read may race with the main streaming reader.
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Already closed.
      }
    }
  }

  /**
   * Closes every open socket and aborts every in-flight fetch.
   */
  private disposeAll(): void {
    for (const ws of this.sockets.values()) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.sockets.clear();
    for (const controller of this.aborts.values()) {
      controller.abort();
    }
    this.aborts.clear();
  }
}
