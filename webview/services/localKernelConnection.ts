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
  private _ws: ProxiedWebSocket;
  private _id: string;
  private _name: string;
  private _model: Kernel.IModel;
  private _serverSettings: ServerConnection.ISettings;
  private _clientId: string;
  private _username: string = "";
  private _handleComms: boolean = true;

  // Signals
  private _statusChanged = new Signal<this, Kernel.Status>(this);
  private _connectionStatusChanged = new Signal<this, Kernel.ConnectionStatus>(
    this,
  );
  private _disposed = new Signal<this, void>(this);
  private _iopubMessage = new Signal<this, KernelMessage.IIOPubMessage>(this);
  private _unhandledMessage = new Signal<this, KernelMessage.IMessage>(this);
  private _anyMessage = new Signal<this, Kernel.IAnyMessageArgs>(this);
  private _pendingMessages = new Signal<this, boolean>(this);

  private _status: Kernel.Status = "unknown";
  private _connectionStatus: Kernel.ConnectionStatus = "connected";
  private _isDisposed = false;
  private _infoReply: KernelMessage.IInfoReply | null = null;
  private _infoPromise: Promise<KernelMessage.IInfoReply>;
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

  removeInputGuard(): void {
    // No-op for local kernels
  }

  clone(
    _options?: Partial<Kernel.IKernelConnection.IOptions>,
  ): Kernel.IKernelConnection {
    throw new Error("Method not implemented: clone");
  }

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

  reconnect(): Promise<void> {
    console.log(
      `[LocalKernelConnection] Reconnect called (no-op for local kernels)`,
    );
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    console.log(`[LocalKernelConnection] Shutdown called`);
    this.dispose();
    return Promise.resolve();
  }

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

  interrupt(): Promise<void> {
    console.log(`[LocalKernelConnection] Interrupt called`);
    // For local kernels, this would send an interrupt signal to the process
    // For now, we'll just log it
    return Promise.resolve();
  }

  restart(): Promise<void> {
    console.log(`[LocalKernelConnection] Restart called`);
    // For local kernels, this would restart the kernel process
    // For now, we'll just log it
    return Promise.resolve();
  }

  requestCreateSubshell(
    _content: KernelMessage.ICreateSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.ICreateSubshellRequestMsg,
    KernelMessage.ICreateSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestCreateSubshell");
  }

  requestDeleteSubshell(
    _content: KernelMessage.IDeleteSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IDeleteSubshellRequestMsg,
    KernelMessage.IDeleteSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestDeleteSubshell");
  }

  requestListSubshell(
    _content: KernelMessage.IListSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IListSubshellRequestMsg,
    KernelMessage.IListSubshellReplyMsg
  > {
    throw new Error("Method not implemented: requestListSubshell");
  }

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

  requestComplete(
    _content: KernelMessage.ICompleteRequestMsg["content"],
  ): Promise<KernelMessage.ICompleteReplyMsg> {
    throw new Error("Method not implemented.");
  }

  requestInspect(
    _content: KernelMessage.IInspectRequestMsg["content"],
  ): Promise<KernelMessage.IInspectReplyMsg> {
    throw new Error("Method not implemented.");
  }

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

  requestDebug(
    _content: KernelMessage.IDebugRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): Kernel.IControlFuture<
    KernelMessage.IDebugRequestMsg,
    KernelMessage.IDebugReplyMsg
  > {
    throw new Error("Method not implemented.");
  }

  requestIsComplete(
    _content: KernelMessage.IIsCompleteRequestMsg["content"],
  ): Promise<KernelMessage.IIsCompleteReplyMsg> {
    throw new Error("Method not implemented.");
  }

  requestCommInfo(
    _content: KernelMessage.ICommInfoRequestMsg["content"],
  ): Promise<KernelMessage.ICommInfoReplyMsg> {
    throw new Error("Method not implemented.");
  }

  sendInputReply(
    _content: KernelMessage.IInputReplyMsg["content"],
    _parent_header: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }

  registerMessageHook(
    _msgId: string,
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for now
  }

  removeMessageHook(
    _msgId: string,
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for now
  }

  registerCommTarget(
    _targetName: string,
    _callback: (
      comm: Kernel.IComm,
      msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // No-op for now
  }

  removeCommTarget(
    _targetName: string,
    _callback: (
      comm: Kernel.IComm,
      msg: KernelMessage.ICommOpenMsg,
    ) => void | PromiseLike<void>,
  ): void {
    // No-op for now
  }

  createComm(_targetName: string, _commId?: string): Kernel.IComm {
    throw new Error("Method not implemented.");
  }

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
  private _anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>;
  private _done = new Signal<this, REPLY>(this);
  private _donePromise: Promise<REPLY>;
  private _doneResolve!: (value: REPLY) => void;
  private _reply: REPLY | undefined;
  private _isDisposed = false;
  private _msgId: string;

  msg: REQUEST;
  onReply: (msg: REPLY) => void | PromiseLike<void>;
  onIOPub: (msg: KernelMessage.IIOPubMessage) => void | PromiseLike<void>;
  onStdin: (msg: KernelMessage.IStdinMessage) => void | PromiseLike<void>;

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

  get done(): Promise<REPLY> {
    return this._donePromise;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get disposed(): ISignal<this, void> {
    return new Signal(this);
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._anyMessage.disconnect(this._handleMessage, this);
    Signal.clearData(this);
  }

  registerMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op
  }

  removeMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op
  }

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
  private _anyMessage: Signal<unknown, Kernel.IAnyMessageArgs>;
  private _done = new Signal<this, REPLY>(this);
  private _donePromise: Promise<REPLY>;
  private _doneResolve!: (value: REPLY) => void;
  private _reply: REPLY | undefined;
  private _isDisposed = false;
  private _msgId: string;

  msg: REQUEST;
  onReply: (msg: REPLY) => void | PromiseLike<void>;
  onIOPub: (msg: KernelMessage.IIOPubMessage) => void | PromiseLike<void>;
  onStdin: (msg: KernelMessage.IStdinMessage) => void | PromiseLike<void>;

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

  get done(): Promise<REPLY> {
    return this._donePromise;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get disposed(): ISignal<this, void> {
    return new Signal(this);
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._anyMessage.disconnect(this._handleMessage, this);
    Signal.clearData(this);
  }

  registerMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented for local kernels
  }

  removeMessageHook(
    _hook: (msg: KernelMessage.IIOPubMessage) => boolean | PromiseLike<boolean>,
  ): void {
    // Not implemented for local kernels
  }

  sendInputReply(
    _content: KernelMessage.IInputReply,
    _parent_header: KernelMessage.IHeader<KernelMessage.MessageType>,
  ): void {
    // Not implemented for local kernels
  }
}
