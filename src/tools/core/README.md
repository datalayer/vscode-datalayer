# src/tools/core/ - Tool Registration and Execution

Core infrastructure for registering and executing MCP tools with VS Code's Language Model Tools API (used by GitHub Copilot).

## Files

- **registration.ts** - Tool registration system. Exports `registerVSCodeTools(context)` (main entry), `registerSingleTool()`, `validateToolDefinitions()`, and `getCombinedOperations()`.

  Tool sources are merged from three registries:
  1. **Notebook operations** from `@datalayer/jupyter-react/tools` (lazy-loaded to avoid browser imports): list cells, insert cell, update cell, delete cell, read cell, etc.
  2. **Lexical operations** from `@datalayer/jupyter-lexical/lib/tools` (lazy-loaded): create document, update blocks, read blocks, etc.
  3. **VS Code-specific operations**: getActiveDocument, createNotebook, createLexical, executeCode, listKernels, selectKernel

  Registration flow: load definitions -> load operations -> validate (every definition has a corresponding operation) -> for each definition, create `VSCodeToolAdapter` and register with `vscode.lm.registerTool(name, adapter)`.

  **How tools execute**: VS Code-specific operations run locally in the extension host. Document operations (cell/block manipulation) are bridged to the webview via BridgeExecutor.

- **toolAdapter.ts** - `VSCodeToolAdapter` class bridging VS Code's `LanguageModelTool` interface to core operations. Handles context building (resolving active document, extracting URI), parameter validation (via Zod schemas), and post-execution logic (opening newly created documents in the editor). Each registered tool gets its own adapter instance.

- **runnerSetup.ts** - Creates `Runner` instances with a smart executor that routes based on operation source. VS Code-specific operations execute locally via direct function call. Notebook/lexical operations are sent to the webview via BridgeExecutor which uses postMessage. Returns the Runner to the caller (BaseDocumentProvider).

- **BridgeExecutor.ts** - Sends tool execution requests from the extension host to the webview and waits for responses. Uses `WebviewPanel.webview.postMessage()` for the outbound request and listens for responses matching the `requestId`. Implements timeout handling for unresponsive webviews.
