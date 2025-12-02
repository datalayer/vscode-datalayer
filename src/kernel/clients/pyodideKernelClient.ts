/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Pyodide kernel client for native VS Code notebooks.
 * Uses Pyodide npm package (Node.js compatible) for Python execution.
 * Downloads Pyodide files to local cache on first use.
 * Routes messages between Pyodide and NotebookCellExecution.
 *
 * @module kernel/clients/pyodideKernelClient
 */

import * as vscode from "vscode";
import type { PyodideInterface } from "pyodide";

// Import Python kernel code as raw string (webpack asset/source loader)
// @ts-ignore - Raw string import
import pyodideKernelCode from "../../../webview/services/pyodide/pyodide_kernel.py";

/**
 * Pending execution context for routing Pyodide messages to correct cell
 */
interface PendingExecution {
  execution: vscode.NotebookCellExecution;
  outputs: vscode.NotebookCellOutput[];
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Queued execution item
 */
interface QueuedExecution {
  msgId: number;
  code: string;
  execution: vscode.NotebookCellExecution;
}

/**
 * Pyodide kernel client for native VS Code notebooks.
 * Uses Pyodide npm package for Node.js environment.
 * Implements sequential execution queue matching Jupyter semantics.
 */
export class PyodideKernelClient {
  private _pyodide: PyodideInterface | null = null;
  private _messageId = 0;
  private _pendingExecutions = new Map<number, PendingExecution>();
  private _executionQueue: QueuedExecution[] = [];
  private _isExecuting = false;
  private _isReady = false;
  private _currentMsgId: number | null = null;

  // Track last display data to prevent duplicates
  // IPython's displayhook uses the display publisher internally, causing the same data
  // to be sent through both publishDisplayDataCallback and publishExecutionResultCallback
  private _lastDisplayData: {
    msgId: number;
    dataHash: string;
  } | null = null;

  /**
   * Creates a new Pyodide kernel client.
   * Uses the bundled Pyodide from npm package (no external downloads needed).
   */
  constructor() {
    // No initialization needed - Pyodide npm package is self-contained
  }

  /**
   * Initializes the Pyodide kernel by loading the runtime.
   * Uses bundled Pyodide from npm package (v0.29.0).
   * Pre-downloads packages from VS Code configuration.
   * Must be called before executing any code.
   *
   * @throws {Error} If initialization fails
   */
  async initialize(): Promise<void> {
    if (this._pyodide) {
      console.log("[PyodideKernelClient] Already initialized");
      return;
    }

    console.log("[PyodideKernelClient] Initializing Pyodide kernel...");

    try {
      // Load Pyodide using npm package (Node.js compatible)
      // The npm package includes all necessary files - no indexURL needed!
      const { loadPyodide } = await import("pyodide");

      this._pyodide = await loadPyodide({
        stdout: (text: string) => this._handleStdout(text),
        stderr: (text: string) => this._handleStderr(text),
      });

      // Mount Node.js filesystem for persistent package cache
      await this._setupPersistentCache();

      // Load micropip for package management
      console.log("[PyodideKernelClient] Loading micropip package...");
      await this._pyodide.loadPackage("micropip");
      console.log("[PyodideKernelClient] ✓ micropip loaded");

      // Load IPython package (required by pyodide_kernel.py)
      console.log("[PyodideKernelClient] Loading IPython package...");
      await this._pyodide.loadPackage("ipython");
      console.log("[PyodideKernelClient] ✓ IPython loaded");

      // Load IPython kernel module for clean error tracebacks
      console.log("[PyodideKernelClient] Loading IPython kernel module...");
      console.log(
        `[PyodideKernelClient] Python code length: ${pyodideKernelCode?.length || 0} chars`,
      );

      // Register the module in Python's sys.modules so it can be imported
      await this._pyodide.runPythonAsync(`
import sys
from types import ModuleType

# Create pyodide_kernel module
pyodide_kernel = ModuleType('pyodide_kernel')

# Execute the kernel code in the module's namespace
exec('''${pyodideKernelCode.replace(/'/g, "\\'")}''', pyodide_kernel.__dict__)

# Register in sys.modules so it can be imported
sys.modules['pyodide_kernel'] = pyodide_kernel

print("[DEBUG] pyodide_kernel module registered in sys.modules")
`);
      console.log("[PyodideKernelClient] ✓ IPython kernel module loaded");

      // Set up error callback to capture IPython-formatted tracebacks
      console.log("[PyodideKernelClient] Setting up IPython callbacks...");
      await this._setupIPythonCallbacks();
      console.log("[PyodideKernelClient] ✓ IPython callbacks configured");

      // Pre-download packages from VS Code configuration
      await this._preloadPackages();

      this._isReady = true;
      console.log("[PyodideKernelClient] Pyodide kernel ready");
    } catch (error) {
      this._pyodide = null;
      // Log full error details for debugging
      console.error(
        "[PyodideKernelClient] Initialization failed with error:",
        error,
      );
      if (error instanceof Error && error.stack) {
        console.error("[PyodideKernelClient] Stack trace:", error.stack);
      }
      throw new Error(
        `Failed to initialize Pyodide kernel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Sets up persistent package cache using Node.js filesystem.
   * Mounts a cache directory into Pyodide's MEMFS and configures micropip to use it.
   * This allows packages to persist across Pyodide instances.
   */
  private async _setupPersistentCache(): Promise<void> {
    try {
      // Get VS Code's global storage path for cache
      const config = vscode.workspace.getConfiguration("datalayer.pyodide");
      const pyodideVersion = config.get<string>("version", "0.29.0");

      // Use OS temp directory for package cache (cross-platform)
      const os = await import("os");
      const path = await import("path");
      const fs = await import("fs/promises");

      // Create cache directory: ~/.cache/datalayer-pyodide/packages
      const homedir = os.homedir();
      const cacheDir = path.join(
        homedir,
        ".cache",
        "datalayer-pyodide",
        pyodideVersion,
        "packages",
      );

      // Ensure cache directory exists
      await fs.mkdir(cacheDir, { recursive: true });

      console.log(
        `[PyodideKernelClient] Mounting package cache at: ${cacheDir}`,
      );

      // Mount Node.js filesystem into Pyodide's Emscripten FS
      // This creates a /cache directory in Pyodide that maps to the real filesystem
      await this._pyodide!.runPythonAsync(`
import os
import sys

# Get FS from pyodide module
from pyodide.ffi import to_js
from js import Object

# Create mount point in Pyodide's filesystem
cache_mount = "/cache"
if not os.path.exists(cache_mount):
    os.makedirs(cache_mount, exist_ok=True)
    print(f"[PyodideKernelClient] Created cache mount point: {cache_mount}")

print(f"[PyodideKernelClient] Cache directory: ${cacheDir}")
`);

      // Mount the Node.js directory using Pyodide's FS API
      // Note: Direct FS mounting needs to be done via JS API, not Python
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FS = (this._pyodide as any).FS;

      if (FS && FS.mount && FS.filesystems && FS.filesystems.NODEFS) {
        try {
          // Mount Node.js directory to /cache in Pyodide FS
          FS.mkdir("/cache");
          FS.mount(FS.filesystems.NODEFS, { root: cacheDir }, "/cache");
          console.log(
            `[PyodideKernelClient] ✓ Mounted NODEFS at /cache -> ${cacheDir}`,
          );
        } catch (error) {
          // Directory might already exist from previous mount attempt
          console.log(`[PyodideKernelClient] Cache mount note: ${error}`);
        }

        // Configure micropip to use the cache directory
        await this._pyodide!.runPythonAsync(`
import sys
import os

# Set environment variables for micropip cache
os.environ['MICROPIP_CACHE_DIR'] = '/cache'

# Also set pip cache directory
os.environ['PIP_CACHE_DIR'] = '/cache'

print("[PyodideKernelClient] ✓ Configured micropip to use persistent cache at /cache")
`);
      } else {
        console.warn(
          "[PyodideKernelClient] NODEFS not available, package cache will not persist",
        );
      }
    } catch (error) {
      // Don't fail initialization if cache setup fails
      console.warn(
        "[PyodideKernelClient] Failed to setup persistent cache (non-fatal):",
        error,
      );
    }
  }

  /**
   * Sets up IPython callbacks for capturing formatted output and clean error tracebacks.
   * This ensures errors don't contain internal Pyodide stack frames.
   */
  private async _setupIPythonCallbacks(): Promise<void> {
    if (!this._pyodide) {
      return;
    }

    // Create JavaScript callbacks for IPython shell
    const publishStreamCallback = (
      _msgId: number, // Python passes msgId, but we use _currentMsgId for routing
      name: string,
      text: string,
    ) => {
      if (name === "stdout") {
        this._handleStdout(text);
      } else if (name === "stderr") {
        this._handleStderr(text);
      }
    };

    const publishErrorCallback = (
      msgId: number,
      ename: string,
      evalue: string,
      traceback: unknown,
    ) => {
      // Convert Python list to JavaScript array if needed
      const tracebackArray = Array.isArray(traceback)
        ? traceback
        : traceback && typeof traceback === "object" && "toJs" in traceback
          ? (traceback as { toJs: () => string[] }).toJs()
          : [];

      this._handleIPythonError(msgId, ename, evalue, tracebackArray);
    };

    const publishDisplayDataCallback = (
      msgId: number,
      data: unknown,
      metadata: unknown,
      _transient: unknown,
    ) => {
      // Convert Python dicts to JavaScript objects
      const dataObj =
        data && typeof data === "object" && "toJs" in data
          ? (data as { toJs: () => Record<string, unknown> }).toJs()
          : (data as Record<string, unknown>);

      const metadataObj =
        metadata && typeof metadata === "object" && "toJs" in metadata
          ? (metadata as { toJs: () => Record<string, unknown> }).toJs()
          : (metadata as Record<string, unknown> | undefined);

      this._handleDisplayData(msgId, dataObj, metadataObj);
    };

    const publishExecutionResultCallback = (
      msgId: number,
      _executionCount: number,
      data: unknown,
      metadata: unknown,
    ) => {
      // Convert Python dicts to JavaScript objects
      const dataObj =
        data && typeof data === "object" && "toJs" in data
          ? (data as { toJs: () => Record<string, unknown> }).toJs()
          : (data as Record<string, unknown>);

      const metadataObj =
        metadata && typeof metadata === "object" && "toJs" in metadata
          ? (metadata as { toJs: () => Record<string, unknown> }).toJs()
          : (metadata as Record<string, unknown> | undefined);

      // Execution results are displayed the same way as display_data
      this._handleDisplayData(msgId, dataObj, metadataObj);
    };

    // Set callbacks on Python IPython shell (MUST await this!)
    await this._pyodide.runPythonAsync(
      `
try:
    import pyodide_kernel
    print(f"[DEBUG] pyodide_kernel imported: {pyodide_kernel}")
    print(f"[DEBUG] stdout_stream: {pyodide_kernel.stdout_stream}")
    print(f"[DEBUG] stderr_stream: {pyodide_kernel.stderr_stream}")
    print(f"[DEBUG] ipython_shell: {pyodide_kernel.ipython_shell}")
    print(f"[DEBUG] publishStreamCallback type: {type(publishStreamCallback)}")
    print(f"[DEBUG] publishErrorCallback type: {type(publishErrorCallback)}")

    pyodide_kernel.stdout_stream.publish_stream_callback = publishStreamCallback
    print("[DEBUG] stdout callback set")

    pyodide_kernel.stderr_stream.publish_stream_callback = publishStreamCallback
    print("[DEBUG] stderr callback set")

    pyodide_kernel.ipython_shell.publish_error_callback = publishErrorCallback
    print("[DEBUG] error callback set")

    # Set display publisher callbacks for matplotlib plots, widgets, etc.
    pyodide_kernel.ipython_shell.display_pub.display_data_callback = publishDisplayDataCallback
    print("[DEBUG] display_data callback set")

    # Set displayhook callback for execution results (cell return values)
    pyodide_kernel.ipython_shell.displayhook.publish_execution_result = publishExecutionResultCallback
    print("[DEBUG] execution_result callback set")

except Exception as e:
    import traceback
    print(f"[ERROR] Failed to set callbacks: {e}")
    print(f"[ERROR] Traceback:")
    traceback.print_exc()
    raise
`,
      {
        globals: this._pyodide.toPy({
          publishStreamCallback,
          publishErrorCallback,
          publishDisplayDataCallback,
          publishExecutionResultCallback,
        }),
      },
    );
  }

  /**
   * Pre-downloads Python packages from VS Code configuration.
   * Uses micropip to install packages, which caches them for faster subsequent loads.
   * Runs silently in the background - errors are logged but don't block initialization.
   */
  private async _preloadPackages(): Promise<void> {
    try {
      // Get package list from VS Code configuration
      const config = vscode.workspace.getConfiguration("datalayer.pyodide");
      const packages = config.get<string[]>("preloadPackages", []);

      if (packages.length === 0) {
        console.log("[PyodideKernelClient] No packages configured for preload");
        return;
      }

      console.log(
        `[PyodideKernelClient] Pre-downloading ${packages.length} packages: ${packages.join(", ")}`,
      );

      // Get micropip from Pyodide
      const micropip = this._pyodide!.pyimport("micropip");

      // Download packages in parallel (faster than sequential)
      const results = await Promise.allSettled(
        packages.map(async (pkg) => {
          try {
            await micropip.install(pkg);
            console.log(`[PyodideKernelClient] ✓ Downloaded: ${pkg}`);
            return { pkg, success: true };
          } catch (error) {
            console.warn(
              `[PyodideKernelClient] ✗ Failed to download ${pkg}:`,
              error,
            );
            return { pkg, success: false, error };
          }
        }),
      );

      // Log summary
      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const failed = results.length - succeeded;

      console.log(
        `[PyodideKernelClient] Package preload complete: ${succeeded} succeeded, ${failed} failed`,
      );

      // Configure matplotlib to use inline backend (avoids browser API dependencies)
      // This must be done after matplotlib is loaded
      if (packages.some((pkg) => pkg.toLowerCase().includes("matplotlib"))) {
        console.log(
          "[PyodideKernelClient] Configuring matplotlib inline backend...",
        );
        try {
          await this._pyodide!.runPythonAsync(`
import matplotlib
import matplotlib.pyplot as plt
# Use inline backend (works in Node.js context without browser APIs)
matplotlib.use('module://matplotlib_inline.backend_inline')
# Configure matplotlib for inline display
from matplotlib_inline import backend_inline
backend_inline.configure_inline_support(pyodide_kernel.ipython_shell, 'inline')
print("[PyodideKernelClient] Matplotlib configured with inline backend")
`);
        } catch (error) {
          console.warn(
            "[PyodideKernelClient] Failed to configure matplotlib (non-fatal):",
            error,
          );
        }
      }
    } catch (error) {
      // Don't throw - preloading is optional
      console.warn(
        "[PyodideKernelClient] Package preload failed (non-fatal):",
        error,
      );
    }
  }

  /**
   * Executes Python code in a notebook cell.
   * Queues execution for sequential processing.
   *
   * @param code - Python code to execute
   * @param execution - VS Code notebook cell execution context
   * @throws {Error} If Python code execution fails
   */
  async execute(
    code: string,
    execution: vscode.NotebookCellExecution,
  ): Promise<void> {
    if (!this._pyodide) {
      // Auto-reinitialize if Pyodide was disposed
      console.log(
        "[PyodideKernelClient] Pyodide not initialized, reinitializing...",
      );
      await this.initialize();
    }

    const msgId = ++this._messageId;

    // Create promise that will be resolved/rejected by _processQueue
    return new Promise<void>((resolve, reject) => {
      // Queue execution (sequential processing like Jupyter)
      this._executionQueue.push({ msgId, code, execution });

      // Store mapping for output routing with promise callbacks
      this._pendingExecutions.set(msgId, {
        execution,
        outputs: [],
        resolve,
        reject,
      });

      // Start processing queue (won't block - runs asynchronously)
      this._processQueue();
    });
  }

  /**
   * Processes execution queue sequentially.
   * Ensures only one cell executes at a time per kernel.
   */
  private async _processQueue(): Promise<void> {
    if (this._isExecuting || this._executionQueue.length === 0) {
      return;
    }

    this._isExecuting = true;
    const item = this._executionQueue.shift()!;

    console.log(
      `[PyodideKernelClient] Executing code (msgId=${item.msgId}):`,
      item.code.substring(0, 50),
    );

    let executionError: Error | null = null;

    try {
      // Clear last display data for new execution
      // This prevents incorrectly skipping outputs from the new cell
      this._lastDisplayData = null;

      // Set current message ID for output routing
      this._currentMsgId = item.msgId;

      // Execute Python code using IPython shell for clean error tracebacks
      // Set message ID in Python global scope for callback routing
      await this._pyodide!.runPythonAsync(`
import builtins
builtins._current_msg_id = ${item.msgId}
`);

      // Execute code through IPython shell
      // Escape backslashes first, then single quotes to prevent escape sequences from breaking the Python string
      const escapedCode = item.code.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      await this._pyodide!.runPythonAsync(`
import pyodide_kernel
await pyodide_kernel.ipython_shell.run_cell_async('''${escapedCode}''')
`);

      // Note: We don't manually handle the result here because IPython's displayhook
      // already calls publishExecutionResultCallback which routes to _handleDisplayData

      // Mark execution complete
      console.log(
        `[PyodideKernelClient] Execution complete (msgId=${item.msgId})`,
      );
    } catch (error) {
      // Handle Python exceptions and display error output
      // IPython shell should have already called publishErrorCallback,
      // but fallback to direct error handling if needed
      if (
        !this._pendingExecutions
          .get(item.msgId)
          ?.outputs.some((o) =>
            o.items.some(
              (i) => i.mime === "application/vnd.code.notebook.error",
            ),
          )
      ) {
        this._handleError(item.msgId, error);
      }

      // Store error to reject the promise in execute()
      executionError =
        error instanceof Error ? error : new Error(String(error));
    } finally {
      this._isExecuting = false;

      // Resolve or reject the pending execution promise
      // NOTE: _handleIPythonError may have already deleted pending execution
      const pending = this._pendingExecutions.get(item.msgId);
      if (pending) {
        if (executionError) {
          // Reject the promise so execute() throws and aborts remaining cells
          pending.reject(executionError);
        } else {
          // Resolve the promise so execute() succeeds
          pending.resolve();
        }
        // Clean up pending execution (unless already cleaned up by _handleIPythonError)
        this._pendingExecutions.delete(item.msgId);
      }

      this._currentMsgId = null;

      // Process next in queue
      this._processQueue();
    }
  }

  /**
   * Handles stdout output from Pyodide.
   */
  private _handleStdout(text: string): void {
    // During initialization (no active execution), log to console for debugging
    if (this._currentMsgId === null) {
      console.log("[Pyodide/stdout]", text);
      return;
    }

    const pending = this._pendingExecutions.get(this._currentMsgId);
    if (!pending) {
      return;
    }

    // Truncate large outputs to prevent UI freeze
    if (text.length > 1_000_000) {
      text =
        text.substring(0, 1_000_000) + "\n\n[Output truncated at 1MB limit]";
    }

    const output = new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.stdout(text),
    ]);

    pending.execution.appendOutput(output);
  }

  /**
   * Handles stderr output from Pyodide.
   */
  private _handleStderr(text: string): void {
    // During initialization (no active execution), log to console for debugging
    if (this._currentMsgId === null) {
      console.error("[Pyodide/stderr]", text);
      return;
    }

    const pending = this._pendingExecutions.get(this._currentMsgId);
    if (!pending) {
      return;
    }

    // Truncate large outputs
    if (text.length > 1_000_000) {
      text =
        text.substring(0, 1_000_000) + "\n\n[Output truncated at 1MB limit]";
    }

    const output = new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.stderr(text),
    ]);

    pending.execution.appendOutput(output);
  }

  /**
   * Handles display_data messages (matplotlib plots, widgets, etc.).
   * This is called when IPython's display() or when matplotlib creates plots.
   */
  private _handleDisplayData(
    msgId: number,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): void {
    const pending = this._pendingExecutions.get(msgId);
    if (!pending) {
      console.warn(
        `[PyodideKernelClient] No pending execution for display_data msgId=${msgId}`,
      );
      return;
    }

    // Check for duplicate display data
    // IPython's displayhook uses the display publisher internally, causing the same output
    // to be sent through both publishDisplayDataCallback and publishExecutionResultCallback
    const dataHash = JSON.stringify(data);
    if (
      this._lastDisplayData &&
      this._lastDisplayData.msgId === msgId &&
      this._lastDisplayData.dataHash === dataHash
    ) {
      console.log(
        `[PyodideKernelClient] Skipping duplicate display_data for msgId=${msgId}`,
      );
      return;
    }

    // Store this display data to detect future duplicates
    this._lastDisplayData = { msgId, dataHash };

    const items: vscode.NotebookCellOutputItem[] = [];

    // Process MIME types in priority order (richest first)
    const mimeOrder = [
      "application/vnd.plotly.v1+json",
      "application/vnd.jupyter.widget-view+json",
      "text/html",
      "text/markdown",
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "application/json",
      "text/plain",
    ];

    for (const mimeType of mimeOrder) {
      if (data[mimeType] !== undefined && data[mimeType] !== null) {
        const value = data[mimeType];

        if (mimeType === "image/png" || mimeType === "image/jpeg") {
          // Images in Jupyter are stored in base64 encoded format
          // VS Code expects bytes when rendering images (not base64 text)
          const base64Data = String(value);
          const buffer = Buffer.from(base64Data, "base64");
          items.push(new vscode.NotebookCellOutputItem(buffer, mimeType));
        } else if (
          mimeType === "application/json" ||
          mimeType.includes("+json")
        ) {
          // JSON data
          const jsonData =
            typeof value === "string" ? JSON.parse(value) : value;
          items.push(vscode.NotebookCellOutputItem.json(jsonData, mimeType));
        } else {
          // Text-based MIME types (HTML, SVG, plain text)
          items.push(
            vscode.NotebookCellOutputItem.text(String(value), mimeType),
          );
        }
      }
    }

    if (items.length > 0) {
      const output = new vscode.NotebookCellOutput(items, metadata);
      pending.execution.appendOutput(output);
      console.log(
        `[PyodideKernelClient] ✓ Display data appended with ${items.length} MIME type(s): ${items.map((i) => i.mime).join(", ")}`,
      );
    } else {
      console.warn(
        "[PyodideKernelClient] display_data had no recognized MIME types",
      );
    }
  }

  /**
   * Handles error messages (exceptions, tracebacks).
   * Formats Python tracebacks in Jupyter style without JavaScript stack traces.
   */
  private _handleError(msgId: number, error: unknown): void {
    const pending = this._pendingExecutions.get(msgId);
    if (!pending) {
      return;
    }

    // Extract error information
    let ename = "PythonError";
    let evalue = "";
    let traceback = "";

    if (error instanceof Error) {
      const errorMessage = error.message || String(error);
      const errorStack = error.stack || "";

      // Remove JavaScript stack traces from the stack
      // Keep only lines before JavaScript traces (lines starting with "at " or containing "wasm://")
      const lines = errorStack.split("\n");
      const pythonLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Stop when we hit JavaScript stack traces
        if (trimmed.startsWith("at ") || line.includes("wasm://")) {
          break;
        }
        pythonLines.push(line);
      }

      // Join clean Python traceback
      const cleanTraceback = pythonLines.join("\n").trim();

      // Extract error name from the last line of traceback
      // Format is typically: "ErrorName: error message"
      const lastLine = pythonLines[pythonLines.length - 1]?.trim() || "";
      const errorMatch = lastLine.match(/^(\w+(?:Error|Exception)):\s*(.*)$/);

      if (errorMatch) {
        ename = errorMatch[1];
        evalue = errorMatch[2] || errorMessage;
      } else {
        ename = error.name || "PythonError";
        evalue = errorMessage;
      }

      // Format with Jupyter-style horizontal line separator
      traceback = cleanTraceback
        ? `---------------------------------------------------------------------------\n${cleanTraceback}`
        : `---------------------------------------------------------------------------\n${ename}: ${evalue}`;
    } else {
      evalue = String(error);
      traceback = `---------------------------------------------------------------------------\n${ename}: ${evalue}`;
    }

    const output = new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.error({
        name: ename,
        message: evalue,
        stack: traceback,
      }),
    ]);

    pending.execution.appendOutput(output);
  }

  /**
   * Handles error messages from IPython shell with clean, pre-formatted tracebacks.
   * IPython automatically filters out internal Pyodide frames, providing clean Python-only tracebacks.
   *
   * @param msgId - Execution message ID
   * @param ename - Error name (e.g., "SyntaxError", "NameError")
   * @param evalue - Error message
   * @param traceback - Pre-formatted traceback lines from IPython (already clean!)
   */
  private _handleIPythonError(
    msgId: number,
    ename: string,
    evalue: string,
    traceback: string[],
  ): void {
    const pending = this._pendingExecutions.get(msgId);
    if (!pending) {
      return;
    }

    // Join traceback lines with Jupyter-style separator
    const formattedTraceback = traceback.join("\n");

    const output = new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.error({
        name: ename,
        message: evalue,
        stack: formattedTraceback,
      }),
    ]);

    pending.execution.appendOutput(output);

    // CRITICAL: Reject the promise to stop execution of remaining cells
    // This ensures that when IPython catches an error, the execute() method throws
    // and the smartDynamicControllerManager's loop breaks (line 502)
    const error = new Error(`${ename}: ${evalue}`);
    error.name = ename;
    pending.reject(error);

    // Clean up pending execution (avoid double-rejection in _processQueue)
    this._pendingExecutions.delete(msgId);
  }

  /**
   * Disposes of the kernel.
   * Should be called when notebook is closed.
   */
  dispose(): void {
    console.log("[PyodideKernelClient] Disposing kernel");

    this._pyodide = null;
    this._isReady = false;
    this._isExecuting = false;
    this._pendingExecutions.clear();
    this._executionQueue = [];
  }

  /**
   * Checks if kernel is ready for execution.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Checks if kernel is currently executing.
   */
  get isExecuting(): boolean {
    return this._isExecuting;
  }
}
