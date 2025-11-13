# MCP (Model Context Protocol) Tools - Implementation Guide

**Last Updated**: October 2025

## Overview

This document covers the implementation of MCP embedded tools for creating and manipulating Datalayer notebooks in VS Code using GitHub Copilot. MCP tools allow Copilot to programmatically interact with the Datalayer extension.

**As of October 2025**, we have **16 embedded MCP tools** providing complete feature parity with the Python-based `jupyter-mcp-server` plus lexical document creation.

## What are MCP Embedded Tools?

⚠️ **CRITICAL**: All cell manipulation tools (insert, execute, read, delete, etc.) **ONLY** work with **Datalayer custom editor notebooks**. They do **NOT** work with native VS Code notebooks.

**Tool Naming Convention**: All Datalayer-specific tools use the "Datalayer" prefix (e.g., `datalayer_insertDatalayerCell`, `datalayer_createDatalayerLocalNotebook`) to help AI models clearly distinguish them from native VS Code notebook operations. If you have both Datalayer and native notebooks open, the tools will automatically validate and only operate on Datalayer notebooks.

MCP (Model Context Protocol) tools are VS Code's `LanguageModelTool` interface that allows GitHub Copilot to perform actions in the IDE. In our case, they enable Copilot to:

- **Notebook Creation**: Create local and remote Datalayer notebooks
- **Lexical Creation**: Create local and remote Datalayer rich text documents
- **Runtime Management**: Start and connect Datalayer cloud runtimes
- **Cell Manipulation**: Insert, execute, read, modify, and delete cells
- **Notebook Inspection**: Read cell contents, get notebook metadata
- **Full CRUD Operations**: Complete notebook lifecycle management via natural language

## Tool Registration Requirements

⚠️ **CRITICAL**: All MCP tools must be registered in **TWO** locations:

1. **package.json** (`languageModelTools` array): Defines tool metadata (name, description, schema) that VS Code reads to display in Configure Tools dialog
2. **src/extension.ts** (`vscode.lm.registerTool()`): Dynamically registers the tool implementation with VS Code

VS Code reads tool display names and schemas from `package.json`, NOT from code registration alone. Missing either registration will cause tools to not appear or not function properly.

## Tool Categories

### Notebook Creation Tools (2 tools)
1. `datalayer_createDatalayerLocalNotebook` - Create local .ipynb files
2. `datalayer_createDatalayerRemoteNotebook` - Create cloud notebooks

### Lexical Creation Tools (2 tools - Added October 2025)
3. `datalayer_createLocalLexical` - Create local .lexical files
4. `datalayer_createRemoteLexical` - Create cloud lexical documents

### Runtime Management Tools (2 tools)
5. `datalayer_startRuntime` - Start Datalayer runtime
6. `datalayer_connectRuntime` - Connect runtime to notebook

### Cell Manipulation Tools (2 tools)
7. `datalayer_insertDatalayerCell` - Insert code/markdown cells
8. `datalayer_executeDatalayerCell` - Execute cells and get outputs

### Jupyter MCP Server Parity Tools (8 tools - Added October 2025)
9. `datalayer_readAllDatalayerCells` - Read all cells from notebook
10. `datalayer_readDatalayerCell` - Read specific cell
11. `datalayer_getDatalayerNotebookInfo` - Get notebook metadata
12. `datalayer_deleteDatalayerCell` - Delete cell from notebook
13. `datalayer_overwriteDatalayerCell` - Replace cell source
14. `datalayer_appendDatalayerMarkdownCell` - Append markdown cell
15. `datalayer_appendExecuteDatalayerCodeCell` - Append and execute code cell
16. `datalayer_insertDatalayerMarkdownCell` - Insert markdown at index

## Implemented Tools

### 1. Create Datalayer Local Notebook (`datalayer_createDatalayerLocalNotebook`)

**Location**: `src/tools/createDatalayerLocalNotebook.ts`

**Purpose**: Creates a new `.ipynb` file on disk and opens it with the Datalayer custom editor.

**Key Parameters**:
- `filename` (optional): Custom notebook name. If not provided, generates `notebook-{timestamp}.ipynb`
- `content` (optional): Initial notebook content as JSON string

**Returns**:
- Success message with URI of created notebook
- URI format: `file:///path/to/notebook.ipynb`
- Copilot can use this URI for subsequent operations

**Example Copilot Usage**:
```
User: "Create a datalayer notebook called data-analysis"
Copilot: Uses datalayer_createDatalayerLocalNotebook with filename="data-analysis"
```

### 2. Create Datalayer Remote Notebook (`datalayer_createDatalayerRemoteNotebook`)

**Location**: `src/tools/createDatalayerRemoteNotebook.ts`

**Purpose**: Creates a notebook in Datalayer cloud spaces.

**Key Parameters**:
- `space_id`: ID of the space where notebook should be created
- `name`: Notebook name
- `content` (optional): Initial content

**Implementation Details**:
- Uses multipart/form-data for API calls (not JSON)
- Opens created notebook with `datalayer.jupyter-notebook` view type
- Returns cloud document URI

### 3. Create Local Lexical (`datalayer_createLocalLexical`)

**Location**: `src/tools/createLocalLexical.ts`

**Purpose**: Creates a new local Lexical document file in the workspace folder.

**Key Parameters**:
- `filename` (optional): Custom lexical name. If not provided, generates `document-{timestamp}.lexical`

**Returns**:
- Success message with file location and URI
- URI format: `file:///path/to/document.lexical`

**Example Copilot Usage**:
```
User: "Create a local lexical document called meeting-notes"
Copilot: Uses datalayer_createLocalLexical with filename="meeting-notes"
```

**Implementation Details**:
- Creates empty Lexical document structure on disk
- Opens with `datalayer.lexical-editor` view type
- Saves as .lexical file in workspace

### 4. Create Remote Lexical (`datalayer_createRemoteLexical`)

**Location**: `src/tools/createRemoteLexical.ts`

**Purpose**: Creates a Lexical document in Datalayer cloud spaces.

**Key Parameters**:
- `lexical_name`: Name of the lexical document
- `space_name` (optional): Name of the space (defaults to "Personal")
- `description` (optional): Document description

**Returns**:
- Success message with document ID and space name
- URI format: `datalayer:/{spaceUid}/{filename}`

**Example Copilot Usage**:
```
User: "Create a remote lexical doc called team-notes in my Personal space"
Copilot: Uses datalayer_createRemoteLexical with lexical_name="team-notes", space_name="Personal"
```

**Implementation Details**:
- Uses SDK method `sdk.createLexical()`
- Requires authentication
- Opens with `datalayer.lexical-editor` view type

### 5. Start Runtime (`datalayer_startRuntime`)

**Location**: `src/tools/startRuntime.ts`

**Purpose**: Creates a Datalayer cloud runtime for notebook execution.

**Key Parameters**:
- `environment` (optional): Runtime environment name
- `minutes` (optional): Runtime duration

### 6. Connect Runtime (`datalayer_connectRuntime`)

**Location**: `src/tools/connectRuntime.ts`

**Purpose**: Connects a notebook to an existing runtime.

**Key Parameters**:
- `notebook_uri`: URI of notebook to connect
- `runtime_id`: ID of runtime to connect to

### 7. Insert Datalayer Cell (`datalayer_insertDatalayerCell`)

**Location**: `src/tools/insertDatalayerCell.ts`

**Purpose**: Inserts a cell (code or markdown) into an open Datalayer notebook.

**Key Parameters**:
- `notebook_uri` (optional): URI of notebook (if not active)
- `cell_type`: "code" or "markdown"
- `cell_source`: Content of the cell
- `cell_index` (optional): Position to insert (default: append)

**Critical Implementation Details**:
- Uses message-based communication (NOT VS Code native notebook API)
- Message flow: Extension → Webview → Notebook2 component
- Polls for notebook readiness (up to 10 seconds)

### 8. Execute Datalayer Cell (`datalayer_executeDatalayerCell`)

**Location**: `src/tools/executeDatalayerCell.ts`

**Purpose**: Executes a cell and returns its output.

**Key Parameters**:
- `cell_index`: Index of cell to execute
- `notebook_uri` (optional): URI of notebook (if not active)

**Returns**: Cell execution outputs (stdout, stderr, display data)

## Jupyter MCP Server Parity Tools (October 2025)

The following 8 tools provide complete feature parity with the Python-based `jupyter-mcp-server`, enabling full notebook CRUD operations via Copilot.

### 9. Read All Cells (`datalayer_readAllDatalayerCells`)

**Location**: `src/tools/readAllDatalayerCells.ts`

**Purpose**: Reads all cells from a notebook, including source and outputs.

**Key Parameters**:
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Returns**: Array of `{index, type, source, outputs?}`

**Example Copilot Usage**:
```
User: "Show me all cells in the notebook"
Copilot: Uses datalayer_readAllDatalayerCells
```

### 10. Read Cell (`datalayer_readDatalayerCell`)

**Location**: `src/tools/readDatalayerCell.ts`

**Purpose**: Reads a specific cell from a notebook.

**Key Parameters**:
- `cell_index`: Index of cell to read
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Returns**: `{index, type, source, outputs?}`

### 11. Get Notebook Info (`datalayer_getDatalayerNotebookInfo`)

**Location**: `src/tools/getDatalayerNotebookInfo.ts`

**Purpose**: Gets metadata about a notebook (path, cell counts, etc.).

**Key Parameters**:
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Returns**: `{notebook_path, total_cells, cell_types}`

### 12. Delete Cell (`datalayer_deleteDatalayerCell`)

**Location**: `src/tools/deleteDatalayerCell.ts`

**Purpose**: Deletes a cell from a notebook.

**Key Parameters**:
- `cell_index`: Index of cell to delete
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Implementation**: Uses `NotebookActions.deleteCells()` via webview message

### 13. Overwrite Cell Source (`datalayer_overwriteDatalayerCell`)

**Location**: `src/tools/overwriteDatalayerCell.ts`

**Purpose**: Replaces a cell's source content (does NOT execute).

**Key Parameters**:
- `cell_index`: Index of cell to overwrite
- `cell_source`: New cell content
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Note**: To execute after overwriting, use `datalayer_executeDatalayerCell`

### 14. Append Markdown Cell (`datalayer_appendDatalayerMarkdownCell`)

**Location**: `src/tools/appendDatalayerMarkdownCell.ts`

**Purpose**: Appends a markdown cell at the end of notebook.

**Key Parameters**:
- `cell_source`: Markdown content
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Implementation**: Wrapper around `datalayer_insertDatalayerCell` with `cellIndex=undefined`

### 15. Append and Execute Code Cell (`datalayer_appendExecuteDatalayerCodeCell`)

**Location**: `src/tools/appendExecuteDatalayerCodeCell.ts`

**Purpose**: Appends a code cell at the end and executes it, returning outputs.

**Key Parameters**:
- `cell_source`: Code content
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Returns**: Cell execution outputs

**Implementation**:
1. Insert code cell at end using `datalayer_insertDatalayerCell`
2. Execute using VS Code notebook API
3. Wait for execution completion (30s timeout)
4. Extract and return outputs

### 16. Insert Markdown Cell (`datalayer_insertDatalayerMarkdownCell`)

**Location**: `src/tools/insertDatalayerMarkdownCell.ts`

**Purpose**: Inserts a markdown cell at a specific index.

**Key Parameters**:
- `cell_index`: Position to insert
- `cell_source`: Markdown content
- `notebook_uri` (optional): URI of notebook (defaults to active)

**Implementation**: Wrapper around `datalayer_insertDatalayerCell` with `cellType="markdown"`

## Architecture

### Message-Based Cell Insertion Flow

```
┌─────────────────┐
│  MCP Tool       │
│  insertCell.ts  │
└────────┬────────┘
         │ 1. Retry logic to find notebook URI
         │ 2. Wait 500ms for webview readiness
         ▼
┌─────────────────────────────────────────┐
│  Internal Command                       │
│  datalayer.internal.insertCell          │
└────────┬────────────────────────────────┘
         │ 3. Routes to webview message sender
         ▼
┌─────────────────────────────────────────┐
│  Internal Command                       │
│  datalayer.internal.sendToWebview       │
└────────┬────────────────────────────────┘
         │ 4. Posts message to webview
         ▼
┌─────────────────────────────────────────┐
│  Webview Message Handler                │
│  NotebookEditor.tsx (handleMessage)     │
└────────┬────────────────────────────────┘
         │ 5. Receives insert-cell message
         │ 6. Polls notebookStore2 for notebook
         ▼
┌─────────────────────────────────────────┐
│  notebookStore2 (Zustand Map)           │
│  notebooks.get(notebookId)              │
└────────┬────────────────────────────────┘
         │ 7. Waits for notebook.adapter.panel.content
         ▼
┌─────────────────────────────────────────┐
│  NotebookActions (JupyterLab)           │
│  insertBelow() + changeCellType()       │
└─────────────────────────────────────────┘
```

## Critical Lessons Learned

### 1. VS Code Native API Does NOT Work with Custom Editors

**Problem**: Initial implementation tried using `vscode.NotebookEdit` and `vscode.workspace.openNotebookDocument()`.

**Result**: Opened notebooks with VS Code's native notebook editor instead of Datalayer custom editor.

**Solution**: Custom editors require message-based communication:
```typescript
// ❌ WRONG - Opens VS Code native editor
const doc = await vscode.workspace.openNotebookDocument(uri);
const edit = vscode.NotebookEdit.insertCells(0, cells);

// ✅ CORRECT - Message to Datalayer custom editor
await vscode.commands.executeCommand('datalayer.internal.sendToWebview', uri, {
  type: 'insert-cell',
  body: { cellType, cellSource, cellIndex }
});
```

### 2. notebookStore2 Uses Map, Not Object

**Problem**: Trying to access notebook via `notebooks[notebookId]` returned undefined.

**Root Cause**: `notebookStore2.notebooks` is a JavaScript `Map`, not a plain object.

**Solution**: Use `.get()` method:
```typescript
// ❌ WRONG
const notebook = notebookState.notebooks[notebookId];

// ✅ CORRECT
const notebook = notebookState.notebooks.get(notebookId);
```

**How We Found This**: Checked `NotebookToolbar.tsx` which successfully uses:
```typescript
const unsubscribe = notebookStore2.subscribe((state) => {
  const notebook = state.notebooks.get(notebookId); // Line 58
  if (notebook) {
    setNotebook(notebook);
  }
});
```

### 3. Async Message Handlers Must Be Marked Async

**Problem**: Build error "Cannot use keyword 'await' outside an async function"

**Root Cause**: Message handler in `NotebookEditor.tsx` was not marked `async`.

**Solution**:
```typescript
// ❌ WRONG
const handleMessage = (message: ExtensionMessage) => {
  const notebook = await waitForNotebook(); // ERROR!
};

// ✅ CORRECT
const handleMessage = async (message: ExtensionMessage) => {
  const notebook = await waitForNotebook(); // Works!
};
```

### 4. Notebook Widget Takes Time to Initialize

**Problem**: Webview receives message but `notebook.adapter.panel.content` is undefined.

**Root Cause**: Notebook2 component needs time to initialize and register in `notebookStore2`.

**Solution**: Polling with retry logic:
```typescript
const waitForNotebook = async () => {
  const maxAttempts = 20; // 10 seconds max (20 * 500ms)
  for (let i = 0; i < maxAttempts; i++) {
    const notebookState = notebookStore2.getState();
    const notebook = notebookState.notebooks.get(notebookId);

    if (notebook?.adapter?.panel?.content) {
      return notebook;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
};
```

### 5. Tool Naming and Descriptions Are Critical for AI Model Selection

**Problem**: AI models (Copilot, Claude) were choosing wrong tools or confusing Datalayer notebooks with native VS Code notebooks.

**Solution 1 - Explicit Naming Convention (October 2025)**:
All Datalayer-specific tools use "Datalayer" prefix in their names:
```typescript
// ✅ CORRECT - Clear naming
datalayer_createDatalayerLocalNotebook
datalayer_insertDatalayerCell
datalayer_executeDatalayerCell

// ❌ OLD - Ambiguous naming
datalayer_createNotebook
datalayer_insertCell
datalayer_executeCell
```

**Solution 2 - Explicit Descriptions**:
Make descriptions explicit with keywords:
```typescript
// ❌ VAGUE
description: "Creates a notebook in Datalayer"

// ✅ EXPLICIT
description: "Creates a LOCAL notebook file on disk. Use this for LOCAL file creation..."
```

**Solution 3 - Runtime Validation**:
All cell manipulation tools validate notebook type and throw descriptive errors:
```typescript
import { validateDatalayerNotebook } from "../utils/notebookValidation";

validateDatalayerNotebook(targetUri); // Throws if not Datalayer notebook
```

### 6. Package.json Registration Is Required

**Problem**: Tools were registered in code with `vscode.lm.registerTool()` but didn't appear in VS Code's Configure Tools dialog.

**Root Cause**: VS Code reads tool metadata (names, descriptions, schemas) from `package.json` `languageModelTools` array, NOT from code registration alone.

**Solution**: All tools must be defined in BOTH locations:

```json
// package.json
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "datalayer_insertDatalayerCell",
        "displayName": "Insert Datalayer Cell",
        "toolReferenceName": "insertDatalayerCell",
        "modelDescription": "Inserts a code or markdown cell into a Datalayer notebook",
        "canBeReferencedInPrompt": true,
        "inputSchema": { /* JSON schema */ }
      }
    ]
  }
}
```

```typescript
// src/extension.ts
vscode.lm.registerTool("datalayer_insertDatalayerCell", new InsertDatalayerCellTool());
```

**Critical Fields**:
- `name`: Must match the ID used in `vscode.lm.registerTool()`
- `toolReferenceName`: Maps to the tool class name
- `inputSchema`: JSON schema for tool parameters

### 7. Return URIs for Sequential Tool Calls

**Problem**: CreateNotebook tool didn't return URI, so InsertCell couldn't find it.

**Solution**: Return structured data with URI:
```typescript
return new vscode.LanguageModelToolResult([
  new vscode.LanguageModelTextPart(
    `Local notebook created successfully!\n\n` +
    `File: ${filename}\n` +
    `Location: ${workspaceFolders[0].name}\n` +
    `URI: ${notebookUri.toString()}\n` +
    `Use notebook_uri: "${notebookUri.toString()}" for subsequent operations.`
  )
]);
```

## File Structure

```
src/
├── tools/
│   ├── createDatalayerLocalNotebook.ts       # LOCAL notebook creation (disk)
│   ├── createDatalayerRemoteNotebook.ts      # REMOTE notebook creation (cloud)
│   ├── createLocalLexical.ts                 # LOCAL lexical creation (disk)
│   ├── createRemoteLexical.ts                # REMOTE lexical creation (cloud)
│   ├── startRuntime.ts                       # Start Datalayer runtime
│   ├── connectRuntime.ts                     # Connect runtime to notebook
│   ├── insertDatalayerCell.ts                # Cell insertion with retry logic
│   ├── executeDatalayerCell.ts               # Execute cell and return outputs
│   ├── readAllDatalayerCells.ts              # Read all cells from notebook
│   ├── readDatalayerCell.ts                  # Read specific cell
│   ├── getDatalayerNotebookInfo.ts           # Get notebook metadata
│   ├── deleteDatalayerCell.ts                # Delete cell from notebook
│   ├── overwriteDatalayerCell.ts             # Replace cell source
│   ├── appendDatalayerMarkdownCell.ts        # Append markdown cell
│   ├── appendExecuteDatalayerCodeCell.ts     # Append and execute code cell
│   ├── insertDatalayerMarkdownCell.ts        # Insert markdown at index
│   └── index.ts                              # Tool registration (16 tools)
├── utils/
│   └── notebookValidation.ts                 # Notebook type validation utilities
├── commands/
│   └── internal.ts                           # Internal commands for routing
│       ├── datalayer.internal.insertCell
│       └── datalayer.internal.sendToWebview
└── providers/
    └── notebookProvider.ts                   # Registers sendToWebview command

webview/notebook/
└── NotebookEditor.tsx                        # Message handler with polling logic
```

## Key Code Sections

### Tool Registration (src/tools/index.ts)

```typescript
export function registerTools(context: vscode.ExtensionContext) {
  const tools: vscode.LanguageModelTool<any>[] = [
    createLocalNotebookTool,
    createRemoteNotebookTool,
    insertCellTool,
    // ... other tools
  ];

  for (const tool of tools) {
    const registration = vscode.lm.registerTool(tool.name, tool);
    context.subscriptions.push(registration);
  }
}
```

### Internal Command Setup (src/commands/internal.ts)

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand(
    "datalayer.internal.insertCell",
    async (params: {
      uri: string;
      cellType: 'code' | 'markdown';
      cellSource: string;
      cellIndex?: number;
    }) => {
      const { uri, cellType, cellSource, cellIndex } = params;
      await vscode.commands.executeCommand(
        "datalayer.internal.sendToWebview",
        uri,
        { type: "insert-cell", body: { cellType, cellSource, cellIndex } }
      );
    }
  )
);
```

### Webview Message Handling (webview/notebook/NotebookEditor.tsx)

```typescript
const handleMessage = async (message: ExtensionMessage) => {
  switch (message.type) {
    case "insert-cell": {
      const { body } = message;
      const { cellType, cellSource, cellIndex } = body;

      // Poll for notebook readiness
      const waitForNotebook = async () => {
        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
          const notebookState = notebookStore2.getState();
          const notebook = notebookState.notebooks.get(notebookId);

          if (notebook?.adapter?.panel?.content) {
            return notebook;
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        }
        return null;
      };

      const notebook = await waitForNotebook();

      if (notebook?.adapter?.panel?.content) {
        const notebookWidget = notebook.adapter.panel.content;

        // Set active cell index
        if (cellIndex !== undefined && cellIndex >= 0) {
          notebookWidget.activeCellIndex = Math.min(
            cellIndex,
            notebookWidget.model!.cells.length
          );
        } else {
          notebookWidget.activeCellIndex = notebookWidget.model!.cells.length - 1;
        }

        // Insert and configure cell
        NotebookActions.insertBelow(notebookWidget);
        NotebookActions.changeCellType(notebookWidget, cellType);

        // Set content
        const activeCell = notebookWidget.activeCell;
        if (activeCell && activeCell.model.sharedModel) {
          activeCell.model.sharedModel.source = cellSource;
        }
      }
      break;
    }
  }
};
```

## Testing

### Testing with Copilot

**Example prompts**:
- "Create a local datalayer notebook called data-analysis"
- "Insert a markdown cell with a title"
- "Add a code cell with a simple plot"

**Full workflow test**:
```
User: "Create a local datalayer notebook called test-analysis and insert a simple plot"

Expected flow:
1. Copilot calls datalayer_createDatalayerLocalNotebook(filename="test-analysis")
2. Tool creates notebook and returns URI
3. Copilot calls datalayer_insertDatalayerCell(notebook_uri="...", cell_type="markdown", cell_source="# Test Analysis")
4. Copilot calls datalayer_insertDatalayerCell(notebook_uri="...", cell_type="code", cell_source="import matplotlib...")
```

## Common Pitfalls

1. **Don't use VS Code native notebook API** - Custom editors need message-based communication
2. **notebookStore2.notebooks is a Map** - Use `.get()` not bracket notation
3. **Mark async handlers as async** - Required for await keyword
4. **Add retry logic** - Notebook widget takes time to initialize
5. **Return URIs from creation tools** - Enables sequential operations
6. **Make tool descriptions explicit** - Helps Copilot choose correct tool
7. **Wait for webview readiness** - Add delays after opening documents
8. **Register tools in package.json** - VS Code reads metadata from `languageModelTools` array
9. **Use "Datalayer" prefix in tool names** - Helps AI models distinguish from native notebooks
10. **Add runtime validation** - Use `notebookValidation.ts` utilities to validate notebook type

## Future Improvements

1. **Better error handling** - More specific error messages for debugging
2. **Retry strategies** - Exponential backoff instead of fixed delays
3. **Notebook state events** - Subscribe to store changes instead of polling
4. **Additional tools**:
   - Move cells up/down
   - Save notebook
   - Export notebook to different formats
   - Search and replace in cells
   - Merge/split cells

## Related Documentation

- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [JupyterLab NotebookActions](https://jupyterlab.readthedocs.io/en/stable/api/classes/notebook.NotebookActions.html)
- [Zustand State Management](https://github.com/pmndrs/zustand)

## Known Issues

1. **Timing sensitivity** - Current polling approach works but could be more robust
2. **Error recovery** - Limited feedback when operations fail
3. **Concurrent operations** - Multiple rapid insertions may have race conditions

---

**Summary**: MCP tools enable powerful programmatic control of Datalayer notebooks through AI assistants (Copilot, Claude). The key insights are:

1. **Custom editors require message-based communication**, not VS Code's native APIs
2. **Tools must be registered in BOTH package.json and code** for proper VS Code integration
3. **Explicit naming with "Datalayer" prefix** helps AI models distinguish from native notebooks
4. **Runtime validation** prevents incorrect usage on native VS Code notebooks
5. **Proper async handling** and correct data structures (Map vs Object) are critical for success
