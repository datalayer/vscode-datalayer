/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 *
 * Adapted from VS Code Jupyter extension (Microsoft Corporation)
 * Original: https://github.com/microsoft/vscode-jupyter
 */

/**
 * Raw ZMQ socket wrapper for direct kernel communication.
 * Creates a WebSocket-like interface over ZMQ channels.
 *
 * @module services/kernel/rawSocket
 */

import type { KernelMessage } from "@jupyterlab/services";
import { serialize as jupyterLabSerialize } from "@jupyterlab/services/lib/kernel/serialize";
import * as wireProtocol from "@nteract/messaging/lib/wire-protocol";
import type * as WebSocketWS from "ws";
import type { Dealer, Subscriber } from "zeromq";
import type { Channel } from "@jupyterlab/services/lib/kernel/messages";
import * as fs from "fs";
import * as path from "path";

/**
 * Kernel connection configuration (from connection file).
 */
export interface IKernelConnection {
  /**
   * Port for the iopub (I/O publish) channel.
   * Used for kernel output messages sent to all clients.
   */
  iopub_port: number;
  /**
   * Port for the shell (request/reply) channel.
   * Used for synchronous request-reply communication.
   */
  shell_port: number;
  /**
   * Port for the stdin channel.
   * Used for kernel input requests (e.g., raw_input calls).
   */
  stdin_port: number;
  /**
   * Port for the control channel.
   * Used for control messages like interrupt and shutdown.
   */
  control_port: number;
  /**
   * HMAC signature scheme used for message authentication.
   * Always "hmac-sha256" for Jupyter kernels.
   */
  signature_scheme: "hmac-sha256";
  /**
   * Port for the heartbeat channel.
   * Used to detect if the kernel is alive.
   */
  hb_port: number;
  /**
   * IP address or hostname where the kernel is running.
   * Usually "127.0.0.1" for local kernels or an IP/domain for remote kernels.
   */
  ip: string;
  /**
   * Secret key for HMAC message signing.
   * Used to authenticate messages between client and kernel.
   */
  key: string;
  /**
   * Transport protocol for connecting to kernel channels.
   * "tcp" for TCP/IP connections, "ipc" for inter-process communication.
   */
  transport: "tcp" | "ipc";
  /**
   * Display name of the kernel (optional).
   * Examples: "python3", "ir", "julia-1.10"
   */
  kernel_name?: string;
}

/**
 * ZMQ channels for kernel communication.
 * Channels are created based on the kernel connection configuration.
 *
 * @internal Used internally for kernel communication
 */
interface IChannels {
  /**
   * Shell channel for synchronous request-reply messages.
   * DEALER socket connecting to kernel's shell port.
   * Used for execute_request, inspect_request, etc.
   */
  shell: Dealer;
  /**
   * Control channel for control messages.
   * DEALER socket connecting to kernel's control port.
   * Used for interrupt and shutdown messages.
   */
  control: Dealer;
  /**
   * Stdin channel for kernel input requests.
   * DEALER socket connecting to kernel's stdin port.
   * Used for responding to raw_input and password requests.
   */
  stdin: Dealer;
  /**
   * IOPub channel for kernel output messages.
   * SUBSCRIBER socket connecting to kernel's iopub port.
   * Receives stream, display_data, execute_result, error, status messages, etc.
   */
  iopub: Subscriber;
}

const noop = () => {};

/**
 * Loads zeromq with fallback mechanism.
 * Tries primary zeromq first, falls back to zeromqold if it fails.
 * Based on VS Code Jupyter extension's approach.
 *
 * Sets up prebuilds path for native binaries before loading.
 *
 * @returns The zeromq module
 * @throws Error if both zeromq versions fail to load
 */
function getZeroMQ(): typeof import("zeromq") {
  // Set up path to native binaries (located in dist/node_modules/zeromq/prebuilds)
  // This helps zeromq's cmake-ts loader find the .node files
  const extensionRoot = path.join(__dirname, "..");
  const zmqPrebuildsPath = path.join(
    extensionRoot,
    "node_modules",
    "zeromq",
    "prebuilds",
  );
  const zmqOldPrebuildsPath = path.join(
    extensionRoot,
    "node_modules",
    "zeromqold",
    "prebuilds",
  );

  console.log(`[RawSocket] ZeroMQ prebuilds path: ${zmqPrebuildsPath}`);

  try {
    // Try primary zeromq with prebuilds path hint
    if (fs.existsSync(zmqPrebuildsPath)) {
      process.env.ZMQ_PREBUILDS_PATH = zmqPrebuildsPath;
    }

    const zmq: typeof import("zeromq") = require("zeromq");
    console.log("[RawSocket] Successfully loaded primary zeromq");
    return zmq;
  } catch (error) {
    console.warn("[RawSocket] Primary zeromq failed, trying fallback:", error);
    try {
      // Try fallback zeromqold
      if (fs.existsSync(zmqOldPrebuildsPath)) {
        process.env.ZMQ_PREBUILDS_PATH = zmqOldPrebuildsPath;
      }

      const zmq: typeof import("zeromq") = require("zeromqold");
      console.log("[RawSocket] Successfully loaded fallback zeromqold");
      return zmq;
    } catch (fallbackError) {
      console.error("[RawSocket] Both zeromq versions failed to load:", {
        primary: error,
        fallback: fallbackError,
      });
      throw new Error(
        `Failed to load zeromq: ${(error as Error).message}. Fallback also failed: ${(fallbackError as Error).message}`,
      );
    }
  }
}

function formConnectionString(config: IKernelConnection, channel: string) {
  const portDelimiter = config.transport === "tcp" ? ":" : "-";
  const port = config[`${channel}_port` as keyof IKernelConnection];
  if (!port) {
    throw new Error(`Port not found for channel "${channel}"`);
  }
  return `${config.transport}://${config.ip}${portDelimiter}${port}`;
}

function generateUuid(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Raw ZMQ socket that wraps kernel channels in WebSocket-like interface.
 * Used by @jupyterlab/services for kernel communication.
 */
export class RawSocket {
  /**
   * Callback invoked when the socket connection opens.
   * Signature: (event: { target: unknown }) => void
   */
  public onopen: (event: { target: unknown }) => void = noop;
  /**
   * Callback invoked when a socket error occurs.
   * Signature: (event: { error: unknown; message: string; type: string; target: unknown }) => void
   */
  public onerror: (event: {
    error: unknown;
    message: string;
    type: string;
    target: unknown;
  }) => void = noop;
  /**
   * Callback invoked when the socket connection closes.
   * Signature: (event: { wasClean: boolean; code: number; reason: string; target: unknown }) => void
   */
  public onclose: (event: {
    wasClean: boolean;
    code: number;
    reason: string;
    target: unknown;
  }) => void = noop;
  /**
   * Callback invoked when a message is received from the kernel.
   * Signature: (event: { data: WebSocketWS.Data; type: string; target: unknown }) => void
   */
  public onmessage: (event: {
    data: WebSocketWS.Data;
    type: string;
    target: unknown;
  }) => void = noop;

  /**
   * Array of hooks to be called when receiving messages from the kernel.
   * Each hook receives serialized message data and must complete before the message is processed.
   * Used for intercepting and transforming incoming messages.
   */
  private receiveHooks: ((data: WebSocketWS.Data) => Promise<void>)[] = [];
  /**
   * Array of hooks to be called when sending messages to the kernel.
   * Each hook receives the message data and an optional callback for error reporting.
   * Used for intercepting and transforming outgoing messages.
   */
  private sendHooks: ((
    data: unknown,
    cb?: (err?: Error) => void,
  ) => Promise<void>)[] = [];
  /**
   * Promise chain for sequencing message receive operations.
   * Ensures messages are processed in order by chaining async operations.
   */
  private msgChain: Promise<unknown> = Promise.resolve();
  /**
   * Promise chain for sequencing message send operations.
   * Ensures messages are sent in order by chaining async operations.
   */
  private sendChain: Promise<unknown> = Promise.resolve();
  /**
   * ZMQ channels for kernel communication.
   * Contains shell, control, stdin (DEALER) and iopub (SUBSCRIBER) channels.
   */
  private channels: IChannels;
  /**
   * Flag indicating whether the socket has been closed.
   * Prevents message processing after closure.
   */
  private closed = false;

  /**
   * WebSocket protocol version string.
   * Empty for raw ZMQ sockets, matches WebSocket interface.
   */
  public readonly protocol = "";

  /**
   * Creates a new RawSocket instance that wraps ZMQ channels in a WebSocket-like interface.
   * Initializes kernel communication channels (shell, control, stdin, iopub).
   *
   * @param connection - Kernel connection configuration from the connection file
   * @param serialize - Function to serialize kernel messages to string or ArrayBuffer format
   */
  constructor(
    private connection: IKernelConnection,
    private serialize: (msg: KernelMessage.IMessage) => string | ArrayBuffer,
  ) {
    this.channels = this.generateChannels(connection);

    // IMPORTANT: The 'open' event is NOT emitted automatically here
    //
    // Initialization flow:
    // 1. RawSocket creates ZMQ channels (DEALER for shell/control/stdin, SUBSCRIBER for iopub)
    // 2. ZMQ sockets connect immediately to kernel ports
    // 3. The connection is ready as soon as channels are created
    // 4. The 'open' event should be emitted by LocalKernelProxy when:
    //    - The webview requests a WebSocket connection
    //    - After the kernel_info_request/reply handshake completes
    //
    // Why we don't emit 'open' here:
    // - KernelConnection auto-sends kernel_info_request when it receives 'open' event
    // - We want explicit control over when messages are sent to the kernel
    // - The webview should trigger the kernel_info_request flow via LocalKernelProxy
  }

  public dispose() {
    if (!this.closed) {
      this.close();
    }
  }

  public close(): void {
    this.closed = true;
    const closer = (closable: { close(): void }) => {
      try {
        closable.close();
      } catch (ex) {
        console.error(`Error during socket shutdown`, ex);
      }
    };
    closer(this.channels.control);
    closer(this.channels.iopub);
    closer(this.channels.shell);
    closer(this.channels.stdin);
  }

  public emit(event: string | symbol, ...args: unknown[]): boolean {
    switch (event) {
      case "message":
        this.onmessage({
          data: args[0] as WebSocketWS.Data,
          type: "message",
          target: this,
        });
        break;
      case "close":
        this.onclose({ wasClean: true, code: 0, reason: "", target: this });
        break;
      case "error":
        this.onerror({
          error: "",
          message: "error",
          type: "error",
          target: this,
        });
        break;
      case "open":
        this.onopen({ target: this });
        break;
    }
    return true;
  }

  public send(data: unknown, _callback: unknown): void {
    this.sendMessage(data as KernelMessage.IMessage, false);
  }

  public addReceiveHook(hook: (data: WebSocketWS.Data) => Promise<void>): void {
    this.receiveHooks.push(hook);
  }

  public removeReceiveHook(
    hook: (data: WebSocketWS.Data) => Promise<void>,
  ): void {
    this.receiveHooks = this.receiveHooks.filter((l) => l !== hook);
  }

  public addSendHook(
    hook: (
      data: unknown,
      cb?: ((err?: Error | undefined) => void) | undefined,
    ) => Promise<void>,
  ): void {
    this.sendHooks.push(hook);
  }

  public removeSendHook(
    hook: (
      data: unknown,
      cb?: ((err?: Error | undefined) => void) | undefined,
    ) => Promise<void>,
  ): void {
    this.sendHooks = this.sendHooks.filter((p) => p !== hook);
  }

  private generateChannel<T extends Subscriber | Dealer>(
    connection: IKernelConnection,
    channel: Channel,
    ctor: () => T,
  ): T {
    const result = ctor();
    result.connect(formConnectionString(connection, channel));
    this.processSocketMessages(channel, result).catch((ex) =>
      console.error(`Failed to read messages from channel ${channel}`, ex),
    );
    return result;
  }

  private async processSocketMessages(
    channel: Channel,
    readable: Subscriber | Dealer,
  ) {
    for await (const msg of readable) {
      if (this.closed) {
        break;
      } else {
        this.onIncomingMessage(channel, msg);
      }
    }
  }

  private generateChannels(connection: IKernelConnection): IChannels {
    // Use zeromq from node_modules with fallback mechanism

    const zmq = getZeroMQ();
    const routingId = generateUuid();

    const result: IChannels = {
      iopub: this.generateChannel(
        connection,
        "iopub",
        () =>
          new zmq.Subscriber({
            maxMessageSize: -1,
            receiveHighWaterMark: 0,
          }),
      ),
      shell: this.generateChannel(
        connection,
        "shell",
        () =>
          new zmq.Dealer({
            routingId,
            sendHighWaterMark: 0,
            receiveHighWaterMark: 0,
            maxMessageSize: -1,
          }),
      ),
      control: this.generateChannel(
        connection,
        "control",
        () =>
          new zmq.Dealer({
            routingId,
            sendHighWaterMark: 0,
            receiveHighWaterMark: 0,
            maxMessageSize: -1,
          }),
      ),
      stdin: this.generateChannel(
        connection,
        "stdin",
        () =>
          new zmq.Dealer({
            routingId,
            sendHighWaterMark: 0,
            receiveHighWaterMark: 0,
            maxMessageSize: -1,
          }),
      ),
    };

    result.iopub.subscribe();
    return result;
  }

  private onIncomingMessage(channel: Channel, data: unknown) {
    let decoded: KernelMessage.IMessage;
    if (this.closed) {
      // TypeScript needs the assertion here since {} doesn't have all required properties
      decoded = {} as unknown as KernelMessage.IMessage;
    } else {
      decoded = wireProtocol.decode(
        data as Buffer<ArrayBufferLike>[],
        this.connection.key,
        this.connection.signature_scheme,
      ) as unknown as KernelMessage.IMessage;
    }

    const message: KernelMessage.IMessage = {
      ...(decoded as KernelMessage.IMessage),
      channel,
    };

    if (this.receiveHooks.length) {
      this.msgChain = this.msgChain
        .then(() => {
          const serialized = this.serialize(message);
          return Promise.all(this.receiveHooks.map((p) => p(serialized)));
        })
        .then(() => this.fireOnMessage(message, channel));
    } else {
      this.msgChain = this.msgChain.then(() =>
        this.fireOnMessage(message, channel),
      );
    }
  }

  private fireOnMessage(message: KernelMessage.IMessage, channel: Channel) {
    if (!this.closed) {
      try {
        ensureFields(message, channel);
        this.onmessage({
          data: message as unknown as WebSocketWS.Data,
          type: "message",
          target: this,
        });
      } catch (ex) {
        console.error(
          `Failed to handle message ${JSON.stringify(message)}`,
          ex,
        );
      }
    }
  }

  private sendMessage(msg: KernelMessage.IMessage, bypassHooking: boolean) {
    const data = wireProtocol.encode(
      msg as Parameters<typeof wireProtocol.encode>[0],
      this.connection.key,
      this.connection.signature_scheme,
    );

    // Determine channel if not set - most request messages go to shell channel
    const channel = msg.channel || "shell";

    if (!bypassHooking && this.sendHooks.length) {
      const hookData = this.serialize(msg);
      this.sendChain = this.sendChain
        .then(() => Promise.all(this.sendHooks.map((s) => s(hookData, noop))))
        .then(async () => {
          try {
            await this.postToSocket(channel, data);
          } catch (ex) {
            console.error(
              `Failed to write data to kernel channel ${channel}`,
              ex,
            );
          }
        });
    } else {
      this.sendChain = this.sendChain.then(() => {
        this.postToSocket(channel, data);
      });
    }
    this.sendChain.catch(noop);
  }

  private postToSocket(channel: string, data: unknown) {
    const socket = (this.channels as unknown as Record<string, Dealer>)[
      channel
    ];
    if (socket) {
      socket.send(data as Parameters<Dealer["send"]>[0]).catch((exc) => {
        console.error(`Error communicating with kernel`, exc);
      });
    } else {
      console.error(
        `Attempting to send message on invalid channel: ${channel}`,
      );
    }
  }
}

/**
 * Create a new RawSocket kernel connection using @jupyterlab/services.
 * This function mimics what vscode-jupyter does in newRawKernel().
 */
export function createRawKernel(
  connection: IKernelConnection,
  clientId: string,
  username: string,
) {
  const jupyterLab = require("@jupyterlab/services");

  // Create custom WebSocket class that uses RawSocket
  class RawSocketWrapper extends RawSocket {
    constructor() {
      super(connection, jupyterLabSerialize);
    }
  }

  // Create server settings with custom WebSocket
  const settings = jupyterLab.ServerConnection.makeSettings({
    WebSocket: RawSocketWrapper as unknown,
    wsUrl: "RAW", // Special marker for raw kernel
  });

  // Create kernel connection using @jupyterlab/services
  const realKernel = new jupyterLab.KernelConnection({
    serverSettings: settings,
    clientId,
    handleComms: true,
    username,
    model: {
      id: generateUuid(),
      name: connection.kernel_name || "python3",
    },
  });

  return { realKernel, socket: null };
}

// Helper functions for message validation

const HEADER_FIELDS = ["username", "version", "session", "msg_id", "msg_type"];

const IOPUB_CONTENT_FIELDS = {
  stream: { name: "string", text: "string" },
  display_data: { data: "object", metadata: "object" },
  execute_input: { code: "string", execution_count: "number" },
  execute_result: {
    execution_count: "number",
    data: "object",
    metadata: "object",
  },
  error: { ename: "string", evalue: "string", traceback: "object" },
  status: {
    execution_state: [
      "string",
      ["starting", "idle", "busy", "restarting", "dead"],
    ],
  },
  clear_output: { wait: "boolean" },
  comm_open: { comm_id: "string", target_name: "string", data: "object" },
  comm_msg: { comm_id: "string", data: "object" },
  comm_close: { comm_id: "string" },
  shutdown_reply: { restart: "boolean" },
};

function ensureFields(message: KernelMessage.IMessage, channel: Channel) {
  const header = message.header as unknown as Record<string, unknown>;
  HEADER_FIELDS.forEach((field) => {
    if (typeof header[field] !== "string") {
      header[field] = "";
    }
  });
  if (typeof message.channel !== "string") {
    message.channel = channel;
  }
  if (!message.content) {
    message.content = {};
  }
  if (!message.metadata) {
    message.metadata = {};
  }
  if (message.channel === "iopub") {
    ensureIOPubContent(message);
  }
}

function ensureIOPubContent(message: KernelMessage.IMessage) {
  if (message.channel !== "iopub") {
    return;
  }
  const messageType = message.header
    .msg_type as keyof typeof IOPUB_CONTENT_FIELDS;
  if (messageType in IOPUB_CONTENT_FIELDS) {
    const fields = IOPUB_CONTENT_FIELDS[messageType] as Record<string, unknown>;
    if (fields === undefined) {
      return;
    }
    const names = Object.keys(fields);
    const content = message.content as Record<string, unknown>;
    for (let i = 0; i < names.length; i++) {
      let args = fields[names[i]];
      if (!Array.isArray(args)) {
        args = [args];
      }
      const fieldName = names[i];
      if (
        !(fieldName in content) ||
        typeof content[fieldName] !== (args as unknown[])[0]
      ) {
        switch ((args as unknown[])[0]) {
          case "string":
            content[fieldName] = "";
            break;
          case "boolean":
            content[fieldName] = false;
            break;
          case "object":
            content[fieldName] = {};
            break;
          case "number":
            content[fieldName] = 0;
            break;
        }
      }
    }
  }
}
