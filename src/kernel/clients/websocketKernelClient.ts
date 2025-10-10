/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * WebSocket-based Jupyter kernel client for native notebook execution.
 * Implements the Jupyter messaging protocol over WebSocket.
 *
 * @module kernel/websocketKernelClient
 */

import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type {
  RuntimeDTO,
  RuntimeJSON,
} from "@datalayer/core/lib/models/RuntimeDTO";

/**
 * Jupyter message structure according to the protocol.
 */
export interface JupyterMessage {
  /** Message header containing protocol metadata */
  header: {
    /** Unique message identifier */
    msg_id: string;
    /** Message type (e.g., 'execute_request', 'execute_reply') */
    msg_type: string;
    /** Username of the sender */
    username: string;
    /** Session identifier */
    session: string;
    /** ISO timestamp when message was created */
    date: string;
    /** Jupyter message protocol version */
    version: string;
  };
  /** Header of the parent message this message responds to */
  parent_header: unknown;
  /** Message metadata object */
  metadata: unknown;
  /** Message content payload */
  content: unknown;
  /** Optional binary buffers attached to message */
  buffers?: unknown[];
  /** Communication channel (e.g., 'shell', 'iopub') */
  channel?: string;
}

/**
 * Execution result from kernel.
 */
export interface ExecutionResult {
  /** Array of outputs produced during execution */
  outputs: ExecutionOutput[];
  /** Whether execution completed successfully */
  success: boolean;
}

/**
 * Output from code execution.
 */
export interface ExecutionOutput {
  /** Type of output produced */
  type: "stream" | "execute_result" | "display_data" | "error";
  /** Stream name (stdout or stderr) for stream outputs */
  name?: string;
  /** Text content for stream outputs */
  text?: string;
  /** Display data object for execute_result or display_data outputs */
  data?: unknown;
  /** Exception name for error outputs */
  ename?: string;
  /** Exception value for error outputs */
  evalue?: string;
  /** Exception traceback lines for error outputs */
  traceback?: string[];
}

/**
 * WebSocket-based kernel client for Jupyter protocol communication.
 * Handles connection, execution, and message processing for native notebooks.
 */
export class WebSocketKernelClient {
  /** WebSocket connection instance */
  private _ws: WebSocket | undefined;
  /** Unique session identifier for this client */
  private _sessionId: string;
  /** Kernel ID assigned by the Jupyter server */
  private _kernelId: string | undefined;
  /** Connection status flag */
  private _connected = false;
  /** Connection attempt in progress flag */
  private _connecting = false;
  /** Runtime configuration and credentials */
  private _runtime: RuntimeJSON;
  /** Map of pending execution requests awaiting replies */
  private _pendingRequests = new Map<
    string,
    {
      /** Callback to resolve with execution result */
      resolve: (result: ExecutionResult) => void;
      /** Callback to reject with error */
      reject: (error: Error) => void;
      /** Accumulated outputs during execution */
      outputs: ExecutionOutput[];
    }
  >();

  /**
   * Creates a new WebSocketKernelClient.
   *
   * @param runtime - The Datalayer runtime to connect to
   */
  constructor(
    runtime: RuntimeDTO | RuntimeJSON,
    /** @internal - Used in runtime connection methods */
    // @ts-ignore - TS6138
    private readonly _sdk: DatalayerClient,
  ) {
    this._sessionId = uuidv4();

    // Extract runtime data from Runtime model or plain object
    if (runtime && typeof runtime === "object") {
      // Check if it's a Runtime model with toJSON method
      if ("toJSON" in runtime && typeof runtime.toJSON === "function") {
        // It's a Runtime model - use toJSON to get stable interface
        this._runtime = runtime.toJSON();
      } else {
        // It's already RuntimeJSON data
        this._runtime = runtime as RuntimeJSON;
      }
    } else {
      // Fallback - should not happen
      throw new Error("Invalid runtime object provided");
    }
  }

  /**
   * Connects to the kernel via WebSocket.
   *
   * @returns Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this._connected || this._connecting) {
      return;
    }

    this._connecting = true;

    try {
      // Check for connection info from SDK
      const ingressUrl = this._runtime.ingress;
      const token = this._runtime.token;

      if (!ingressUrl) {
        throw new Error("Runtime missing ingress URL from SDK");
      }

      if (!token) {
        throw new Error("Runtime missing token from SDK");
      }

      // First, get or create a kernel
      await this.ensureKernel();

      // Construct WebSocket URL
      const wsUrl = this.getWebSocketUrl();

      // Create WebSocket connection
      this._ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this._runtime.token}`,
          Cookie: `_xsrf=${this._runtime.token}`,
        },
        rejectUnauthorized: false, // For self-signed certificates
      });

      // Set up event handlers
      this._ws.on("open", this.onOpen.bind(this));
      this._ws.on("message", this.onMessage.bind(this));
      this._ws.on("error", this.onError.bind(this));
      this._ws.on("close", this.onClose.bind(this));

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, 30000);

        const handleOpen = () => {
          clearTimeout(timeout);
          this._ws?.off("error", handleError);
          resolve();
        };

        const handleError = (error: Error) => {
          clearTimeout(timeout);
          this._ws?.off("open", handleOpen);
          reject(error);
        };

        this._ws?.once("open", handleOpen);
        this._ws?.once("error", handleError);
      });

      this._connected = true;
      this._connecting = false;
    } catch (error) {
      this._connecting = false;
      throw error;
    }
  }

  /**
   * Ensures a kernel exists for this session.
   */
  private async ensureKernel(): Promise<void> {
    try {
      const baseUrl = this._runtime.ingress!.replace(/\/$/, "");

      // List existing kernels
      const listResponse = await fetch(`${baseUrl}/api/kernels`, {
        headers: {
          Authorization: `Bearer ${this._runtime.token}`,
          "Content-Type": "application/json",
        },
      });

      if (listResponse.ok) {
        const kernels = (await listResponse.json()) as Array<{ id: string }>;
        if (kernels.length > 0) {
          this._kernelId = kernels[0].id;
          return;
        }
      }

      // Create new kernel if none exist
      const createResponse = await fetch(`${baseUrl}/api/kernels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._runtime.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "python3",
        }),
      });

      if (createResponse.ok) {
        const kernel = (await createResponse.json()) as { id: string };
        this._kernelId = kernel.id;
      } else {
        throw new Error(
          `Failed to create kernel: ${createResponse.statusText}`,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Gets the WebSocket URL for kernel communication.
   */
  private getWebSocketUrl(): string {
    const baseUrl = this._runtime
      .ingress!.replace(/^https?:/, "wss:")
      .replace(/\/$/, "");

    return `${baseUrl}/api/kernels/${this._kernelId}/channels?session_id=${this._sessionId}`;
  }

  /**
   * Handles WebSocket open event.
   */
  private onOpen(): void {
    // Send kernel info request to verify connection
    const msg = this.createMessage("kernel_info_request", {});
    this.sendMessage(msg);
  }

  /**
   * Handles WebSocket message event.
   */
  private onMessage(data: unknown): void {
    try {
      const dataStr = data as { toString(): string };
      const msg: JupyterMessage = JSON.parse(dataStr.toString());

      // Skip kernel info replies and status messages
      if (
        msg.header.msg_type === "kernel_info_reply" ||
        msg.header.msg_type === "status"
      ) {
        return;
      }

      // Find pending request
      const parentHeader = msg.parent_header as { msg_id?: string };
      const parentId = parentHeader?.msg_id;
      if (!parentId) {
        return;
      }

      const pending = this._pendingRequests.get(parentId);
      if (!pending) {
        return;
      }

      // Process message based on type
      const content = msg.content as Record<string, unknown>;

      switch (msg.header.msg_type) {
        case "stream":
          pending.outputs.push({
            type: "stream",
            name: content.name as string,
            text: content.text as string,
          });
          break;

        case "execute_result":
          pending.outputs.push({
            type: "execute_result",
            data: content.data,
          });
          break;

        case "display_data":
          pending.outputs.push({
            type: "display_data",
            data: content.data,
          });
          break;

        case "error":
          pending.outputs.push({
            type: "error",
            ename: content.ename as string,
            evalue: content.evalue as string,
            traceback: content.traceback as string[],
          });
          break;

        case "execute_reply":
          // Execution complete
          const success = content.status === "ok";
          this._pendingRequests.delete(parentId);
          pending.resolve({ outputs: pending.outputs, success });
          break;
      }
    } catch (error) {}
  }

  /**
   * Handles WebSocket error event.
   */
  private onError(error: Error): void {
    // Reject all pending requests
    for (const [_id, pending] of this._pendingRequests) {
      pending.reject(error);
    }
    this._pendingRequests.clear();
  }

  /**
   * Handles WebSocket close event.
   */
  private onClose(): void {
    this._connected = false;

    // Reject all pending requests
    for (const [_id, pending] of this._pendingRequests) {
      pending.reject(new Error("WebSocket connection closed"));
    }
    this._pendingRequests.clear();
  }

  /**
   * Creates a Jupyter message.
   */
  private createMessage(msgType: string, content: unknown): JupyterMessage {
    const msgId = uuidv4();

    return {
      header: {
        msg_id: msgId,
        msg_type: msgType,
        username: "vscode",
        session: this._sessionId,
        date: new Date().toISOString(),
        version: "5.3",
      },
      parent_header: {},
      metadata: {},
      content: content,
      channel: "shell",
    };
  }

  /**
   * Sends a message over WebSocket.
   */
  private sendMessage(msg: JupyterMessage): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    this._ws.send(JSON.stringify(msg));
  }

  /**
   * Executes code in the kernel.
   *
   * @param code - Code to execute
   * @returns Execution result with outputs
   */
  public async execute(code: string): Promise<ExecutionResult> {
    if (!this._connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const msg = this.createMessage("execute_request", {
        code: code,
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true,
      });

      // Store pending request
      this._pendingRequests.set(msg.header.msg_id, {
        resolve,
        reject,
        outputs: [],
      });

      // Set timeout
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(msg.header.msg_id);
        reject(new Error("Execution timeout"));
      }, 60000); // 1 minute timeout

      // Update resolve to clear timeout
      const originalResolve = this._pendingRequests.get(
        msg.header.msg_id,
      )!.resolve;
      this._pendingRequests.get(msg.header.msg_id)!.resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };

      try {
        this.sendMessage(msg);
      } catch (error) {
        clearTimeout(timeout);
        this._pendingRequests.delete(msg.header.msg_id);
        reject(error);
      }
    });
  }

  /**
   * Interrupts kernel execution.
   */
  public async interrupt(): Promise<void> {
    if (!this._kernelId || !this._runtime.ingress) {
      return;
    }

    try {
      const baseUrl = this._runtime.ingress.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/kernels/${this._kernelId}/interrupt`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._runtime.token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to interrupt kernel: ${response.statusText}`);
      }
    } catch (error) {}
  }

  /**
   * Restarts the kernel.
   */
  public async restart(): Promise<void> {
    if (!this._kernelId || !this._runtime.ingress) {
      return;
    }

    try {
      const baseUrl = this._runtime.ingress.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/kernels/${this._kernelId}/restart`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._runtime.token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to restart kernel: ${response.statusText}`);
      }

      // Reconnect WebSocket
      this.dispose();
      await this.connect();
    } catch (error) {}
  }

  /**
   * Disposes of the client and closes connections.
   */
  public dispose(): void {
    // Clear pending requests
    for (const [_id, pending] of this._pendingRequests) {
      pending.reject(new Error("Client disposed"));
    }
    this._pendingRequests.clear();

    // Close WebSocket
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close();
      this._ws = undefined;
    }

    this._connected = false;
    this._connecting = false;
  }
}
