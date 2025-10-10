# Pyodide Integration Attempts

**Goal**: Implement local Pyodide-based Python kernel for VS Code extension to enable offline notebook execution.

**Challenge**: VS Code webview CSP (Content Security Policy) blocks external script loading, Web Workers, and importScripts calls.

**Status**: ✅ PARTIAL SUCCESS (Attempt 10) - Pyodide initializes, stdlib loading issue remains

---

## TL;DR - Current Status

**Latest**: Attempt 10 successfully loads Pyodide core, but fails on Python stdlib loading.

**What's Working**:
- ✅ Worker creation via Blob URL (bypasses CSP)
- ✅ Pre-fetching pyodide.js (16KB) and pyodide.asm.js (1.1MB) in main thread
- ✅ Executing scripts via eval in worker
- ✅ Pyodide core initialization successful
- ✅ fetch() override routing WASM/JSON/ZIP through main thread

**Current Blocker**:
- ❌ "No module named 'encodings'" - python_stdlib.zip (2.2MB) not loading
- Fetch override should handle this but not being triggered
- May need browser cache clear or need to pre-load stdlib like asm.js

**Key Learnings**:
1. asm.js is REQUIRED (defines _createPyodideModule), not just a fallback
2. importScripts cannot be made async (spec requirement)
3. Pyodide uses BOTH fetch() and importScripts() for different resources
4. Pre-fetching in main thread + eval in worker = solution for CSP

---

## Attempt 1: JupyterLite PyodideKernel

**Approach**: Use `@jupyterlite/pyodide-kernel` directly from JupyterLite package.

**Implementation**:
- Created `jupyterliteKernelAdapter.ts` wrapping `PyodideKernel`
- Attempted to instantiate kernel with `new PyodideKernel({ sendMessage, location, mountDrive })`

**Result**: FAILED

**Error**:
```
SecurityError: Failed to construct 'Worker': Script at 'https://cdn.jsdelivr.net/...' cannot be accessed from origin 'vscode-webview://...'
```

**Root Cause**: JupyterLite creates external Web Worker from CDN URL, which violates CSP.

---

## Attempt 2: Inline Web Worker from Blob URL

**Approach**: Create worker from inline code string using Blob URL to bypass CSP restrictions.

**Implementation**:
- Created `pyodideInlineKernel.ts` with worker code embedded as string constant
- Used `new Blob([WORKER_CODE])` and `URL.createObjectURL(blob)` to create worker
- Worker loads from blob:// URL instead of external file

**Result**: PARTIAL SUCCESS

**What Worked**:
- Worker creation succeeded (Blob URL bypasses CSP for worker creation)
- Worker initialized and started running code

**What Failed**:
```
Refused to load the script 'https://cdn.jsdelivr.net/pyodide/v0.18.1/full/pyodide.js' because it violates the following Content Security Policy directive: "script-src 'nonce-...'"
```

**Root Cause**: Worker code uses `importScripts()` to load Pyodide from CDN, which CSP blocks inside workers.

---

## Attempt 3: Bundle Pyodide Locally

**Approach**: Bundle Pyodide files (12MB) in extension dist folder instead of loading from CDN.

**Implementation**:
- Updated `webpack.config.js` with CopyPlugin to copy Pyodide files from `node_modules/pyodide/`
- Copied: `*.js`, `*.wasm`, `*.json`, `*.zip`, `*.mjs`, `*.map`
- Changed worker code to use local path instead of CDN

**Result**: PARTIAL SUCCESS

**What Worked**:
- Pyodide files (12MB) bundled successfully in dist/pyodide/
- Worker attempted to fetch local files

**What Failed**:
```
GET https://file+.vscode-resource.vscode-cdn.net/.../pyodide.js net::ERR_ABORTED 403 (Forbidden)
```

**Root Cause**: Direct file:// or vscode-resource:// URLs don't work. Need VS Code's `asWebviewUri` API.

---

## Attempt 4: Use asWebviewUri for Proper Resource URIs

**Approach**: Use VS Code's `webview.asWebviewUri()` to convert file paths to proper webview resource URIs.

**Implementation**:
- Modified `notebookTemplate.ts` to generate Pyodide base URI using `asWebviewUri`
- Injected URI into webview global scope: `window.__PYODIDE_BASE_URI__`
- Worker fetches Pyodide script from proper webview URI

**Result**: MAJOR PROGRESS

**What Worked**:
- Fetch response changed from 403 Forbidden to 200 OK
- Pyodide script loads successfully (16698 bytes)
- Worker initializes properly

**What Failed**:
```
Refused to load the script 'https://file+.vscode-resource.vscode-cdn.net/.../pyodide.asm.js' because it violates CSP directive: "script-src 'nonce-...'"
```

**Root Cause**: Pyodide's `loadPyodide()` tries to load asm.js (JavaScript fallback) via `importScripts()`, which CSP blocks. Need to force WASM-only mode.

---

## Attempt 5: Fetch in Main Thread, Pass to Worker

**Approach**: Since workers can't fetch from vscode-webview:// URIs, fetch Pyodide script in main thread and pass via postMessage.

**Implementation**:
- Main thread: `fetch(pyodideBaseUrl/pyodide.js).then(response => response.text())`
- Send script content to worker via postMessage: `{ type: 'init', pyodideScript, baseUrl }`
- Worker: `eval(pyodideScript)` to load Pyodide into global scope

**Result**: SUCCESS (for initial script load)

**What Worked**:
- Pyodide script loads (200 OK, 16698 bytes)
- `eval(pyodideScript)` successfully adds `loadPyodide` function to worker global scope
- WebAssembly support confirmed: `typeof WebAssembly !== 'undefined'` returns `true`

**What Still Fails**:
Pyodide internally calls `importScripts()` to load `pyodide.asm.js`, triggering same CSP violation.

---

## Attempt 6: Monkey-Patch importScripts (Return Early)

**Approach**: Override `self.importScripts` to return early for asm.js files, preventing CSP violation.

**Implementation**:
```javascript
const originalImportScripts = self.importScripts;
self.importScripts = function(...args) {
  console.log('[PyodideWorker] importScripts called with:', args);
  if (args.some(url => url.includes('.asm.js'))) {
    console.warn('[PyodideWorker] Blocking asm.js import, returning early');
    return; // Just return without doing anything
  }
  return originalImportScripts.apply(this, args);
};
```

**Result**: FAILED

**Error**: Pyodide initialization hangs/fails silently.

**Root Cause**: Returning early makes Pyodide think asm.js loaded successfully, but the code isn't actually there. When Pyodide tries to use asm.js functions, they're undefined.

---

## Attempt 7: Monkey-Patch importScripts (Throw Error)

**Approach**: Throw error when asm.js loading attempted, hoping Pyodide has fallback logic to use WASM instead.

**Implementation**:
```javascript
self.importScripts = function(...args) {
  console.log('[PyodideWorker] importScripts called with:', args);
  if (args.some(url => url.includes('.asm.js'))) {
    console.warn('[PyodideWorker] Throwing error for asm.js import to force WASM fallback');
    throw new Error('asm.js blocked by CSP, using WASM instead');
  }
  return originalImportScripts.apply(this, args);
};
```

**Result**: FAILED

**Error**:
```
[PyodideWorker] importScripts called with: ['https://file+.vscode-resource.vscode-cdn.net/.../pyodide.asm.js']
[PyodideWorker] Throwing error for asm.js import to force WASM fallback
[PyodideInlineKernel] Worker message: {id: 0, type: 'error', error: {…}}
```

**Root Cause**: Pyodide's `loadPyodide()` doesn't have proper error handling for importScripts failures. When asm.js import throws, initialization fails completely instead of falling back to WASM.

---

---

## Attempt 8: Override fetch() in Worker (IN PROGRESS)

**Approach**: Override worker's `fetch()` function to intercept ALL resource requests and route them through main thread.

**Implementation**:
- Worker: Override `self.fetch()` to intercept all Pyodide resource requests
- Worker: Post `fetch-request` message to main thread with URL
- Main thread: Fetch resource using proper webview URI and send back data
- Worker: Resolve original fetch promise with received data
- Completely block `importScripts()` - not needed with fetch override

**Key Code** (worker):
```javascript
self.fetch = async function(resource, init) {
  const url = resource.toString();
  if (url.includes(baseUrl) || url.includes('pyodide')) {
    const id = fetchRequestId++;
    const promise = new Promise((resolve, reject) => {
      pendingFetches.set(id, { resolve, reject });
    });

    postMessage({ type: 'fetch-request', id: id, url: url });
    return promise;
  }
  return originalFetch.call(this, resource, init);
};
```

**Key Code** (main thread):
```javascript
if (msg.type === 'fetch-request') {
  fetch(msg.url)
    .then(response => {
      if (msg.url.endsWith('.wasm')) {
        return response.arrayBuffer();
      } else {
        return response.text();
      }
    })
    .then(data => {
      this._worker.postMessage({
        id: msg.id,
        type: 'fetch-response',
        url: msg.url,
        success: true,
        data: data
      });
    });
}
```

**Result**: PARTIAL SUCCESS (kernel lifecycle issue found)

**What Worked**:
- Fetch override implemented correctly
- Main thread proxy working
- Worker creation successful

**What Failed**:
- Kernel immediately shut down by notebook component before init completed
- Reason: Initial status was "unknown" + connection "connecting"
- Notebook2Base.js interprets this as failed kernel and shuts it down
- Worker never gets chance to initialize Pyodide

**Fix 1 Applied** (kernel lifecycle):
Changed initial status to "idle" and connection to "connected":
```typescript
private _status: Kernel.Status = "idle";  // Start as idle to prevent immediate shutdown
private _connectionStatus: Kernel.ConnectionStatus = "connected";  // Start as connected
```

**Retest Result**: MAJOR PROGRESS - fetch override working!
- ✅ Kernel stays alive
- ✅ Worker initializes successfully
- ✅ fetch() override working for: pyodide-lock.json, pyodide.asm.wasm, python_stdlib.zip
- ❌ importScripts still called for asm.js (not intercepted by fetch override)
- Pyodide uses BOTH fetch() and importScripts() for different resources

**Fix 2 Applied** (importScripts to fetch conversion):
Override importScripts to use fetch + eval instead:
```typescript
self.importScripts = async function(...urls) {
  console.warn('[PyodideWorker] importScripts called, converting to fetch:', urls);
  for (const url of urls) {
    const response = await fetch(url);  // Uses our fetch override
    const scriptText = await response.text();
    eval.call(self, scriptText);  // Execute in global scope
  }
};
```

This converts importScripts calls to fetch (which routes through main thread) + eval.

**Status**: Build successful with Fix 2, ready for retest.

**Retest Result - Fix 2**: FAILED (importScripts must be synchronous)
- ✅ importScripts override triggered
- ✅ Converted to fetch + eval
- ✅ asm.js fetched successfully
- ✅ asm.js executed via eval
- ❌ But importScripts is now async (returns Promise)
- ❌ Pyodide expects synchronous importScripts (native behavior)
- ❌ Can't make fetch synchronous in worker

**Root Cause**: importScripts is synchronous by spec, but fetch is always async. No way to make fetch synchronous in workers.

---

## Attempt 9: Skip asm.js Completely (WASM-Only Mode)

**Approach**: Don't load asm.js at all - just skip it and let Pyodide use WASM.

**Rationale**:
- WASM already loads successfully via fetch override
- asm.js is just a JavaScript fallback for browsers without WASM
- We confirmed WebAssembly support exists
- If WASM works, asm.js is unnecessary

**Implementation**:
```typescript
self.importScripts = function(...urls) {
  // Filter out asm.js files
  const filteredUrls = urls.filter(url => !url.includes('.asm.js'));

  if (filteredUrls.length !== urls.length) {
    console.warn('[PyodideWorker] Skipping asm.js files - using WASM only');
  }

  // Load non-asm.js files with original importScripts
  if (filteredUrls.length > 0) {
    return originalImportScripts.apply(this, filteredUrls);
  }

  // All files were asm.js - skip completely
  console.log('[PyodideWorker] All files were asm.js, skipping');
};
```

This approach:
- Keeps importScripts synchronous (no Promise)
- Filters out asm.js before calling original importScripts
- Lets other importScripts calls work normally
- Relies on WASM which already loads via fetch override

**Status**: Build successful, ready for testing.

**Retest Result - Attempt 9**: FAILED (asm.js defines required function)
- ✅ asm.js skipped successfully
- ❌ Error: "_createPyodideModule is not defined"
- **Root Cause**: asm.js file (1.1MB) defines `_createPyodideModule` which Pyodide requires
- Can't skip asm.js - it's not just a fallback, it's REQUIRED

---

## Attempt 10: Pre-fetch asm.js in Main Thread

**Approach**: Fetch BOTH pyodide.js AND pyodide.asm.js in main thread, pass both to worker via postMessage.

**Rationale**:
- asm.js defines `_createPyodideModule` (required)
- Can't load via importScripts (CSP blocked)
- Can't skip (required function)
- Solution: Pre-fetch in main thread (no CSP issues) and pass script text to worker

**Implementation**:

Main thread:
```typescript
Promise.all([
  fetch(`${pyodideBaseUrl}/pyodide.js`).then(r => r.text()),
  fetch(`${pyodideBaseUrl}/pyodide.asm.js`).then(r => r.text())  // 1.1MB
])
  .then(([pyodideScript, asmScript]) => {
    this._worker.postMessage({
      type: "init",
      baseUrl: pyodideBaseUrl,
      pyodideScript: pyodideScript,
      asmScript: asmScript
    });
  });
```

Worker:
```typescript
async function initPyodide(baseUrl, pyodideScript, asmScript) {
  // Execute asm.js FIRST to define _createPyodideModule
  console.log('[PyodideWorker] Executing asm.js script...');
  eval(asmScript);

  // Then execute Pyodide loader
  console.log('[PyodideWorker] Executing Pyodide script...');
  eval(pyodideScript);

  // Now loadPyodide() should work
  pyodide = await loadPyodide({ indexURL: baseUrl + '/' });
}
```

**Status**: Build successful, ready for testing.

**Retest Result - Attempt 10**: MAJOR SUCCESS - asm.js loaded!
- ✅ asm.js (1.1MB) fetched in main thread
- ✅ asm.js executed via eval in worker
- ✅ _createPyodideModule defined
- ✅ Pyodide initialization started
- ❌ NEW ERROR: "No module named 'encodings'" (Python stdlib missing)

**Analysis**:
- Pyodide successfully initialized (got past asm.js issue)
- Now failing because it can't find python_stdlib.zip
- The fetch override should handle this but isn't being triggered
- Need to verify python_stdlib.zip is bundled and accessible

**Fix Applied**: Cleaned up importScripts override to be simpler no-op since asm.js is pre-loaded.

**Status**: Build successful, ready for retest.

---

## Summary of All Attempts

| Attempt | Approach | Result | Why It Failed |
|---------|----------|--------|---------------|
| 1 | JupyterLite PyodideKernel | ❌ | CDN worker URL blocked by CSP |
| 2 | Inline worker from Blob URL | 🟡 | Worker created, but importScripts blocked |
| 3 | Bundle Pyodide locally | 🟡 | Files bundled, but 403 Forbidden |
| 4 | Use asWebviewUri | 🟡 | Files load (200 OK), but asm.js via importScripts blocked |
| 5 | Fetch in main thread, pass to worker | ✅ | pyodide.js loads, but asm.js still via importScripts |
| 6 | Monkey-patch importScripts (return early) | ❌ | Pyodide thinks asm.js loaded but code missing |
| 7 | Monkey-patch importScripts (throw error) | ❌ | No fallback logic in Pyodide |
| 8 | Override fetch() in worker | 🟡 | Works for JSON/WASM/ZIP, but asm.js still via importScripts |
| 8.1 | Override importScripts to async fetch+eval | ❌ | importScripts must be synchronous (spec) |
| 9 | Skip asm.js completely | ❌ | asm.js defines _createPyodideModule (required) |
| 10 | Pre-fetch asm.js in main thread | ✅ | **SUCCESS** - asm.js loaded, Pyodide initializes! |

## Current Status

**What Works (Attempt 10)**:
- ✅ Inline Web Worker creation via Blob URL (bypasses CSP)
- ✅ Pyodide bundled locally (12MB in dist/pyodide/)
- ✅ Proper webview resource URIs via `asWebviewUri`
- ✅ Fetching pyodide.js (16KB) in main thread
- ✅ Fetching pyodide.asm.js (1.1MB) in main thread
- ✅ Passing both scripts to worker via postMessage
- ✅ Executing asm.js via eval (defines _createPyodideModule)
- ✅ Executing pyodide.js via eval (defines loadPyodide)
- ✅ Pyodide initialization started
- ✅ fetch() override working for WASM/JSON/ZIP
- ✅ importScripts blocked (no longer needed)

**Current Issue (RESOLVED)**:
- ❌ "No module named 'encodings'" - python_stdlib.zip not loading
- ✅ FOUND: fetch override working, stdlib requested
- ✅ FOUND: .zip files returned as text instead of arrayBuffer
- ✅ FIX APPLIED: Return .zip files as arrayBuffer like .wasm

**Fix**:
```typescript
// For binary files (WASM, ZIP), return arrayBuffer; for text files, return text
if (msg.url.endsWith('.wasm') || msg.url.endsWith('.zip')) {
  return response.arrayBuffer();
} else {
  return response.text();
}
```

**Status**: Build successful, ready for final test. Should now execute Python code!

---

## ✅ SUCCESS - Pyodide Integration Working! (October 2025)

**Final Result**: Pyodide successfully integrated and executing Python code in VS Code extension!

**Test Results**:
- ✅ Pyodide loaded successfully
- ✅ Worker sends 'ready' message
- ✅ Code execution works: `x = 1` ✓
- ✅ Expressions work: `1+4` returns `5` ✓
- ✅ Outputs display correctly in cells
- ✅ Execution counts increment properly (`[1]:`, `[2]:`, etc.)
- ✅ Line breaks and streaming output work perfectly
- ✅ Package preloading with configurable behavior
- ✅ TypeScript strict mode compliance

**What Was Fixed**:
1. **Blob URL worker** - Bypasses CSP for worker creation
2. **Pre-fetch asm.js** - Load 1.1MB asm.js in main thread, pass to worker
3. **fetch() override** - Route all Pyodide resources through main thread
4. **Binary file handling** - Return .zip and .wasm as arrayBuffer, not text
5. **stdout capture** - Use pyodide.setStdout() to capture print() output

**Final Architecture**:
```
Main Thread:
  - Fetch pyodide.js (16KB) + pyodide.asm.js (1.1MB)
  - Pass both to worker via postMessage
  - Handle all fetch requests from worker (proxy pattern)

Worker (Blob URL):
  - Execute asm.js via eval (defines _createPyodideModule)
  - Execute pyodide.js via eval (defines loadPyodide)
  - Override fetch() to route through main thread
  - Block importScripts (not needed)
  - Execute Python code via pyodide.runPythonAsync()
```

**Performance**:
- First load: ~2-3 seconds (loads 12MB Pyodide bundle)
- Subsequent executions: Near-instant
- All resources cached in browser

**Known Issues**:
- ✅ ~~Minor UI framework errors about future.dispose()~~ FIXED
- ✅ ~~Results don't display in cell outputs~~ FIXED
- ✅ ~~Execution counts not showing~~ FIXED - Added execute_input messages
- ✅ ~~Outputs appending to all cells~~ FIXED - Added parent_header filtering
- ✅ ~~Output formatting issues (line breaks, streaming)~~ FIXED - See Fix 6 below
- ✅ ~~IAnyMessageArgs unwrapping~~ FIXED - See Fix 7 below
- No syntax highlighting in outputs yet (minor)
- No interactive widgets support yet (future enhancement)

**Latest Fixes (October 2025)**:

**Fix 1** - Proper execution completion:
Changed `done` promise from immediate resolve to waiting for execution completion:
```typescript
const executionPromise = new Promise<any>((resolve) => {
  const handler = (sender: any, msg: any) => {
    if (msg.content && msg.content.execution_state === 'idle') {
      this._iopubMessage.disconnect(handler);
      resolve({ status: "ok", execution_count: this._executionCount });
    }
  };
  this._iopubMessage.connect(handler);
});
```

**Status**: ✅ COMPLETE - Pyodide integration successful with output display!

---

## Recent Fixes (October 2025)

### Fix 5: Execution Counts and Output Isolation

**Date**: October 2025

**Issues Fixed**:
1. Execution counts not showing (`[*]:` instead of `[1]:`, `[2]:`)
2. Outputs appending to ALL previous cells instead of just current cell
3. Cell execution isolation broken

**Root Causes**:
1. Missing `execute_input` IOPub message that tells JupyterLab the execution count
2. No parent_header filtering - all futures received all messages
3. `onIOPub`, `onReply`, `onStdin` implemented as methods instead of property setters

**Fixes Applied**:

**1. Execute Input Messages** - Emit when status becomes 'busy':
```typescript
if (status === "busy" && this._currentExecuteCode) {
  this._executionCount++;
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
}
```

**2. Parent Header Filtering** - Store execute request header and filter messages:
```typescript
// Store request header for filtering
const executeRequestHeader = {
  msg_id: `execute_request_${msgId}`,
  msg_type: "execute_request",
  username: this.username,
  session: this.clientId,
  date: startTime,
};
this._currentExecuteHeader = executeRequestHeader;

// Filter messages by parent_header
Object.defineProperty(future, "onIOPub", {
  set: (cb: any) => {
    iopubWrapper = (_sender: any, msg: any) => {
      // Only emit messages that belong to THIS execution
      if (msg.parent_header && msg.parent_header.msg_id === executeRequestHeader.msg_id) {
        cb(msg);
      }
    };
    this._iopubMessage.connect(iopubWrapper);
  },
});
```

**3. Property Setters** - JupyterLab uses property assignment, not method calls:
```typescript
// Wrong: future.onIOPub((msg) => {...})
// Right: future.onIOPub = (msg) => {...}

Object.defineProperty(future, "onIOPub", {
  set: (cb: any) => { /* connect callback */ },
  get: () => undefined,
});
```

**4. Lumino Signal Wrapper** - Drop sender parameter:
```typescript
// Lumino signals emit (sender, args)
// JupyterLab expects just (msg)
iopubWrapper = (_sender: any, msg: any) => {
  if (msg.parent_header?.msg_id === executeRequestHeader.msg_id) {
    cb(msg);  // Call with msg only
  }
};
```

**Results**:
- ✅ Execution counts display: `[1]:`, `[2]:`, `[3]:` etc.
- ✅ Outputs isolated to correct cells
- ✅ Multiple cells can be executed without cross-contamination
- ✅ Cell execution state properly managed

---

## Output Display Fix (Final)

**Problem**: Code executes but outputs don't display in cells

**Error Messages**:
```
TypeError: Cannot read properties of undefined (reading 'finally')
  at set future (widget.js:228)

TypeError: cell.outputArea.future.registerMessageHook is not a function
  at CodeCell.execute (widget.js:1386)
```

**Root Cause**: `requestExecute` was declared as `async` returning `Promise<any>`, but JupyterLab expects **synchronous** return of future object.

**What Was Happening**:
```typescript
async requestExecute(...): Promise<any> {
  return { done: ..., onIOPub: ..., ... };  // Returns Promise<future>, not future!
}
```

JupyterLab calls `kernel.requestExecute()` and immediately tries to access properties on the returned value. Since it was async, it returned a Promise, not the future object. The Promise doesn't have `done`, `onIOPub`, etc., so those were undefined.

**Fix**:
```typescript
requestExecute(...): any {  // Synchronous, NOT async
  return { done: ..., onIOPub: ..., ... };  // Returns future immediately
}
```

Now the future object is returned synchronously and JupyterLab can immediately access its properties.

**Test Results After Fix**:
- ✅ `print(1)` displays output `1`
- ✅ `1+4` displays output `5`
- ✅ No more `TypeError` about undefined future
- ✅ Outputs render correctly in cells

**Status**: ✅ ALL ISSUES RESOLVED - Python execution with output display working!

---

## Execution Count Fix

**New Error**: `Cannot read properties of undefined (reading 'execution_count')` at `widget.js:1394`

**Analysis**: The `done` promise resolves with a message that JupyterLab expects to have structure:
```typescript
{
  content: {
    status: "ok",
    execution_count: number
  },
  metadata: {}
}
```

But we were resolving with:
```typescript
{ status: "ok", execution_count: number }  // Wrong - missing 'content' wrapper
```

**Fix Applied**:
```typescript
resolve({
  content: {
    status: "ok",
    execution_count: this._executionCount
  },
  metadata: {}
});
```

**Status**: ✅ Build successful - execution count should now update correctly

---

## Fix 4: Missing metadata.started Timestamp

**Date**: October 2025

**Issue**: `TypeError: Cannot read properties of undefined (reading 'date')` at widget.js:1403

**Root Cause**: JupyterLab's CodeCell.execute() registers a timing hook that accesses `msg.header.date` on ALL iopub messages (status, stream, execute_result, error). ALL iopub messages must have proper header with date field.

**Error**:
```
widget.js:1403 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'date')
    at CodeCell.execute (widget.js:1403:1)
```

**Fix**: ALL kernel messages (iopub and shell) must have complete header structure with date field.

JupyterLab registers timing hooks that access `msg.header.date` on EVERY message:

```typescript
// All iopub messages (status, stream, execute_result, error)
const iopubMsg = {
  header: {
    msg_id: `status_${Date.now()}`,
    msg_type: "status",
    date: new Date().toISOString(),  // CRITICAL: required on ALL messages
    username: this.username,
    session: this.clientId
  },
  parent_header: {},
  metadata: {},
  content: { ... },
  channel: "iopub"
};

// Execute reply message
const finishTime = new Date().toISOString();
resolve({
  header: {
    msg_id: `execute_reply_${msgId}`,
    msg_type: "execute_reply",
    username: this.username,
    session: this.clientId,
    date: finishTime  // CRITICAL: required
  },
  parent_header: {},
  metadata: { started: startTime },
  content: { status: "ok", execution_count: this._executionCount },
  channel: "shell"
});
```

**Status**: ✅ Fixed - all kernel messages include proper header structure

---

## Fix 6: Stdout Streaming and Line Breaks (January 2025)

**Date**: October 2025

**Issues**:
1. Print output had no line breaks - `print(0); print(1)` displayed as `01` instead of two lines
2. No real-time streaming - loops with `time.sleep(1)` showed all output at end instead of incrementally
3. DataCloneError when posting messages from Python to worker

**Root Causes**:
1. Using `pyodide.setStdout({ batched: ... })` which **strips newlines** from print() output
2. Python dictionaries created in Python can't be cloned by postMessage()

**Inspiration from JupyterLite**:
Analyzed the JupyterLite pyodide-kernel implementation at `/Users/goanpeca/Desktop/develop/datalayer/pyodide-kernel`:
- File: `packages/pyodide-kernel/src/worker.ts` (lines 330-344)
- **Key insight**: JupyterLite doesn't use `pyodide.setStdout()` at all!
- Instead, they use Python-side stream capture with IPython's infrastructure
- The `pyodide_kernel` Python package provides proper stream objects that preserve newlines

**Solution - Python-Side Stdout Capture**:
Created a Python class that intercepts `sys.stdout.write()` calls and sends messages directly:

```python
# webview/services/pyodideInlineKernel.ts lines 231-308

import sys
import ast
from js import Object

class StreamCapture:
    def __init__(self, name, message_id):
        self.name = name
        self.message_id = message_id

    def write(self, text):
        if text:
            # Send immediately for streaming (preserves newlines!)
            # Use js.Object.fromEntries to create plain JS object that can be cloned
            import js
            msg = js.Object.fromEntries([
                ['id', self.message_id],
                ['type', 'stream'],
                ['name', self.name],
                ['text', text]  # ✅ Newlines preserved naturally!
            ])
            js.self.postMessage(msg)
        return len(text)

    def flush(self):
        pass

# Replace stdout temporarily during execution
old_stdout = sys.stdout
sys.stdout = StreamCapture('stdout', message_id)

try:
    # Execute user code with IPython-like behavior
    # - Try eval() first for expressions (like "1+4")
    # - Fall back to exec() for statements
    # - Capture last expression result like IPython does
    exec(user_code)
finally:
    sys.stdout = old_stdout
```

**Key Technical Details**:
1. **Python-side capture** - Intercept stdout at the Python level, not JS level
2. **Preserves newlines** - Python's `sys.stdout.write()` receives text with `\n` intact
3. **Real-time streaming** - Each `write()` call sends message immediately
4. **Proper serialization** - Use `js.Object.fromEntries()` to create cloneable JS objects
5. **IPython-like execution** - Parse AST to evaluate expressions and capture results
6. **Safe code passing** - Use `pyodide.globals.set()` instead of string escaping

**Results**:
- ✅ Line breaks work perfectly (each print() on new line)
- ✅ Real-time streaming (numbers appear one by one with sleep delays)
- ✅ Expression results displayed (`1+4` shows `5`)
- ✅ No DataCloneError (proper JS object serialization)
- ✅ Matches JupyterLite behavior exactly

**Test Code**:
```python
import time
for i in range(10):
    print(i)
    time.sleep(1)
```

**Output**: Numbers 0-9 appear one per second, each on separate line ✅

**Status**: ✅ COMPLETE - Output streaming and formatting working perfectly!

---

### Fix 7: IAnyMessageArgs Message Unwrapping (January 2025)

**Date**: October 2025

**Issue**: After implementing TypeScript strict mode compliance with `IAnyMessageArgs` interface, Pyodide kernel execution broke with error "Requesting cell execution without any cell executor defined".

**Root Cause**: Signal listeners in `requestExecute()` were expecting raw message objects but were now receiving wrapped `{msg: IMessage, direction: 'recv'}` format from `createMessageArgs()`. Properties like `msg.parent_header` were actually at `msgArgs.msg.parent_header`.

**Error**:
```
Requesting cell execution without any cell executor defined.
Execution count property access failed - msg.content undefined
Parent header filtering broken - messages not reaching correct cells
```

**Symptoms**:
1. Kernel execution hung after status "busy"
2. No outputs appeared in cells
3. Execution never completed (no "idle" status)
4. Future.onIOPub callbacks never triggered

**Fix Applied**: Updated signal listeners to unwrap messages from IAnyMessageArgs format:

**1. Execution Completion Handler** (lines 863-870):
```typescript
// Create a promise that resolves when execution is complete
const executionPromise = new Promise<any>((resolve) => {
  const handler = (_sender: any, msgArgs: any) => {
    // Unwrap message from IAnyMessageArgs format
    const msg = msgArgs.msg || msgArgs;  // ✅ Handle both formats

    // Execution complete when status goes back to idle
    if (msg.content && msg.content.execution_state === "idle") {
      this._iopubMessage.disconnect(handler);
      resolve({
        header: { date: new Date().toISOString() },
        content: { status: "ok", execution_count: this._executionCount },
        metadata: { started: startTime },
      });
    }
  };
  this._iopubMessage.connect(handler);
});
```

**2. onIOPub Callback Wrapper** (lines 917-931):
```typescript
// Lumino signals emit (sender, args), but JupyterLab expects just (msg)
// Wrap the callback to drop the sender parameter AND filter by parent_header
// NOTE: msg is wrapped as {msg: IMessage, direction: 'recv'} due to IAnyMessageArgs
iopubWrapper = (_sender: any, msgArgs: any) => {
  // Unwrap the message from IAnyMessageArgs format
  const msg = msgArgs.msg || msgArgs; // ✅ Handle both wrapped and unwrapped formats

  // Only emit messages that belong to THIS execution
  if (
    msg.parent_header &&
    msg.parent_header.msg_id === executeRequestHeader.msg_id
  ) {
    cb(msg);  // Call with unwrapped message
  }
};
```

**Why This Pattern Works**:
- `msgArgs.msg || msgArgs` works for both wrapped and unwrapped formats
- Wrapped format: Returns `msgArgs.msg` (the actual IMessage object)
- Unwrapped format: Returns `msgArgs` (already an IMessage object)
- Maintains backward compatibility with direct message passing
- Complies with TypeScript's `IAnyMessageArgs` interface requirements

**Impact on Other Components**:
- `createMessageArgs()` helper continues to wrap messages for Signal emission
- Signal listeners must unwrap before accessing message properties
- Future callbacks receive unwrapped messages (JupyterLab expectation)
- Parent header filtering works correctly with unwrapped messages

**Test Results**:
- ✅ Pyodide kernel execution works perfectly
- ✅ Execution counts display correctly
- ✅ Outputs appear in cells
- ✅ Multi-cell execution without cross-contamination
- ✅ TypeScript compiles with zero errors
- ✅ All signal listeners properly unwrap messages

**Status**: ✅ COMPLETE - TypeScript strict mode compliance achieved without breaking functionality!

---

## Package Preloading System (October 2025)

### Overview

The extension can automatically download common Python packages on startup to improve Pyodide performance. Packages are cached in the browser's IndexedDB for offline use.

### Configuration

**Setting**: `datalayer.pyodide.preloadBehavior`

**Modes**:

1. **ask-once** (default): Prompt once on first use, remember choice
2. **ask-always**: Prompt every time packages aren't cached
3. **auto**: Download automatically without asking
4. **disabled**: Never preload packages

**Setting**: `datalayer.pyodide.preloadPackages`

**Default Packages** (24 packages):
```json
[
  "numpy", "pandas", "matplotlib", "scipy", "scikit-learn",
  "pillow", "requests", "beautifulsoup4", "lxml", "regex",
  "pyyaml", "setuptools", "micropip", "packaging", "pytz",
  "six", "python-dateutil", "kiwisolver", "cycler", "fonttools",
  "contourpy", "pyparsing", "certifi", "charset-normalizer"
]
```

### Cache Management

**Command**: `datalayer.pyodide.clearCache`

**What It Does**:
1. Clears all cached Pyodide packages from IndexedDB
2. Resets extension tracking state (`PRELOADED_PACKAGES_KEY`)
3. Resets prompt flag (`PRELOAD_PROMPTED_KEY`)
4. Reloads webviews to apply changes

**Usage**:
- Command Palette → "Datalayer: Clear Pyodide Package Cache"
- Prompts for confirmation before clearing
- Shows notification with instructions to reload extension window

### Implementation Details

**Files**:
- `src/services/pyodide/pyodidePreloader.ts` - Preloader service with behavior modes
- `src/commands/pyodide.ts` - Cache clearing command
- `package.json` - Configuration schema and command registration

**State Keys** (VS Code globalState):
```typescript
const PRELOAD_PROMPTED_KEY = "datalayer.pyodide.preloadPrompted";    // Boolean
const PRELOADED_PACKAGES_KEY = "datalayer.pyodide.preloadedPackages"; // String hash
```

**Behavior Logic**:

```typescript
// Auto mode: Download without asking if not cached
if (preloadBehavior === "auto") {
  if (!arePackagesPreloaded) {
    await this._startPreload();
  }
}

// Ask-always mode: Prompt every time if packages aren't cached
else if (preloadBehavior === "ask-always") {
  if (!arePackagesPreloaded) {
    await this._promptUserForPreload();
  }
}

// Ask-once mode (default): Prompt only first time
else {
  if (!hasPrompted) {
    // First time - prompt user
    await this._promptUserForPreload();
  } else if (!arePackagesPreloaded) {
    // Package list changed - download silently
    await this._startPreload();
  }
}
```

**Cache Storage**:
- Location: Browser IndexedDB (in webview context)
- Managed by: Pyodide's internal package caching system
- Size: ~50-100MB depending on packages
- Persistence: Survives extension reloads and VS Code restarts

**User Experience**:
1. Extension activates
2. PyodidePreloader checks behavior mode
3. If needed, shows notification: "Pyodide package preloading available. Download 24 packages (~50MB) for offline use?"
4. User chooses "Download" or "Skip"
5. If "Download", shows progress notification
6. Packages cached for future use
7. Subsequent loads use cached packages (instant)

**Status**: ✅ COMPLETE - Package preloading with flexible behavior modes working!

---

## Next Steps to Try (If Further Issues Arise)

### Option 1: Pre-load WASM in Main Thread
Fetch the WASM file in main thread and pass binary data to worker via postMessage, then manually instantiate WebAssembly module.

### Option 2: Custom loadPyodide Configuration
Check if Pyodide has configuration flag to disable asm.js entirely (e.g., `fullStdlib: false` or WASM-only mode).

### Option 3: Provide Custom Fetch Function
Override Pyodide's fetch mechanism to intercept and handle all resource loading:
```javascript
pyodide = await loadPyodide({
  indexURL: baseUrl,
  fetchOptions: { /* custom fetch */ }
});
```

### Option 4: Examine Pyodide Source
Look at Pyodide's loadPyodide() source to understand exact loading mechanism and find proper way to force WASM-only.

### Option 5: Alternative Python WASM Runtimes
Consider alternatives to Pyodide:
- **Pyodide Lite**: Stripped-down version
- **WebAssembly Python**: Direct WASM builds of CPython
- **Brython**: Python interpreter in JavaScript (no WASM needed)

---

## Technical Context

### VS Code Webview CSP
```
Content-Security-Policy:
  default-src 'none';
  script-src 'nonce-abc123' 'unsafe-eval';
  worker-src blob:;
  connect-src https:;
```

**Implications**:
- External scripts require nonce (can't use in workers)
- `importScripts()` blocked for external URLs
- Blob URLs work for workers
- `unsafe-eval` allows `eval()` (used for passing Pyodide script)

### File Locations
- Worker code: [webview/services/pyodideInlineKernel.ts](../../webview/services/pyodideInlineKernel.ts)
- Service manager: [webview/services/pyodideMinimalServiceManager.ts](../../webview/services/pyodideMinimalServiceManager.ts)
- HTML template: [src/ui/templates/notebookTemplate.ts](../../src/ui/templates/notebookTemplate.ts)
- Bundled Pyodide: `dist/pyodide/*.{js,wasm,json,zip}`
- Webpack config: [webpack.config.js](../../webpack.config.js)

---

*Last Updated: October 2025*
