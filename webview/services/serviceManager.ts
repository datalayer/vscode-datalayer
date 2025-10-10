/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module serviceManager
 * Service manager for Jupyter kernel communication.
 * Creates a fake JupyterLab service manager that proxies requests through postMessage.
 * Implements WebSocket proxying for real-time kernel communication.
 */

/**
 * Fake JupyterLab service manager that proxy the requests and websockets
 * through postMessage
 *
 * The fake WebSocket is largely copied from mock-server licensed under MIT License.
 */

import { ServiceManager, ServerConnection } from "@jupyterlab/services";
import { MessageHandler, type ExtensionMessage } from "./messageHandler";
import { isLocalKernelUrl } from "../../src/constants/kernelConstants";

/**
 * Enable verbose debug logging for WebSocket messages.
 * Set to true during development, false in production.
 */
const DEBUG_WEBSOCKET = false;

/**
 * Forward HTTP request through postMessage to the extension.
 *
 * @param request HTTP request
 * @param init HTTP request initialization
 * @returns HTTP response
 */
async function fetch(
  request: RequestInfo,
  init?: RequestInit | null,
): Promise<Response> {
  const r = new Request(request, init ?? undefined);
  const body = !["GET", "HEAD"].includes(r.method)
    ? await r.arrayBuffer()
    : undefined;
  const headers: Record<string, string> = [...r.headers].reduce(
    (agg, pair) => ({ ...agg, [pair[0]]: pair[1] }),
    {},
  );

  const reply = await MessageHandler.instance.request({
    type: "http-request",
    body: {
      method: r.method,
      url: r.url,
      body,
      headers,
    },
  });

  {
    const replyData = reply as {
      headers?: HeadersInit;
      body?: BodyInit;
      status?: number;
      statusText?: string;
    };
    const { headers, body, status, statusText } = replyData ?? {};
    return new Response(body, { headers, status, statusText });
  }
}

/**
 * Create a JupyterLab service manager with proxied communication.
 * @param baseUrl Base URL for the Jupyter server
 * @param token Authentication token for the server
 * @returns ServiceManager instance configured for VS Code extension communication
 */
export function createServiceManager(
  baseUrl: string,
  token: string = "",
): ServiceManager {
  const refSettings = ServerConnection.makeSettings();

  // The token will be appended as a query parameter by Jupyter itself
  // when appendToken is true, so we don't need it in headers
  return new ServiceManager({
    serverSettings: {
      ...refSettings,
      appendToken: true, // Append token as query parameter
      baseUrl,
      appUrl: "",
      fetch: fetch,
      init: {
        cache: "no-store",
        credentials: "same-origin",
      } satisfies RequestInit,
      token, // This is the runtime-specific token, not the JWT auth token
      // @ts-ignore - Type mismatch between browser WebSocket and library expectations
      WebSocket: ProxiedWebSocket,
      wsUrl: baseUrl.replace(/^http/, "ws"),
    },
  });
}

/*
 * Code modified from mock-socket
 */

const ERROR_PREFIX = {
  CONSTRUCTOR_ERROR: "Failed to construct 'WebSocket':",
  CLOSE_ERROR: "Failed to execute 'close' on 'WebSocket':",
  EVENT: {
    CONSTRUCT: "Failed to construct 'Event':",
    MESSAGE: "Failed to construct 'MessageEvent':",
    CLOSE: "Failed to construct 'CloseEvent':",
  },
};

/**
 * Configuration for creating Event objects
 */
interface IEventConfiguration {
  /** Event type string */
  type: string;
  /** Target element for the event */
  target?: EventTarget;
}

/**
 * Configuration for creating CloseEvent objects
 */
interface ICloseEventConfiguration extends IEventConfiguration {
  /** Close code (1000 for normal closure) */
  code?: number;
  /** Human-readable close reason */
  reason?: string;
  /** Whether the connection closed cleanly */
  wasClean?: boolean;
}

/*
 * Creates an Event object and extends it to allow full modification of
 * its properties.
 *
 * @param {object} config - within config you will need to pass type and optionally target
 */
function createEvent(config: IEventConfiguration) {
  const { type, target } = config;
  const eventObject = new Event(type);
  if (target) {
    Object.defineProperty(eventObject, "target", {
      writable: false,
      value: target,
    });
    Object.defineProperty(eventObject, "srcElement", {
      writable: false,
      value: target,
    });
    Object.defineProperty(eventObject, "currentTarget", {
      writable: false,
      value: target,
    });
  }
  return eventObject;
}

/*
 * Creates a CloseEvent object for WebSocket closure.
 *
 * @param {object} config - within config: type and optionally code, reason, wasClean
 */
function createCloseEvent(config: ICloseEventConfiguration) {
  const { code, reason, type } = config;
  let { wasClean } = config;
  if (!wasClean) {
    wasClean = code === 1000;
  }
  const closeEvent = new CloseEvent(type, {
    code,
    reason,
    wasClean,
  });
  // Note: target, srcElement, and currentTarget are read-only properties
  // that are automatically set by the browser when the event is dispatched.
  // Attempting to set them manually causes errors.
  return closeEvent;
}

/**
 * Calculate the length of a string in UTF-8 bytes.
 * @param str The string to measure
 * @returns The length of the string in UTF-8 bytes
 */
function lengthInUtf8Bytes(str: string): number {
  // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
  const m = encodeURIComponent(str).match(/%[89ABab]/g);
  return str.length + (m ? m.length : 0);
}

/**
 * Normalize WebSocket send data to a serializable format.
 * @param data The raw data to normalize
 * @returns The normalized data suitable for WebSocket transmission
 */
function normalizeSendData(data: unknown) {
  // FIXME this does not work -> JupyterLab fails to serialize the data
  // when the protocol is v1.kernel.websocket.jupyter.org
  if (
    Object.prototype.toString.call(data) !== "[object Blob]" &&
    !(data instanceof ArrayBuffer)
  ) {
    data = String(data);
  }
  return data;
}

/**
 * Verify and normalize WebSocket subprotocols.
 * Validates protocol format, checks for duplicates, and filters out unsupported protocols.
 * @param protocols The subprotocol or protocols to verify
 * @returns Validated array of protocols
 * @throws SyntaxError if protocols are invalid or duplicated
 */
function protocolVerification(protocols?: string | string[]): string[] {
  protocols = protocols ?? new Array<string>();
  if (!Array.isArray(protocols) && typeof protocols !== "string") {
    throw new SyntaxError(
      `${ERROR_PREFIX.CONSTRUCTOR_ERROR} The subprotocol '${(
        protocols as string | string[]
      ).toString()}' is invalid.`,
    );
  }
  if (typeof protocols === "string") {
    protocols = [protocols];
  }
  const uniq = protocols
    .map((p) => ({ count: 1, protocol: p }))
    .reduce(
      (a, b) => {
        a[b.protocol] = (a[b.protocol] || 0) + b.count;
        return a;
      },
      {} as Record<string, number>,
    );
  const duplicates = Object.keys(uniq).filter((a) => uniq[a] > 1);
  if (duplicates.length > 0) {
    throw new SyntaxError(
      `${ERROR_PREFIX.CONSTRUCTOR_ERROR} The subprotocol '${duplicates[0]}' is duplicated.`,
    );
  }
  return protocols.filter((p) => p !== "v1.kernel.websocket.jupyter.org");
}

/**
 * Verify and normalize a WebSocket URL.
 * Validates URL format, scheme, and structure according to WebSocket standards.
 * @param url The URL to verify
 * @returns The normalized URL string
 * @throws TypeError if URL is missing
 * @throws SyntaxError if URL is invalid, has wrong scheme, or contains fragment
 */
function urlVerification(url: string | URL) {
  const urlRecord = new URL(url);
  const { pathname, protocol, hash } = urlRecord;
  if (!url) {
    throw new TypeError(
      `${ERROR_PREFIX.CONSTRUCTOR_ERROR} 1 argument required, but only 0 present.`,
    );
  }
  if (!pathname) {
    urlRecord.pathname = "/";
  }
  if (protocol === "") {
    throw new SyntaxError(
      `${
        ERROR_PREFIX.CONSTRUCTOR_ERROR
      } The URL '${urlRecord.toString()}' is invalid.`,
    );
  }
  if (protocol !== "ws:" && protocol !== "wss:") {
    throw new SyntaxError(
      `${ERROR_PREFIX.CONSTRUCTOR_ERROR} The URL's scheme must be either 'ws' or 'wss'. '${protocol}' is not allowed.`,
    );
  }
  if (hash !== "") {
    throw new SyntaxError(
      `${ERROR_PREFIX.CONSTRUCTOR_ERROR} The URL contains a fragment identifier ('${hash}'). Fragment identifiers are not allowed in WebSocket URLs.`,
    );
  }
  return urlRecord.toString();
}

/**
 * EventTarget is an interface implemented by objects that can
 * receive events and may have listeners for them.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */
class EventTarget {
  /** Map of event type to listener functions */
  protected listeners: Map<string, Set<(...args: unknown[]) => void>> =
    new Map();

  /**
   * Register a listener function for a specific event type.
   * The listener can later be invoked via the dispatchEvent method.
   *
   * @param type The type of event (e.g., 'open', 'message', 'close', 'error')
   * @param listener Callback function to invoke when an event of this type is dispatched
   */
  addEventListener(
    type: string,
    listener: (...args: unknown[]) => void /* , useCapture */,
  ) {
    if (typeof listener === "function") {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }

      this.listeners.get(type)!.add(listener);
    }
  }

  /**
   * Unregister a listener function for a specific event type.
   * The listener will no longer be invoked when events of this type are dispatched.
   *
   * @param type The type of event (e.g., 'open', 'message', 'close', 'error')
   * @param listener The callback function to remove
   */
  removeEventListener(
    type: string,
    listener: (...args: unknown[]) => void /* , useCapture */,
  ) {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Dispatch an event to all registered listeners of that event type.
   * Each listener is invoked with the event as the first argument, or with custom arguments if provided.
   *
   * @param event The event object to dispatch
   * @param customArguments Optional custom arguments to pass to listeners instead of the event
   * @returns True if listeners were found and invoked, false otherwise
   */
  dispatchEvent(event: Event, ...customArguments: unknown[]) {
    const eventName = event.type;
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return false;
    }
    listeners.forEach((listener) => {
      if (customArguments.length > 0) {
        listener.apply(this, customArguments);
      } else {
        listener.call(this, event);
      }
    });
    return true;
  }
}

/**
 * Fake WebSocket implementation that proxies through postMessage.
 * Implements the standard WebSocket API but communicates with the VS Code extension
 * instead of directly connecting to a server.
 */
export class ProxiedWebSocket extends EventTarget {
  /** WebSocket is connecting */
  static readonly CONNECTING = 0;
  /** WebSocket connection is open and ready */
  static readonly OPEN = 1;
  /** WebSocket connection is closing */
  static readonly CLOSING = 2;
  /** WebSocket connection is closed */
  static readonly CLOSED = 3;
  /** Counter for generating unique client IDs */
  private static _clientCounter = 0;

  constructor(url: string | URL, protocols: string | string[] = []) {
    super();
    this.clientId = "ws-" + (ProxiedWebSocket._clientCounter++).toString();
    this.url = urlVerification(url);

    protocols = protocolVerification(protocols);
    // Filter out invalid protocols - must be non-empty and contain only alphanumeric, hyphen, dot, underscore
    const validProtocols = protocols.filter(
      (p) => p && p.length > 0 && /^[a-zA-Z0-9._-]+$/.test(p),
    );
    this.protocol = validProtocols[0] || "";
    this.binaryType = "blob";
    this._readyState = ProxiedWebSocket.CONNECTING;
    this._disposable = MessageHandler.instance.on(
      this._onExtensionMessage.bind(this) as (message: unknown) => void,
    );
    this._open();

    // For local kernel connections, SYNCHRONOUSLY transition to OPEN state
    // This prevents race conditions where JupyterLab checks for kernel connection
    // before the async websocket-open message can arrive from the extension
    // We must do this synchronously because JupyterLab checks immediately in the same call stack
    if (isLocalKernelUrl(this.url)) {
      console.log(
        `[ProxiedWebSocket] Local kernel detected, SYNCHRONOUSLY opening: ${this.url}`,
      );
      this._readyState = ProxiedWebSocket.OPEN;
      // Dispatch open event synchronously - JupyterLab is checking in the same call stack
      this.dispatchEvent(new Event("open"));
      console.log(
        `[ProxiedWebSocket] Dispatched SYNCHRONOUS 'open' event for local kernel, readyState=${this._readyState}`,
      );
    }
  }

  /** Current connection state */
  private _readyState: number;
  /** Disposable for cleaning up message handlers */
  private _disposable: { dispose(): void };

  /** WebSocket is connecting */
  readonly CONNECTING = 0;
  /** WebSocket connection is open and ready */
  readonly OPEN = 1;
  /** WebSocket connection is closing */
  readonly CLOSING = 2;
  /** WebSocket connection is closed */
  readonly CLOSED = 3;

  /** Unique identifier for this WebSocket instance */
  readonly clientId: string;
  /** URL of the WebSocket endpoint */
  readonly url: string;
  /** Amount of buffered data waiting to be sent */
  readonly bufferedAmount: number = 0;
  /** Extensions in use */
  readonly extensions: string = "";
  /** Subprotocol in use */
  readonly protocol: string;
  /** Binary data type for received messages */
  binaryType: BinaryType;

  /**
   * Get the current connection state of the WebSocket.
   */
  get readyState(): number {
    return this._readyState;
  }

  /**
   * Get the open event handler callback.
   */
  get onopen(): ((this: WebSocket, ev: Event) => unknown) | null {
    return (this.listeners.get("open") ?? null) as unknown as
      | ((this: WebSocket, ev: Event) => unknown)
      | null;
  }

  /**
   * Get the message event handler callback.
   */
  get onmessage(): ((this: WebSocket, ev: MessageEvent) => unknown) | null {
    return (this.listeners.get("message") ?? null) as unknown as
      | ((this: WebSocket, ev: MessageEvent) => unknown)
      | null;
  }

  /**
   * Get the close event handler callback.
   */
  get onclose(): ((this: WebSocket, ev: CloseEvent) => unknown) | null {
    return (this.listeners.get("close") ?? null) as unknown as
      | ((this: WebSocket, ev: CloseEvent) => unknown)
      | null;
  }

  /**
   * Get the error event handler callback.
   */
  get onerror(): ((this: WebSocket, ev: Event) => unknown) | null {
    return (this.listeners.get("error") ?? null) as unknown as
      | ((this: WebSocket, ev: Event) => unknown)
      | null;
  }

  /**
   * Set the open event handler callback.
   * @param listener The callback function to invoke when the connection opens
   */
  set onopen(listener: (...args: unknown[]) => void) {
    this.listeners.delete("open");
    this.addEventListener("open", listener);
  }

  /**
   * Set the message event handler callback.
   * @param listener The callback function to invoke when a message is received
   */
  set onmessage(listener: (...args: unknown[]) => void) {
    this.listeners.delete("message");
    this.addEventListener("message", listener);
  }

  /**
   * Set the close event handler callback.
   * @param listener The callback function to invoke when the connection closes
   */
  set onclose(listener: (...args: unknown[]) => void) {
    this.listeners.delete("close");
    this.addEventListener("close", listener);
  }

  /**
   * Set the error event handler callback.
   * @param listener The callback function to invoke when an error occurs
   */
  set onerror(listener: (...args: unknown[]) => void) {
    this.listeners.delete("error");
    this.addEventListener("error", listener);
  }

  /**
   * Close the WebSocket connection.
   * @param code Optional close code (1000 or 3000-4999)
   * @param reason Optional human-readable close reason
   * @throws TypeError if the close code is invalid
   * @throws SyntaxError if the close reason is too long
   */
  close(code?: number, reason?: string) {
    if (code !== undefined) {
      if (
        typeof code !== "number" ||
        (code !== 1000 && (code < 3000 || code > 4999))
      ) {
        throw new TypeError(
          `${ERROR_PREFIX.CLOSE_ERROR} The code must be either 1000, or between 3000 and 4999. ${code} is neither.`,
        );
      }
    }

    if (reason !== undefined) {
      const length = lengthInUtf8Bytes(reason);

      if (length > 123) {
        throw new SyntaxError(
          `${ERROR_PREFIX.CLOSE_ERROR} The message must not be greater than 123 bytes.`,
        );
      }
    }

    if (
      this.readyState === WebSocket.CLOSING ||
      this.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    const wasConnecting = this.readyState === WebSocket.CONNECTING;
    this._readyState = WebSocket.CLOSING;
    this._disposable.dispose();
    const closeEvent = createCloseEvent({
      type: "close",
      code,
      reason,
    });
    setTimeout(() => {
      MessageHandler.instance.send({
        type: "websocket-close",
        id: this.clientId,
        body: {
          origin: this.url,
        },
      });
      this._readyState = WebSocket.CLOSED;
      if (wasConnecting) {
        const errorEvent = createEvent({
          type: "error",
          target: this,
        });
        this.dispatchEvent(errorEvent);
      }
      this.dispatchEvent(closeEvent);
    });
  }

  /**
   * Send data through the WebSocket connection.
   * @param data The data to send (string, Blob, or ArrayBuffer)
   * @throws Error if the WebSocket is in CLOSING or CLOSED state
   */
  send(data: unknown) {
    if (
      this.readyState === ProxiedWebSocket.CLOSING ||
      this.readyState === ProxiedWebSocket.CLOSED
    ) {
      throw new Error("WebSocket is already in CLOSING or CLOSED state");
    }

    // TODO: handle bufferedAmount
    MessageHandler.instance.send({
      type: "websocket-message",
      id: this.clientId,
      body: {
        origin: this.url,
        data: normalizeSendData(data),
      },
    });
  }

  /**
   * Handle incoming messages from the extension.
   * Routes WebSocket messages (open, message, close) to appropriate handlers.
   * @param message The extension message containing WebSocket event data
   * @returns True if the message was processed, false otherwise
   * @private
   */
  private _onExtensionMessage(message: ExtensionMessage): boolean {
    const { type } = message;

    // Only process WebSocket messages (messages with id field)
    if (!("id" in message)) {
      return false;
    }

    const { id } = message;
    if (id === this.clientId) {
      switch (type) {
        case "websocket-message":
          // FIXME this does not work -> JupyterLab fails to deserialize the array
          // when the protocol is v1.kernel.websocket.jupyter.org
          // A part of the fix probably lies in the need to convert the binaryType
          // to 'arraybuffer' for kernel websocket (in the extension side!!):
          // https://github.com/jupyterlab/jupyterlab/blob/85c82eba1caa7e28a0d818c0840e13756c1b1256/packages/services/src/kernel/default.ts#L1468
          const { body } = message;
          const bodyData = body as {
            data?: { type?: string; data?: number[] } | string;
          };
          if (
            typeof bodyData.data === "object" &&
            bodyData.data?.type === "Buffer" &&
            bodyData.data?.data
          ) {
            (bodyData.data as unknown) = new ArrayBuffer(
              bodyData.data.data.length,
            );
          }
          // MessageEvent constructor expects { data: ... } not the body directly
          if (DEBUG_WEBSOCKET) {
            console.log(
              `[WebviewWebSocket] Dispatching message event for clientId=${this.clientId}:`,
              typeof bodyData.data === "string" ? "JSON string" : "object",
            );
          }
          if (DEBUG_WEBSOCKET && typeof bodyData.data === "string") {
            try {
              const parsed = JSON.parse(bodyData.data);
              console.log(
                `[WebviewWebSocket] Message type: ${parsed.header?.msg_type}, channel: ${parsed.channel}`,
              );

              // Extra logging for kernel_info_reply
              if (parsed.header?.msg_type === "kernel_info_reply") {
                console.log(`[WebviewWebSocket] kernel_info_reply details:`, {
                  msg_id: parsed.header?.msg_id,
                  parent_msg_id: parsed.parent_header?.msg_id,
                  session: parsed.header?.session,
                  status: parsed.content?.status,
                  hasLanguageInfo: !!parsed.content?.language_info,
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
          this.dispatchEvent(
            new MessageEvent("message", { data: bodyData.data }),
          );
          break;
        case "websocket-open": {
          if (DEBUG_WEBSOCKET) {
            console.log(
              `[WebviewWebSocket] Received websocket-open for clientId=${this.clientId}, url=${this.url}`,
            );
          }
          this._readyState = WebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          if (DEBUG_WEBSOCKET) {
            console.log(
              `[WebviewWebSocket] Dispatched 'open' event, readyState=${this._readyState}`,
            );
          }
          break;
        }
        case "websocket-close":
          this.close();
          break;
      }
      return true;
    }
    return false;
  }

  /**
   * Initialize the WebSocket connection by sending an open request to the extension.
   * @private
   */
  private _open(): void {
    MessageHandler.instance.send({
      type: "websocket-open",
      id: this.clientId,
      body: {
        origin: this.url,
        protocol: this.protocol,
      },
    });
  }
}
