/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Pyodide Worker Code
 * This code runs in a Web Worker and executes Python code via Pyodide
 */

// Pyodide Worker - runs Python code via Pyodide
let pyodide = null;
let pyodideReadyPromise = null;

// Initialize Pyodide
async function initPyodide(
  baseUrl,
  pyodideScript,
  asmScript,
  pyodideKernelCode,
) {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    // Execute asm.js FIRST to define _createPyodideModule
    eval(asmScript);

    // Then execute the Pyodide loader script
    eval(pyodideScript);

    // Override fetch() to intercept ALL resource requests
    const originalFetch = self.fetch;
    const pendingFetches = new Map();
    let fetchRequestId = 0;

    self.fetch = async function (resource, init) {
      const url = resource.toString();

      // If this is a Pyodide resource, route through main thread
      if (url.includes(baseUrl) || url.includes("pyodide")) {
        const id = fetchRequestId++;
        const promise = new Promise((resolve, reject) => {
          pendingFetches.set(id, { resolve, reject });
        });

        postMessage({
          type: "fetch-request",
          id: id,
          url: url,
        });

        return promise;
      }

      return originalFetch.call(this, resource, init);
    };

    self.__pendingFetches = pendingFetches;

    // Block importScripts completely since we pre-loaded asm.js
    const originalImportScripts = self.importScripts;
    self.importScripts = function (..._urls) {
      // No-op, everything already loaded via eval
    };

    // Load Pyodide
    pyodide = await self.loadPyodide({
      indexURL: baseUrl + "/",
    });

    // Restore original functions
    self.fetch = originalFetch;
    self.importScripts = originalImportScripts;

    // Helper function to recursively convert Maps to plain objects for postMessage compatibility
    // Maps cannot be cloned by structured clone algorithm used by postMessage
    function mapToObject(obj) {
      const out = obj instanceof Array ? [] : {};
      const entries = obj instanceof Map ? obj.entries() : Object.entries(obj);
      for (const [key, value] of entries) {
        out[key] =
          value instanceof Map || value instanceof Array
            ? mapToObject(value)
            : value;
      }
      return out;
    }

    // Pre-load micropip
    await pyodide.loadPackage(["micropip"]);

    // Install IPython and nbformat (required for Plotly)
    await pyodide.runPythonAsync(
      "import micropip\n" +
        'await micropip.install("ipython")\n' +
        'await micropip.install("nbformat")',
    );

    // Configure matplotlib backend (JupyterLite pattern)
    // Use matplotlib_inline for proper Jupyter integration
    await pyodide.runPythonAsync(`
import os

# Set matplotlib to use inline backend (designed for Jupyter)
# This must be set BEFORE matplotlib is imported
if not os.environ.get('MPLBACKEND'):
    os.environ['MPLBACKEND'] = 'module://matplotlib_inline.backend_inline'
    print("[PyodideWorker] Matplotlib configured to use inline backend")
`);

    // Load pyodide_kernel.py module (JupyterLite pattern)
    console.log("[PyodideWorker] Writing pyodide_kernel.py to filesystem...");
    console.log(
      "[PyodideWorker] pyodideKernelCode length:",
      pyodideKernelCode?.length || 0,
    );

    if (!pyodideKernelCode || pyodideKernelCode.length === 0) {
      throw new Error("pyodideKernelCode is empty or undefined");
    }

    pyodide.FS.writeFile("/pyodide_kernel.py", pyodideKernelCode);
    console.log("[PyodideWorker] File written, importing module...");

    // Add root directory to Python path so import can find the module
    await pyodide.runPythonAsync(
      "import sys\n" +
        'if "/" not in sys.path:\n' +
        '    sys.path.insert(0, "/")',
    );

    await pyodide.runPythonAsync("import pyodide_kernel");
    console.log("[PyodideWorker] Module imported successfully");

    // Set up callbacks ONCE during initialization (JupyterLite pattern)
    // These callbacks will use the msg_id passed from Python
    const publishExecutionResult = (msg_id, _prompt_count, data, metadata) => {
      // Convert Python dict to plain JavaScript object
      const dataObj = data.toJs ? data.toJs() : data;
      const metadataObj =
        metadata && metadata.toJs ? metadata.toJs() : metadata;

      // Recursively convert Maps to plain objects for postMessage compatibility
      const formattedData = mapToObject(dataObj);
      const formattedMetadata = metadataObj ? mapToObject(metadataObj) : {};

      self.postMessage({
        id: msg_id,
        type: "execute_result",
        result: formattedData,
        metadata: formattedMetadata,
      });
    };

    const publishStreamCallback = (msg_id, name, text) => {
      self.postMessage({ id: msg_id, type: "stream", name, text });
    };

    const displayDataCallback = (msg_id, data, metadata, _transient) => {
      // Convert Python dict to plain JavaScript object
      const dataObj = data.toJs ? data.toJs() : data;
      const metadataObj =
        metadata && metadata.toJs ? metadata.toJs() : metadata;

      // Recursively convert Maps to plain objects for postMessage compatibility
      const formattedData = mapToObject(dataObj);
      const formattedMetadata = metadataObj ? mapToObject(metadataObj) : {};

      self.postMessage({
        id: msg_id,
        type: "display_data",
        data: formattedData,
        metadata: formattedMetadata,
      });
    };

    const clearOutputCallback = (msg_id, wait) => {
      self.postMessage({ id: msg_id, type: "clear_output", wait });
    };

    const updateDisplayDataCallback = (msg_id, data, metadata, _transient) => {
      // Convert Python dict to plain JavaScript object
      const dataObj = data.toJs ? data.toJs() : data;
      const metadataObj =
        metadata && metadata.toJs ? metadata.toJs() : metadata;

      // Recursively convert Maps to plain objects for postMessage compatibility
      const formattedData = mapToObject(dataObj);
      const formattedMetadata = metadataObj ? mapToObject(metadataObj) : {};

      self.postMessage({
        id: msg_id,
        type: "update_display_data",
        data: formattedData,
        metadata: formattedMetadata,
      });
    };

    const publishErrorCallback = (msg_id, ename, evalue, traceback) => {
      console.error(
        `[PyodideWorker] publishErrorCallback called with msg_id="${msg_id}", ename="${ename}", evalue="${evalue}"`,
      );

      // Convert Python list to JavaScript array if needed
      const tracebackArray =
        traceback && traceback.toJs ? traceback.toJs() : traceback;

      self.postMessage({
        id: msg_id,
        type: "error",
        ename: ename,
        evalue: evalue,
        traceback: tracebackArray,
      });
    };

    // Set callbacks on Python objects
    await pyodide.runPythonAsync(
      `
import pyodide_kernel
pyodide_kernel.stdout_stream.publish_stream_callback = publishStreamCallback
pyodide_kernel.stderr_stream.publish_stream_callback = publishStreamCallback
pyodide_kernel.ipython_shell.display_pub.clear_output_callback = clearOutputCallback
pyodide_kernel.ipython_shell.display_pub.display_data_callback = displayDataCallback
pyodide_kernel.ipython_shell.display_pub.update_display_data_callback = updateDisplayDataCallback
pyodide_kernel.ipython_shell.displayhook.publish_execution_result = publishExecutionResult
pyodide_kernel.ipython_shell.publish_error_callback = publishErrorCallback
`,
      {
        globals: pyodide.toPy({
          publishStreamCallback,
          clearOutputCallback,
          displayDataCallback,
          updateDisplayDataCallback,
          publishExecutionResult,
          publishErrorCallback,
        }),
      },
    );

    console.log("[PyodideWorker] Initialized");

    return pyodide;
  })();

  return pyodideReadyPromise;
}

// Handle messages from main thread
self.addEventListener("message", async (event) => {
  const {
    id,
    type,
    code,
    baseUrl,
    pyodideScript,
    asmScript,
    pyodideKernelCode,
    url,
    data,
    success,
    error,
    parent_msg_id,
  } = event.data;

  if (type === "fetch-response") {
    const pending = self.__pendingFetches?.get(id);
    if (pending) {
      if (success) {
        const response = new Response(data, {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": url.endsWith(".wasm")
              ? "application/wasm"
              : url.endsWith(".js")
                ? "application/javascript"
                : url.endsWith(".json")
                  ? "application/json"
                  : "application/octet-stream",
          },
        });
        pending.resolve(response);
      } else {
        pending.reject(new Error(error || "Fetch failed"));
      }
      self.__pendingFetches.delete(id);
    }
    return;
  }

  if (type === "init") {
    try {
      await initPyodide(baseUrl, pyodideScript, asmScript, pyodideKernelCode);
      self.postMessage({ id, type: "ready" });
    } catch (error) {
      self.postMessage({
        id,
        type: "error",
        error: {
          ename: "InitializationError",
          evalue: error.message,
          traceback: [error.stack || error.message],
        },
      });
    }
  } else if (type === "execute") {
    try {
      if (!pyodide) {
        throw new Error("Pyodide not initialized");
      }

      self.postMessage({ id, type: "status", status: "busy" });

      // Store the PARENT MESSAGE ID (string) in Python's builtins
      // This is the execute_request msg_id that matches parent_header in iopub messages
      // Python callbacks will send this back so outputs route to the correct cell
      const msgIdForPython = parent_msg_id || id;
      await pyodide.runPythonAsync(
        `import builtins\nbuiltins._current_msg_id = "${msgIdForPython}"`,
      );

      // Auto-load packages
      try {
        await pyodide.loadPackagesFromImports(code);
      } catch (loadError) {
        console.error("[PyodideWorker] Package load failed:", loadError);
      }

      // Redirect stdout/stderr (already set in pyodide_kernel module)
      await pyodide.runPythonAsync(`
import sys
import pyodide_kernel
sys.stdout = pyodide_kernel.stdout_stream
sys.stderr = pyodide_kernel.stderr_stream
`);

      // Execute code using IPython shell
      // For async code, run_cell returns a coroutine/PyodideTask, which we must NOT access attributes on
      // Just execute and let the callbacks handle all output
      pyodide.globals.set("__code__", code);
      await pyodide.runPythonAsync(`
import pyodide_kernel
shell = pyodide_kernel.ipython_shell
# Execute the code - this will call all the display callbacks
shell.run_cell(__code__, store_history=True, silent=False)
`);

      self.postMessage({ id, type: "status", status: "idle" });
    } catch (error) {
      self.postMessage({
        id,
        type: "error",
        error: {
          ename: error.constructor.name,
          evalue: error.message,
          traceback: [error.stack || error.message],
        },
      });
      self.postMessage({ id, type: "status", status: "idle" });
    }
  }
});
