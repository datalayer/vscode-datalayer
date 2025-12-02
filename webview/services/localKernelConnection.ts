/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom KernelConnection implementation for local kernels.
 * Bypasses the standard Jupyter server session flow and directly connects to a local ZMQ kernel.
 *
 * This is necessary because local kernels don't have a Jupyter server managing sessions,
 * so we can't use the standard @jupyterlab/services session creation flow.
 *
 * @module localKernelConnection
 */

import {
  KernelMessage,
  Kernel,
  ServerConnection,
  KernelSpec,
} from "@jupyterlab/services";
import { ISignal, Signal } from "@lumino/signaling";
import { JSONObject } from "@lumino/coreutils";
import { ProxiedWebSocket } from "./serviceManager";

/**
 * A custom KernelConnection that wraps a local kernel WebSocket.
 * This bypasses the session management and provides a pre-connected kernel.
 */
export class LocalKernelConnection implements Kernel.IKernelConnection {
  /** The WebSocket connection to the local kernel. */
  private _ws: ProxiedWebSocket;
  /** The unique identifier of the kernel. */
  private _id: string;
  /** The name of the kernel. */
  private _name: string;
  /** The kernel model containing kernel specifications. */
  private _model: Kernel.IModel;
  /** Server settings for the kernel connection. */
  private _serverSettings: ServerConnection.ISettings;
  /** The client session ID. */
  private _clientId: string;
  /** The username associated with the kernel. */
  private _username: string = "";
  /** Whether this connection should handle comm (widget) messages. */
  private _handleComms: boolean = true;

  /** Signal emitted when kernel status changes. */
  private _statusChanged = new Signal<this, Kernel.Status>(this);
  /** Signal emitted when connection status changes. */
  private _connectionStatusChanged = new Signal<this, Kernel.ConnectionStatus>(
    this,
  );
  /** Signal emitted when the kernel is disposed. */
  private _disposed = new Signal<this, void>(this);
  /** Signal emitted when an iopub message is received. */
  private _iopubMessage = new Signal<this, KernelMessage.IIOPubMessage>(this);
  /** Signal emitted when an unhandled message is received. */
  private _unhandledMessage = new Signal<this, KernelMessage.IMessage>(this);
  /** Signal emitted for any message (sent or received). */
  private _anyMessage = new Signal<this, Kernel.IAnyMessageArgs>(this);
  /** Signal emitted when pending input state changes. */
  private _pendingMessages = new Signal<this, boolean>(this);
  /** Signal emitted when kernel properties change. */
  private _propertyChanged = new Signal<this, "path" | "name" | "type">(this);

  /** The current execution status of the kernel. */
  private _status: Kernel.Status = "unknown";
  /** The current connection status of the kernel. */
  private _connectionStatus: Kernel.ConnectionStatus = "connected";
  /** Whether the kernel connection has been disposed. */
  private _isDisposed = false;
  /** The cached kernel info reply. */
  private _infoReply: KernelMessage.IInfoReply | null = null;
  /** Promise that resolves when kernel info is received. */
  private _infoPromise: Promise<KernelMessage.IInfoReply>;
  /** Function to resolve the kernel info promise. */
  private _resolveInfo!: (value: KernelMessage.IInfoReply) => void;

  constructor(options: {
    id: string;
    name: string;
    model: Kernel.IModel;
    serverSettings: ServerConnection.ISettings;
    clientId: string;
    username?: string;
    handleComms?: boolean;
  }) {
    this._id = options.id;
    this._name = options.name;
    this._model = options.model;
    this._serverSettings = options.serverSettings;
    this._clientId = options.clientId;
    this._username = options.username || "";
    this._handleComms =
      options.handleComms !== undefined ? options.handleComms : true;

    // Create WebSocket with kernel channels endpoint
    const wsUrl = `ws://local-kernel-${this._id}.localhost/api/kernels/${this._id}/channels?session_id=${this._clientId}`;
    this._ws = new ProxiedWebSocket(wsUrl);

    // Set up message handling
    this._ws.onmessage = this._onWSMessage.bind(this);
    this._ws.onerror = () => {
      this._connectionStatus = "disconnected";
      this._connectionStatusChanged.emit(this._connectionStatus);
    };
    this._ws.onclose = () => {
      this._connectionStatus = "disconnected";
      this._connectionStatusChanged.emit(this._connectionStatus);
    };

    // Initialize info promise - will be resolved when kernel_info_reply is received
    this._infoPromise = new Promise<KernelMessage.IInfoReply>((resolve) => {
      // Store resolver to be called when we receive kernel_info_reply
      this._resolveInfo = resolve;
    });

    console.log(`[LocalKernelConnection] Created for kernel ${this._id}`);
  }

  /**
   * Handles incoming WebSocket messages and emits appropriate signals.
   */
  private _onWSMessage(...args: unknown[]): void {
    const event = args[0] as MessageEvent;
    try {
      const msg = JSON.parse(event.data) as KernelMessage.IMessage;
      const msgWithChannel = msg as KernelMessage.IMessage & {
        channel?: string;
      };

      console.log(
        `[LocalKernelConnection] Received message: ${msg.header.msg_type}, channel: ${msgWithChannel.channel}`,
      );

      // Emit anyMessage signal
      this._anyMessage.emit({ msg, direction: "recv" });

      // Handle different message types
      const channel = msgWithChannel.channel;
      if (channel === "iopub") {
        this._iopubMessage.emit(msg as KernelMessage.IIOPubMessage);

        // Handle status messages
        if (msg.header.msg_type === "status") {
          const content = msg.content as { execution_state?: Kernel.Status };
          const newStatus = content.execution_state;
          if (newStatus && newStatus !== this._status) {
            this._status = newStatus;
            this._statusChanged.emit(this._status);
            console.log(
              `[LocalKernelConnection] Status changed to: ${this._status}`,
            );
          }
        }
      } else if (channel === "shell") {
        // Handle kernel_info_reply
        if (msg.header.msg_type === "kernel_info_reply") {
          const content = msg.content as KernelMessage.IInfoReply;
          if (content.status === "ok") {
            this._infoReply = content;
            this._resolveInfo(content); // Resolve the promise
            console.log(
              `[LocalKernelConnection] Received kernel_info_reply, kernel is ready`,
            );
          }
        }
      }
    } catch (error) {
      console.error(`[LocalKernelConnection] Error processing message:`, error);
    }
  }

  // IKernelConnection interface implementation

  get id(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get model(): Kernel.IModel {
    return this._model;
  }

  get username(): string {
    return this._username;
  }

  set username(value: string) {
    this._username = value;
  }

  get clientId(): string {
    return this._clientId;
  }

  set clientId(value: string) {
    this._clientId = value;
  }

  get status(): Kernel.Status {
    return this._status;
  }

  get connectionStatus(): Kernel.ConnectionStatus {
    return this._connectionStatus;
  }

  get info(): Promise<KernelMessage.IInfoReply> {
    return this._infoPromise;
  }

  get handleComms(): boolean {
    return this._handleComms;
  }

  set handleComms(value: boolean) {
    this._handleComms = value;
  }

  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // Signals

  get statusChanged(): ISignal<this, Kernel.Status> {
    return this._statusChanged;
  }

  get connectionStatusChanged(): ISignal<this, Kernel.ConnectionStatus> {
    return this._connectionStatusChanged;
  }

  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  get iopubMessage(): ISignal<this, KernelMessage.IIOPubMessage> {
    return this._iopubMessage;
  }

  get unhandledMessage(): ISignal<this, KernelMessage.IMessage> {
    return this._unhandledMessage;
  }

  get anyMessage(): ISignal<this, Kernel.IAnyMessageArgs> {
    return this._anyMessage;
  }

  get propertyChanged(): ISignal<this, "path" | "name" | "type"> {
    return this._propertyChanged;
  }

  get hasPendingInput(): boolean {
    return false; // Local kernels don't need stdin handling
  }

  get pendingInput(): ISignal<this, boolean> {
    return this._pendingMessages;
  }

  get supportsSubshells(): boolean {
    return false; // Local kernels don't support subshells
  }

  get subshellId(): string | null {
    return null; // Local kernels don't have subshells
  }

  // Methods

  /**
   * Remove input guard from the kernel (no-op for local kernels).
   */
  removeInputGuard(): void {
    // No-op for local kernels
  }

  /**
   * Clone the kernel connection (not supported for local kernels).
   * @param _options - Optional clone options.
   * @throws {Error} Always throws as cloning is not implemented.
   */
  clone(
    _options?: Partial<Kernel.IKernelConnection.IOptions>,
  ): Kernel.IKernelConnection {
    throw new Error("Method not implemented: clone");
  }

  /**
   * Dispose of the kernel connection and clean up resources.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._ws.close();
    this._disposed.emit();
    Signal.clearData(this);
    console.log(
      `[LocalKernelConnection] Disposed kernel connection ${this._id}`,
    );
  }

  /**
   * Send a shell message to the kernel.
   * @param msg - The shell message to send.
   * @param _expectReply - Whether a reply is expected.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @returns A shell future that will resolve with the reply.
   */
  sendShellMessage<T extends KernelMessage.ShellMessageType>(
    msg: KernelMessage.IShellMessage<T>,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): Kernel.IShellFuture<
    KernelMessage.IShellMessage<T>,
    KernelMessage.IShellMessage<KernelMessage.ShellMessageType>
  > {
    const msgWithChannel = { ...msg, channel: "shell" };
    this._ws.send(JSON.stringify(msgWithChannel));
    this._anyMessage.emit({ msg, direction: "send" });

    // Create a Future to handle the response
    return new KernelShellFuture(msg, this._ws, this._anyMessage);
  }

  /**
   * Send a control message to the kernel.
   * @param msg - The control message to send.
   * @param _expectReply - Whether a reply is expected.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @returns A control future that will resolve with the reply.
   */
  sendControlMessage<T extends KernelMessage.ControlMessageType>(
    msg: KernelMessage.IControlMessage<T>,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IControlMessage<T>,
    KernelMessage.IControlMessage<KernelMessage.ControlMessageType>
  > {
    const msgWithChannel = { ...msg, channel: "control" };
    this._ws.send(JSON.stringify(msgWithChannel));
    this._anyMessage.emit({ msg, direction: "send" });

    // Create a Future to handle the response
    return new KernelControlFuture(msg, this._ws, this._anyMessage);
  }

  /**
   * Reconnect to the kernel (no-op for local kernels).
   * @returns A resolved promise.
   */
  reconnect(): Promise<void> {
    console.log(
      `[LocalKernelConnection] Reconnect called (no-op for local kernels)`,
    );
    return Promise.resolve();
  }

  /**
   * Shutdown the kernel connection.
   * @returns A resolved promise.
   */
  shutdown(): Promise<void> {
    console.log(`[LocalKernelConnection] Shutdown called`);
    this.dispose();
    return Promise.resolve();
  }

  /**
   * Get the kernel specification.
   * @returns A promise that resolves to the kernel spec model.
   */
  get spec(): Promise<KernelSpec.ISpecModel | undefined> {
    // Return a promise that resolves to a spec based on the kernel name
    return Promise.resolve({
      name: this._name,
      language: "python",
      display_name: this._name,
      argv: [],
      env: {},
      resources: {},
    });
  }

  /**
   * Interrupt the kernel execution.
   * @returns A resolved promise.
   */
  interrupt(): Promise<void> {
    console.log(`[LocalKernelConnection] Interrupt called`);
    // For local kernels, this would send an interrupt signal to the process
    // For now, we'll just log it
    return Promise.resolve();
  }

  /**
   * Restart the kernel.
   * @returns A resolved promise.
   */
  restart(): Promise<void> {
    console.log(`[LocalKernelConnection] Restart called`);
    // For local kernels, this would restart the kernel process
    // For now, we'll just log it
    return Promise.resolve();
  }

  /**
   * Request creation of a subshell (not supported for local kernels).
   * @param _content - The subshell creation request content.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @throws {Error} Always throws as subshells are not supported.
   */
  requestCreateSubshell(
    _content: KernelMessage.ICreateSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.ICreateSubshellRequestMsg,
    KernelMessage.ICreateSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestCreateSubshell");
  }

  /**
   * Request deletion of a subshell (not supported for local kernels).
   * @param _content - The subshell deletion request content.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @throws {Error} Always throws as subshells are not supported.
   */
  requestDeleteSubshell(
    _content: KernelMessage.IDeleteSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IDeleteSubshellRequestMsg,
    KernelMessage.IDeleteSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestDeleteSubshell");
  }

  /**
   * Request listing of subshells (not supported for local kernels).
   * @param _content - The subshell list request content.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @throws {Error} Always throws as subshells are not supported.
   */
  requestListSubshell(
    _content: KernelMessage.IListSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IListSubshellRequestMsg,
    KernelMessage.IListSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestListSubshell");
  }

  /**
   * Request kernel information.
   * @returns A promise that resolves with the kernel info reply.
   */
  requestKernelInfo(): Promise<KernelMessage.IInfoReplyMsg | undefined> {
    console.log(`[LocalKernelConnection] Requesting kernel info`);

    // If we already have info, return it
    if (this._infoReply) {
      return Promise.resolve({
        header: {
          msg_id: "",
          msg_type: "kernel_info_reply",
          username: this._username,
          session: this._clientId,
          date: new Date().toISOString(),
          version: "5.3",
        },
        _parent_header:
          {} as unknown as KernelMessage.IHeader<"kernel_info_request">,
        metadata: {},
        content: this._infoReply,
        channel: "shell",
        buffers: [],
      } as unknown as KernelMessage.IInfoReplyMsg);
    }

    // Otherwise send a kernel_info_request
    const msg: KernelMessage.IInfoRequestMsg = {
      header: {
        msg_id: `kernel_info_request-${Date.now()}`,
        msg_type: "kernel_info_request",
        username: this._username,
        session: this._clientId,
        date: new Date().toISOString(),
        version: "5.3",
      },
      parent_header:
        {} as unknown as KernelMessage.IHeader<KernelMessage.MessageType>,
      metadata: {},
      content: {},
      channel: "shell",
      buffers: [],
    };

    const future = this.sendShellMessage(msg, true, false);
    return new Promise((resolve, reject) => {
      future.onReply = (reply: unknown) => {
        const replyMsg = reply as KernelMessage.IInfoReplyMsg;
        if (replyMsg.content.status === "ok") {
          this._infoReply = replyMsg.content;
          this._resolveInfo(replyMsg.content); // Resolve the promise
          resolve(replyMsg);
        } else {
          reject(new Error("Kernel info request failed"));
        }
      };
    });
  }

  /**
   * Request code completion (not supported for local kernels).
   * @param _content - The completion request content.
   * @throws {Error} Always throws as completion is not implemented.
   */
  requestComplete(
    _content: KernelMessage.ICompleteRequestMsg["content"],
  ): Promise<KernelMessage.ICompleteReplyMsg> {
    throw new Error("Method not implemented.");
  }

  /**
   * Request object inspection (not supported for local kernels).
   * @param _content - The inspection request content.
   * @throws {Error} Always throws as inspection is not implemented.
   */
  requestInspect(
    _content: KernelMessage.IInspectRequestMsg["content"],
  ): Promise<KernelMessage.IInspectReplyMsg> {
    throw new Error("Method not implemented.");
  }

  /**
   * Request command history (returns empty history).
   * @param _content - The history request content.
   * @returns A promise that resolves with an empty history reply.
   */
  async requestHistory(
    _content: KernelMessage.IHistoryRequestMsg["content"],
  ): Promise<KernelMessage.IHistoryReplyMsg> {
    console.log(
      `[LocalKernelConnection] requestHistory called (returning empty history)`,
    );

    // Return empty history - we don't track history for local kernels
    const reply: KernelMessage.IHistoryReplyMsg = {
      header: {
        msg_id: `history_reply-${Date.now()}`,
        msg_type: "history_reply",
        username: this._username,
        session: this._clientId,
        date: new Date().toISOString(),
        version: "5.3",
      },
      parent_header: {} as unknown as KernelMessage.IHeader<"history_request">,
      metadata: {},
      content: {
        status: "ok",
        history: [],
      },
      channel: "shell",
      buffers: [],
    };
    return reply;
  }

  /**
   * Execute code in the kernel.
   * @param content - The code execution request content.
   * @param disposeOnDone - Whether to dispose the future after completion.
   * @param metadata - Optional metadata to include with the request.
   * @returns A shell future that will resolve with the execution reply.
   */
  requestExecute(
    content: KernelMessage.IExecuteRequestMsg["content"],
    disposeOnDone?: boolean,
    metadata?: unknown,
  ): Kernel.IShellFuture<
    KernelMessage.IExecuteRequestMsg,
    KernelMessage.IExecuteReplyMsg
  > {
    console.log(`[LocalKernelConnection] Executing code:`, content.code);

    const msg: KernelMessage.IExecuteRequestMsg = {
      header: {
        msg_id: `execute_request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        msg_type: "execute_request",
        username: this._username,
        session: this._clientId,
        date: new Date().toISOString(),
        version: "5.3",
      },
      parent_header:
        {} as unknown as KernelMessage.IHeader<KernelMessage.MessageType>,
      metadata: (metadata as JSONObject) || {},
      content,
      channel: "shell",
      buffers: [],
    };

    return this.sendShellMessage(
      msg,
      true,
      disposeOnDone,
    ) as Kernel.IShellFuture<
      KernelMessage.IExecuteRequestMsg,
      KernelMessage.IExecuteReplyMsg
    >;
  }

  /**
   * Request debugging information (not supported for local kernels).
   * @param _content - The debug request content.
   * @param _disposeOnDone - Whether to dispose after completion.
   * @throws {Error} Always throws as debugging is not implemented.
   */
  requestDebug(
    _content: KernelMessage.IDebugRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IDebugRequestMsg,
    KernelMessage.IDebugReplyMsg
  > {
    throw new Error("Method not implemented.");
  }

  /**
   * Check if code is complete (not supported for local kernels).
   * @param _content - The is_complete request content.
   * @throws {Error} Always throws as is_complete is not implemented.
   */
  requestIsComplete(
    _content: KernelMessage.IIsCompleteRequestMsg["content"],
  ): Promise<KernelMessage.IIsCompleteReplyMsg> {
    throw new Error("Method not implemented.");
  }

  /**
   * Request comm information (not supported for local kernels).
   * @param _content - The comm info request content.
   * @throws {Error} Always throws as comm info is not implemented.
   */
  requestCommInfo(
    _content: KernelMessage.ICommInfoRequestMsg["content"],
  ): Promise<KernelMessage.ICommInfoReplyMsg> {
    throw new Error("Method not implemented.");
  }

  /**
   * Send an input reply to the kernel (not supported for local kernels).
   * @param _content - The input reply content.
   * @param _parent_header - The parent message header.
   * @throws {Error} Always throws as input reply is not implemented.
   */
  sendInputReply(
    _content: KernelMessage.IInputReplyMsg["content"],
    _parent_header: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }

  /**
   * Register a message hook for IOPub messages (no-op for local kernels).
   * @param _msgId - The message ID to hook.
   * @param _hook - The hook function to register.
   */
  registerMessageHook(
    _msgId: string,
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for now
  }

  /**
   * Remove a message hook (no-op for local kernels).
   * @param _msgId - The message ID to unhook.
   * @param _hook - The hook function to remove.
   */
  removeMessageHook(
    _msgId: string,
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for now
  }

  /**
   * Register a comm target (no-op for local kernels).
   * @param _targetName - The name of the comm target.
   * @param _callback - The callback to invoke when a comm is opened.
   */
  registerCommTarget(
    _targetName: string,
    _callback: (
      comm: Kernel.IComm,
      msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // No-op for now
  }

  /**
   * Remove a comm target (no-op for local kernels).
   * @param _targetName - The name of the comm target.
   * @param _callback - The callback to remove.
   */
  removeCommTarget(
    _targetName: string,
    _callback: (
      comm: Kernel.IComm,
      msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // No-op for now
  }

  /**
   * Create a comm (not supported for local kernels).
   * @param _targetName - The name of the comm target.
   * @param _commId - Optional comm ID.
   * @throws {Error} Always throws as comm creation is not implemented.
   */
  createComm(_targetName: string, _commId?: string): Kernel.IComm {
    throw new Error("Method not implemented.");
  }

  /**
   * Check if a comm with the given ID exists.
   * @param _commId - The comm ID to check.
   * @returns Always returns false for local kernels.
   */
  hasComm(_commId: string): boolean {
    return false;
  }
}

/**
 * A Future implementation for shell messages.
 */
class KernelShellFuture<
  REQUEST extends KernelMessage.IShellMessage = KernelMessage.IShellMessage,
  REPLY extends KernelMessage.IShellMessage = KernelMessage.IShellMessage,
> implements Kernel.IShellFuture<REQUEST, REPLY>
{
  /** Signal that emits all kernel messages. */
  private _anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>;
  /** Signal emitted when the future is done. */
  private _done = new Signal<this, REPLY>(this);
  /** Promise that resolves when the future is done. */
  private _donePromise: Promise<REPLY>;
  /** Function to resolve the done promise. */
  private _doneResolve!: (value: REPLY) => void;
  /** The reply message received from the kernel. */
  private _reply: REPLY | undefined;
  /** Whether this future has been disposed. */
  private _isDisposed = false;
  /** The message ID of the request this future is tracking. */
  private _msgId: string;

  /** The request message sent to the kernel. */
  msg: REQUEST;
  /** Callback invoked when a reply is received. */
  onReply: (msg: REPLY) => void | PromiseLike<void>;
  /** Callback invoked when an iopub message is received. */
  onIOPub: (msg: KernelMessage.IIOPubMessage) => void | PromiseLike<void>;
  /** Callback invoked when a stdin message is received. */
  onStdin: (msg: KernelMessage.IStdinMessage) => void | PromiseLike<void>;

  /**
   * Create a new shell future.
   * @param msg - The request message.
   * @param _ws - The WebSocket connection (unused).
   * @param anyMessage - Signal that emits all kernel messages.
   */
  constructor(
    msg: REQUEST,
    _ws: ProxiedWebSocket,
    anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>,
  ) {
    this.msg = msg;
    this._anyMessage = anyMessage;
    this._msgId = msg.header.msg_id;

    // Initialize handlers as no-ops
    this.onReply = () => {};
    this.onIOPub = () => {};
    this.onStdin = () => {};

    // Create a promise that resolves when done signal emits
    this._donePromise = new Promise<REPLY>((resolve) => {
      this._doneResolve = resolve;
    });

    // Listen for responses
    this._anyMessage.connect(this._handleMessage, this);
  }

  /**
   * Handle incoming messages and route them to appropriate handlers.
   * @param _sender - The signal sender (unused).
   * @param args - The message arguments.
   */
  private _handleMessage(_sender: unknown, args: Kernel.IAnyMessageArgs): void {
    if (args.direction === "send") {
      return;
    }

    const msg = args.msg;
    const parentMsgId = (msg.parent_header as { msg_id?: string })?.msg_id;

    // Check if this message is a reply to our request
    if (parentMsgId === this._msgId) {
      const channel = (msg as { channel?: string }).channel;

      if (channel === "shell" && msg.header.msg_type.endsWith("_reply")) {
        this._reply = msg as unknown as REPLY;
        if (this.onReply) {
          this.onReply(this._reply);
        }
        this._done.emit(this._reply);
        this._doneResolve(this._reply); // Resolve the promise
      } else if (channel === "iopub") {
        if (this.onIOPub) {
          this.onIOPub(msg as KernelMessage.IIOPubMessage);
        }
      } else if (channel === "stdin") {
        if (this.onStdin) {
          this.onStdin(msg as KernelMessage.IStdinMessage);
        }
      }
    }
  }

  /**
   * Promise that resolves when the future completes.
   */
  get done(): Promise<REPLY> {
    return this._donePromise;
  }

  /**
   * Whether this future has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Signal emitted when the future is disposed.
   */
  get disposed(): ISignal<this, void> {
    return new Signal(this);
  }

  /**
   * Dispose the future and clean up resources.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._anyMessage.disconnect(this._handleMessage, this);
    Signal.clearData(this);
  }

  /**
   * Register a message hook for IOPub messages (no-op for shell futures).
   * @param _hook - The hook function to register.
   */
  registerMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op
  }

  /**
   * Remove a message hook (no-op for shell futures).
   * @param _hook - The hook function to remove.
   */
  removeMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op
  }

  /**
   * Send an input reply (not supported for shell futures).
   * @param _content - The input reply content.
   * @param _parent_header - The parent message header.
   * @throws {Error} Always throws as input reply is not supported.
   */
  sendInputReply(
    _content: KernelMessage.IInputReplyMsg["content"],
    _parent_header: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }
}

/**
 * A Future implementation for control messages.
 * Control messages and shell messages have the same structure, just different channel names.
 * We duplicate the implementation to avoid type incompatibility issues with inheritance.
 */
class KernelControlFuture<
  REQUEST extends KernelMessage.IControlMessage = KernelMessage.IControlMessage,
  REPLY extends KernelMessage.IControlMessage = KernelMessage.IControlMessage,
> implements Kernel.IControlFuture<REQUEST, REPLY>
{
  /** Signal that emits all kernel messages. */
  private _anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>;
  /** Signal emitted when the future is done. */
  private _done = new Signal<this, REPLY>(this);
  /** Promise that resolves when the future is done. */
  private _donePromise: Promise<REPLY>;
  /** Function to resolve the done promise. */
  private _doneResolve!: (value: REPLY) => void;
  /** The reply message received from the kernel. */
  private _reply: REPLY | undefined;
  /** Whether this future has been disposed. */
  private _isDisposed = false;
  /** The message ID of the request this future is tracking. */
  private _msgId: string;

  /** The request message sent to the kernel. */
  msg: REQUEST;
  /** Callback invoked when a reply is received. */
  onReply: (msg: REPLY) => void | PromiseLike<void>;
  /** Callback invoked when an iopub message is received. */
  onIOPub: (msg: KernelMessage.IIOPubMessage) => void | PromiseLike<void>;
  /** Callback invoked when a stdin message is received. */
  onStdin: (msg: KernelMessage.IStdinMessage) => void | PromiseLike<void>;

  /**
   * Create a new control future.
   * @param msg - The request message.
   * @param _ws - The WebSocket connection (unused).
   * @param anyMessage - Signal that emits all kernel messages.
   */
  constructor(
    msg: REQUEST,
    _ws: ProxiedWebSocket,
    anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>,
  ) {
    this.msg = msg;
    this._anyMessage = anyMessage;
    this._msgId = msg.header.msg_id;

    // Initialize handlers as no-ops
    this.onReply = () => {};
    this.onIOPub = () => {};
    this.onStdin = () => {};

    // Create a promise that resolves when done signal emits
    this._donePromise = new Promise<REPLY>((resolve) => {
      this._doneResolve = resolve;
    });

    // Listen for responses
    this._anyMessage.connect(this._handleMessage, this);
  }

  /**
   * Handle incoming messages and route them to appropriate handlers.
   * @param _sender - The signal sender (unused).
   * @param args - The message arguments.
   */
  private _handleMessage(_sender: unknown, args: Kernel.IAnyMessageArgs): void {
    if (args.direction === "send") {
      return;
    }

    const msg = args.msg;
    const parentMsgId = (msg.parent_header as { msg_id?: string })?.msg_id;

    // Check if this message is a reply to our request
    if (parentMsgId === this._msgId) {
      const channel = (msg as { channel?: string }).channel;

      if (channel === "control" && msg.header.msg_type.endsWith("_reply")) {
        this._reply = msg as unknown as REPLY;
        if (this.onReply) {
          this.onReply(this._reply);
        }
        this._done.emit(this._reply);
        this._doneResolve(this._reply); // Resolve the promise
      } else if (channel === "iopub") {
        if (this.onIOPub) {
          this.onIOPub(msg as KernelMessage.IIOPubMessage);
        }
      } else if (channel === "stdin") {
        if (this.onStdin) {
          this.onStdin(msg as KernelMessage.IStdinMessage);
        }
      }
    }
  }

  /**
   * Promise that resolves when the future completes.
   */
  get done(): Promise<REPLY> {
    return this._donePromise;
  }

  /**
   * Whether this future has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Signal emitted when the future is disposed.
   */
  get disposed(): ISignal<this, void> {
    return new Signal(this);
  }

  /**
   * Dispose the future and clean up resources.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._anyMessage.disconnect(this._handleMessage, this);
    Signal.clearData(this);
  }

  /**
   * Register a message hook for IOPub messages (not implemented for local kernels).
   * @param _hook - The hook function to register.
   */
  registerMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented for local kernels
  }

  /**
   * Remove a message hook (not implemented for local kernels).
   * @param _hook - The hook function to remove.
   */
  removeMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented for local kernels
  }

  /**
   * Send an input reply (not implemented for local kernels).
   * @param _content - The input reply content.
   * @param _parent_header - The parent message header.
   */
  sendInputReply(
    _content: KernelMessage.IInputReply,
    _parent_header: KernelMessage.IHeader<KernelMessage.MessageType>,
  ): void {
    // Not implemented for local kernels
  }
}
