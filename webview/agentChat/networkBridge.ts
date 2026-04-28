/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Installs global `window.fetch` and `window.WebSocket` overrides that tunnel
 * every outgoing HTTP/WebSocket call through the VS Code extension host.
 *
 * Why this exists: the Agent Chat webview runs at `vscode-webview://` origin,
 * but `@datalayer/agent-runtimes` contains many components and protocol
 * adapters that perform raw `fetch()` / `new WebSocket()` against the
 * Datalayer runtime. The runtime server does not include `vscode-webview://*`
 * in its CORS allow-list, so every direct browser-side call is blocked.
 *
 * By swapping the globals before the main bundle loads we transparently
 * proxy every call — including streaming (SSE) responses and WebSocket
 * bidirectional traffic — through postMessage. The extension host (Node.js)
 * then opens the real HTTP/WS connection, free from CORS.
 *
 * Requests to `vscode-webview://` / blob: / data: URLs are passed through to
 * the native implementation so local asset loads keep working.
 *
 * Wire protocol:
 *   webview -> host : { type: "net.fetch.request", requestId, ... }
 *   webview -> host : { type: "net.fetch.abort", requestId }
 *   host -> webview : { type: "net.fetch.head", requestId, status, statusText, headers }
 *   host -> webview : { type: "net.fetch.chunk", requestId, chunk: ArrayBuffer }
 *   host -> webview : { type: "net.fetch.end", requestId }
 *   host -> webview : { type: "net.fetch.error", requestId, message }
 *
 *   webview -> host : { type: "net.ws.open", socketId, url, protocols }
 *   webview -> host : { type: "net.ws.send", socketId, data }
 *   webview -> host : { type: "net.ws.close", socketId, code?, reason? }
 *   host -> webview : { type: "net.ws.open.ack", socketId }
 *   host -> webview : { type: "net.ws.message", socketId, data, isBinary }
 *   host -> webview : { type: "net.ws.close", socketId, code, reason }
 *   host -> webview : { type: "net.ws.error", socketId, message }
 *
 * @module webview/agentChat/networkBridge
 */

/** Minimal subset of the VS Code webview API used by the bridge. */
export interface VsCodeLike {
  /**
   * Post a message to the extension host.
   *
   * @param message - Structured-cloneable payload.
   */
  postMessage(message: unknown): void;
}

type HeadersRecord = Record<string, string>;

interface FetchPending {
  /**
   * Stream controller for the response body. Set inside the `start()`
   * callback that fires synchronously when the head message creates the
   * `ReadableStream`. May be `undefined` while the request is in-flight
   * but no head has arrived yet — callers must check before enqueueing.
   */
  controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  resolveResponse: (response: Response) => void;
  rejectResponse: (error: Error) => void;
  headReceived: boolean;
  /**
   * Chunks received before the head arrived. Drained into the controller
   * once `start()` fires. Without this buffer, chunks racing ahead of the
   * head would be silently dropped.
   */
  bufferedChunks: Uint8Array[];
  /**
   * Records that an `end` message arrived before the head. The controller
   * is closed once it becomes available.
   */
  endedBeforeHead: boolean;
  /**
   * Records that an `error` message arrived before the head. The error is
   * propagated once the controller becomes available, or the response
   * promise is rejected if no head ever arrives.
   */
  earlyError: Error | undefined;
  /**
   * Timeout handle. Cleared on completion or error. If it fires the
   * pending entry is removed and the response promise / stream is
   * rejected so callers don't hang when the extension host never replies.
   */
  timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  /**
   * Cleanup hook invoked exactly once when the pending entry is removed
   * (response settled, error, end, timeout, or abort). Used to detach
   * the `AbortSignal` listener registered in `bridgedFetch` — without
   * this, callers reusing a long-lived `AbortSignal` across many
   * requests would accumulate dead listeners on the signal and retain
   * the entry's closure long after the request finished.
   */
  onSettled?: () => void;
}

/**
 * Maximum time the webview will wait for the extension host to start
 * responding (head) or send another chunk on a streaming response. After
 * this elapses the bridged fetch is rejected with a `TypeError` and any
 * pending stream is errored, mirroring how a stalled HTTP socket would
 * surface to the caller.
 */
const FETCH_REQUEST_TIMEOUT_MS = 60_000;

interface WsInstance {
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  binaryType: "blob" | "arraybuffer";
  dispatchClose: (code: number, reason: string) => void;
  dispatchMessage: (data: ArrayBuffer | string) => void;
  dispatchError: (message: string) => void;
  dispatchOpen: () => void;
}

const LOCAL_URL_PREFIXES = ["vscode-webview://", "blob:", "data:"] as const;

/**
 * Returns true when the URL should bypass the bridge (local resource).
 *
 * @param url - Target URL string.
 *
 * @returns Whether the URL should be passed through to the native impl.
 */
function isLocalUrl(url: string): boolean {
  return LOCAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Converts a fetch `HeadersInit` / `Headers` / plain object into a flat record.
 *
 * @param input - Any headers-like input.
 *
 * @returns Plain `Record<string, string>` of headers.
 */
function normalizeHeaders(
  input: HeadersInit | undefined | null,
): HeadersRecord {
  const result: HeadersRecord = {};
  if (!input) {
    return result;
  }
  if (input instanceof Headers) {
    input.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(input)) {
    for (const [key, value] of input) {
      result[key] = value;
    }
    return result;
  }
  for (const [key, value] of Object.entries(input as Record<string, string>)) {
    result[key] = value;
  }
  return result;
}

/**
 * Installs global `window.fetch` and `window.WebSocket` overrides that route
 * all traffic through the extension host. Idempotent: calling twice is a no-op.
 *
 * @param vscode - The VS Code webview API handle.
 */
export function installNetworkBridge(vscode: VsCodeLike): void {
  const w = window as unknown as {
    __datalayerNetBridgeInstalled?: boolean;
    fetch: typeof fetch;
    WebSocket: typeof WebSocket;
  };
  if (w.__datalayerNetBridgeInstalled) {
    return;
  }
  w.__datalayerNetBridgeInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const NativeWebSocket = window.WebSocket;

  const fetchPending = new Map<string, FetchPending>();
  const wsRegistry = new Map<string, WsInstance>();
  let requestCounter = 0;
  let socketCounter = 0;

  /**
   * Clears any pending timeout on a fetch entry (no-op if unset).
   *
   * @param pending - Pending fetch entry to clear the timer on.
   */
  function clearTimeoutHandle(pending: FetchPending): void {
    if (pending.timeoutHandle !== undefined) {
      clearTimeout(pending.timeoutHandle);
      pending.timeoutHandle = undefined;
    }
  }

  /**
   * Removes the pending entry for a request and invokes its `onSettled`
   * cleanup hook exactly once. Use this everywhere instead of calling
   * `fetchPending.delete()` directly so per-request resources (e.g. the
   * `AbortSignal` listener attached in `bridgedFetch`) are released no
   * matter which terminal path the request took.
   *
   * @param requestId - Correlation ID for the request to settle.
   */
  function settlePending(requestId: string): void {
    const entry = fetchPending.get(requestId);
    if (!entry) {
      return;
    }
    fetchPending.delete(requestId);
    const onSettled = entry.onSettled;
    entry.onSettled = undefined;
    if (onSettled) {
      try {
        onSettled();
      } catch {
        // Cleanup must never throw past the bridge — swallow defensively.
      }
    }
  }

  /**
   * Resets the per-request timeout. Called on each head/chunk so a
   * long-lived stream extends its deadline only as long as data keeps
   * flowing — the bridge gives up if the host stops sending or never
   * replies at all.
   *
   * @param pending - Pending fetch entry whose timer is being refreshed.
   * @param requestId - Correlation ID used to look up the entry on fire.
   */
  function bumpTimeout(pending: FetchPending, requestId: string): void {
    clearTimeoutHandle(pending);
    pending.timeoutHandle = setTimeout(() => {
      const entry = fetchPending.get(requestId);
      if (!entry) {
        return;
      }
      const err = new TypeError(
        `Bridged fetch timed out after ${FETCH_REQUEST_TIMEOUT_MS}ms (host did not respond)`,
      );
      if (entry.headReceived) {
        entry.controller?.error(err);
      } else {
        entry.rejectResponse(err);
      }
      settlePending(requestId);
    }, FETCH_REQUEST_TIMEOUT_MS);
  }

  // ── Install the message listener ──────────────────────────────────────
  window.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown };
    if (data === null || typeof data !== "object") {
      return;
    }
    const type = typeof data.type === "string" ? data.type : null;
    if (type === null) {
      return;
    }
    switch (type) {
      case "net.fetch.head": {
        const msg = data as {
          requestId: string;
          status: number;
          statusText: string;
          headers: HeadersRecord;
        };
        const pending = fetchPending.get(msg.requestId);
        if (!pending) {
          return;
        }
        pending.headReceived = true;
        // Reset the timeout: subsequent chunks each refresh the deadline so
        // long-lived streams (SSE) don't get killed mid-stream.
        bumpTimeout(pending, msg.requestId);
        const requestId = msg.requestId;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            pending.controller = controller;
            // Drain anything that arrived before the consumer subscribed.
            for (const chunk of pending.bufferedChunks) {
              controller.enqueue(chunk);
            }
            pending.bufferedChunks.length = 0;
            // Apply any terminal state that arrived before head as well.
            if (pending.earlyError) {
              controller.error(pending.earlyError);
              clearTimeoutHandle(pending);
              settlePending(requestId);
            } else if (pending.endedBeforeHead) {
              controller.close();
              clearTimeoutHandle(pending);
              settlePending(requestId);
            }
          },
          cancel() {
            // Consumer dropped the body (e.g. `reader.cancel()` on an SSE
            // stream they no longer need). Tell the host to abort the
            // upstream fetch so it doesn't keep streaming bytes that will
            // never be read, and clean up our local entry.
            const entry = fetchPending.get(requestId);
            if (entry) {
              clearTimeoutHandle(entry);
              settlePending(requestId);
            }
            vscode.postMessage({ type: "net.fetch.abort", requestId });
          },
        });
        pending.resolveResponse(
          new Response(stream, {
            status: msg.status,
            statusText: msg.statusText,
            headers: msg.headers,
          }),
        );
        break;
      }
      case "net.fetch.chunk": {
        const msg = data as {
          requestId: string;
          chunk: ArrayBuffer | Uint8Array;
        };
        const pending = fetchPending.get(msg.requestId);
        if (!pending) {
          return;
        }
        const bytes =
          msg.chunk instanceof Uint8Array
            ? msg.chunk
            : new Uint8Array(msg.chunk);
        // Each chunk extends the timeout — long SSE streams must not be
        // killed by the head deadline.
        bumpTimeout(pending, msg.requestId);
        if (pending.controller) {
          pending.controller.enqueue(bytes);
        } else {
          // Head hasn't arrived yet — queue and drain inside `start()`.
          pending.bufferedChunks.push(bytes);
        }
        break;
      }
      case "net.fetch.end": {
        const msg = data as { requestId: string };
        const pending = fetchPending.get(msg.requestId);
        if (!pending) {
          return;
        }
        if (pending.controller) {
          pending.controller.close();
          clearTimeoutHandle(pending);
          settlePending(msg.requestId);
        } else {
          // End raced ahead of head — defer the close until `start()` runs.
          pending.endedBeforeHead = true;
        }
        break;
      }
      case "net.fetch.error": {
        const msg = data as { requestId: string; message: string };
        const pending = fetchPending.get(msg.requestId);
        if (!pending) {
          return;
        }
        const err = new TypeError(msg.message || "Network request failed");
        if (pending.headReceived) {
          if (pending.controller) {
            pending.controller.error(err);
            clearTimeoutHandle(pending);
            settlePending(msg.requestId);
          } else {
            // Head was acknowledged but the stream `start()` hasn't run yet.
            pending.earlyError = err;
          }
        } else {
          clearTimeoutHandle(pending);
          pending.rejectResponse(err);
          settlePending(msg.requestId);
        }
        break;
      }
      case "net.ws.open.ack": {
        const msg = data as { socketId: string };
        const ws = wsRegistry.get(msg.socketId);
        // Only transition CONNECTING (0) → OPEN (1). If the consumer
        // already called `close()` (state CLOSING/CLOSED) while the host's
        // open ack was in flight, dropping it here mirrors native
        // `WebSocket`, which never fires `open` after a close was
        // initiated.
        if (ws && ws.readyState === 0) {
          ws.dispatchOpen();
        }
        break;
      }
      case "net.ws.message": {
        const msg = data as {
          socketId: string;
          data: ArrayBuffer | string;
          isBinary: boolean;
        };
        const ws = wsRegistry.get(msg.socketId);
        // Drop late frames that arrive after the consumer initiated
        // close. Native `WebSocket` would never deliver `message` to a
        // CLOSING/CLOSED socket; matching that behavior here keeps
        // application-level state machines consistent.
        if (ws && ws.readyState === 1) {
          ws.dispatchMessage(msg.data);
        }
        break;
      }
      case "net.ws.close": {
        const msg = data as {
          socketId: string;
          code: number;
          reason: string;
        };
        const ws = wsRegistry.get(msg.socketId);
        if (!ws) {
          return;
        }
        wsRegistry.delete(msg.socketId);
        ws.dispatchClose(msg.code, msg.reason);
        break;
      }
      case "net.ws.error": {
        const msg = data as { socketId: string; message: string };
        const ws = wsRegistry.get(msg.socketId);
        if (!ws) {
          return;
        }
        // Dispatch the error event first, then guarantee a terminal
        // `close` so the socket transitions out of CONNECTING/OPEN. Native
        // `WebSocket` always pairs an error with a close (code 1006 on
        // abnormal termination); without this, an `error` from the host
        // — most importantly the URL-validation rejection in
        // `agentChatNetworkBridge` — would leave callers waiting on a
        // socket stuck in CONNECTING and the registry entry would leak.
        ws.dispatchError(msg.message);
        if (wsRegistry.has(msg.socketId)) {
          wsRegistry.delete(msg.socketId);
          ws.dispatchClose(1006, msg.message);
        }
        break;
      }
      default:
        break;
    }
  });

  // ── fetch override ────────────────────────────────────────────────────
  const bridgedFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input as RequestInfo, init);
    const url = request.url;
    if (isLocalUrl(url)) {
      return nativeFetch(input as RequestInfo, init);
    }
    requestCounter += 1;
    const requestId = `net-${Date.now()}-${requestCounter}`;
    const method = request.method.toUpperCase();
    const headers = normalizeHeaders(Object.fromEntries(request.headers));

    let body: ArrayBuffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await request.arrayBuffer();
      if (body.byteLength === 0) {
        body = undefined;
      }
    }

    // Honor an `AbortSignal` from the caller. Without this, an aborted
    // fetch on the webview side leaves the host-side `fetch()` running to
    // completion (or until the head timeout), wasting bandwidth/sockets
    // and keeping AI streaming responses alive after the user navigated
    // away. We post `net.fetch.abort` to the host and locally reject /
    // error the stream so the abort surfaces immediately to the caller.
    const signal = request.signal;

    return new Promise<Response>((resolveResponse, rejectResponse) => {
      const entry: FetchPending = {
        controller: undefined,
        resolveResponse,
        rejectResponse,
        headReceived: false,
        bufferedChunks: [],
        endedBeforeHead: false,
        earlyError: undefined,
        timeoutHandle: undefined,
      };
      fetchPending.set(requestId, entry);

      // `AbortSignal.reason` is typed as `any`/`unknown`; coerce into an
      // `Error` so it satisfies the existing `rejectResponse` signature
      // and surfaces a useful `.message`/`.stack` to callers.
      const abortReason = (): Error => {
        const r = signal.reason as unknown;
        if (r instanceof Error) {
          return r;
        }
        if (typeof r === "string" && r.length > 0) {
          return new DOMException(r, "AbortError");
        }
        return new DOMException("Aborted", "AbortError");
      };

      // Already aborted before we even posted — short-circuit. No abort
      // listener was attached yet, so `settlePending`'s `onSettled` hook
      // is a no-op here; calling it keeps the cleanup path uniform.
      if (signal.aborted) {
        rejectResponse(abortReason());
        settlePending(requestId);
        // Don't bother telling the host about a request we never sent.
        return;
      }

      const onAbort = (): void => {
        const e = fetchPending.get(requestId);
        if (!e) {
          return; // Already settled (response, error, end, or timeout).
        }
        clearTimeoutHandle(e);
        const reason = abortReason();
        if (e.headReceived) {
          e.controller?.error(reason);
        } else {
          e.rejectResponse(reason);
        }
        // `settlePending` invokes `onSettled`, which calls
        // `removeEventListener` — but `{ once: true }` already detached
        // this listener once it fired. Calling `removeEventListener` on a
        // no-longer-registered listener is a documented no-op.
        settlePending(requestId);
        vscode.postMessage({ type: "net.fetch.abort", requestId });
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Detach the abort listener as soon as the request settles for any
      // reason, so a long-lived `AbortController` (e.g. one shared across
      // many requests) doesn't accumulate dead listeners or pin the
      // entry's closure in memory.
      entry.onSettled = () => signal.removeEventListener("abort", onAbort);

      // Arm the head-deadline timer. If the host never sends `net.fetch.head`
      // (extension was reloaded mid-request, postMessage was dropped, etc.)
      // the promise rejects rather than hanging forever.
      bumpTimeout(entry, requestId);
      vscode.postMessage({
        type: "net.fetch.request",
        requestId,
        url,
        method,
        headers,
        body,
      });
    });
  };
  Object.defineProperty(window, "fetch", {
    value: bridgedFetch,
    writable: true,
    configurable: true,
  });

  // ── WebSocket override ────────────────────────────────────────────────
  /**
   * Drop-in `WebSocket` replacement. All open/send/close operations are
   * tunneled to the extension host, which owns the real socket. Events
   * (open/message/close/error) are synthesized from relay messages so
   * consumers cannot tell they are not talking to a native WebSocket.
   */
  class BridgedWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState: number = 0;
    readonly url: string;
    readonly protocol: string = "";
    readonly extensions: string = "";
    binaryType: "blob" | "arraybuffer" = "blob";
    bufferedAmount = 0;

    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    private readonly socketId: string = "";

    constructor(url: string | URL, protocols?: string | string[]) {
      super();
      this.url = typeof url === "string" ? url : url.toString();
      if (isLocalUrl(this.url)) {
        // Fall back to native WebSocket for local URLs.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new NativeWebSocket(url, protocols) as any;
      }
      socketCounter += 1;
      this.socketId = `ws-${Date.now()}-${socketCounter}`;
      const self = this;
      const instance: WsInstance = {
        get readyState() {
          return self.readyState;
        },
        set readyState(value: number) {
          self.readyState = value;
        },
        get onopen() {
          return self.onopen;
        },
        set onopen(v) {
          self.onopen = v;
        },
        get onclose() {
          return self.onclose;
        },
        set onclose(v) {
          self.onclose = v;
        },
        get onmessage() {
          return self.onmessage;
        },
        set onmessage(v) {
          self.onmessage = v;
        },
        get onerror() {
          return self.onerror;
        },
        set onerror(v) {
          self.onerror = v;
        },
        get binaryType() {
          return self.binaryType;
        },
        set binaryType(v) {
          self.binaryType = v;
        },
        dispatchOpen: () => {
          self.readyState = 1;
          const ev = new Event("open");
          self.onopen?.(ev);
          self.dispatchEvent(ev);
        },
        dispatchMessage: (data) => {
          let payload: ArrayBuffer | Blob | string;
          if (typeof data === "string") {
            payload = data;
          } else if (self.binaryType === "arraybuffer") {
            payload = data;
          } else {
            payload = new Blob([data]);
          }
          const ev = new MessageEvent("message", { data: payload });
          self.onmessage?.(ev);
          self.dispatchEvent(ev);
        },
        dispatchClose: (code, reason) => {
          self.readyState = 3;
          const ev = new CloseEvent("close", {
            code,
            reason,
            wasClean: code === 1000,
          });
          self.onclose?.(ev);
          self.dispatchEvent(ev);
        },
        dispatchError: (message) => {
          const ev = new Event("error");
          (ev as unknown as { message: string }).message = message;
          self.onerror?.(ev);
          self.dispatchEvent(ev);
        },
      };
      wsRegistry.set(this.socketId, instance);
      vscode.postMessage({
        type: "net.ws.open",
        socketId: this.socketId,
        url: this.url,
        protocols:
          typeof protocols === "string"
            ? [protocols]
            : Array.isArray(protocols)
              ? protocols
              : [],
      });
    }

    /**
     * Queues a message for sending on the bridged socket.
     *
     * @param data - String, binary buffer, or `Blob` payload.
     *
     * @throws When the socket is not yet open.
     */
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (this.readyState !== 1) {
        throw new DOMException("WebSocket is not open", "InvalidStateError");
      }
      if (typeof data === "string") {
        vscode.postMessage({
          type: "net.ws.send",
          socketId: this.socketId,
          data,
          isBinary: false,
        });
        return;
      }
      let buffer: ArrayBuffer;
      if (data instanceof ArrayBuffer) {
        buffer = data;
      } else if (ArrayBuffer.isView(data)) {
        // Copy the view's bytes into a fresh `ArrayBuffer` rather than
        // calling `data.buffer.slice(...)`. The `.slice()` shortcut works
        // for views over a regular `ArrayBuffer`, but views over a
        // `SharedArrayBuffer` (or, in some runtimes, transferred buffers)
        // either lack `slice` or throw — diverging from native
        // `WebSocket.send()` which accepts any `ArrayBufferView`. Going
        // through a typed-array copy avoids that whole class of issue
        // and also produces a buffer detachable from the original.
        const copy = new Uint8Array(data.byteLength);
        copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        buffer = copy.buffer;
      } else if (
        typeof SharedArrayBuffer !== "undefined" &&
        data instanceof SharedArrayBuffer
      ) {
        // Native `WebSocket.send()` accepts any `ArrayBufferLike`, which
        // includes `SharedArrayBuffer`. Without this branch a SAB would
        // fall through to the `Blob` path below and crash at
        // `(data as Blob).arrayBuffer()`. `postMessage` doesn't transfer
        // shared buffers across the webview boundary, so copy into a
        // regular `ArrayBuffer` first.
        const copy = new Uint8Array(data.byteLength);
        copy.set(new Uint8Array(data));
        buffer = copy.buffer;
      } else {
        // Blob: best-effort async send. Order is preserved per-socket via
        // the main thread message queue.
        const socketId = this.socketId;
        (data as Blob)
          .arrayBuffer()
          .then((b) => {
            vscode.postMessage({
              type: "net.ws.send",
              socketId,
              data: b,
              isBinary: true,
            });
          })
          .catch((err: unknown) => {
            // `Blob.arrayBuffer()` can reject (e.g. blob backed by a now
            // unreachable file/URL). Without this catch the rejection
            // would surface as an unhandled-promise warning and the
            // frame would be silently dropped. Surface it as a websocket
            // `error` event so consumers can react instead of waiting
            // forever for a response that will never arrive.
            const message = err instanceof Error ? err.message : String(err);

            console.error(
              "[AgentChat networkBridge] Blob.arrayBuffer() failed; ws send dropped:",
              message,
            );
            wsRegistry.get(socketId)?.dispatchError(message);
          });
        return;
      }
      vscode.postMessage({
        type: "net.ws.send",
        socketId: this.socketId,
        data: buffer,
        isBinary: true,
      });
    }

    /**
     * Initiates a graceful close on the bridged socket.
     *
     * @param code - Optional WebSocket close code.
     * @param reason - Optional human-readable reason.
     */
    close(code?: number, reason?: string): void {
      if (this.readyState === 2 || this.readyState === 3) {
        return;
      }
      this.readyState = 2;
      vscode.postMessage({
        type: "net.ws.close",
        socketId: this.socketId,
        code,
        reason,
      });
    }
  }

  Object.defineProperty(window, "WebSocket", {
    value: BridgedWebSocket,
    writable: true,
    configurable: true,
  });
}
