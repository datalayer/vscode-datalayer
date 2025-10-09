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

import { Kernel, ServerConnection } from "@jupyterlab/services";
import { Signal, ISignal } from "@lumino/signaling";

// Worker message types
interface WorkerStatusMessage {
  type: "status";
  status: Kernel.Status;
}

interface WorkerStreamMessage {
  type: "stream";
  name: string;
  text: string;
}

interface WorkerExecuteResultMessage {
  type: "execute_result";
  result: unknown;
}

interface WorkerErrorMessage {
  type: "error";
  error: {
    ename: string;
    evalue: string;
    traceback: string[];
  };
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
 * Create inline worker code as a string
 * This is the Pyodide worker that will run in the Web Worker
 * Uses fetch+eval instead of importScripts to bypass CSP restrictions
 */
const PYODIDE_WORKER_CODE = `
// Pyodide Worker - runs Python code via Pyodide
let pyodide = null;
let pyodideReadyPromise = null;

// Initialize Pyodide
async function initPyodide(baseUrl, pyodideScript, asmScript) {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    console.log('[PyodideWorker] Initializing Pyodide with baseUrl:', baseUrl);
    console.log('[PyodideWorker] WebAssembly support:', typeof WebAssembly !== 'undefined');

    // ATTEMPT 10: Execute asm.js FIRST to define _createPyodideModule
    console.log('[PyodideWorker] Executing asm.js script (defines _createPyodideModule)...');
    eval(asmScript);
    console.log('[PyodideWorker] ASM script executed, _createPyodideModule defined:', typeof _createPyodideModule !== 'undefined');

    // Then execute the Pyodide loader script
    console.log('[PyodideWorker] Executing Pyodide script...');
    eval(pyodideScript);

    console.log('[PyodideWorker] Pyodide script evaluated, loading runtime...');

    // ATTEMPT 8: Override fetch() to intercept ALL resource requests
    // This avoids importScripts entirely and routes everything through main thread
    const originalFetch = self.fetch;
    const pendingFetches = new Map();
    let fetchRequestId = 0;

    self.fetch = async function(resource, init) {
      const url = resource.toString();
      console.log('[PyodideWorker] fetch() intercepted:', url);

      // If this is a Pyodide resource, route through main thread
      if (url.includes(baseUrl) || url.includes('pyodide')) {
        const id = fetchRequestId++;
        const promise = new Promise((resolve, reject) => {
          pendingFetches.set(id, { resolve, reject });
        });

        // Ask main thread to fetch this resource
        postMessage({
          type: 'fetch-request',
          id: id,
          url: url
        });

        return promise;
      }

      // For other URLs (shouldn't happen in Pyodide), use original fetch
      return originalFetch.call(this, resource, init);
    };

    // Store handler for fetch responses from main thread
    self.__pendingFetches = pendingFetches;

    // ATTEMPT 10: Block importScripts completely since we pre-loaded asm.js
    // asm.js already executed via eval above, don't need importScripts at all
    const originalImportScripts = self.importScripts;
    self.importScripts = function(...urls) {
      console.log('[PyodideWorker] importScripts called (blocked):', urls);
      console.log('[PyodideWorker] All scripts pre-loaded via eval, skipping importScripts');
      // Just return - no-op, everything already loaded via eval
    };

    // Load Pyodide with local index URL
    pyodide = await loadPyodide({
      indexURL: baseUrl + '/',
    });

    // Restore original functions
    self.fetch = originalFetch;
    self.importScripts = originalImportScripts;

    console.log('[PyodideWorker] Pyodide loaded successfully!');
    return pyodide;
  })();

  return pyodideReadyPromise;
}

// Handle messages from main thread
self.addEventListener('message', async (event) => {
  const { id, type, code, baseUrl, pyodideScript, asmScript, url, data, success, error } = event.data;

  // Handle fetch responses from main thread
  if (type === 'fetch-response') {
    const pending = self.__pendingFetches?.get(id);
    if (pending) {
      if (success) {
        // Create Response object from fetched data
        const response = new Response(data, {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': url.endsWith('.wasm') ? 'application/wasm' :
                           url.endsWith('.js') ? 'application/javascript' :
                           url.endsWith('.json') ? 'application/json' :
                           'application/octet-stream'
          }
        });
        pending.resolve(response);
      } else {
        pending.reject(new Error(error || 'Fetch failed'));
      }
      self.__pendingFetches.delete(id);
    }
    return;
  }

  if (type === 'init') {
    // Initialize Pyodide with the provided base URL, pyodide script, and asm script
    try {
      await initPyodide(baseUrl, pyodideScript, asmScript);
      self.postMessage({
        id,
        type: 'ready'
      });
    } catch (error) {
      self.postMessage({
        id,
        type: 'error',
        error: {
          ename: 'InitializationError',
          evalue: error.message,
          traceback: [error.stack || error.message]
        }
      });
    }
  } else if (type === 'execute') {
    try {
      // Ensure Pyodide is initialized
      if (!pyodide) {
        throw new Error('Pyodide not initialized. Call init first.');
      }

      // Send execution start status
      self.postMessage({
        id,
        type: 'status',
        status: 'busy'
      });

      // Execute Python code with proper stdout handling
      console.log('[PyodideWorker] Executing:', code);

      // Use Python-side stdout capture for proper newline handling
      // This is similar to how JupyterLite does it - handle stdout in Python, not JS
      // Use pyodide.globals to pass the user code and message ID safely
      pyodide.globals.set('__user_code__', code);
      pyodide.globals.set('__message_id__', id);

      const result = await pyodide.runPythonAsync(\`
import sys
import ast
from js import Object

# Capture stdout in real-time
class StreamCapture:
    def __init__(self, name, message_id):
        self.name = name
        self.message_id = message_id

    def write(self, text):
        if text:
            # Send each write immediately for streaming (preserves newlines!)
            # Use js.Object.fromEntries to create a plain JS object that can be cloned
            import js
            msg = js.Object.fromEntries([
                ['id', self.message_id],
                ['type', 'stream'],
                ['name', self.name],
                ['text', text]
            ])
            js.self.postMessage(msg)
        return len(text)

    def flush(self):
        pass

# Replace stdout with our streaming capture
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = StreamCapture('stdout', __message_id__)
sys.stderr = StreamCapture('stderr', __message_id__)

result = None
try:
    # Execute user code with IPython-like behavior:
    # - Try to evaluate as expression first (for things like "1+4")
    # - If that fails, execute as statement
    # - Capture the last expression result

    code = __user_code__.strip()

    # Try to parse as expression first
    try:
        tree = ast.parse(code, mode='eval')
        # It's a valid expression, evaluate it
        result = eval(compile(tree, '<string>', 'eval'))
    except SyntaxError:
        # Not an expression, execute as statements
        # Check if last line is an expression
        try:
            tree = ast.parse(code, mode='exec')
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                # Last statement is an expression, split it out
                if len(tree.body) > 1:
                    # Execute everything except last line
                    exec_code = compile(ast.Module(body=tree.body[:-1], type_ignores=[]), '<string>', 'exec')
                    exec(exec_code)
                # Evaluate last expression
                expr = compile(ast.Expression(body=tree.body[-1].value), '<string>', 'eval')
                result = eval(expr)
            else:
                # No expression at end, just execute
                exec(code)
        except:
            # Just execute as is
            exec(code)

except Exception as e:
    # Restore streams before raising
    sys.stdout = old_stdout
    sys.stderr = old_stderr
    raise
finally:
    # Restore original stdout/stderr
    sys.stdout = old_stdout
    sys.stderr = old_stderr

result
\`);

      // Send result if not None/undefined
      if (result !== undefined && result !== null) {
        self.postMessage({
          id,
          type: 'execute_result',
          result: result
        });
      }

      // Send idle status
      self.postMessage({
        id,
        type: 'status',
        status: 'idle'
      });
    } catch (error) {
      // Send error
      self.postMessage({
        id,
        type: 'error',
        error: {
          ename: error.constructor.name,
          evalue: error.message,
          traceback: [error.stack || error.message]
        }
      });

      // Send idle status
      self.postMessage({
        id,
        type: 'status',
        status: 'idle'
      });
    }
  }
});

console.log('[PyodideWorker] Worker initialized, waiting for init message...');
`;

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
  private _pendingInput = new Signal<this, boolean>(this);
  private _status: Kernel.Status = "idle"; // Start as idle to prevent immediate shutdown
  private _connectionStatus: Kernel.ConnectionStatus = "connected"; // Start as connected
  private _executionCount = 0;
  private _messageId = 0;
  private _currentExecuteHeader: ExecuteRequestHeader | undefined;
  private _currentExecuteCode: string | undefined;

  readonly id: string;
  readonly name: string;
  readonly model: Kernel.IModel;
  readonly username: string = "";
  readonly serverSettings: ServerConnection.ISettings;
  readonly clientId: string;
  readonly handleComms: boolean = true;

  constructor(options: any, serverSettings: ServerConnection.ISettings) {
    this.serverSettings = serverSettings;
    this.id = `pyodide-inline-${Date.now()}`;
    this.name = "pyodide";
    this.clientId = this.id;
    this.model = {
      id: this.id,
      name: this.name,
    };

    console.log(
      "[PyodideInlineKernel] Creating inline Web Worker with Blob URL...",
    );

    // Create Blob from worker code string
    const blob = new Blob([PYODIDE_WORKER_CODE], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);

    // Create worker from Blob URL (bypasses CSP restrictions!)
    this._worker = new Worker(blobUrl);

    // Get the Pyodide base URL from the global variable injected by the extension
    // This uses the proper asWebviewUri to bypass CSP restrictions
    const pyodideBaseUrl = (window as any).__PYODIDE_BASE_URI__;

    if (!pyodideBaseUrl) {
      console.error("[PyodideInlineKernel] __PYODIDE_BASE_URI__ not found!");
      throw new Error("Pyodide base URI not provided by extension");
    }

    console.log("[PyodideInlineKernel] Pyodide base URL:", pyodideBaseUrl);

    // Listen to worker messages
    this._worker.addEventListener("message", (event) => {
      const msg = event.data;

      // Handle fetch requests from worker
      if (msg.type === "fetch-request") {
        console.log("[PyodideInlineKernel] Worker requested fetch:", msg.url);
        fetch(msg.url)
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`,
              );
            }
            // For binary files (WASM, ZIP), return arrayBuffer; for text files, return text
            if (msg.url.endsWith(".wasm") || msg.url.endsWith(".zip")) {
              return response.arrayBuffer();
            } else {
              return response.text();
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
    console.log(
      "[PyodideInlineKernel] Fetching Pyodide scripts from main thread...",
    );

    Promise.all([
      fetch(`${pyodideBaseUrl}/pyodide.js`).then((r) => r.text()),
      fetch(`${pyodideBaseUrl}/pyodide.asm.js`).then((r) => r.text()),
    ])
      .then(([pyodideScript, asmScript]) => {
        console.log(
          "[PyodideInlineKernel] Pyodide script fetched, size:",
          pyodideScript.length,
        );
        console.log(
          "[PyodideInlineKernel] ASM script fetched, size:",
          asmScript.length,
        );

        if (pyodideScript.length === 0 || asmScript.length === 0) {
          throw new Error("Scripts are empty!");
        }

        // Check if worker still exists (not disposed during async fetch)
        if (!this._worker) {
          console.warn(
            "[PyodideInlineKernel] Worker was disposed before init could complete",
          );
          return;
        }

        // Initialize Pyodide with BOTH scripts
        this._worker.postMessage({
          id: this._messageId++,
          type: "init",
          baseUrl: pyodideBaseUrl,
          pyodideScript: pyodideScript,
          asmScript: asmScript,
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

    console.log("[PyodideInlineKernel] Worker created from Blob URL!");
  }

  private _handleWorkerMessage(msg: WorkerMessage): void {
    console.log("[PyodideInlineKernel] Worker message:", msg);

    // Log errors with full details
    if (msg.type === "error") {
      console.error("[PyodideInlineKernel] Error details:", {
        ename: msg.error.ename,
        evalue: msg.error.evalue,
        traceback: msg.error.traceback,
      });
    }

    if (msg.type === "status") {
      const status = msg.status as Kernel.Status;
      if (status !== this._status) {
        this._status = status;
        this._statusChanged.emit(this._status);
      }

      // When transitioning to busy, increment execution count and send execute_input
      if (status === "busy" && this._currentExecuteCode) {
        this._executionCount++;

        // Emit execute_input message with execution count
        const executeInputMsg = {
          header: {
            msg_id: `execute_input_${Date.now()}`,
            msg_type: "execute_input",
            date: new Date().toISOString(),
            username: this.username,
            session: this.clientId,
          },
          parent_header: this._currentExecuteHeader || {},
          metadata: {},
          content: {
            code: this._currentExecuteCode,
            execution_count: this._executionCount,
          },
          channel: "iopub",
        };
        this._iopubMessage.emit(executeInputMsg);
        this._anyMessage.emit(executeInputMsg);
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
        parent_header: this._currentExecuteHeader || {},
        metadata: {},
        content: {
          execution_state: status,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(iopubMsg);
      this._anyMessage.emit(iopubMsg);
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
        parent_header: this._currentExecuteHeader || {},
        metadata: {},
        content: {
          name: msg.name, // 'stdout' or 'stderr'
          text: msg.text,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(iopubMsg);
      this._anyMessage.emit(iopubMsg);
    } else if (msg.type === "execute_result") {
      // Emit execute result as iopub message (execution count already incremented on execute_input)
      const iopubMsg = {
        header: {
          msg_id: `execute_result_${Date.now()}`,
          msg_type: "execute_result",
          date: new Date().toISOString(), // Required for timing hooks
          username: this.username,
          session: this.clientId,
        },
        parent_header: this._currentExecuteHeader || {},
        metadata: {},
        content: {
          execution_count: this._executionCount,
          data: {
            "text/plain": String(msg.result),
          },
          metadata: {},
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(iopubMsg);
      this._anyMessage.emit(iopubMsg);
    } else if (msg.type === "error") {
      // Emit error as iopub message
      const iopubMsg = {
        header: {
          msg_id: `error_${Date.now()}`,
          msg_type: "error",
          date: new Date().toISOString(), // Required for timing hooks
          username: this.username,
          session: this.clientId,
        },
        parent_header: this._currentExecuteHeader || {},
        metadata: {},
        content: {
          ename: msg.error.ename,
          evalue: msg.error.evalue,
          traceback: msg.error.traceback,
        },
        channel: "iopub",
      };
      this._iopubMessage.emit(iopubMsg);
      this._anyMessage.emit(iopubMsg);
    } else if (msg.type === "ready") {
      console.log("[PyodideInlineKernel] Pyodide is ready!");
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

  get isDisposed(): boolean {
    return this._worker === null;
  }

  dispose(): void {
    if (this._worker) {
      console.log("[PyodideInlineKernel] Disposing worker");
      this._worker.terminate();
      (this._worker as any) = null;
      this._disposed.emit();
    }
  }

  clone(options?: any): Kernel.IKernelConnection {
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

  async requestInspect(content: any): Promise<any> {
    return { status: "ok", found: false, data: {}, metadata: {} };
  }

  async requestHistory(content: any): Promise<any> {
    return { status: "ok", history: [] };
  }

  requestExecute(content: any, disposeOnDone?: boolean, metadata?: any): any {
    console.log("[PyodideInlineKernel] Execute request:", content.code);

    const msgId = this._messageId++;
    const startTime = new Date().toISOString();

    // Create execute request header that will be used as parent_header for all IOPub messages
    const executeRequestHeader = {
      msg_id: `execute_request_${msgId}`,
      msg_type: "execute_request",
      username: this.username,
      session: this.clientId,
      date: startTime,
    };

    // Store for use in message handlers
    this._currentExecuteHeader = executeRequestHeader;
    this._currentExecuteCode = content.code;

    // Send execute message to worker
    this._worker.postMessage({
      id: msgId,
      type: "execute",
      code: content.code,
    });

    // Create a promise that resolves when execution is complete
    const executionPromise = new Promise<any>((resolve) => {
      const handler = (sender: any, msg: any) => {
        // Execution complete when status goes back to idle
        if (msg.content && msg.content.execution_state === "idle") {
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
      registerMessageHook: (hook: any) => {
        // No-op for Pyodide
      },
      removeMessageHook: (hook: any) => {
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
        iopubWrapper = (_sender: any, msg: any) => {
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
      set: (cb: any) => {
        // No-op for Pyodide
      },
      get: () => undefined,
    });

    return future;
  }

  async requestIsComplete(content: any): Promise<any> {
    return { status: "complete" };
  }

  async requestCommInfo(content: any): Promise<any> {
    return { comms: {}, status: "ok" };
  }

  sendInputReply(content: any): void {
    console.log("[PyodideInlineKernel] Input reply:", content);
  }

  sendShellMessage(
    msg: any,
    expectReply?: boolean,
    disposeOnDone?: boolean,
  ): any {
    throw new Error("sendShellMessage not implemented");
  }

  registerCommTarget(
    targetName: string,
    callback: (comm: any, msg: any) => void | PromiseLike<void>,
  ): void {
    console.log("[PyodideInlineKernel] Register comm target:", targetName);
  }

  removeCommTarget(
    targetName: string,
    callback: (comm: any, msg: any) => void | PromiseLike<void>,
  ): void {
    console.log("[PyodideInlineKernel] Remove comm target:", targetName);
  }

  registerMessageHook(
    msgId: string,
    hook: (msg: any) => boolean | PromiseLike<boolean>,
  ): void {
    console.log("[PyodideInlineKernel] Register message hook:", msgId);
  }

  removeMessageHook(
    msgId: string,
    hook: (msg: any) => boolean | PromiseLike<boolean>,
  ): void {
    console.log("[PyodideInlineKernel] Remove message hook:", msgId);
  }

  async reconnect(): Promise<void> {
    console.log("[PyodideInlineKernel] Reconnect (no-op)");
  }

  async interrupt(): Promise<void> {
    console.log("[PyodideInlineKernel] Interrupt");
  }

  async restart(): Promise<void> {
    console.log("[PyodideInlineKernel] Restart");
  }
}
