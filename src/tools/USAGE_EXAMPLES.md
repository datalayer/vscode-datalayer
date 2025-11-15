# Unified Tool Architecture - Usage Examples

This document provides comprehensive examples demonstrating how to use the unified tool architecture across all three supported platforms: VS Code, SaaS (browser), and ag-ui/CopilotKit.

## Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [VS Code Extension Integration](#vs-code-extension-integration)
3. [SaaS Web Application Integration](#saas-web-application-integration)
4. [ag-ui/CopilotKit Integration](#ag-uicopilotkit-integration)
5. [Creating Custom Tools](#creating-custom-tools)
6. [Testing Tools](#testing-tools)
7. [Advanced Patterns](#advanced-patterns)

---

## Quick Start Guide

The unified architecture consists of three layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Platform Adapters                         │
│  (VS Code | SaaS | ag-ui) - Platform-specific wrappers      │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Definitions                          │
│  (JSON Schema + Metadata) - Single source of truth          │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Operations                           │
│  (Business Logic) - Platform-agnostic implementation        │
└─────────────────────────────────────────────────────────────┘
```

**Key benefits:**

- 90%+ code reuse across platforms
- Single source of truth for tool definitions
- Platform-agnostic testing
- ag-ui/CopilotKit compatible by design

---

## VS Code Extension Integration

### 1. Basic Setup in extension.ts

Replace manual tool registration with factory registration:

```typescript
// src/extension.ts
import * as vscode from "vscode";
import { registerVSCodeTools } from "./tools/adapters/vscode/registration";

export function activate(context: vscode.ExtensionContext) {
  // Register all tools automatically
  registerVSCodeTools(context);

  // ... rest of your activation code
}
```

### 2. Selective Tool Registration

Register only specific tools:

```typescript
import { registerVSCodeTools } from "./tools/adapters/vscode/registration";
import { insertCellTool, deleteCellTool } from "./tools/definitions/tools";
import {
  insertCellOperation,
  deleteCellOperation,
} from "./tools/core/operations";

// Register only cell manipulation tools
registerVSCodeTools(
  context,
  [insertCellTool, deleteCellTool], // Only these tools
  {
    insertCell: insertCellOperation,
    deleteCell: deleteCellOperation,
  },
);
```

### 3. Custom Tool Registration

Register a single tool with custom configuration:

```typescript
import { registerSingleTool } from "./tools/adapters/vscode/registration";
import { myCustomTool } from "./tools/definitions/tools/myCustomTool";
import { myCustomOperation } from "./tools/core/operations/myCustomOperation";

const disposable = registerSingleTool(context, myCustomTool, myCustomOperation);

// Unregister later if needed
disposable.dispose();
```

### 4. Implementing Internal Commands

The VS Code adapter uses message passing to communicate with webviews. You need to implement internal commands:

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Register internal command handlers for webview communication
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.insertCell",
      async (args: {
        uri: string;
        cellType: string;
        cellSource: string;
        cellIndex: number;
      }) => {
        const panel = findWebviewPanel(args.uri);
        if (!panel) {
          throw new Error(`No webview found for URI: ${args.uri}`);
        }

        // Send message to webview
        await panel.webview.postMessage({
          type: "insertCell",
          cellType: args.cellType,
          cellSource: args.cellSource,
          cellIndex: args.cellIndex,
        });

        // Wait for response
        return await waitForWebviewResponse(panel, "insertCellResponse");
      },
    ),
  );

  // Register other internal commands: readCell, deleteCell, updateCell, etc.
  // See /src/tools/adapters/vscode/INTEGRATION_GUIDE.md for complete list
}
```

### 5. Testing in Extension Development Host

```bash
# Press F5 in VS Code to launch Extension Development Host
# Then test with GitHub Copilot:

# In chat:
@workspace /insertCell Insert a markdown cell with "# Hello World"

# Or use tool directly:
#insertCell cell_type="markdown" cell_source="# Hello World" cell_index=0
```

---

## SaaS Web Application Integration

### 1. Basic Setup with JupyterLab

```typescript
// In your JupyterLab extension plugin
import { JupyterFrontEnd } from "@jupyterlab/application";
import { SaaSToolContext } from "./tools/adapters/saas/SaaSToolContext";
import { SaaSToolAdapter } from "./tools/adapters/saas/SaaSToolAdapter";
import { insertCellTool } from "./tools/definitions/tools";
import { insertCellOperation } from "./tools/core/operations";

const plugin: JupyterFrontEndPlugin<void> = {
  id: "datalayer-tools",
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    // Create context
    const context = new SaaSToolContext(app, yourSDKClient, yourAuthProvider);

    // Create adapter for a specific tool
    const insertCellAdapter = new SaaSToolAdapter(
      insertCellTool,
      insertCellOperation,
      context,
    );

    // Execute tool
    async function insertCell() {
      try {
        const result = await insertCellAdapter.execute({
          cellType: "code",
          cellSource: 'print("Hello from SaaS")',
          cellIndex: 0,
        });

        console.log("✅ Cell inserted:", result);
      } catch (error) {
        console.error("❌ Failed to insert cell:", error);
      }
    }

    // Expose to UI
    app.commands.addCommand("datalayer:insert-cell", {
      label: "Insert Cell",
      execute: insertCell,
    });
  },
};
```

### 2. Using Direct Document Access

```typescript
import { SaaSToolContext } from "./tools/adapters/saas/SaaSToolContext";
import { SaaSDocumentHandle } from "./tools/adapters/saas/SaaSDocumentHandle";

// Get active notebook
const context = new SaaSToolContext(app, sdk, auth);
const notebookPanel = context.getActiveDocument();

if (!notebookPanel) {
  console.error("No active notebook");
  return;
}

// Create document handle
const documentHandle = context.createDocumentHandle(notebookPanel);

// Use handle directly (bypasses tool layer)
await documentHandle.insertCell(0, {
  type: "code",
  source: "x = 42\nprint(x)",
  outputs: [],
  metadata: {},
});

// Read cells
const cellCount = await documentHandle.getCellCount();
console.log(`Notebook has ${cellCount} cells`);

// Execute cell
const result = await documentHandle.executeCell(0);
console.log("Execution result:", result);
```

### 3. Batch Operations

```typescript
import { SaaSToolAdapter } from "./tools/adapters/saas/SaaSToolAdapter";
import { allToolDefinitions } from "./tools/definitions/tools";
import { allOperations } from "./tools/core/operations";

// Create adapters for all tools
const adapters = allToolDefinitions.map(
  (definition) =>
    new SaaSToolAdapter(
      definition,
      allOperations[definition.operation],
      context,
    ),
);

// Execute multiple operations
async function setupNotebook() {
  const insertCell = adapters.find(
    (a) => a.definition.operation === "insertCell",
  );

  // Insert header
  await insertCell!.execute({
    cellType: "markdown",
    cellSource: "# Data Analysis",
    cellIndex: 0,
  });

  // Insert imports
  await insertCell!.execute({
    cellType: "code",
    cellSource: "import pandas as pd\nimport numpy as np",
    cellIndex: 1,
  });

  // Insert analysis code
  await insertCell!.execute({
    cellType: "code",
    cellSource: 'df = pd.read_csv("data.csv")\ndf.head()',
    cellIndex: 2,
  });
}
```

### 4. Document Management

```typescript
// Get all open notebooks
const allNotebooks = context.getAllDocuments();
console.log(`${allNotebooks.length} notebooks open`);

// Get notebook by ID
const notebook = context.getDocumentById("my-notebook-id");

// Clear cached handles
context.clearHandles();
```

---

## ag-ui/CopilotKit Integration

### 1. Basic Setup with React

```tsx
// In your React component
import { useCopilotAction } from "@copilotkit/react-core";
import { useNotebookTools } from "./tools/adapters/agui/hooks";
import { SaaSToolContext } from "./tools/adapters/saas/SaaSToolContext";

function NotebookEditor({ app, sdk, auth }: Props) {
  // Create context (same as SaaS)
  const context = useMemo(
    () => new SaaSToolContext(app, sdk, auth),
    [app, sdk, auth],
  );

  // Auto-register all notebook tools with CopilotKit
  useNotebookTools(context, useCopilotAction);

  return (
    <div>
      <CopilotKitUI />
      {/* Your notebook editor UI */}
    </div>
  );
}
```

### 2. Selective Tool Registration

```tsx
import { useNotebookTools } from "./tools/adapters/agui/hooks";
import { insertCellTool, deleteCellTool } from "./tools/definitions/tools";
import {
  insertCellOperation,
  deleteCellOperation,
} from "./tools/core/operations";

function NotebookEditor({ app, sdk, auth }: Props) {
  const context = useMemo(
    () => new SaaSToolContext(app, sdk, auth),
    [app, sdk, auth],
  );

  // Only register cell manipulation tools
  useNotebookTools(
    context,
    useCopilotAction,
    [insertCellTool, deleteCellTool], // Only these tools
    {
      insertCell: insertCellOperation,
      deleteCell: deleteCellOperation,
    },
  );

  return <YourUI />;
}
```

### 3. Single Tool Registration

```tsx
import { useSingleTool } from "./tools/adapters/agui/hooks";
import { insertCellTool } from "./tools/definitions/tools";
import { insertCellOperation } from "./tools/core/operations";

function InsertCellButton({ context }: Props) {
  // Register only the insert cell tool
  useSingleTool(insertCellTool, insertCellOperation, context, useCopilotAction);

  return (
    <button
      onClick={() => {
        // Tool is now available to CopilotKit
        console.log("Insert cell tool registered");
      }}
    >
      Enable Insert Cell Tool
    </button>
  );
}
```

### 4. Manual Tool Actions

```tsx
import { useToolActions } from "./tools/adapters/agui/hooks";
import { allToolDefinitions } from "./tools/definitions/tools";
import { allOperations } from "./tools/core/operations";

function NotebookToolbar({ context }: Props) {
  // Get all tool actions without auto-registration
  const actions = useToolActions(allToolDefinitions, allOperations, context);

  return (
    <div>
      {actions.map((action) => (
        <button
          key={action.name}
          onClick={async () => {
            // Execute tool manually
            const result = await action.handler({
              cellType: "code",
              cellSource: 'print("Manual execution")',
              cellIndex: 0,
            });
            console.log("Tool result:", result);
          }}
        >
          {action.name}
        </button>
      ))}
    </div>
  );
}
```

### 5. Custom Rendering

```tsx
// In your tool definition
import { ToolDefinition } from "./tools/definitions/schema";

export const insertCellTool: ToolDefinition = {
  // ... other properties
  platformConfig: {
    agui: {
      renderingHints: {
        customRender: ({ status, args, result }) => {
          if (status === "executing") {
            return <Spinner>Inserting {args.cellType} cell...</Spinner>;
          }

          if (status === "complete") {
            return (
              <div>
                ✅ Inserted {args.cellType} cell at index {result.index}
                <pre>{args.cellSource}</pre>
              </div>
            );
          }

          return null;
        },
      },
    },
  },
};
```

---

## Creating Custom Tools

### Step 1: Define the Operation

```typescript
// src/tools/core/operations/myCustomOperation.ts
import type { ToolOperation, ToolExecutionContext } from "../interfaces";

export interface MyCustomParams {
  input: string;
  options?: {
    flag?: boolean;
  };
}

export interface MyCustomResult {
  success: boolean;
  output: string;
}

export const myCustomOperation: ToolOperation<MyCustomParams, MyCustomResult> =
  {
    name: "myCustom",
    description: "Performs a custom operation",

    async execute(params, context): Promise<MyCustomResult> {
      const { input, options } = params;
      const { document, sdk, auth } = context;

      // Your business logic here (platform-agnostic!)
      const output = input.toUpperCase();

      return {
        success: true,
        output: options?.flag ? `${output}!` : output,
      };
    },
  };
```

### Step 2: Create Tool Definition

```typescript
// src/tools/definitions/tools/myCustomTool.ts
import type { ToolDefinition } from "../schema";

export const myCustomTool: ToolDefinition = {
  name: "datalayer_myCustom",
  displayName: "My Custom Tool",
  toolReferenceName: "myCustom",
  description: "A custom tool that transforms input text",

  parameters: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Text to transform",
      },
      options: {
        type: "object",
        properties: {
          flag: {
            type: "boolean",
            description: "Add exclamation mark",
          },
        },
      },
    },
    required: ["input"],
  },

  operation: "myCustom",

  platformConfig: {
    vscode: {
      confirmationMessage: "Transform **{{input}}**?",
      invocationMessage: "Transforming text...",
    },
    saas: {
      enablePreview: true,
    },
    agui: {
      requiresConfirmation: false,
    },
  },

  tags: ["custom", "text"],
};
```

### Step 3: Register Tool

```typescript
// Add to src/tools/core/operations/index.ts
export { myCustomOperation } from "./myCustomOperation";

// Add to src/tools/definitions/tools/index.ts
export { myCustomTool } from "./myCustomTool";

// Update registry
export const allOperations = {
  // ... existing operations
  myCustom: myCustomOperation,
};

export const allToolDefinitions = [
  // ... existing tools
  myCustomTool,
] as const;
```

### Step 4: Use Across Platforms

The tool now works automatically on all platforms:

```typescript
// VS Code: Auto-registered via factory
registerVSCodeTools(context);

// SaaS: Create adapter
const adapter = new SaaSToolAdapter(myCustomTool, myCustomOperation, context);
await adapter.execute({ input: "hello", options: { flag: true } });

// ag-ui: Auto-registered via hook
useNotebookTools(context, useCopilotAction);
```

---

## Testing Tools

### 1. Unit Testing Core Operations

```typescript
// src/tools/core/__tests__/myCustomOperation.test.ts
import { describe, it, expect } from "vitest";
import { MockDocumentHandle } from "./mockDocumentHandle";
import { myCustomOperation } from "../operations/myCustomOperation";

describe("myCustomOperation", () => {
  it("should transform input text", async () => {
    const result = await myCustomOperation.execute(
      { input: "hello" },
      {}, // No context needed
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("HELLO");
  });

  it("should add exclamation mark when flag is true", async () => {
    const result = await myCustomOperation.execute(
      { input: "hello", options: { flag: true } },
      {},
    );

    expect(result.output).toBe("HELLO!");
  });
});
```

### 2. Integration Testing with Mock Document

```typescript
import { MockDocumentHandle } from "./mockDocumentHandle";
import { insertCellOperation } from "../operations/insertCell";

describe("insertCell integration", () => {
  it("should insert cell at correct position", async () => {
    const doc = new MockDocumentHandle([
      { type: "code", source: "x = 1", outputs: [] },
    ]);

    await insertCellOperation.execute(
      {
        cellType: "markdown",
        cellSource: "# Header",
        cellIndex: 0,
      },
      { document: doc },
    );

    expect(await doc.getCellCount()).toBe(2);

    const cell = await doc.getCell(0);
    expect(cell.type).toBe("markdown");
    expect(cell.source).toBe("# Header");
  });
});
```

### 3. Testing Tool Definitions

```typescript
import { myCustomTool } from "../definitions/tools/myCustomTool";

describe("myCustomTool definition", () => {
  it("should have correct schema", () => {
    expect(myCustomTool.name).toBe("datalayer_myCustom");
    expect(myCustomTool.operation).toBe("myCustom");
    expect(myCustomTool.parameters.required).toContain("input");
  });

  it("should be ag-ui compatible", () => {
    expect(myCustomTool.parameters.type).toBe("object");
    expect(myCustomTool.parameters.properties).toBeDefined();
  });
});
```

### 4. Testing VS Code Adapter

```typescript
import * as vscode from "vscode";
import { VSCodeToolAdapter } from "../adapters/vscode/VSCodeToolAdapter";
import { myCustomTool } from "../definitions/tools/myCustomTool";
import { myCustomOperation } from "../operations/myCustomOperation";

describe("VSCodeToolAdapter", () => {
  it("should prepare invocation message", async () => {
    const adapter = new VSCodeToolAdapter(myCustomTool, myCustomOperation);

    const result = await adapter.prepareInvocation(
      {
        input: { input: "test" },
        toolInvocationToken: {} as any,
        requestedContentTypes: [],
      },
      {} as any,
    );

    expect(result.invocationMessage).toContain("Transforming");
  });
});
```

---

## Advanced Patterns

### 1. Conditional Tool Registration

```typescript
// Register tools based on features or permissions
function registerToolsBasedOnPermissions(
  context: vscode.ExtensionContext,
  userPermissions: string[],
) {
  const toolsToRegister = allToolDefinitions.filter((tool) => {
    // Check if user has permission for this tool
    const requiredPermission = tool.platformConfig?.vscode?.requiredPermission;
    return !requiredPermission || userPermissions.includes(requiredPermission);
  });

  registerVSCodeTools(context, toolsToRegister, allOperations);
}
```

### 2. Tool Composition

```typescript
// Compose multiple operations into a workflow
async function createNotebookWorkflow(context: ToolExecutionContext) {
  const doc = context.document!;

  // Insert header
  await insertCellOperation.execute(
    { cellType: "markdown", cellSource: "# Analysis", cellIndex: 0 },
    context,
  );

  // Insert code
  await insertCellOperation.execute(
    { cellType: "code", cellSource: "import pandas as pd", cellIndex: 1 },
    context,
  );

  // Execute code
  await executeCellOperation.execute({ cellIndex: 1 }, context);

  return { success: true, message: "✅ Workflow complete" };
}
```

### 3. Error Handling

```typescript
import { SaaSToolAdapter } from "./tools/adapters/saas/SaaSToolAdapter";

async function executeToolSafely(
  adapter: SaaSToolAdapter<any, any>,
  params: any,
) {
  try {
    const result = await adapter.execute(params);
    console.log("✅ Success:", result);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes("out of bounds")) {
        console.error("❌ Invalid cell index");
      } else if (error.message.includes("Document handle")) {
        console.error("❌ No active document");
      } else {
        console.error("❌ Unexpected error:", error.message);
      }
    }
    throw error;
  }
}
```

### 4. Custom Document Handle Implementation

```typescript
// Implement DocumentHandle for a custom platform
import type { DocumentHandle, CellData } from "./tools/core/interfaces";

export class CustomPlatformDocumentHandle implements DocumentHandle {
  constructor(private customNotebook: CustomNotebookType) {}

  async getCellCount(): Promise<number> {
    return this.customNotebook.cells.length;
  }

  async insertCell(index: number, cell: CellData): Promise<void> {
    // Your platform-specific implementation
    this.customNotebook.insertCellAt(index, cell);
  }

  // Implement other methods...
}

// Use with any tool
const adapter = new SaaSToolAdapter(
  insertCellTool,
  insertCellOperation,
  context,
);
```

### 5. Dynamic Tool Registration

```typescript
// Register tools dynamically based on configuration
async function loadAndRegisterTools(
  context: vscode.ExtensionContext,
  configPath: string,
) {
  // Load tool configuration
  const config = await loadToolConfig(configPath);

  // Filter tools by configuration
  const enabledTools = allToolDefinitions.filter((tool) =>
    config.enabledTools.includes(tool.name),
  );

  // Register only enabled tools
  registerVSCodeTools(context, enabledTools, allOperations);

  console.log(`Registered ${enabledTools.length} tools from config`);
}
```

---

## Troubleshooting

### Issue: "Document handle is required"

**Cause**: Tool requires document but none provided.

**Solution**: Ensure document is resolved in execution context:

```typescript
// VS Code adapter auto-resolves from URI
// SaaS adapter needs active document
const notebook = context.getActiveDocument();
if (!notebook) {
  console.error("No active notebook");
  return;
}
```

### Issue: "No operation found for tool"

**Cause**: Tool definition references non-existent operation.

**Solution**: Check operation name matches:

```typescript
// Tool definition
operation: "myCustom";

// Operation export
export const allOperations = {
  myCustom: myCustomOperation, // Must match!
};
```

### Issue: ag-ui tool not appearing

**Cause**: Hook not called or context missing.

**Solution**: Verify hook is inside CopilotKit provider:

```tsx
<CopilotKit>
  <YourComponent>{/* useNotebookTools must be here */}</YourComponent>
</CopilotKit>
```

---

## Next Steps

1. **Try the examples** - Start with VS Code integration
2. **Create custom tools** - Follow the custom tool guide
3. **Write tests** - Use MockDocumentHandle for unit tests
4. **Deploy** - Test in production with SaaS and ag-ui

For more details, see:

- [README.md](./README.md) - Architecture overview
- [INTEGRATION_GUIDE.md](./adapters/vscode/INTEGRATION_GUIDE.md) - VS Code integration
- [API Documentation](./core/interfaces.ts) - Core interfaces
