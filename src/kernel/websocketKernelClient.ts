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
import type { DatalayerSDK, Runtime } from "../../../core/lib/index.js";

/**
 * Jupyter message structure according to the protocol.
 */
interface JupyterMessage {
  header: {
    msg_id: string;
    msg_type: string;
    username: string;
    session: string;
    date: string;
    version: string;
  };
  parent_header: any;
  metadata: any;
  content: any;
  buffers?: any[];
  channel?: string;
}

/**
 * Execution result from kernel.
 */
export interface ExecutionResult {
  outputs: ExecutionOutput[];
  success: boolean;
}

/**
 * Output from code execution.
 */
export interface ExecutionOutput {
  type: "stream" | "execute_result" | "display_data" | "error";
  name?: string; // For stream outputs (stdout/stderr)
  text?: string; // For stream outputs
  data?: any; // For execute_result/display_data
  ename?: string; // For errors
  evalue?: string; // For errors
  traceback?: string[]; // For errors
}

/**
 * WebSocket-based kernel client for Jupyter protocol communication.
 * Handles connection, execution, and message processing for native notebooks.
 */
export class WebSocketKernelClient {
  private _ws: WebSocket | undefined;
  private _sessionId: string;
  private _kernelId: string | undefined;
  private _connected = false;
  private _connecting = false;
  private _runtime: Runtime;
  private _pendingRequests = new Map<
    string,
    {
      resolve: (result: ExecutionResult) => void;
      reject: (error: Error) => void;
      outputs: ExecutionOutput[];
    }
  >();

  /**
   * Creates a new WebSocketKernelClient.
   *
   * @param runtime - The Datalayer runtime to connect to
   * @param sdk - Datalayer SDK instance
   */
  constructor(runtime: Runtime, private readonly _sdk: DatalayerSDK) {
    this._sessionId = uuidv4();
    console.log(
      "[WebSocketKernelClient] Created with session:",
      this._sessionId
    );

    // Extract runtime data from Runtime model or plain object
    if (runtime && typeof runtime === "object") {
      // Check if it's a Runtime model with properties
      if ("uid" in runtime && typeof runtime.uid !== "undefined") {
        console.log(
          "[WebSocketKernelClient] Runtime is a model with properties"
        );
        // It's a Runtime model with getters - access properties directly
        this._runtime = {
          uid: runtime.uid,
          pod_name: (runtime as any).podName || runtime.pod_name || "",
          given_name: (runtime as any).givenName || runtime.given_name || "",
          environment_name:
            (runtime as any).environmentName || runtime.environment_name || "",
          // Try ingress first, then jupyterUrl as fallback
          ingress:
            runtime.ingress ||
            (runtime as any).jupyterUrl ||
            runtime.jupyter_url ||
            "",
          // Try token first, then jupyterToken as fallback
          token:
            runtime.token ||
            (runtime as any).jupyterToken ||
            runtime.jupyter_token ||
            "",
          burning_rate: runtime.burning_rate || 0,
        } as Runtime;

        console.log("[WebSocketKernelClient] Extracted from model:", {
          uid: this._runtime.uid,
          ingress: this._runtime.ingress,
          token: this._runtime.token ? "***" : undefined,
          given_name: this._runtime.given_name,
        });
      } else if (typeof (runtime as any).toJSON === "function") {
        console.log("[WebSocketKernelClient] Runtime has toJSON method");
        this._runtime = (runtime as any).toJSON();
      } else {
        console.log("[WebSocketKernelClient] Runtime is a plain object");
        // It's already plain data
        this._runtime = runtime;
      }
    } else {
      // Fallback
      this._runtime = runtime;
    }

    console.log("[WebSocketKernelClient] Runtime data:", {
      uid: this._runtime.uid,
      ingress: this._runtime.ingress,
      token: this._runtime.token ? "***" : undefined,
      given_name: this._runtime.given_name,
    });
  }

  /**
   * Connects to the kernel via WebSocket.
   *
   * @returns Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this._connected || this._connecting) {
      console.log("[WebSocketKernelClient] Already connected or connecting");
      return;
    }

    this._connecting = true;

    try {
      // Check for connection info - runtime might have different field names
      const ingressUrl = this._runtime.ingress || this._runtime.jupyter_url;
      const token = this._runtime.token || this._runtime.jupyter_token;

      if (!ingressUrl || !token) {
        console.error("[WebSocketKernelClient] Runtime object:", this._runtime);
        throw new Error(
          `Runtime missing connection info. Has ingress: ${!!ingressUrl}, Has token: ${!!token}`
        );
      }

      // Update runtime object with normalized fields
      this._runtime.ingress = ingressUrl;
      this._runtime.token = token;

      // First, get or create a kernel
      await this.ensureKernel();

      // Construct WebSocket URL
      const wsUrl = this.getWebSocketUrl();
      console.log("[WebSocketKernelClient] Connecting to:", wsUrl);

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
      console.log("[WebSocketKernelClient] Connected successfully");
    } catch (error) {
      this._connecting = false;
      console.error("[WebSocketKernelClient] Connection failed:", error);
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
        const kernels = (await listResponse.json()) as any[];
        if (kernels.length > 0) {
          this._kernelId = kernels[0].id;
          console.log(
            "[WebSocketKernelClient] Using existing kernel:",
            this._kernelId
          );
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
        const kernel: any = await createResponse.json();
        this._kernelId = kernel.id;
        console.log("[WebSocketKernelClient] Created kernel:", this._kernelId);
      } else {
        throw new Error(
          `Failed to create kernel: ${createResponse.statusText}`
        );
      }
    } catch (error) {
      console.error("[WebSocketKernelClient] Failed to ensure kernel:", error);
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
    console.log("[WebSocketKernelClient] WebSocket opened");

    // Send kernel info request to verify connection
    const msg = this.createMessage("kernel_info_request", {});
    this.sendMessage(msg);
  }

  /**
   * Handles WebSocket message event.
   */
  private onMessage(data: any): void {
    try {
      const msg: JupyterMessage = JSON.parse(data.toString());

      // Skip kernel info replies and status messages
      if (
        msg.header.msg_type === "kernel_info_reply" ||
        msg.header.msg_type === "status"
      ) {
        return;
      }

      console.log(
        "[WebSocketKernelClient] Received message:",
        msg.header.msg_type
      );

      // Find pending request
      const parentId = msg.parent_header?.msg_id;
      if (!parentId) {
        return;
      }

      const pending = this._pendingRequests.get(parentId);
      if (!pending) {
        return;
      }

      // Process message based on type
      switch (msg.header.msg_type) {
        case "stream":
          pending.outputs.push({
            type: "stream",
            name: msg.content.name,
            text: msg.content.text,
          });
          break;

        case "execute_result":
          pending.outputs.push({
            type: "execute_result",
            data: msg.content.data,
          });
          break;

        case "display_data":
          pending.outputs.push({
            type: "display_data",
            data: msg.content.data,
          });
          break;

        case "error":
          pending.outputs.push({
            type: "error",
            ename: msg.content.ename,
            evalue: msg.content.evalue,
            traceback: msg.content.traceback,
          });
          break;

        case "execute_reply":
          // Execution complete
          const success = msg.content.status === "ok";
          this._pendingRequests.delete(parentId);
          pending.resolve({ outputs: pending.outputs, success });
          break;
      }
    } catch (error) {
      console.error("[WebSocketKernelClient] Error processing message:", error);
    }
  }

  /**
   * Handles WebSocket error event.
   */
  private onError(error: Error): void {
    console.error("[WebSocketKernelClient] WebSocket error:", error);

    // Reject all pending requests
    for (const [id, pending] of this._pendingRequests) {
      pending.reject(error);
    }
    this._pendingRequests.clear();
  }

  /**
   * Handles WebSocket close event.
   */
  private onClose(): void {
    console.log("[WebSocketKernelClient] WebSocket closed");
    this._connected = false;

    // Reject all pending requests
    for (const [id, pending] of this._pendingRequests) {
      pending.reject(new Error("WebSocket connection closed"));
    }
    this._pendingRequests.clear();
  }

  /**
   * Creates a Jupyter message.
   */
  private createMessage(msgType: string, content: any): JupyterMessage {
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
        msg.header.msg_id
      )!.resolve;
      this._pendingRequests.get(msg.header.msg_id)!.resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };

      try {
        this.sendMessage(msg);
        console.log(
          "[WebSocketKernelClient] Sent execute request:",
          msg.header.msg_id
        );
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
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to interrupt kernel: ${response.statusText}`);
      }

      console.log("[WebSocketKernelClient] Kernel interrupted");
    } catch (error) {
      console.error(
        "[WebSocketKernelClient] Failed to interrupt kernel:",
        error
      );
    }
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
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to restart kernel: ${response.statusText}`);
      }

      console.log("[WebSocketKernelClient] Kernel restarted");

      // Reconnect WebSocket
      this.dispose();
      await this.connect();
    } catch (error) {
      console.error("[WebSocketKernelClient] Failed to restart kernel:", error);
    }
  }

  /**
   * Disposes of the client and closes connections.
   */
  public dispose(): void {
    console.log("[WebSocketKernelClient] Disposing");

    // Clear pending requests
    for (const [id, pending] of this._pendingRequests) {
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
