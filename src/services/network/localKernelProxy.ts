/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Proxy for local ZMQ kernels that simulates a WebSocket connection.
 * Translates webview WebSocket messages to @jupyterlab/services kernel methods.
 *
 * @module services/network/localKernelProxy
 */

import type * as vscode from "vscode";
import type { Kernel, KernelMessage } from "@jupyterlab/services";
import type { LocalKernelClient } from "../kernel/localKernelClient";

/**
 * Simulates a WebSocket connection for a local ZMQ kernel.
 * Routes kernel protocol messages between the webview and the LocalKernelClient.
 * Supports multiple WebSocket connections to the same kernel.
 */
export class LocalKernelProxy {
  private _kernel: Kernel.IKernelConnection | undefined;
  private _rawSocket: unknown; // RawSocket from the kernel connection
  private _messageHandlers = new Map<
    string,
    (msg: KernelMessage.IMessage) => void
  >();
  private _clientIds = new Set<string>(); // Track all WebSocket connection IDs

  // Track session ID mapping: request msg_id -> JupyterLab's session ID
  // We need this because the real kernel uses its own session ID, but JupyterLab
  // expects replies to use the same session ID as the request
  private _sessionIdMap = new Map<string, string>();
  private _kernelSessionId: string | null = null;

  constructor(
    private readonly _kernelClient: LocalKernelClient,
    private readonly _webview: vscode.WebviewPanel,
    initialClientId: string,
  ) {
    this._kernel = this._kernelClient.getKernel();

    if (!this._kernel) {
      throw new Error("Kernel not started");
    }

    // Get the underlying RawSocket via public method
    // This is necessary to bypass KernelConnection's state management
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._rawSocket = this._kernelClient.getRawSocket() as any;

    if (!this._rawSocket) {
      throw new Error("RawSocket not available");
    }

    // Register the initial client ID
    this._clientIds.add(initialClientId);

    // Set up listeners for all kernel messages
    this._setupKernelListeners();

    // Also listen for shell replies directly from RawSocket
    // RawSocket's onmessage receives ALL messages (IOPub, shell, stdin, control)
    // We forward them all to the webview
    // NOTE: We DON'T call the original onmessage handler because it tries to
    // deserialize the message before we can sanitize the Buffer objects
    (
      this._rawSocket as {
        onmessage?: (event: { data?: KernelMessage.IMessage }) => void;
      }
    ).onmessage = (event: { data?: KernelMessage.IMessage }) => {
      // Forward to webview with sanitized buffers
      if (event.data) {
        console.log(
          `[LocalKernelProxy] RawSocket message:`,
          event.data.header?.msg_type,
        );
        this._forwardKernelMessage(event.data);
      }
    };

    // Notify webview that connection is open
    console.log(
      `[LocalKernelProxy] Sending websocket-open to ${initialClientId}`,
    );
    this._sendToWebview("websocket-open", {}, initialClientId);
    console.log(`[LocalKernelProxy] WebSocket opened for ${initialClientId}`);
  }

  /**
   * Registers an additional WebSocket connection to this kernel.
   * Returns an empty object for the websocket-open message body.
   */
  public addConnection(clientId: string): Record<string, never> {
    this._clientIds.add(clientId);
    console.log(
      `[LocalKernelProxy] Added connection ${clientId}, total connections: ${this._clientIds.size}`,
    );
    return {};
  }

  /**
   * Removes a WebSocket connection from this kernel.
   * Returns true if there are still active connections, false if this was the last one.
   */
  public removeConnection(clientId: string): boolean {
    this._clientIds.delete(clientId);
    console.log(
      `[LocalKernelProxy] Removed connection ${clientId}, remaining connections: ${this._clientIds.size}`,
    );
    return this._clientIds.size > 0;
  }

  /**
   * Sets up listeners for kernel messages and forwards them to the webview.
   */
  private _setupKernelListeners(): void {
    if (!this._kernel) {
      return;
    }

    // Listen to all IOPub messages (outputs, status changes, etc.)
    this._kernel.iopubMessage.connect((_sender, msg) => {
      this._forwardKernelMessage(msg);
    });

    // Listen to status changes
    this._kernel.statusChanged.connect((_sender, status) => {
      console.log(`[LocalKernelProxy] Kernel status changed: ${status}`);
    });
  }

  /**
   * Forwards a kernel message to the webview as a WebSocket message.
   * Sanitizes Buffer objects in the idents field to proper format for postMessage.
   * Also translates the kernel's session ID to JupyterLab's expected session ID.
   */
  private _forwardKernelMessage(msg: KernelMessage.IMessage): void {
    // Sanitize the message before sending to webview
    // The idents field may contain Node.js Buffer objects that serialize as
    // {"type":"Buffer","data":[...]} which can't be deserialized by DataView
    const sanitizedMsg: KernelMessage.IMessage & {
      idents?: unknown[];
      header: KernelMessage.IHeader & { session: string };
      parent_header?: Partial<KernelMessage.IHeader> & {
        msg_id?: string;
        session?: string;
      };
    } = { ...msg };

    if (sanitizedMsg.idents && Array.isArray(sanitizedMsg.idents)) {
      sanitizedMsg.idents = sanitizedMsg.idents.map((ident: unknown) => {
        // If this is a serialized Buffer object, convert to array of numbers
        if (
          ident &&
          typeof ident === "object" &&
          (ident as { type?: string; data?: unknown[] }).type === "Buffer" &&
          Array.isArray((ident as { type?: string; data?: unknown[] }).data)
        ) {
          return (ident as { data: unknown[] }).data;
        }
        // If it's already a Buffer, convert to array of numbers
        if (Buffer.isBuffer(ident)) {
          return Array.from(ident);
        }
        // If it's a Uint8Array, convert to array of numbers
        if (ident instanceof Uint8Array) {
          return Array.from(ident);
        }
        // Otherwise return as-is
        return ident;
      });
    }

    // CRITICAL: Translate session IDs
    // The kernel uses its own session ID, but JupyterLab expects messages to use
    // the session ID from the corresponding request

    // Store the kernel's actual session ID
    if (
      !this._kernelSessionId &&
      sanitizedMsg.header &&
      sanitizedMsg.header.session
    ) {
      this._kernelSessionId = sanitizedMsg.header.session;
    }

    // For messages with a parent_header (replies), translate to the request's session ID
    if (sanitizedMsg.parent_header && sanitizedMsg.parent_header.msg_id) {
      const parentMsgId = sanitizedMsg.parent_header.msg_id;
      const jupyterlabSessionId = this._sessionIdMap.get(parentMsgId);

      if (jupyterlabSessionId) {
        // This is a reply to a request we sent - translate the session ID
        const originalKernelSessionId = sanitizedMsg.header.session;
        sanitizedMsg.header.session = jupyterlabSessionId;

        console.log(
          `[LocalKernelProxy] Translated session ID: ${originalKernelSessionId} -> ${jupyterlabSessionId} for ${sanitizedMsg.header.msg_type}`,
        );
      }
    } else if (
      this._kernelSessionId &&
      sanitizedMsg.header &&
      sanitizedMsg.header.session === this._kernelSessionId
    ) {
      // For unsolicited messages (no parent_header) like status updates,
      // use the FIRST session ID we saw from JupyterLab
      const firstJupyterLabSessionId = Array.from(
        this._sessionIdMap.values(),
      )[0];
      if (firstJupyterLabSessionId) {
        const originalKernelSessionId = sanitizedMsg.header.session;
        sanitizedMsg.header.session = firstJupyterLabSessionId;
        console.log(
          `[LocalKernelProxy] Translated unsolicited message session ID: ${originalKernelSessionId} -> ${firstJupyterLabSessionId} for ${sanitizedMsg.header.msg_type}`,
        );
      }
    }

    // Serialize as JSON string - the webview's WebSocket wrapper expects a JSON string
    const messageData = JSON.stringify(sanitizedMsg);
    this._sendToWebview("websocket-message", { data: messageData });
  }

  /**
   * Sends a message to the webview.
   * Broadcasts to all registered client connections, or to a specific client if specified.
   */
  private _sendToWebview(
    type: string,
    body: unknown,
    specificClientId?: string,
  ): void {
    if (specificClientId) {
      // Send to specific client only
      console.log(
        `[LocalKernelProxy] Sending to webview: type=${type}, clientId=${specificClientId}`,
      );
      this._webview.webview.postMessage({
        type,
        id: specificClientId,
        body,
      });
    } else {
      // Broadcast to all clients
      console.log(
        `[LocalKernelProxy] Broadcasting to webview: type=${type}, clients=${Array.from(this._clientIds).join(", ")}`,
      );
      for (const clientId of this._clientIds) {
        this._webview.webview.postMessage({
          type,
          id: clientId,
          body,
        });
      }
    }
  }

  /**
   * Handles incoming WebSocket messages from the webview.
   * Translates them to kernel protocol operations.
   *
   * CRITICAL: Intercepts kernel_info_request and responds immediately with a proper reply.
   * This allows JupyterLab's kernel.ready Promise to resolve correctly.
   */
  public handleMessage(data: unknown): void {
    if (!this._kernel) {
      console.error("[LocalKernelProxy] Kernel not available");
      return;
    }

    // Parse the incoming message
    // Webview sends Jupyter protocol messages as JSON strings
    // https://jupyter-client.readthedocs.io/en/stable/messaging.html
    let msg: KernelMessage.IMessage;
    try {
      if (typeof data === "string") {
        msg = JSON.parse(data) as KernelMessage.IMessage;
      } else {
        msg = data as KernelMessage.IMessage;
      }
    } catch (error) {
      console.error("[LocalKernelProxy] Failed to parse message:", error);
      return;
    }

    console.log(
      `[LocalKernelProxy] Received message: ${msg.header?.msg_type}`,
      msg.header?.msg_type === "execute_request"
        ? "CODE:" + (msg.content as { code?: string })?.code
        : "",
    );

    // Check if header is valid
    if (!msg.header || !msg.header.msg_id) {
      console.error(
        `[LocalKernelProxy] Invalid message header - missing msg_id:`,
        msg,
      );
      return;
    }

    // Store the mapping from request msg_id to JupyterLab's session ID
    // This allows us to translate the kernel's session ID back to JupyterLab's session ID in replies
    this._sessionIdMap.set(msg.header.msg_id, msg.header.session);
    console.log(
      `[LocalKernelProxy] Stored session mapping: ${msg.header.msg_id} -> ${msg.header.session}`,
    );

    // Forward ALL messages to the real kernel
    // The real kernel will handle everything with its own session ID
    try {
      if (
        this._rawSocket &&
        typeof (this._rawSocket as { send?: unknown }).send === "function"
      ) {
        console.log(
          `[LocalKernelProxy] Forwarding message to kernel:`,
          msg.header.msg_type,
        );
        (
          this._rawSocket as { send: (msg: KernelMessage.IMessage) => void }
        ).send(msg);
      } else {
        console.error(
          `[LocalKernelProxy] RawSocket not available or doesn't have send method`,
        );
      }
    } catch (error) {
      console.error(
        `[LocalKernelProxy] Failed to send message to kernel:`,
        error,
      );
    }
  }

  /**
   * Closes the proxy and cleans up resources.
   */
  public close(): void {
    this._messageHandlers.clear();
    this._sendToWebview("websocket-close", {});
  }
}
