# API Reference - Unified Tool Architecture

Complete API reference for the unified tool architecture.

## Table of Contents

1. [Core Interfaces](#core-interfaces)
2. [Core Operations](#core-operations)
3. [Tool Definitions](#tool-definitions)
4. [Platform Adapters](#platform-adapters)
5. [Type Definitions](#type-definitions)

---

## Core Interfaces

### DocumentHandle

Platform-agnostic interface for notebook operations.

```typescript
interface DocumentHandle {
  // Cell counting
  getCellCount(): Promise<number>;

  // Cell reading
  getCell(index: number): Promise<CellData>;
  getAllCells(): Promise<CellData[]>;

  // Metadata
  getMetadata(): Promise<NotebookMetadata>;

  // Cell manipulation
  insertCell(index: number, cell: CellData): Promise<void>;
  deleteCell(index: number): Promise<void>;
  updateCell(index: number, source: string): Promise<void>;

  // Execution
  executeCell(index: number): Promise<ExecutionResult>;

  // Lifecycle (optional)
  save?(): Promise<void>;
  close?(): Promise<void>;
}
```

**Implementations:**
- [VSCodeDocumentHandle](./adapters/vscode/VSCodeDocumentHandle.ts) - VS Code message passing
- [SaaSDocumentHandle](./adapters/saas/SaaSDocumentHandle.ts) - Direct Jupyter widget APIs
- [MockDocumentHandle](./core/__tests__/mockDocumentHandle.ts) - Testing

**Usage:**
```typescript
const cellCount = await document.getCellCount();
await document.insertCell(0, {
  type: 'code',
  source: 'print("Hello")',
  outputs: [],
  metadata: {}
});
```

---

### ToolOperation<TParams, TResult>

Generic interface for platform-agnostic operations.

```typescript
interface ToolOperation<TParams, TResult> {
  /** Operation name (must match tool definition) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Execute the operation */
  execute(
    params: TParams,
    context: ToolExecutionContext
  ): Promise<TResult>;
}
```

**Type Parameters:**
- `TParams` - Input parameter type (validated against JSON Schema)
- `TResult` - Output result type

**Example:**
```typescript
const myOperation: ToolOperation<MyParams, MyResult> = {
  name: 'myOperation',
  description: 'Does something useful',

  async execute(params, context) {
    // Platform-agnostic business logic
    return { success: true };
  }
};
```

---

### ToolExecutionContext

Dependency injection container for operations.

```typescript
interface ToolExecutionContext {
  /** Document handle (for cell operations) */
  document?: DocumentHandle;

  /** Datalayer SDK client */
  sdk?: unknown;

  /** Authentication provider */
  auth?: unknown;

  /** Platform-specific extras */
  extras?: Record<string, unknown>;
}
```

**Usage:**
```typescript
async execute(params, context) {
  const { document, sdk, auth } = context;

  if (!document) {
    throw new Error('Document required');
  }

  await document.insertCell(0, ...);
}
```

---

## Core Operations

### Cell Manipulation

#### insertCell

Insert a cell into notebook at specified position.

```typescript
interface InsertCellParams {
  cellType: 'code' | 'markdown' | 'raw';
  cellSource: string;
  cellIndex?: number;  // Optional: defaults to end
}

interface InsertCellResult {
  success: boolean;
  index: number;
  message: string;
}
```

**Example:**
```typescript
const result = await insertCellOperation.execute(
  {
    cellType: 'code',
    cellSource: 'print("Hello")',
    cellIndex: 0
  },
  { document }
);
// result.index === 0
```

#### deleteCell

Delete a cell from notebook.

```typescript
interface DeleteCellParams {
  cellIndex: number;
}

interface DeleteCellResult {
  success: boolean;
  message: string;
}
```

**Example:**
```typescript
await deleteCellOperation.execute(
  { cellIndex: 2 },
  { document }
);
```

#### updateCell

Update cell source code.

```typescript
interface UpdateCellParams {
  cellIndex: number;
  newSource: string;
}

interface UpdateCellResult {
  success: boolean;
  message: string;
}
```

**Example:**
```typescript
await updateCellOperation.execute(
  {
    cellIndex: 0,
    newSource: 'x = 42\nprint(x)'
  },
  { document }
);
```

---

### Cell Reading

#### readCell

Read a single cell by index.

```typescript
interface ReadCellParams {
  cellIndex: number;
}

interface ReadCellResult {
  success: boolean;
  cell: CellData;
}
```

**Example:**
```typescript
const result = await readCellOperation.execute(
  { cellIndex: 0 },
  { document }
);

console.log(result.cell.type);     // 'code'
console.log(result.cell.source);   // Cell content
```

#### readAllCells

Read all cells from notebook.

```typescript
interface ReadAllCellsParams {}  // No parameters

interface ReadAllCellsResult {
  success: boolean;
  cells: CellData[];
  count: number;
}
```

**Example:**
```typescript
const result = await readAllCellsOperation.execute({}, { document });

console.log(`Found ${result.count} cells`);
result.cells.forEach((cell, i) => {
  console.log(`Cell ${i}: ${cell.type}`);
});
```

---

### Cell Execution

#### executeCell

Execute a code cell and return results.

```typescript
interface ExecuteCellParams {
  cellIndex: number;
}

interface ExecuteCellResult {
  success: boolean;
  executionOrder?: number;
  outputs: CellOutput[];
  duration: number;  // milliseconds
  message: string;
}
```

**Example:**
```typescript
const result = await executeCellOperation.execute(
  { cellIndex: 0 },
  { document }
);

if (result.success) {
  console.log(`Executed in ${result.duration}ms`);
  console.log(`Execution count: ${result.executionOrder}`);

  result.outputs.forEach(output => {
    if (output.output_type === 'stream') {
      console.log(output.text);
    }
  });
}
```

---

### Notebook Information

#### getNotebookInfo

Get metadata about the notebook.

```typescript
interface GetNotebookInfoParams {}

interface GetNotebookInfoResult {
  success: boolean;
  info: NotebookMetadata;
}
```

**Example:**
```typescript
const result = await getNotebookInfoOperation.execute({}, { document });

console.log(`Path: ${result.info.path}`);
console.log(`Cells: ${result.info.cellCount}`);
console.log(`Code cells: ${result.info.cellTypes.code}`);
console.log(`Markdown cells: ${result.info.cellTypes.markdown}`);
```

---

### Document Creation

#### createRemoteNotebook

Create a notebook in Datalayer cloud.

```typescript
interface CreateRemoteNotebookParams {
  notebookName: string;
  spaceId?: string;
  initialContent?: string;
}

interface CreateRemoteNotebookResult {
  success: boolean;
  notebookId: string;
  url: string;
  message: string;
}
```

**Example:**
```typescript
const result = await createRemoteNotebookOperation.execute(
  {
    notebookName: 'My Analysis',
    spaceId: 'space-123',
    initialContent: '# Hello\nprint("World")'
  },
  { sdk, auth }
);

console.log(`Created: ${result.url}`);
```

#### createLocalNotebook

Create a notebook in local filesystem.

```typescript
interface CreateLocalNotebookParams {
  notebookName: string;
  directory?: string;
  initialContent?: string;
}

interface CreateLocalNotebookResult {
  success: boolean;
  path: string;
  message: string;
}
```

**Example:**
```typescript
const result = await createLocalNotebookOperation.execute(
  {
    notebookName: 'analysis.ipynb',
    directory: '/Users/me/notebooks',
    initialContent: 'print("Hello")'
  },
  { extras: { createLocalFile } }
);
```

---

### Runtime Management

#### startRuntime

Start a Jupyter runtime in Datalayer cloud.

```typescript
interface StartRuntimeParams {
  runtimeName: string;
  snapshotId?: string;
  duration?: number;  // minutes
  autoConnect?: boolean;
}

interface StartRuntimeResult {
  success: boolean;
  runtimeId: string;
  status: string;
  message: string;
}
```

**Example:**
```typescript
const result = await startRuntimeOperation.execute(
  {
    runtimeName: 'ml-runtime',
    snapshotId: 'snap-123',
    duration: 60,
    autoConnect: true
  },
  { sdk, auth, extras }
);
```

#### connectRuntime

Connect a notebook to a runtime.

```typescript
interface ConnectRuntimeParams {
  runtimeId: string;
  notebookUri?: string;
}

interface ConnectRuntimeResult {
  success: boolean;
  message: string;
}
```

---

## Tool Definitions

### ToolDefinition

Unified tool definition schema.

```typescript
interface ToolDefinition {
  /** Tool identifier (e.g., 'datalayer_insertCell') */
  name: string;

  /** Human-readable name */
  displayName: string;

  /** Short name for referencing (e.g., 'insertCell') */
  toolReferenceName?: string;

  /** AI model description */
  description: string;

  /** JSON Schema parameter definition (ag-ui compatible) */
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };

  /** Core operation name */
  operation: string;

  /** Platform-specific configurations */
  platformConfig?: {
    vscode?: VSCodeToolConfig;
    saas?: SaaSToolConfig;
    agui?: AgUIToolConfig;
  };

  /** Tags for categorization */
  tags?: string[];
}
```

### Platform Configs

#### VSCodeToolConfig

```typescript
interface VSCodeToolConfig {
  /** Confirmation message shown before execution */
  confirmationMessage?: string;

  /** Message shown during execution */
  invocationMessage?: string;

  /** Can tool be referenced in prompts? */
  canBeReferencedInPrompt?: boolean;

  /** Required user permission */
  requiredPermission?: string;
}
```

#### SaaSToolConfig

```typescript
interface SaaSToolConfig {
  /** Enable result preview */
  enablePreview?: boolean;

  /** Custom success message */
  successMessage?: string;

  /** Custom error handler */
  errorHandler?: (error: Error) => void;
}
```

#### AgUIToolConfig

```typescript
interface AgUIToolConfig {
  /** Requires user confirmation */
  requiresConfirmation?: boolean;

  /** Rendering hints */
  renderingHints?: {
    /** Custom render function for CopilotKit */
    customRender?: (props: {
      status: string;
      args: any;
      result: any;
    }) => React.ReactNode;

    /** Icon to display */
    icon?: string;

    /** Priority for tool ordering */
    priority?: number;
  };
}
```

### Example Definition

```typescript
export const insertCellTool: ToolDefinition = {
  name: 'datalayer_insertCell',
  displayName: 'Insert Notebook Cell',
  toolReferenceName: 'insertCell',
  description: 'Inserts a code or markdown cell into a Jupyter notebook',

  parameters: {
    type: 'object',
    properties: {
      cellType: {
        type: 'string',
        enum: ['code', 'markdown'],
        description: 'Type of cell to insert'
      },
      cellSource: {
        type: 'string',
        description: 'Content of the cell'
      },
      cellIndex: {
        type: 'number',
        description: 'Position to insert (0-based, optional)'
      }
    },
    required: ['cellType', 'cellSource']
  },

  operation: 'insertCell',

  platformConfig: {
    vscode: {
      confirmationMessage: 'Insert **{{cellType}}** cell?',
      invocationMessage: 'Inserting {{cellType}} cell'
    },
    saas: { enablePreview: true },
    agui: { requiresConfirmation: true }
  },

  tags: ['cell', 'notebook', 'manipulation', 'create']
};
```

---

## Platform Adapters

### VS Code

#### VSCodeToolAdapter

Bridges LanguageModelTool to core operations.

```typescript
class VSCodeToolAdapter<TParams>
  implements vscode.LanguageModelTool<TParams> {

  constructor(
    private readonly definition: ToolDefinition,
    private readonly operation: ToolOperation<TParams, unknown>
  );

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<TParams>,
    token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation>;

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<TParams>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult>;
}
```

**Usage:**
```typescript
import { VSCodeToolAdapter } from './adapters/vscode/VSCodeToolAdapter';

const adapter = new VSCodeToolAdapter(
  insertCellTool,
  insertCellOperation
);

vscode.lm.registerTool('datalayer_insertCell', adapter);
```

#### VSCodeDocumentHandle

VS Code implementation using webview messages.

```typescript
class VSCodeDocumentHandle implements DocumentHandle {
  constructor(
    private readonly uri: vscode.Uri,
    private readonly commandExecutor: typeof vscode.commands.executeCommand
  );

  // Implements all DocumentHandle methods via message passing
}
```

**Usage:**
```typescript
const handle = new VSCodeDocumentHandle(
  notebookUri,
  vscode.commands.executeCommand
);

await handle.insertCell(0, { /* ... */ });
```

#### Registration Functions

```typescript
/**
 * Register all tools automatically
 */
function registerVSCodeTools(
  context: vscode.ExtensionContext,
  definitions?: readonly ToolDefinition[],
  operations?: Record<string, ToolOperation<any, any>>
): void;

/**
 * Register a single tool
 */
function registerSingleTool(
  context: vscode.ExtensionContext,
  definition: ToolDefinition,
  operation: ToolOperation<any, any>
): vscode.Disposable;
```

---

### SaaS

#### SaaSToolAdapter

Wraps operations for browser execution.

```typescript
class SaaSToolAdapter<TParams, TResult> {
  constructor(
    private readonly definition: ToolDefinition,
    private readonly operation: ToolOperation<TParams, TResult>,
    private readonly saasContext: SaaSToolContext
  );

  async execute(params: TParams): Promise<TResult>;
}
```

**Usage:**
```typescript
const adapter = new SaaSToolAdapter(
  insertCellTool,
  insertCellOperation,
  context
);

const result = await adapter.execute({
  cellType: 'code',
  cellSource: 'print("Hello")'
});
```

#### SaaSToolContext

Manages document access in browser.

```typescript
class SaaSToolContext {
  constructor(
    private readonly app: JupyterFrontEnd,
    public readonly sdk: DatalayerClient,
    public readonly auth: any
  );

  /** Get currently active notebook */
  getActiveDocument(): NotebookPanel | null;

  /** Get notebook by ID */
  getDocumentById(id: string): NotebookPanel | null;

  /** Get all open notebooks */
  getAllDocuments(): NotebookPanel[];

  /** Create document handle for notebook */
  createDocumentHandle(notebook: NotebookPanel): SaaSDocumentHandle;

  /** Clear cached handles */
  clearHandles(): void;
}
```

**Usage:**
```typescript
const context = new SaaSToolContext(app, sdk, auth);

const notebook = context.getActiveDocument();
const handle = context.createDocumentHandle(notebook!);
```

#### SaaSDocumentHandle

Direct Jupyter widget manipulation.

```typescript
class SaaSDocumentHandle implements DocumentHandle {
  constructor(private readonly notebookPanel: NotebookPanel);

  // Implements all DocumentHandle methods via direct widget APIs
}
```

---

### ag-ui / CopilotKit

#### CopilotKitAction

Action format for CopilotKit.

```typescript
interface CopilotKitAction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: any) => Promise<string>;
  render?: (props: {
    status: string;
    args: any;
    result: any;
  }) => React.ReactNode;
}
```

#### Converter Functions

```typescript
/**
 * Convert tool definition to CopilotKit action
 */
function createCopilotKitAction(
  definition: ToolDefinition,
  operation: ToolOperation<any, any>,
  context: SaaSToolContext
): CopilotKitAction;

/**
 * Convert all tool definitions to actions
 */
function createAllCopilotKitActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<any, any>>,
  context: SaaSToolContext
): CopilotKitAction[];
```

#### React Hooks

##### useNotebookTools

Auto-register all tools with CopilotKit.

```typescript
function useNotebookTools(
  context: SaaSToolContext,
  useCopilotAction: UseCopilotActionFn,
  definitions?: ToolDefinition[],
  operations?: Record<string, ToolOperation<any, any>>
): void;
```

**Usage:**
```tsx
function NotebookEditor() {
  const context = useMemo(() => new SaaSToolContext(app, sdk, auth), []);

  useNotebookTools(context, useCopilotAction);

  return <YourUI />;
}
```

##### useSingleTool

Register a single tool.

```typescript
function useSingleTool(
  definition: ToolDefinition,
  operation: ToolOperation<any, any>,
  context: SaaSToolContext,
  useCopilotAction: UseCopilotActionFn
): void;
```

##### useToolActions

Get actions without auto-registration.

```typescript
function useToolActions(
  definitions: ToolDefinition[],
  operations: Record<string, ToolOperation<any, any>>,
  context: SaaSToolContext
): CopilotKitAction[];
```

---

## Type Definitions

### CellData

```typescript
interface CellData {
  type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs: CellOutput[];
  metadata: Record<string, unknown>;
  execution_count?: number;
}
```

### CellOutput

```typescript
type CellOutput =
  | StreamOutput
  | ExecuteResultOutput
  | DisplayDataOutput
  | ErrorOutput;

interface StreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string | string[];
}

interface ExecuteResultOutput {
  output_type: 'execute_result';
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  execution_count: number;
}

interface DisplayDataOutput {
  output_type: 'display_data';
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface ErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback: string[];
}
```

### NotebookMetadata

```typescript
interface NotebookMetadata {
  path: string;
  cellCount: number;
  cellTypes: {
    code: number;
    markdown: number;
    raw: number;
  };
  kernelspec?: {
    name: string;
    display_name: string;
    language: string;
  };
  language_info?: {
    name: string;
    version: string;
    mimetype: string;
    file_extension: string;
  };
}
```

### ExecutionResult

```typescript
interface ExecutionResult {
  success: boolean;
  executionOrder?: number;
  outputs: CellOutput[];
  duration: number;  // milliseconds
}
```

### RuntimeInfo

```typescript
interface RuntimeInfo {
  runtimeId: string;
  runtimeName: string;
  status: 'pending' | 'running' | 'stopped' | 'error';
  url?: string;
  createdAt: string;
  expiresAt?: string;
}
```

---

## Error Handling

All operations throw standard JavaScript errors:

```typescript
try {
  await operation.execute(params, context);
} catch (error) {
  if (error instanceof Error) {
    console.error('Operation failed:', error.message);

    // Common error patterns:
    if (error.message.includes('out of bounds')) {
      // Invalid cell index
    } else if (error.message.includes('Document handle')) {
      // Missing document
    } else if (error.message.includes('No kernel')) {
      // Kernel not available
    }
  }
}
```

---

## Testing Utilities

### MockDocumentHandle

Mock implementation for unit testing.

```typescript
class MockDocumentHandle implements DocumentHandle {
  constructor(initialCells?: CellData[]);

  // All DocumentHandle methods implemented with in-memory storage
  // Fully functional for testing without any platform
}
```

**Usage:**
```typescript
import { MockDocumentHandle } from './core/__tests__/mockDocumentHandle';

const doc = new MockDocumentHandle([
  { type: 'code', source: 'x = 1', outputs: [] }
]);

await insertCellOperation.execute(
  { cellType: 'markdown', cellSource: '# Header', cellIndex: 0 },
  { document: doc }
);

expect(await doc.getCellCount()).toBe(2);
```

---

## Constants

### Default Values

```typescript
const DEFAULT_RUNTIME_DURATION = 10;  // minutes
const MAX_CELL_SOURCE_LENGTH = 10000;  // characters
const DEFAULT_CELL_INDEX = -1;  // append to end
```

### Operation Names

```typescript
const OPERATION_NAMES = {
  INSERT_CELL: 'insertCell',
  DELETE_CELL: 'deleteCell',
  UPDATE_CELL: 'updateCell',
  READ_CELL: 'readCell',
  READ_ALL_CELLS: 'readAllCells',
  EXECUTE_CELL: 'executeCell',
  GET_NOTEBOOK_INFO: 'getNotebookInfo',
  CREATE_REMOTE_NOTEBOOK: 'createRemoteNotebook',
  CREATE_LOCAL_NOTEBOOK: 'createLocalNotebook',
  // ...
};
```

---

## See Also

- [README.md](./README.md) - Architecture overview
- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - Usage examples
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migration from old tools
- [Core Interfaces](./core/interfaces.ts) - Source code
- [Tool Definitions](./definitions/schema.ts) - Schema source
