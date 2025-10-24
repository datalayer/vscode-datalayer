/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Complete Workflow Example - Unified Tool Architecture
 *
 * This example demonstrates a complete end-to-end workflow using the unified
 * tool architecture across all three platforms: VS Code, SaaS, and ag-ui.
 *
 * Workflow: Create a data analysis notebook with cells for imports, data loading,
 * analysis, and visualization.
 *
 * @module tools/examples/completeWorkflowExample
 */

import type { ToolExecutionContext } from "../core/interfaces";
import { insertCellOperation } from "../core/operations/insertCell";
import { executeCellOperation } from "../core/operations/executeCell";
import { readAllCellsOperation } from "../core/operations/readAllCells";

/**
 * Complete workflow result
 */
interface WorkflowResult {
  success: boolean;
  cellsCreated: number;
  cellsExecuted: number;
  errors: string[];
  summary: string;
}

/**
 * Creates a complete data analysis notebook workflow
 *
 * This demonstrates how to:
 * 1. Use multiple operations in sequence
 * 2. Handle errors gracefully
 * 3. Provide detailed feedback
 * 4. Work across all platforms
 *
 * @param context - Tool execution context (includes document handle)
 * @param options - Workflow options
 * @returns Workflow result with detailed information
 */
export async function createDataAnalysisWorkflow(
  context: ToolExecutionContext,
  options: {
    dataSource: string; // e.g., 'data.csv' or 'https://example.com/data.csv'
    executeImmediately?: boolean; // Whether to execute cells after insertion
    includeVisualization?: boolean; // Whether to add plotting code
  }
): Promise<WorkflowResult> {
  const { document } = context;

  if (!document) {
    throw new Error("Document handle is required for workflow");
  }

  const errors: string[] = [];
  let cellsCreated = 0;
  let cellsExecuted = 0;

  try {
    console.log("🚀 Starting data analysis workflow...");

    // Step 1: Insert notebook title
    console.log("📝 Step 1/6: Creating title...");
    await insertCellOperation.execute(
      {
        cellType: "markdown",
        cellSource: "# Data Analysis Workflow\n\nAutomated analysis created by Datalayer tools",
        cellIndex: 0,
      },
      context
    );
    cellsCreated++;

    // Step 2: Insert imports
    console.log("📦 Step 2/6: Adding imports...");
    const imports = `
import pandas as pd
import numpy as np
${options.includeVisualization ? "import matplotlib.pyplot as plt\nimport seaborn as sns" : ""}

print("✅ Libraries imported successfully")
    `.trim();

    await insertCellOperation.execute(
      {
        cellType: "code",
        cellSource: imports,
        cellIndex: 1,
      },
      context
    );
    cellsCreated++;

    // Execute imports if requested
    if (options.executeImmediately) {
      try {
        await executeCellOperation.execute({ cellIndex: 1 }, context);
        cellsExecuted++;
      } catch (error) {
        errors.push(
          `Failed to execute imports: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Step 3: Insert data loading
    console.log("📊 Step 3/6: Adding data loading...");
    const dataLoading = `
# Load data
df = pd.read_csv('${options.dataSource}')

# Display basic information
print(f"Dataset shape: {df.shape}")
print(f"Columns: {list(df.columns)}")
df.head()
    `.trim();

    await insertCellOperation.execute(
      {
        cellType: "code",
        cellSource: dataLoading,
        cellIndex: 2,
      },
      context
    );
    cellsCreated++;

    // Step 4: Insert data exploration
    console.log("🔍 Step 4/6: Adding data exploration...");
    const exploration = `
# Data exploration
print("\\n=== Data Info ===")
print(df.info())

print("\\n=== Summary Statistics ===")
print(df.describe())

print("\\n=== Missing Values ===")
print(df.isnull().sum())
    `.trim();

    await insertCellOperation.execute(
      {
        cellType: "code",
        cellSource: exploration,
        cellIndex: 3,
      },
      context
    );
    cellsCreated++;

    // Step 5: Insert analysis
    console.log("📈 Step 5/6: Adding analysis...");
    const analysis = `
# Perform analysis
# Note: Customize this section based on your specific needs

# Example: Correlation analysis
print("\\n=== Correlation Analysis ===")
numeric_cols = df.select_dtypes(include=[np.number]).columns
if len(numeric_cols) > 0:
    correlation_matrix = df[numeric_cols].corr()
    print(correlation_matrix)
else:
    print("No numeric columns found for correlation analysis")
    `.trim();

    await insertCellOperation.execute(
      {
        cellType: "code",
        cellSource: analysis,
        cellIndex: 4,
      },
      context
    );
    cellsCreated++;

    // Step 6: Insert visualization (optional)
    if (options.includeVisualization) {
      console.log("📊 Step 6/6: Adding visualization...");
      const visualization = `
# Create visualizations
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Distribution plot
numeric_cols = df.select_dtypes(include=[np.number]).columns
if len(numeric_cols) > 0:
    first_numeric = numeric_cols[0]
    df[first_numeric].hist(bins=30, ax=axes[0])
    axes[0].set_title(f'Distribution of {first_numeric}')
    axes[0].set_xlabel(first_numeric)
    axes[0].set_ylabel('Frequency')

    # Correlation heatmap
    if len(numeric_cols) > 1:
        correlation = df[numeric_cols].corr()
        sns.heatmap(correlation, annot=True, cmap='coolwarm', ax=axes[1])
        axes[1].set_title('Correlation Heatmap')
    else:
        axes[1].text(0.5, 0.5, 'Not enough numeric columns',
                    ha='center', va='center')

plt.tight_layout()
plt.show()

print("✅ Visualization complete")
      `.trim();

      await insertCellOperation.execute(
        {
          cellType: "code",
          cellSource: visualization,
          cellIndex: 5,
        },
        context
      );
      cellsCreated++;
    } else {
      console.log("⏭️  Step 6/6: Skipping visualization (not requested)");
    }

    // Read all cells to verify
    const result = await readAllCellsOperation.execute({}, context);
    console.log(`✅ Workflow complete: ${result.cells.length} cells created`);

    return {
      success: true,
      cellsCreated,
      cellsExecuted,
      errors,
      summary: `✅ Created ${cellsCreated} cells${cellsExecuted > 0 ? `, executed ${cellsExecuted}` : ""}${errors.length > 0 ? `, encountered ${errors.length} error(s)` : ""}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    return {
      success: false,
      cellsCreated,
      cellsExecuted,
      errors,
      summary: `❌ Workflow failed: ${errorMessage}`,
    };
  }
}

/**
 * Example: Using the workflow in VS Code
 *
 * This shows how to integrate the workflow into a VS Code command.
 */
export function registerWorkflowCommand(
  context: any // vscode.ExtensionContext
): void {
  const vscode = require("vscode");

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.createDataAnalysisWorkflow",
      async () => {
        try {
          // Get active notebook
          const activeEditor = vscode.window.activeTextEditor;
          if (!activeEditor) {
            vscode.window.showErrorMessage("No active notebook");
            return;
          }

          // Prompt for data source
          const dataSource = await vscode.window.showInputBox({
            prompt: "Enter data source path or URL",
            value: "data.csv",
            placeHolder: "e.g., data.csv or https://example.com/data.csv",
          });

          if (!dataSource) {
            return; // User cancelled
          }

          // Ask about execution
          const executeNow = await vscode.window.showQuickPick(
            ["Yes", "No"],
            {
              placeHolder: "Execute cells immediately?",
            }
          );

          // Ask about visualization
          const includeViz = await vscode.window.showQuickPick(
            ["Yes", "No"],
            {
              placeHolder: "Include visualization?",
            }
          );

          // Show progress
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Creating data analysis workflow...",
              cancellable: false,
            },
            async (progress) => {
              // Import dependencies
              const { VSCodeDocumentHandle } = await import(
                "../adapters/vscode/VSCodeDocumentHandle"
              );
              const { getServiceContainer } = await import(
                "../../services/serviceContainer"
              );

              // Create document handle
              const documentHandle = new VSCodeDocumentHandle(
                activeEditor.document.uri,
                vscode.commands.executeCommand
              );

              // Get services
              const services = getServiceContainer();

              // Create execution context
              const executionContext = {
                document: documentHandle,
                sdk: services.sdk,
                auth: services.authProvider,
              };

              // Execute workflow
              progress.report({ message: "Creating cells..." });
              const result = await createDataAnalysisWorkflow(
                executionContext,
                {
                  dataSource,
                  executeImmediately: executeNow === "Yes",
                  includeVisualization: includeViz === "Yes",
                }
              );

              // Show result
              if (result.success) {
                vscode.window.showInformationMessage(result.summary);
              } else {
                vscode.window.showErrorMessage(result.summary);
                if (result.errors.length > 0) {
                  console.error("Workflow errors:", result.errors);
                }
              }
            }
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Workflow failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );
}

/**
 * Example: Using the workflow in SaaS (browser)
 *
 * This shows how to use the workflow in a JupyterLab extension.
 */
export async function runWorkflowInSaaS(
  app: any, // JupyterFrontEnd
  sdk: any, // DatalayerClient
  auth: any, // AuthProvider
  options: {
    dataSource: string;
    executeImmediately?: boolean;
    includeVisualization?: boolean;
  }
): Promise<WorkflowResult> {
  // Import SaaS dependencies
  const { SaaSToolContext } = await import(
    "../adapters/saas/SaaSToolContext"
  );

  // Create context
  const context = new SaaSToolContext(app, sdk, auth);

  // Get active notebook
  const notebookPanel = context.getActiveDocument();
  if (!notebookPanel) {
    throw new Error("No active notebook");
  }

  // Create document handle
  const documentHandle = context.createDocumentHandle(notebookPanel);

  // Create execution context
  const executionContext = {
    document: documentHandle,
    sdk,
    auth,
  };

  // Execute workflow
  return await createDataAnalysisWorkflow(executionContext, options);
}

/**
 * Example: Using the workflow with ag-ui/CopilotKit
 *
 * This shows how to expose the workflow as a CopilotKit action.
 */
export function createWorkflowAction(
  context: any // SaaSToolContext
): any {
  // CopilotKitAction
  return {
    name: "createDataAnalysisWorkflow",
    description:
      "Creates a complete data analysis workflow with cells for imports, data loading, exploration, analysis, and optional visualization",

    parameters: {
      type: "object",
      properties: {
        dataSource: {
          type: "string",
          description: "Path or URL to data file (e.g., 'data.csv')",
        },
        executeImmediately: {
          type: "boolean",
          description: "Execute cells after insertion (default: false)",
        },
        includeVisualization: {
          type: "boolean",
          description: "Include visualization code (default: true)",
        },
      },
      required: ["dataSource"],
    },

    handler: async (params: any): Promise<string> => {
      try {
        // Get active notebook
        const notebookPanel = context.getActiveDocument();
        if (!notebookPanel) {
          return "❌ No active notebook found";
        }

        // Create document handle
        const documentHandle = context.createDocumentHandle(notebookPanel);

        // Create execution context
        const executionContext = {
          document: documentHandle,
          sdk: context.sdk,
          auth: context.auth,
        };

        // Execute workflow
        const result = await createDataAnalysisWorkflow(
          executionContext,
          params
        );

        // Return formatted result
        if (result.success) {
          return `${result.summary}\n\nDetails:\n- Cells created: ${result.cellsCreated}\n- Cells executed: ${result.cellsExecuted}${result.errors.length > 0 ? `\n- Errors: ${result.errors.length}` : ""}`;
        } else {
          return `${result.summary}\n\nErrors:\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
        }
      } catch (error) {
        return `❌ Workflow error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

/**
 * Example React component using the workflow with ag-ui
 */
export function WorkflowButton(): any {
  // React.ReactNode
  const { useCopilotAction } = require("@copilotkit/react-core");
  const context = null; // Get from your app context

  // Register workflow action
  useCopilotAction(createWorkflowAction(context));

  return null; // CopilotKit automatically handles the action
}

/**
 * Testing the workflow with MockDocumentHandle
 *
 * This demonstrates how to unit test the workflow without any platform.
 */
export async function testWorkflow(): Promise<void> {
  const { MockDocumentHandle } = await import(
    "../core/__tests__/mockDocumentHandle"
  );

  // Create mock document
  const mockDoc = new MockDocumentHandle();

  // Create execution context
  const context = {
    document: mockDoc,
  };

  // Run workflow
  console.log("🧪 Testing workflow with mock document...");
  const result = await createDataAnalysisWorkflow(context, {
    dataSource: "test-data.csv",
    executeImmediately: false,
    includeVisualization: true,
  });

  // Verify results
  console.log("Result:", result);
  console.log("Cells in mock document:", await mockDoc.getCellCount());

  // Assertions
  if (result.success && result.cellsCreated === 6) {
    console.log("✅ Test passed!");
  } else {
    console.error("❌ Test failed!");
  }
}

/**
 * Advanced: Custom workflow with error recovery
 *
 * This shows how to build a workflow with automatic error recovery.
 */
export async function createResilientWorkflow(
  context: ToolExecutionContext,
  options: {
    dataSource: string;
    maxRetries?: number;
    fallbackMode?: boolean;
  }
): Promise<WorkflowResult> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`🔄 Workflow attempt ${attempt}/${maxRetries}...`);

      const result = await createDataAnalysisWorkflow(context, {
        dataSource: options.dataSource,
        executeImmediately: !options.fallbackMode, // Don't execute in fallback mode
        includeVisualization: !options.fallbackMode,
      });

      if (result.success || attempt >= maxRetries) {
        return result;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt >= maxRetries) {
        throw error;
      }
    }
  }

  throw new Error("Workflow failed after maximum retries");
}

/**
 * Usage examples for all platforms
 */
export const USAGE_EXAMPLES = `
# Complete Workflow Example

## VS Code Usage

\`\`\`typescript
// Register command in extension.ts
import { registerWorkflowCommand } from './tools/examples/completeWorkflowExample';

export function activate(context: vscode.ExtensionContext) {
  registerWorkflowCommand(context);
}

// Then use in VS Code:
// 1. Open a notebook
// 2. Run: "Datalayer: Create Data Analysis Workflow"
// 3. Enter data source
// 4. Choose options
\`\`\`

## SaaS Usage

\`\`\`typescript
import { runWorkflowInSaaS } from './tools/examples/completeWorkflowExample';

// In your JupyterLab extension
const result = await runWorkflowInSaaS(app, sdk, auth, {
  dataSource: 'data.csv',
  executeImmediately: true,
  includeVisualization: true
});

console.log(result.summary);
\`\`\`

## ag-ui Usage

\`\`\`tsx
import { WorkflowButton, createWorkflowAction } from './tools/examples/completeWorkflowExample';

function NotebookEditor() {
  const { useCopilotAction } = require('@copilotkit/react-core');
  const context = useMemo(() => new SaaSToolContext(app, sdk, auth), []);

  // Auto-register workflow action
  useCopilotAction(createWorkflowAction(context));

  return (
    <div>
      <CopilotKitUI />
      {/* User can now say: "Create a data analysis workflow for data.csv" */}
    </div>
  );
}
\`\`\`

## Testing

\`\`\`typescript
import { testWorkflow } from './tools/examples/completeWorkflowExample';

// Run unit test
await testWorkflow();
\`\`\`
`;
