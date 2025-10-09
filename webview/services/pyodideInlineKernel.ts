/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pyodide kernel that uses inline Web Worker (Blob URL) to bypass CSP restrictions
 * Loads Pyodide from bundled resources using fetch+eval instead of importScripts
 */

import { Kernel, ServerConnection, KernelMessage } from "@jupyterlab/services";
import { Signal, ISignal } from "@lumino/signaling";
// Worker will be imported as raw JavaScript
// @ts-ignore - Import worker file as raw text
import pyodideWorkerCode from "./pyodide/pyodideWorker.worker.js?raw";
// @ts-ignore - Import Python file as raw text
import pyodideKernelCode from "./pyodide/pyodide_kernel.py?raw";

// Worker message types
interface WorkerStatusMessage {
  type: "status";
  id?: number; // Execution ID for tracking which cell this status belongs to
  status: Kernel.Status;
}

interface WorkerStreamMessage {
  type: "stream";
  id?: number; // Execution ID for tracking which cell this output belongs to
  name: string;
  text: string;
}

interface WorkerExecuteResultMessage {
  type: "execute_result";
  id?: number; // Execution ID for tracking which cell this result belongs to
  result: unknown;
  metadata?: Record<string, any>;
}

interface WorkerDisplayDataMessage {
  type: "display_data";
  id?: number; // Execution ID for tracking which cell this display belongs to
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

interface WorkerErrorMessage {
  type: "error";
  id?: number; // Execution ID for tracking which cell this error belongs to
  ename: string;
  evalue: string;
  traceback: string[];
}

interface WorkerReadyMessage {
  type: "ready";
}

interface WorkerFetchRequestMessage {
  type: "fetch-request";
  id: number;
  url: string;
}

type WorkerMessage =
  | WorkerStatusMessage
  | WorkerStreamMessage
  | WorkerExecuteResultMessage
  | WorkerDisplayDataMessage
  | WorkerErrorMessage
  | WorkerReadyMessage
  | WorkerFetchRequestMessage;

// Execute request header type
interface ExecuteRequestHeader {
  msg_id: string;
  msg_type: string;
  username: string;
  session: string;
  date: string;
}

/**
 * Helper to create IAnyMessageArgs from a kernel message
 */
function createMessageArgs(
  msg: Record<string, unknown>,
  direction: "send" | "recv" = "recv",
): Kernel.IAnyMessageArgs {
  return {
    msg: msg as unknown as KernelMessage.IMessage,
    direction,
  };
}

/**
 * Inline Pyodide kernel that creates Web Worker from Blob URL
 */
export class PyodideInlineKernel implements Kernel.IKernelConnection {
  private _worker: Worker;
  private _disposed = new Signal<this, void>(this);
  private _iopubMessage = new Signal<this, Kernel.IAnyMessageArgs>(this);
  private _statusChanged = new Signal<this, Kernel.Status>(this);
  private _connectionStatusChanged = new Signal<this, Kernel.ConnectionStatus>(
    this,
  );
  private _anyMessage = new Signal<this, Kernel.IAnyMessageArgs>(this);
  private _unhandledMessage = new Signal<this, KernelMessage.IMessage>(this);
  private _pendingInput = new Signal<this, boolean>(this);
  private _status: Kernel.Status = "idle"; // Start as idle to prevent immediate shutdown
  private _connectionStatus: Kernel.ConnectionStatus = "connected"; // Start as connected
  private _isReady = false; // Track if Pyodide worker is fully initialized
  private _executionCount = 0;
  private _messageId = 0;
  private _currentExecuteHeader: ExecuteRequestHeader | undefined;
  private _currentExecuteCode: string | undefined;
  // Map execution ID to parent header for proper message routing when running multiple cells
  private _executionHeaders: Map<number, ExecuteRequestHeader> = new Map();
  // Map execution ID to execution count for proper cell numbering when running multiple cells
  private _executionCounts: Map<number, number> = new Map();
  // Execution queue to ensure cells execute sequentially (JupyterLite pattern)
  private _executionQueue: Array<{
    msgId: number;
    code: string;
    executeRequestHeader: ExecuteRequestHeader;
  }> = [];
  private _isExecuting = false;

  readonly id: string;
  readonly name: string;
  readonly model: Kernel.IModel;
  readonly username: string = "";
  readonly serverSettings: ServerConnection.ISettings;
  readonly clientId: string;
  readonly handleComms: boolean = true;

  constructor(_options: any, serverSettings: ServerConnection.ISettings) {
    this.serverSettings = serverSettings;
    this.id = `pyodide-inline-${Date.now()}`;
    this.name = "pyodide";
    this.clientId = this.id;
    this.model = {
      id: this.id,
      name: this.name,
    };

    // FORCE VISIBLE DEBUG - Use console.error to ensure it shows
    console.error(
      `🔴🔴🔴 [KERNEL CONSTRUCTOR] PyodideInlineKernel created! ID: ${this.id} 🔴🔴🔴`,
    );

    // Create worker from raw TypeScript code using Blob URL (bypasses CSP restrictions)
    // We import the worker file as a string and create a Blob from it
    const blob = new Blob([pyodideWorkerCode], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);
    this._worker = new Worker(blobUrl);

    // Get the Pyodide base URL from the global variable injected by the extension
    // This uses the proper asWebviewUri to bypass CSP restrictions
    const pyodideBaseUrl = (window as any).__PYODIDE_BASE_URI__;

    if (!pyodideBaseUrl) {
      console.error("[PyodideInlineKernel] __PYODIDE_BASE_URI__ not found!");
      throw new Error("Pyodide base URI not provided by extension");
    }

    // Listen to worker messages
    this._worker.addEventListener("message", (event) => {
      const msg = event.data;

      // Handle fetch requests from worker
      if (msg.type === "fetch-request") {
        // SECURITY: Use proxyFetch to route through extension backend
        // Webviews cannot make arbitrary network requests due to CSP
        import("../utils/httpProxy")
          .then(({ proxyFetch }) => proxyFetch(msg.url))
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`,
              );
            }
            // For binary files (WASM, ZIP, WHL), return arrayBuffer; for text files, return text
            if (
              msg.url.endsWith(".wasm") ||
              msg.url.endsWith(".zip") ||
              msg.url.endsWith(".whl")
            ) {
              return await response.arrayBuffer();
            } else {
              return await response.text();
            }
          })
          .then((data) => {
            this._worker.postMessage({
              id: msg.id,
              type: "fetch-response",
              url: msg.url,
              success: true,
              data: data,
            });
          })
          .catch((error) => {
            console.error(
              "[PyodideInlineKernel] Fetch failed:",
              msg.url,
              error,
            );
            this._worker.postMessage({
              id: msg.id,
              type: "fetch-response",
              url: msg.url,
              success: false,
              error: error.message,
            });
          });
        return;
      }

      // Handle other worker messages
      this._handleWorkerMessage(msg);
    });

    this._worker.addEventListener("error", (error) => {
      console.error("[PyodideInlineKernel] Worker error:", error);
    });

    // ATTEMPT 10: Pre-fetch BOTH pyodide.js AND pyodide.asm.js in main thread
    // asm.js defines _createPyodideModule which is required
    Promise.all([
      fetch(`${pyodideBaseUrl}/pyodide.js`).then((r) => r.text()),
      fetch(`${pyodideBaseUrl}/pyodide.asm.js`).then((r) => r.text()),
    ])
      .then(([pyodideScript, asmScript]) => {
        if (pyodideScript.length === 0 || asmScript.length === 0) {
          throw new Error("Scripts are empty!");
        }

        // Check if worker still exists (not disposed during async fetch)
        if (!this._worker) {
          return;
        }

        // Initialize Pyodide with BOTH scripts and the Python kernel code
        this._worker.postMessage({
          id: this._messageId++,
          type: "init",
          baseUrl: pyodideBaseUrl,
          pyodideScript: pyodideScript,
          asmScript: asmScript,
          pyodideKernelCode: pyodideKernelCode,
        });
      })
      .catch((error) => {
        console.error(
          "[PyodideInlineKernel] Failed to fetch Pyodide script:",
          error,
        );
        console.error(
          "[PyodideInlineKernel] Attempted URL:",
          `${pyodideBaseUrl}/pyodide.js`,
        );
      });
  }

  private _handleWorkerMessage(msg: WorkerMessage): void {
    // Log errors with full details
    if (msg.type === "error") {
      console.error("[PyodideInlineKernel] Error details:", {
        ename: msg.ename,
        evalue: msg.evalue,
        traceback: msg.traceback,
      });
    }

    // IMPORTANT: Get the correct parent header for this execution
    // Each message has an 'id' that corresponds to the execution msgId
    // WorkerReadyMessage and WorkerFetchRequestMessage don't have execution-related IDs
    const msgId =
      msg.type !== "ready" && msg.type !== "fetch-request" ? msg.id : undefined;
    const parentHeader =
      msgId !== undefined
        ? this._executionHeaders.get(msgId) || this._currentExecuteHeader || {}
        : this._currentExecuteHeader || {};

    // Debug logging for message routing
    if (msg.type === "stream" || msg.type === "execute_result") {
      console.log(
        `[PyodideInlineKernel] <<<<<< RECEIVED FROM WORKER: type=${msg.type}, msg.id="${msg.id}" (type: ${typeof msg.id}), parentHeader.msg_id="${(parentHeader as any).msg_id}" >>>>>>`,
      );
    }

    if (msg.type === "status") {
      const status = msg.status as Kernel.Status;
      if (status !== this._status) {
        this._status = status;
        this._statusChanged.emit(this._status);
      }

      // When transitioning to busy, increment execution count and send execute_input
      if (
        status === "busy" &&
        this._currentExecuteCode &&
        msg.id !== undefined
      ) {
        this._executionCount++;

        // Store execution count for this specific execution ID
        this._executionCounts.set(msg.id, this._executionCount);

        // Emit execute_input message with execution count
        const executeInputMsg = {
          header: {
            msg_id: `execute_input_${Date.now()}`,
            msg_type: "execute_input",
            date: new Date().toISOString(),
            username: this.username,
            session: this.clientId,
          },
          parent_header: parentHeader,
          metadata: {},
          content: {
            code: this._currentExecuteCode,
            execution_count: this._executionCount,
          },
          channel: "iopub",
        };
        this._iopubMessage.emit(createMessageArgs(executeInputMsg));
        this._anyMessage.emit(createMessageArgs(executeInputMsg));
      }

      // Emit status message
      const iopubMsg = {
        header: {
          msg_id: `status_${Date.now()}`,
          msg_type: "status",
          date: new Date().toISOString(), // Required for timing hooks
          username: this.username,
          session: this.clientId,
        },
        parent_header: parentHeader,
        metadata: {},
        content: {
          execution_state: status,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(createMessageArgs(iopubMsg));
      this._anyMessage.emit(createMessageArgs(iopubMsg));

      // Clean up header and execution count after execution completes (status goes to idle)
      if (status === "idle" && msg.id !== undefined) {
        this._executionHeaders.delete(msg.id);
        this._executionCounts.delete(msg.id);
      }
    } else if (msg.type === "stream") {
      // Emit stream output (stdout/stderr) as iopub message
      const iopubMsg = {
        header: {
          msg_id: `stream_${Date.now()}`,
          msg_type: "stream",
          date: new Date().toISOString(), // Required for timing hooks
          username: this.username,
          session: this.clientId,
        },
        parent_header: parentHeader,
        metadata: {},
        content: {
          name: msg.name, // 'stdout' or 'stderr'
          text: msg.text,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(createMessageArgs(iopubMsg));
      this._anyMessage.emit(createMessageArgs(iopubMsg));
    } else if (msg.type === "execute_result") {
      const resultKeys =
        msg.result && typeof msg.result === "object"
          ? Object.keys(msg.result)
          : [];
      console.error(
        "🔵🔵🔵 [PyodideInlineKernel] execute_result! Result keys:",
        resultKeys.join(", "),
      );

      // Get the execution count for this specific execution
      const executionCount =
        msg.id !== undefined
          ? this._executionCounts.get(msg.id) || this._executionCount
          : this._executionCount;

      // Format the result data - handle rich display outputs
      let data: Record<string, any>;
      let metadata: Record<string, any> = msg.metadata || {};

      // Check if result is already a MIME bundle (dict with mime types as keys)
      if (
        msg.result &&
        typeof msg.result === "object" &&
        !Array.isArray(msg.result)
      ) {
        const keys = Object.keys(msg.result);
        const hasMimeType = keys.some(
          (k) =>
            k.startsWith("text/") ||
            k.startsWith("image/") ||
            k.startsWith("application/"),
        );

        if (hasMimeType) {
          // It's already a MIME bundle
          console.error(
            "✅✅✅ MIME bundle in execute_result! Keys:",
            keys.join(", "),
          );
          data = msg.result as Record<string, any>;

          // Filter out text/html if Plotly JSON exists (same as display_data)
          if (data["application/vnd.plotly.v1+json"]) {
            console.error(
              "🎯🎯🎯 PLOTLY JSON in execute_result - REMOVING text/html!",
            );
            delete data["text/html"];
            console.error(
              "🎯🎯🎯 After filtering, keys:",
              Object.keys(data).join(", "),
            );
          }
        } else {
          // Regular object, stringify it
          console.error(
            "⚠️⚠️⚠️ Non-MIME object in execute_result, stringifying",
          );
          data = {
            "text/plain": String(msg.result),
          };
        }
      } else {
        // Primitive value or array
        data = {
          "text/plain": String(msg.result),
        };
      }

      // Emit execute result as iopub message
      const iopubMsg = {
        header: {
          msg_id: `execute_result_${Date.now()}`,
          msg_type: "execute_result",
          date: new Date().toISOString(), // Required for timing hooks
          username: this.username,
          session: this.clientId,
        },
        parent_header: parentHeader,
        metadata: {},
        content: {
          execution_count: executionCount,
          data: data,
          metadata: metadata,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(createMessageArgs(iopubMsg));
      this._anyMessage.emit(createMessageArgs(iopubMsg));
    } else if (msg.type === "display_data") {
      // Emit display_data (e.g., matplotlib figures, Plotly) as iopub message
      const dataKeys = msg.data ? Object.keys(msg.data) : [];
      console.error(
        "🎨 [PyodideInlineKernel] display_data received! Keys:",
        dataKeys.join(", "),
      );

      const iopubMsg = {
        header: {
          msg_id: `display_data_${Date.now()}`,
          msg_type: "display_data",
          date: new Date().toISOString(),
          username: this.username,
          session: this.clientId,
        },
        parent_header: parentHeader,
        metadata: {},
        content: {
          data: msg.data,
          metadata: msg.metadata || {},
          transient: {},
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(createMessageArgs(iopubMsg));
      this._anyMessage.emit(createMessageArgs(iopubMsg));
    } else if (msg.type === "error") {
      console.error(
        `🔴🔴🔴 [PyodideInlineKernel] ERROR received! ename="${msg.ename}", evalue="${msg.evalue}" 🔴🔴🔴`,
      );

      // Emit error as iopub message
      const iopubMsg = {
        header: {
          msg_id: `error_${Date.now()}`,
          msg_type: "error",
          date: new Date().toISOString(),
          username: this.username,
          session: this.clientId,
        },
        parent_header: parentHeader,
        metadata: {},
        content: {
          ename: msg.ename || "Error",
          evalue: msg.evalue || "",
          traceback: msg.traceback || [],
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(createMessageArgs(iopubMsg));
      this._anyMessage.emit(createMessageArgs(iopubMsg));
    } else if (msg.type === "ready") {
      console.log(
        "[PyodideInlineKernel] Worker is ready! Setting _isReady = true",
      );
      this._isReady = true;
      this._status = "idle";
      this._connectionStatus = "connected";
      this._statusChanged.emit(this._status);
      this._connectionStatusChanged.emit(this._connectionStatus);
    }
  }

  get info(): Promise<any> {
    return Promise.resolve({
      protocol_version: "5.3",
      implementation: "pyodide",
      implementation_version: "0.25.0",
      language_info: {
        name: "python",
        version: "3.11.0",
        mimetype: "text/x-python",
        file_extension: ".py",
        pygments_lexer: "ipython3",
        codemirror_mode: { name: "ipython", version: 3 },
        nbconvert_exporter: "python",
      },
      banner: "Pyodide kernel (inline worker, local bundle)",
      help_links: [],
      status: "ok",
    });
  }

  get spec(): Promise<any> {
    return Promise.resolve({
      name: "pyodide",
      display_name: "Pyodide (Python)",
      language: "python",
      resources: {},
    });
  }

  get status(): Kernel.Status {
    return this._status;
  }

  get connectionStatus(): Kernel.ConnectionStatus {
    return this._connectionStatus;
  }

  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  get iopubMessage(): ISignal<this, any> {
    return this._iopubMessage;
  }

  get statusChanged(): ISignal<this, Kernel.Status> {
    return this._statusChanged;
  }

  get connectionStatusChanged(): ISignal<this, Kernel.ConnectionStatus> {
    return this._connectionStatusChanged;
  }

  get pendingInput(): ISignal<this, boolean> {
    return this._pendingInput;
  }

  get anyMessage(): ISignal<this, any> {
    return this._anyMessage;
  }

  get unhandledMessage(): ISignal<this, KernelMessage.IMessage> {
    return this._unhandledMessage;
  }

  get isDisposed(): boolean {
    return this._worker === null;
  }

  dispose(): void {
    if (this._worker) {
      this._worker.terminate();
      (this._worker as any) = null;
      this._disposed.emit();
    }
  }

  clone(_options?: any): Kernel.IKernelConnection {
    throw new Error("Cloning not supported for PyodideInlineKernel");
  }

  async shutdown(): Promise<void> {
    this.dispose();
  }

  async requestKernelInfo(): Promise<any> {
    return this.info;
  }

  async requestComplete(content: any): Promise<any> {
    return {
      status: "ok",
      matches: [],
      cursor_start: content.cursor_pos,
      cursor_end: content.cursor_pos,
      metadata: {},
    };
  }

  async requestInspect(_content: any): Promise<any> {
    return { status: "ok", found: false, data: {}, metadata: {} };
  }

  async requestHistory(_content: any): Promise<any> {
    return { status: "ok", history: [] };
  }

  /**
   * Process the execution queue sequentially (JupyterLite pattern).
   * Ensures cells execute one at a time, preventing race conditions with msg_id.
   */
  private async _processExecutionQueue(): Promise<void> {
    // If already executing, return - the current loop will pick up new items
    if (this._isExecuting) {
      console.log(
        `[PyodideInlineKernel] _processExecutionQueue: already executing, queue length=${this._executionQueue.length}`,
      );
      return;
    }

    // If queue is empty, nothing to do
    if (this._executionQueue.length === 0) {
      console.log(
        `[PyodideInlineKernel] _processExecutionQueue: queue is empty`,
      );
      return;
    }

    console.log(
      `[PyodideInlineKernel] ========== STARTING QUEUE PROCESSING: ${this._executionQueue.length} items ==========`,
    );
    this._isExecuting = true;

    // Process ALL queued items - while loop will keep going as new items are added
    while (this._executionQueue.length > 0) {
      const item = this._executionQueue.shift();
      if (!item) {
        continue;
      }

      const { msgId, code, executeRequestHeader } = item;

      console.log(
        `[PyodideInlineKernel] ========== DEQUEUED CELL msgId=${msgId}, parent_msg_id="${executeRequestHeader.msg_id}", queue remaining: ${this._executionQueue.length} ==========`,
      );

      // Set as current execution
      this._currentExecuteHeader = executeRequestHeader;
      this._currentExecuteCode = code;

      // Send execute message to worker and wait for completion
      try {
        await new Promise<void>((resolve, reject) => {
          let executionError: Error | null = null;

          // Listen for idle status or error for THIS specific execution
          const statusHandler = (_sender: any, msgArgs: any) => {
            const msg = msgArgs.msg || msgArgs;
            // Wait for idle status that matches our parent header
            if (
              msg.content &&
              msg.content.execution_state === "idle" &&
              msg.parent_header &&
              msg.parent_header.msg_id === executeRequestHeader.msg_id
            ) {
              this._iopubMessage.disconnect(statusHandler);
              // If there was an error during execution, stop the queue
              if (executionError) {
                reject(executionError);
              } else {
                resolve();
              }
            }
            // Check for error messages
            if (
              msg.header &&
              msg.header.msg_type === "error" &&
              msg.parent_header &&
              msg.parent_header.msg_id === executeRequestHeader.msg_id
            ) {
              executionError = new Error(
                msg.content?.evalue || "Execution error",
              );
            }
          };
          this._iopubMessage.connect(statusHandler);

          // Send execute message to worker
          console.log(
            `[PyodideInlineKernel] >>>>>> POSTING TO WORKER: id=${msgId}, parent_msg_id="${executeRequestHeader.msg_id}" <<<<<<`,
          );
          this._worker.postMessage({
            id: msgId,
            type: "execute",
            code: code,
            parent_msg_id: executeRequestHeader.msg_id, // String msg_id for Python
          });
        });
        console.log(
          `[PyodideInlineKernel] ========== CELL ${msgId} COMPLETED SUCCESSFULLY ==========`,
        );
      } catch (error) {
        console.error(
          `[PyodideInlineKernel] ========== CELL ${msgId} FAILED, STOPPING QUEUE ==========`,
          error,
        );

        // Clear remaining queue items on error
        // Note: Cells in queue were never actually started by the kernel (never sent to worker),
        // so we don't send idle status for them. The notebook UI may have marked them as busy
        // when "Run All" was clicked, but that's a UI-level state, not kernel-level.
        this._executionQueue.length = 0;
        this._isExecuting = false;
        return;
      }
    }

    this._isExecuting = false;
    console.log(
      "[PyodideInlineKernel] ========== QUEUE PROCESSING COMPLETE ==========",
    );
  }

  requestExecute(content: any, _disposeOnDone?: boolean, _metadata?: any): any {
    const msgId = this._messageId++;
    const startTime = new Date().toISOString();

    console.error(
      `🔴🔴🔴 [KERNEL EXECUTE] requestExecute called! msgId=${msgId}, queue length=${this._executionQueue.length} 🔴🔴🔴`,
    );
    console.log(
      `[PyodideInlineKernel ${this.id}] ========== requestExecute called: msgId=${msgId} ==========`,
    );

    // CRITICAL: Check if kernel is disposed before executing
    if (this.isDisposed) {
      console.warn(
        `[PyodideInlineKernel ${this.id}] ========== REJECTING EXECUTION: Kernel is disposed ==========`,
      );

      // Return a proper IKernelFuture that immediately rejects
      // Must include all required methods to prevent errors in JupyterLab code
      const rejectedPromise = Promise.reject(
        new Error("Kernel is disposed and cannot execute cells"),
      );

      const future: any = {
        done: rejectedPromise,
        registerMessageHook: (_hook: any) => {
          // No-op for disposed kernel
        },
        removeMessageHook: (_hook: any) => {
          // No-op for disposed kernel
        },
        dispose: () => {},
      };

      // Define onIOPub as a setter (required by JupyterLab)
      Object.defineProperty(future, "onIOPub", {
        set: (_cb: any) => {
          // No-op for disposed kernel
        },
        get: () => undefined,
      });

      // Define onReply as a setter
      Object.defineProperty(future, "onReply", {
        set: (_cb: any) => {
          // No-op for disposed kernel
        },
        get: () => undefined,
      });

      // Define onStdin as a setter
      Object.defineProperty(future, "onStdin", {
        set: (_cb: any) => {
          // No-op for disposed kernel
        },
        get: () => undefined,
      });

      return future;
    }

    // CRITICAL: Check if worker is initialized before executing
    if (!this._isReady) {
      console.warn(
        `[PyodideInlineKernel ${this.id}] ========== REJECTING EXECUTION: Worker not ready yet ==========`,
      );

      // Return a proper IKernelFuture that immediately rejects
      const rejectedPromise = Promise.reject(
        new Error(
          "Pyodide worker is still initializing. Please wait a moment and try again.",
        ),
      );

      const future: any = {
        done: rejectedPromise,
        registerMessageHook: (_hook: any) => {
          // No-op
        },
        removeMessageHook: (_hook: any) => {
          // No-op
        },
        dispose: () => {},
      };

      // Define onIOPub as a setter (required by JupyterLab)
      Object.defineProperty(future, "onIOPub", {
        set: (_cb: any) => {},
        get: () => undefined,
      });

      Object.defineProperty(future, "onReply", {
        set: (_cb: any) => {},
        get: () => undefined,
      });

      Object.defineProperty(future, "onStdin", {
        set: (_cb: any) => {},
        get: () => undefined,
      });

      return future;
    }

    // Create execute request header that will be used as parent_header for all IOPub messages
    const executeRequestHeader = {
      msg_id: `execute_request_${msgId}`,
      msg_type: "execute_request",
      username: this.username,
      session: this.clientId,
      date: startTime,
    };

    // Store header by msgId for proper message routing when running multiple cells
    this._executionHeaders.set(msgId, executeRequestHeader);

    // Add to execution queue (JupyterLite pattern - ensures sequential execution)
    console.log(
      `[PyodideInlineKernel] Adding cell ${msgId} to queue (current queue size: ${this._executionQueue.length})`,
    );
    this._executionQueue.push({
      msgId,
      code: content.code,
      executeRequestHeader,
    });

    // Process queue if not already executing (don't await - fire and forget)
    this._processExecutionQueue().catch((error) => {
      console.error("[PyodideInlineKernel] Queue processing failed:", error);
    });

    // Create a promise that resolves when execution is complete
    const executionPromise = new Promise<any>((resolve) => {
      const handler = (_sender: any, msgArgs: any) => {
        // Unwrap message from IAnyMessageArgs format
        const msg = msgArgs.msg || msgArgs;

        // Execution complete when status goes back to idle AND matches our parent header
        if (
          msg.content &&
          msg.content.execution_state === "idle" &&
          msg.parent_header &&
          msg.parent_header.msg_id === executeRequestHeader.msg_id
        ) {
          this._iopubMessage.disconnect(handler);
          const finishTime = new Date().toISOString();
          // Resolve with proper IExecuteReplyMsg structure
          resolve({
            header: {
              msg_id: `execute_reply_${msgId}`,
              msg_type: "execute_reply",
              username: this.username,
              session: this.clientId,
              date: finishTime,
            },
            parent_header: {},
            metadata: {
              started: startTime,
            },
            content: {
              status: "ok",
              execution_count: this._executionCount,
            },
            channel: "shell",
          });
        }
      };
      this._iopubMessage.connect(handler);
    });

    // Return future object with getter/setter properties (not methods!)
    const future: any = {
      done: executionPromise,
      registerMessageHook: (_hook: any) => {
        // No-op for Pyodide
      },
      removeMessageHook: (_hook: any) => {
        // No-op for Pyodide
      },
      dispose: () => {},
    };

    // Store the wrapper function so we can disconnect it later
    let iopubWrapper: any = null;

    // Define onIOPub as a setter (JupyterLab uses: future.onIOPub = callback)
    Object.defineProperty(future, "onIOPub", {
      set: (cb: any) => {
        // Disconnect previous callback if any
        if (iopubWrapper) {
          this._iopubMessage.disconnect(iopubWrapper);
        }

        // Lumino signals emit (sender, args), but JupyterLab expects just (msg)
        // Wrap the callback to drop the sender parameter AND filter by parent_header
        // NOTE: msg is wrapped as {msg: IMessage, direction: 'recv'} due to IAnyMessageArgs
        iopubWrapper = (_sender: any, msgArgs: any) => {
          // Unwrap the message from IAnyMessageArgs format
          const msg = msgArgs.msg || msgArgs; // Handle both wrapped and unwrapped formats

          // Only emit messages that belong to THIS execution
          if (
            msg.parent_header &&
            msg.parent_header.msg_id === executeRequestHeader.msg_id
          ) {
            cb(msg);
          }
        };
        this._iopubMessage.connect(iopubWrapper);
      },
      get: () => undefined,
    });

    // Define onReply as a setter
    Object.defineProperty(future, "onReply", {
      set: (cb: any) => {
        cb({
          content: { status: "ok", execution_count: this._executionCount },
        });
      },
      get: () => undefined,
    });

    // Define onStdin as a setter
    Object.defineProperty(future, "onStdin", {
      set: (_cb: any) => {
        // No-op for Pyodide
      },
      get: () => undefined,
    });

    return future;
  }

  async requestIsComplete(_content: any): Promise<any> {
    return { status: "complete" };
  }

  async requestCommInfo(_content: any): Promise<any> {
    return { comms: {}, status: "ok" };
  }

  sendInputReply(_content: any): void {
    // No-op for Pyodide
  }

  sendShellMessage(
    _msg: any,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("sendShellMessage not implemented");
  }

  registerCommTarget(
    _targetName: string,
    _callback: (comm: any, msg: any) => void | PromiseLike<void>,
  ): void {
    // No-op for Pyodide
  }

  removeCommTarget(
    _targetName: string,
    _callback: (comm: any, msg: any) => void | PromiseLike<void>,
  ): void {
    // No-op for Pyodide
  }

  registerMessageHook(
    _msgId: string,
    _hook: (msg: any) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for Pyodide
  }

  removeMessageHook(
    _msgId: string,
    _hook: (msg: any) => boolean | PromiseLike<boolean>,
  ): void {
    // No-op for Pyodide
  }

  async reconnect(): Promise<void> {
    // No-op for Pyodide
  }

  // Missing IKernelConnection methods - stub implementations
  get hasPendingInput(): boolean {
    return false;
  }

  sendControlMessage<T extends KernelMessage.ControlMessageType>(
    _msg: KernelMessage.IControlMessage<T>,
    _expectReply?: boolean,
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("sendControlMessage not implemented for Pyodide");
  }

  requestDebug(
    _content: KernelMessage.IDebugRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("requestDebug not implemented for Pyodide");
  }

  requestCreateSubshell(
    _content: KernelMessage.ICreateSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("requestCreateSubshell not implemented for Pyodide");
  }

  requestDeleteSubshell(
    _content: KernelMessage.IDeleteSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("requestDeleteSubshell not implemented for Pyodide");
  }

  requestListSubshell(
    _content: KernelMessage.IListSubshellRequestMsg["content"],
    _disposeOnDone?: boolean,
  ): any {
    throw new Error("requestListSubshell not implemented for Pyodide");
  }

  createComm(_targetName: string, _commId?: string): any {
    throw new Error("createComm not implemented for Pyodide");
  }

  hasComm(_commId: string): boolean {
    return false;
  }

  removeInputGuard(): void {
    // No-op for Pyodide
  }

  get supportsSubshells(): boolean {
    return false;
  }

  subshellId: string | null = null;

  async interrupt(): Promise<void> {
    // No-op for Pyodide
  }

  async restart(): Promise<void> {
    // No-op for Pyodide
  }
}
