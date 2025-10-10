# Datalayer Tools Architecture

**Status**: ✅ Refactored and Production Ready

This directory implements a unified tool architecture that enables notebook and lexical document manipulation across the Datalayer platform.

## Architecture Overview

The tool system is organized into three main layers:

1. **Core Operations** - Platform-agnostic business logic (in `datalayer-react` and `datalayer-lexical` packages)
2. **Tool Definitions** - JSON Schema-based metadata that describes tools
3. **Platform Adapters** - VS Code-specific implementations that bridge definitions to operations

```
┌─────────────────────────────────────────────────────────────────┐
│                       Tool Definitions                          │
│            (JSON Schema metadata + operation name)              │
│  - VS Code-specific: src/tools/definitions/                    │
│  - Notebook tools: src/datalayer-react/tools/definitions/      │
│  - Lexical tools: src/datalayer-lexical/tools/definitions/     │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Maps to operation by name
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Core Operations                             │
│            (Platform-agnostic business logic)                   │
│  - Notebook operations: src/datalayer-react/tools/operations/  │
│  - Lexical operations: src/datalayer-lexical/tools/operations/ │
│  - VS Code operations: src/tools/operations/                   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Uses
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Platform Implementations                       │
│  - VS Code adapter: src/tools/toolAdapter.ts                   │
│  - Registration: src/tools/registration.ts                     │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── tools/                           # VS Code-specific tools
│   ├── definitions/                 # VS Code tool definitions (3 tools)
│   │   ├── createNotebook.ts        # Create notebook tool
│   │   ├── createLexical.ts         # Create lexical document tool
│   │   ├── getActiveDocument.ts     # Get active document tool
│   │   └── index.ts                 # Export all definitions
│   │
│   ├── operations/                  # VS Code-specific operations
│   │   ├── createNotebook.ts        # Create notebook operation
│   │   ├── createLexical.ts         # Create lexical operation
│   │   ├── createDocument.ts        # Shared document creation logic
│   │   ├── getActiveDocument.ts     # Get active document operation
│   │   └── manageRuntime.ts         # Runtime management operations
│   │
│   ├── utils/                       # Utility modules
│   │   ├── registry.ts              # Tool definition registry
│   │   ├── notebookHelpers.ts       # Notebook utilities
│   │   └── generators/
│   │       └── packageJsonGenerator.ts  # Auto-generate package.json
│   │
│   ├── toolAdapter.ts               # VS Code tool adapter implementation
│   ├── registration.ts              # Tool registration with VS Code
│   ├── index.ts                     # Main export
│   └── README.md                    # This file
│
├── datalayer-react/                 # Notebook tools package
│   ├── tools/
│   │   ├── definitions/             # 5 notebook tool definitions
│   │   │   ├── insertCell.ts
│   │   │   ├── deleteCell.ts
│   │   │   ├── updateCell.ts
│   │   │   ├── readCell.ts
│   │   │   └── executeCell.ts
│   │   │
│   │   ├── operations/              # 7 notebook operations
│   │   │   ├── insertCell.ts
│   │   │   ├── deleteCell.ts
│   │   │   ├── updateCell.ts
│   │   │   ├── readCell.ts
│   │   │   ├── readAllCells.ts
│   │   │   ├── executeCell.ts
│   │   │   └── getNotebookInfo.ts
│   │   │
│   │   └── core/                    # Shared interfaces & types
│   │       ├── interfaces.ts        # ToolOperation, ExecutionContext
│   │       ├── types.ts             # CellData, NotebookData, etc.
│   │       └── formatter.ts         # Response formatting
│   │
│   └── index.ts                     # Main export (notebookTools bundle)
│
├── datalayer-lexical/               # Lexical document tools package
│   ├── tools/
│   │   ├── definitions/             # 5 lexical tool definitions
│   │   │   ├── insertBlock.ts
│   │   │   ├── insertBlocks.ts
│   │   │   ├── deleteBlock.ts
│   │   │   ├── readBlocks.ts
│   │   │   └── listAvailableBlocks.ts
│   │   │
│   │   ├── operations/              # 5 lexical operations
│   │   │   ├── insertBlock.ts
│   │   │   ├── insertBlocks.ts
│   │   │   ├── deleteBlock.ts
│   │   │   ├── readBlocks.ts
│   │   │   └── listAvailableBlocks.ts
│   │   │
│   │   └── core/                    # Shared interfaces & types
│   │       ├── interfaces.ts
│   │       ├── types.ts
│   │       └── formatter.ts
│   │
│   └── index.ts                     # Main export (lexicalTools bundle)
│
└── datalayer-core/                  # Shared definitions
    └── tools/definitions/
        └── schema.ts                # ToolDefinition interface (shared)
```

## Key Components

### 1. Tool Definitions

Tool definitions provide JSON Schema-based metadata that describes each tool:

```typescript
export const insertCellTool: ToolDefinition = {
  name: "datalayer_insertCell",
  displayName: "Insert Cell",
  toolReferenceName: "insertCell",
  description: "Inserts a code or markdown cell into a notebook",

  parameters: {
    type: "object",
    properties: {
      cellType: { type: "string", enum: ["code", "markdown"] },
      cellSource: { type: "string" },
      cellIndex: { type: "number" },
    },
    required: ["cellType", "cellSource"],
  },

  operation: "insertCell", // Maps to operation by name

  platformConfig: {
    vscode: {
      confirmationMessage: "Insert {{cellType}} cell?",
    },
  },
};
```

### 2. Core Operations

Operations implement the actual business logic:

```typescript
export const insertCellOperation: ToolOperation<
  InsertCellParams,
  InsertCellResult
> = {
  name: "insertCell",
  description: "Inserts a code or markdown cell",

  async execute(params, context) {
    const { cellType, cellSource, cellIndex } = params;
    const { document } = context;

    // Platform-agnostic logic
    const targetIndex = cellIndex ?? (await document.getCellCount());
    await document.insertCell(targetIndex, {
      type: cellType,
      source: cellSource,
    });

    return { success: true, index: targetIndex };
  },
};
```

### 3. Tool Registration

The registration module automatically registers all tools with VS Code:

```typescript
// In extension.ts
import { registerVSCodeTools } from "./tools/registration";

export function activate(context: vscode.ExtensionContext) {
  // Automatically registers all tools (notebook + lexical + VS Code)
  registerVSCodeTools(context);
}
```

## Package Structure

### Centralized Tool Bundles

Each package exports a complete bundle of tools:

**datalayer-react/index.ts:**

```typescript
export const notebookTools = {
  definitions: notebookToolDefinitions, // Array of 5 definitions
  operations: notebookToolOperations, // Object with 7 operations
};
```

**datalayer-lexical/index.ts:**

```typescript
export const lexicalTools = {
  definitions: lexicalToolDefinitions, // Array of 5 definitions
  operations: lexicalToolOperations, // Object with 5 operations
};
```

**Benefits:**

- ✅ Import once instead of 12+ individual imports
- ✅ Easy to iterate over all tools for registration
- ✅ Encapsulation - each package owns its tools
- ✅ Ready for extraction to separate npm packages

## Tool Categories

### VS Code Tools (3 tools)

- **createNotebook** - Create new notebook documents (remote/local)
- **createLexical** - Create new lexical documents (remote/local)
- **getActiveDocument** - Get content of active document

### Notebook Tools (5 definitions, 7 operations)

- **insertCell** - Insert code/markdown cells
- **deleteCell** - Delete cells by index
- **updateCell** - Update cell source
- **readCell** - Read single cell
- **executeCell** - Execute cells
- Plus: readAllCells, getNotebookInfo operations

### Lexical Tools (5 tools)

- **insertBlock** - Insert single block
- **insertBlocks** - Insert multiple blocks
- **deleteBlock** - Delete block by ID
- **readBlocks** - Read all blocks
- **listAvailableBlocks** - List available block types

## Usage

### Adding a New Tool

1. **Create the operation** (in appropriate package):

```typescript
// src/datalayer-react/tools/operations/myOperation.ts
export const myOperation: ToolOperation<MyParams, MyResult> = {
  name: "myOperation",
  description: "Does something useful",
  async execute(params, context) {
    // Implementation
  },
};
```

2. **Create the definition**:

```typescript
// src/datalayer-react/tools/definitions/myTool.ts
export const myTool: ToolDefinition = {
  name: "datalayer_myTool",
  displayName: "My Tool",
  toolReferenceName: "myTool",
  description: "Does something useful",
  parameters: {
    /* JSON Schema */
  },
  operation: "myOperation",
};
```

3. **Export from package index**:

```typescript
// src/datalayer-react/index.ts
import { myOperation } from "./tools/operations/myOperation";
import { myTool } from "./tools/definitions/myTool";

export const notebookToolDefinitions = [
  // ... existing tools
  myTool,
];

export const notebookToolOperations = {
  // ... existing operations
  myOperation,
};
```

4. **Registration happens automatically** - No changes needed to registration.ts!

### Testing

```bash
# Compile all code
npm run compile

# Run type checking
npx tsc --noEmit

# Test in Extension Development Host
Press F5 in VS Code
```

## Benefits

### For Developers

- ✅ **Clean imports** - 2 imports instead of 12+
- ✅ **Automatic registration** - Add tool to package, automatically registered
- ✅ **Type safety** - End-to-end type checking
- ✅ **Easy testing** - Mock DocumentHandle for unit tests

### For Architecture

- ✅ **Separation of concerns** - Definitions separate from operations
- ✅ **Platform agnostic** - Operations work across VS Code, SaaS, ag-ui
- ✅ **Future-proof** - Ready to extract to separate npm packages
- ✅ **Maintainable** - Single source of truth per tool

## Migration Status

✅ **Complete** - All tools migrated to new architecture

- Moved operations from `core/` to `operations/`
- Created centralized package exports
- Simplified registration with spread operators
- Flattened adapter directory structure

## Next Steps

1. **Package Extraction** - Extract datalayer-react and datalayer-lexical to separate npm packages
2. **SaaS Integration** - Add SaaS platform adapter
3. **ag-ui Integration** - Add CopilotKit-compatible adapter
4. **Documentation** - Add usage examples and API reference

---

**Last Updated**: November 2025
