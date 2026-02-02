# Datalayer Agent Mode Implementation Plan

**Issue**: [#272](https://github.com/datalayer/vscode-datalayer/issues/272) - Create Custom Copilot Datalayer Agent

**Goal**: Fix critical context retention bug and implement a full Agent Mode for autonomous data science workflows

---

## Table of Contents

1. [Part 1: Context Retention Fix](#part-1-context-retention-fix)
2. [Part 2: Agent Mode Implementation](#part-2-agent-mode-implementation)
3. [Implementation Timeline](#implementation-timeline)
4. [Testing Strategy](#testing-strategy)
5. [Success Criteria](#success-criteria)

---

# Part 1: Context Retention Fix

**Status**: ✅ **COMPLETED**

**Implementation Date**: February 1, 2026

**Files Modified**:

- `src/chat/datalayerChatParticipant.ts` (lines 64-76, 252-283)

## Problem Statement

The `@datalayer` chat participant fails to retain conversation context between messages. Every request is treated as a fresh session.

**Root Cause**: Lines 66-68 in `datalayerChatParticipant.ts` create a fresh messages array without using `context.history`.

```typescript
// Current buggy code (lines 66-68)
const messages: vscode.LanguageModelChatMessage[] = [
  vscode.LanguageModelChatMessage.User(systemPrompt),
];
```

## Solution

### Core Implementation

**File**: `src/chat/datalayerChatParticipant.ts`

**Changes needed in `handleChatRequest` method**:

1. **Convert conversation history** (before line 66):

```typescript
/**
 * Convert VS Code chat history to language model messages
 */
private convertHistoryToMessages(
  history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>
): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];

  for (const turn of history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      // User message
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      // Assistant message - extract text from response parts
      const responseText = turn.response
        .filter((part) => part instanceof vscode.ChatResponseMarkdownPart)
        .map((part) => (part as vscode.ChatResponseMarkdownPart).value.value)
        .join("\n");

      if (responseText) {
        messages.push(
          vscode.LanguageModelChatMessage.Assistant([
            new vscode.LanguageModelTextPart(responseText),
          ])
        );
      }
    }
  }

  return messages;
}
```

2. **Replace lines 66-68** with history-aware logic:

```typescript
// Convert conversation history
const historyMessages = this.convertHistoryToMessages(_context.history);

// Build messages array
const messages: vscode.LanguageModelChatMessage[] = [];

// Add system prompt only on first turn
if (historyMessages.length === 0) {
  const systemPrompt = this.buildSimpleSystemPrompt();
  messages.push(vscode.LanguageModelChatMessage.User(systemPrompt));
} else {
  // Add conversation history
  messages.push(...historyMessages);
}
```

3. **Keep existing active document logic** (lines 69-140):

```typescript
// Add active document context (CURRENT turn only)
try {
  stream.progress("Getting active document...");
  const activeDocResult = await vscode.lm.invokeTool(
    "datalayer_getActiveDocument",
    { input: {}, toolInvocationToken: request.toolInvocationToken },
    token,
  );

  // ... existing document processing logic ...

  messages.push(
    vscode.LanguageModelChatMessage.User(
      `Active document information:\n${activeDocText}`,
    ),
  );

  // ... existing listAvailableBlocks logic for lexical docs ...
}
```

4. **Add current user request** (lines 139-140):

```typescript
// Add user's current request
messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
```

### Key Design Decisions

1. **System prompt placement**: Only on first turn (when `history.length === 0`)
   - Avoids token waste and model confusion

2. **Active document context**: Always fetch on every turn
   - User may have switched documents between turns

3. **Tool calls in history**: Simplified approach - only preserve text responses
   - VS Code API doesn't expose tool calls in `ChatResponseTurn.response`
   - Tool results are already captured in text responses

4. **History length**: No truncation (start simple)
   - VS Code likely manages history length itself
   - Add truncation later if token limits become an issue

### Implementation Details

**What was implemented**:

1. **Added `convertHistoryToMessages()` method** (lines 252-283):
   - Iterates through `_context.history`
   - Converts `ChatRequestTurn` to `User` messages
   - Converts `ChatResponseTurn` to `Assistant` messages (extracts markdown text)
   - Returns array of `LanguageModelChatMessage[]`

2. **Modified `handleChatRequest()` method** (lines 64-76):
   - Calls `convertHistoryToMessages(_context.history)`
   - Checks if `historyMessages.length === 0` (first turn)
   - If first turn: adds system prompt
   - If subsequent turn: spreads history messages into array
   - Existing workflow unchanged: active document → list blocks → user request

**Build status**: ✅ Compiled successfully with no TypeScript errors

**Next steps**:

- Manual testing with multi-turn conversations
- Verify context retention with examples from testing strategy

---

# Part 2: Agent Mode Implementation

## Overview

Currently, `@datalayer` is a **reactive chat participant**. We're adding **autonomous Agent Mode** capabilities:

1. **Autonomous multi-turn workflows** - Execute complex tasks with minimal intervention
2. **Proactive assistance** - Offer suggestions and fixes without being asked
3. **VS Code Agent SDK integration** - Leverage Agent Mode APIs (if available)
4. **Specialized behaviors** - Domain-specific patterns for data science

---

## Architecture

### 1. Agent vs Chat Participant

| Feature    | Chat Participant (Current)      | Agent Mode (New)                |
| ---------- | ------------------------------- | ------------------------------- |
| Invocation | `@datalayer <message>`          | Agent mode toggle in UI         |
| Behavior   | Reactive (responds to requests) | Autonomous (executes workflows) |
| Control    | User drives each step           | Agent makes decisions           |
| Use case   | Quick tasks, Q&A, single ops    | Complex workflows, batch ops    |

### 2. Core Components

```
src/chat/
├── datalayerChatParticipant.ts  # Existing chat participant
├── datalayerAgent.ts            # NEW: Autonomous agent engine
├── workflows/                   # NEW: Pre-built workflow templates
│   ├── dataAnalysis.ts
│   ├── notebookQuality.ts
│   └── index.ts
└── chatContextProvider.ts       # Existing context provider
```

---

## Implementation Details

### Component 1: DatalayerAgent Class

**File**: `src/chat/datalayerAgent.ts` (NEW)

```typescript
import * as vscode from "vscode";

/**
 * Autonomous Datalayer agent for multi-turn workflows
 */
export class DatalayerAgent {
  private context: vscode.ExtensionContext;
  private tools: vscode.LanguageModelChatTool[];
  private model: vscode.LanguageModelChat;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.tools = vscode.lm.tools.filter((t) => t.name.startsWith("datalayer_"));

    // Get the first available model (prefer GPT-4 or Claude for agent mode)
    const models = vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4",
    });
    this.model = models[0];
  }

  /**
   * Execute a high-level task autonomously across multiple turns
   */
  async executeWorkflow(
    taskDescription: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    stream.markdown(`# 🤖 Agent Mode Activated\n\n`);
    stream.markdown(`**Task**: ${taskDescription}\n\n`);

    // Phase 1: Plan the workflow
    stream.progress("Planning workflow...");
    const plan = await this.planWorkflow(taskDescription, token);

    if (!plan || plan.steps.length === 0) {
      stream.markdown(`\n❌ Could not create a plan for this task.\n`);
      return;
    }

    // Phase 2: Show plan to user
    stream.markdown(`## Workflow Plan\n\n`);
    plan.steps.forEach((step, i) => {
      stream.markdown(`${i + 1}. ${step.description}\n`);
    });
    stream.markdown(
      `\n**Estimated tools needed**: ${plan.requiredTools.join(", ")}\n\n`,
    );

    // Phase 3: Execute autonomously
    stream.markdown(`## Execution\n\n`);

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      stream.progress(
        `Step ${i + 1}/${plan.steps.length}: ${step.description}`,
      );
      stream.markdown(`### Step ${i + 1}: ${step.description}\n\n`);

      const result = await this.executeStep(step, stream, token);

      if (!result.success) {
        stream.markdown(`\n⚠️ **Step failed**: ${result.error}\n\n`);

        // Attempt recovery
        stream.progress(`Attempting recovery...`);
        const recovery = await this.attemptRecovery(
          step,
          result.error,
          stream,
          token,
        );

        if (!recovery.success) {
          stream.markdown(
            `\n❌ **Cannot recover**. Workflow stopped at step ${i + 1}.\n`,
          );
          return;
        }

        stream.markdown(`\n✅ **Recovered**: ${recovery.message}\n\n`);
      } else {
        stream.markdown(`\n✅ **Success**: ${result.message}\n\n`);
      }
    }

    stream.markdown(`\n## ✅ Workflow Completed!\n\n`);
    stream.markdown(`All ${plan.steps.length} steps executed successfully.\n`);
  }

  /**
   * Use LLM to plan workflow from high-level task description
   */
  private async planWorkflow(
    task: string,
    token: vscode.CancellationToken,
  ): Promise<WorkflowPlan | null> {
    const systemPrompt = `You are a Datalayer workflow planner.

Task: Break down the user's request into executable steps using available Datalayer tools.

Available tools (22 total):
- Document: getActiveDocument, createNotebook, createLexical
- Kernels: listKernels, selectKernel, executeCode
- Notebook Cells: insertCell, updateCell, deleteCells, readCell, readAllCells, runCell, runAllCells
- Lexical Blocks: insertBlock, insertBlocks, updateBlock, deleteBlocks, readBlock, readAllBlocks, runBlock, runAllBlocks, listAvailableBlocks

Output format (JSON):
{
  "steps": [
    {"description": "Step description", "toolCalls": ["tool1", "tool2"]},
    ...
  ],
  "requiredTools": ["tool1", "tool2", ...]
}

Be specific and actionable. Each step should map to 1-3 tool calls.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(task),
    ];

    try {
      const response = await this.model.sendRequest(messages, {}, token);

      let responseText = "";
      for await (const chunk of response.text) {
        responseText += chunk;
      }

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const plan = JSON.parse(jsonMatch[0]) as WorkflowPlan;
      return plan;
    } catch (error) {
      console.error("[DatalayerAgent] Planning failed:", error);
      return null;
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<StepResult> {
    // Use LLM with tools to execute this step
    const stepPrompt = `Execute this step: ${step.description}

Use the following tools if needed: ${step.toolCalls.join(", ")}

Be autonomous - make tool calls without asking for permission.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(this.buildAgentSystemPrompt()),
      vscode.LanguageModelChatMessage.User(stepPrompt),
    ];

    try {
      const response = await this.model.sendRequest(
        messages,
        { tools: this.tools },
        token,
      );

      // Process tool calls in response
      let hasToolCalls = false;
      for await (const chunk of response.text) {
        if (chunk instanceof vscode.LanguageModelToolCallPart) {
          hasToolCalls = true;

          // Execute tool
          const toolResult = await vscode.lm.invokeTool(
            chunk.name,
            chunk.input,
            token,
          );

          stream.markdown(`  - Used tool: \`${chunk.name}\`\n`);
        } else {
          stream.markdown(chunk);
        }
      }

      return {
        success: true,
        message: hasToolCalls ? "Tool calls executed" : "Step completed",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  /**
   * Attempt to recover from a failed step
   */
  private async attemptRecovery(
    failedStep: WorkflowStep,
    error: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<RecoveryResult> {
    const recoveryPrompt = `The following step failed:
Step: ${failedStep.description}
Error: ${error}

Analyze the error and suggest a recovery strategy. Can you fix this? If yes, execute the fix.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(this.buildAgentSystemPrompt()),
      vscode.LanguageModelChatMessage.User(recoveryPrompt),
    ];

    try {
      const response = await this.model.sendRequest(
        messages,
        { tools: this.tools },
        token,
      );

      let recoveryText = "";
      for await (const chunk of response.text) {
        if (chunk instanceof vscode.LanguageModelToolCallPart) {
          // Execute recovery tool call
          await vscode.lm.invokeTool(chunk.name, chunk.input, token);
          stream.markdown(`  - Recovery tool: \`${chunk.name}\`\n`);
        } else {
          recoveryText += chunk;
        }
      }

      return {
        success: true,
        message: recoveryText || "Recovered successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Recovery failed: ${error.message}`,
      };
    }
  }

  /**
   * Build system prompt for agent mode
   */
  private buildAgentSystemPrompt(): string {
    return `You are an autonomous Datalayer Data Science Agent.

IMPORTANT: You are in AGENT MODE - be autonomous and proactive!

Capabilities:
- Create and modify Jupyter notebooks (.ipynb) and Lexical documents (.dlex)
- Execute code autonomously
- Detect and fix errors proactively
- Plan and execute multi-step workflows

Guidelines:
- Execute actions autonomously without asking for permission
- Use tools proactively to accomplish tasks
- If a step fails, attempt recovery strategies
- Always validate results before reporting success
- For notebooks: Use *Cell tools (insertCell, runCell, etc.)
- For lexical: Use *Block tools (insertBlock, runBlock, etc.)

Available tools: ${this.tools.map((t) => t.name.replace("datalayer_", "")).join(", ")}`;
  }
}

// Type definitions
interface WorkflowPlan {
  steps: WorkflowStep[];
  requiredTools: string[];
  estimatedDuration?: string;
}

interface WorkflowStep {
  description: string;
  toolCalls: string[];
  dependencies?: number[]; // Indices of prerequisite steps
}

interface StepResult {
  success: boolean;
  error?: string;
  message?: string;
  output?: any;
}

interface RecoveryResult {
  success: boolean;
  message: string;
  alternativeStep?: WorkflowStep;
}
```

### Component 2: Agent Mode Detection

**File**: `src/chat/datalayerChatParticipant.ts` (MODIFY)

Add agent mode routing at the start of `handleChatRequest`:

```typescript
async handleChatRequest(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  // Check if user requested agent mode via special syntax
  const isAgentModeRequest = request.prompt.toLowerCase().startsWith("agent:");

  if (isAgentModeRequest) {
    // Route to autonomous agent
    const taskDescription = request.prompt.substring(6).trim(); // Remove "agent:" prefix
    const agent = new DatalayerAgent(this.context);
    return await agent.executeWorkflow(taskDescription, stream, token);
  }

  // Otherwise, standard chat participant flow (Part 1 - with context retention)
  // ... existing code ...
}
```

### Component 3: Pre-built Workflow Templates

**File**: `src/chat/workflows/dataAnalysis.ts` (NEW)

```typescript
import * as vscode from "vscode";

/**
 * Template: Create a complete data analysis notebook
 */
export async function createDataAnalysisNotebook(
  filename: string = "data_analysis.ipynb",
): Promise<vscode.Uri | null> {
  try {
    // Step 1: Create notebook
    const createResult = await vscode.lm.invokeTool(
      "datalayer_createNotebook",
      { input: { name: filename } },
      new vscode.CancellationTokenSource().token,
    );

    // Extract URI from result
    // ... parse createResult ...

    // Step 2: Add title cell
    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "markdown",
          content:
            "# Data Analysis\n\nAutomated workflow created by Datalayer Agent",
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    // Step 3: Add imports cell
    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "code",
          content: `import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Set visualization style
sns.set_style('whitegrid')
plt.rcParams['figure.figsize'] = (12, 6)`,
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    // Step 4: Add data loading template
    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "code",
          content: `# Load your data
# df = pd.read_csv('your_data.csv')
# df.head()`,
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    // Step 5: Add basic analysis cells
    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "code",
          content: `# Data shape and types
print(f"Shape: {df.shape}")
print("\\nData types:")
print(df.dtypes)`,
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "code",
          content: `# Summary statistics
df.describe()`,
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    await vscode.lm.invokeTool(
      "datalayer_insertCell",
      {
        input: {
          type: "code",
          content: `# Check for missing values
missing = df.isnull().sum()
missing[missing > 0]`,
        },
      },
      new vscode.CancellationTokenSource().token,
    );

    // Return notebook URI
    return null; // TODO: return actual URI
  } catch (error) {
    console.error("[DataAnalysisTemplate] Failed:", error);
    return null;
  }
}
```

**File**: `src/chat/workflows/notebookQuality.ts` (NEW)

```typescript
import * as vscode from "vscode";

/**
 * Analyze notebook quality and provide suggestions
 */
export async function analyzeNotebookQuality(
  notebookUri: vscode.Uri,
): Promise<QualityReport> {
  const report: QualityReport = {
    score: 100,
    issues: [],
    suggestions: [],
  };

  try {
    // Read all cells
    const cellsResult = await vscode.lm.invokeTool(
      "datalayer_readAllCells",
      { input: { uri: notebookUri.toString() } },
      new vscode.CancellationTokenSource().token,
    );

    // Parse cells from result
    const cells: any[] = []; // TODO: parse from cellsResult

    // Check 1: Documentation ratio
    const markdownCells = cells.filter((c) => c.type === "markdown").length;
    const codeCells = cells.filter((c) => c.type === "code").length;
    const totalCells = cells.length;

    if (markdownCells < totalCells * 0.2) {
      report.score -= 15;
      report.issues.push({
        severity: "warning",
        message: `Low documentation ratio: ${markdownCells}/${totalCells} cells are markdown`,
        location: "Overall",
      });
      report.suggestions.push("Add markdown cells to explain your analysis");
    }

    // Check 2: Cell length
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.type === "code" && cell.content.length > 500) {
        report.score -= 5;
        report.issues.push({
          severity: "info",
          message: `Cell ${i} is too long (${cell.content.length} characters)`,
          location: `Cell ${i}`,
        });
        report.suggestions.push(`Split cell ${i} into smaller, focused cells`);
      }
    }

    // Check 3: Code quality patterns
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.type !== "code") continue;

      // Avoid wildcard imports
      if (cell.content.includes("import *")) {
        report.score -= 5;
        report.issues.push({
          severity: "warning",
          message: "Wildcard import detected",
          location: `Cell ${i}`,
        });
        report.suggestions.push(
          `Cell ${i}: Import specific functions instead of using *`,
        );
      }

      // No print statements without context
      const printCount = (cell.content.match(/print\(/g) || []).length;
      if (printCount > 3) {
        report.score -= 3;
        report.issues.push({
          severity: "info",
          message: `Excessive print statements (${printCount})`,
          location: `Cell ${i}`,
        });
      }
    }
  } catch (error) {
    console.error("[NotebookQuality] Analysis failed:", error);
    report.score = 0;
    report.issues.push({
      severity: "error",
      message: `Analysis failed: ${error}`,
      location: "Overall",
    });
  }

  return report;
}

export interface QualityReport {
  score: number; // 0-100
  issues: QualityIssue[];
  suggestions: string[];
}

interface QualityIssue {
  severity: "error" | "warning" | "info";
  message: string;
  location: string;
}
```

---

## Proactive Assistance Features

### 1. Error Detection & Auto-Fix

**Concept**: Monitor notebook execution and offer fixes for common errors.

**Implementation**: Add to `DatalayerAgent` class:

```typescript
/**
 * Analyze error and suggest fix proactively
 */
async handleExecutionError(
  error: string,
  cellIndex: number,
  stream: vscode.ChatResponseStream
): Promise<boolean> {
  // Pattern 1: ModuleNotFoundError
  if (error.includes("ModuleNotFoundError")) {
    const moduleMatch = error.match(/No module named '([^']+)'/);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];

      stream.markdown(`\n💡 **Proactive Fix Available**\n\n`);
      stream.markdown(`Missing module: \`${moduleName}\`\n\n`);
      stream.markdown(`I can add an install cell before this cell. Proceed? (Reply with "yes")\n`);

      // In agent mode, just do it
      await vscode.lm.invokeTool(
        "datalayer_insertCell",
        {
          input: {
            index: cellIndex,
            type: "code",
            content: `!pip install ${moduleName}`
          }
        },
        new vscode.CancellationTokenSource().token
      );

      stream.markdown(`\n✅ Added install cell. Please run it and retry.\n`);
      return true;
    }
  }

  // Pattern 2: NameError (undefined variable)
  if (error.includes("NameError")) {
    stream.markdown(`\n💡 **Tip**: This variable may not be defined yet. Check previous cells.\n`);
    return false;
  }

  // Pattern 3: FileNotFoundError
  if (error.includes("FileNotFoundError")) {
    stream.markdown(`\n💡 **Tip**: File path may be incorrect. Check if the file exists.\n`);
    return false;
  }

  return false;
}
```

### 2. Best Practices Checker

**Concept**: Analyze code and suggest improvements automatically.

**Usage in Agent Mode**:

```typescript
// In agent workflow execution
if (
  step.description.includes("analyze") ||
  step.description.includes("review")
) {
  const qualityReport = await analyzeNotebookQuality(notebookUri);

  stream.markdown(`\n## 📊 Quality Report\n\n`);
  stream.markdown(`**Score**: ${qualityReport.score}/100\n\n`);

  if (qualityReport.issues.length > 0) {
    stream.markdown(`### Issues Found\n\n`);
    qualityReport.issues.forEach((issue) => {
      const icon =
        issue.severity === "error"
          ? "❌"
          : issue.severity === "warning"
            ? "⚠️"
            : "ℹ️";
      stream.markdown(`${icon} ${issue.message} _(${issue.location})_\n`);
    });
  }

  if (qualityReport.suggestions.length > 0) {
    stream.markdown(`\n### Suggestions\n\n`);
    qualityReport.suggestions.forEach((suggestion) => {
      stream.markdown(`- ${suggestion}\n`);
    });
  }
}
```

---

## VS Code Agent SDK Integration

### Agent Registration

**File**: `src/extension.ts` (MODIFY)

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // ... existing chat participant registration ...

  // Register Datalayer Agent (if Agent SDK available)
  if ((vscode as any).agent?.registerAgent) {
    console.log("[Datalayer] VS Code Agent SDK detected - registering agent");

    const datalayerAgentSDK = (vscode as any).agent.registerAgent({
      id: "datalayer-autonomous",
      displayName: "Datalayer Data Science Agent",
      description:
        "Autonomous agent for Jupyter notebook workflows with proactive assistance",

      capabilities: {
        multiTurn: true, // Execute across multiple turns
        autonomous: true, // Make decisions independently
        fileOperations: true, // Create/modify files
        terminalAccess: false, // No terminal (uses tools)
        workspaceAccess: true, // Access workspace files
      },

      // System prompt for agent mode
      systemPrompt: buildAgentSystemPrompt(),

      // Available tools (reuse existing 22)
      tools: vscode.lm.tools.filter((t) => t.name.startsWith("datalayer_")),

      // Handler
      handler: async (
        request: any,
        stream: vscode.ChatResponseStream,
        context: any,
        token: vscode.CancellationToken,
      ) => {
        const agent = new DatalayerAgent(context);
        return await agent.executeWorkflow(request.prompt, stream, token);
      },
    });

    context.subscriptions.push(datalayerAgentSDK);
  } else {
    console.log(
      "[Datalayer] Agent SDK not available - using chat participant only",
    );
  }
}

function buildAgentSystemPrompt(): string {
  return `You are an autonomous Datalayer Data Science Agent specialized in Jupyter notebooks.

Your role: Execute complex data science workflows autonomously with minimal user intervention.

Capabilities:
- Plan and execute multi-step workflows
- Create and modify Jupyter notebooks (.ipynb) and Lexical documents (.dlex)
- Execute code and validate results
- Detect errors and apply fixes proactively
- Suggest best practices and optimizations

Behavioral guidelines:
- Be autonomous: Execute without constant user confirmation
- Be proactive: Offer improvements when you detect issues
- Be resilient: Attempt recovery when steps fail
- Be thorough: Always validate results before claiming success
- Be specialized: Apply data science domain knowledge

Tool usage:
- Notebooks: Use *Cell tools (insertCell, updateCell, runCell, etc.)
- Lexical docs: Use *Block tools (insertBlock, updateBlock, runBlock, etc.)
- Always check kernel connection before running code
- Use readAllCells/readAllBlocks before making modifications

Remember: You are in AGENT MODE - autonomy is expected!`;
}
```

---

## Specialized Agent Behaviors

### 1. Data Science Workflow Templates

**File**: `src/chat/workflows/templates.ts` (NEW)

```typescript
export const DATA_SCIENCE_WORKFLOWS = {
  "exploratory-data-analysis": {
    name: "Exploratory Data Analysis",
    description: "Complete EDA workflow with visualizations",
    steps: [
      "Load data into pandas DataFrame",
      "Check data shape and types",
      "Display first and last rows",
      "Check for missing values",
      "Generate summary statistics",
      "Create correlation matrix heatmap",
      "Visualize distributions of numeric columns",
      "Check for outliers",
    ],
    requiredTools: ["insertCell", "executeCode", "runCell"],
  },

  "machine-learning-pipeline": {
    name: "Machine Learning Pipeline",
    description: "End-to-end ML workflow from data to model",
    steps: [
      "Load and explore data",
      "Split into training and test sets",
      "Feature engineering and preprocessing",
      "Train baseline model",
      "Hyperparameter tuning",
      "Evaluate on test set",
      "Visualize results and metrics",
    ],
    requiredTools: ["insertCell", "executeCode", "runCell"],
  },

  "data-visualization-report": {
    name: "Data Visualization Report",
    description: "Create publication-ready visualization report",
    steps: [
      "Create lexical document",
      "Add report title and introduction",
      "Add data loading section",
      "Create multiple visualization sections",
      "Add interpretations and insights",
      "Add conclusions section",
    ],
    requiredTools: ["createLexical", "insertBlock", "runBlock"],
  },
};

/**
 * Execute a pre-defined workflow template
 */
export async function executeWorkflowTemplate(
  templateKey: keyof typeof DATA_SCIENCE_WORKFLOWS,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const template = DATA_SCIENCE_WORKFLOWS[templateKey];

  stream.markdown(`# ${template.name}\n\n`);
  stream.markdown(`${template.description}\n\n`);
  stream.markdown(`## Steps\n\n`);

  template.steps.forEach((step, i) => {
    stream.markdown(`${i + 1}. ${step}\n`);
  });

  stream.markdown(
    `\n**Required tools**: ${template.requiredTools.join(", ")}\n\n`,
  );

  // Execute via DatalayerAgent
  const agent = new DatalayerAgent(/* context */);
  const taskDescription = `Execute the "${template.name}" workflow with these steps: ${template.steps.join("; ")}`;
  await agent.executeWorkflow(taskDescription, stream, token);
}
```

### 2. Interactive Tutorial Mode

**File**: `src/chat/tutorials/index.ts` (NEW)

```typescript
export const TUTORIALS = {
  "pandas-basics": {
    title: "Pandas Basics Tutorial",
    lessons: [
      {
        title: "Loading Data",
        explanation: "Learn how to load data from CSV files using pandas.",
        starterCode:
          "import pandas as pd\n\n# Load data\ndf = pd.read_csv('data.csv')",
        task: "Load your own CSV file",
        expectedOutput: "DataFrame with your data",
        hint: "Make sure the file path is correct",
      },
      {
        title: "Exploring Data",
        explanation: "Use head(), info(), and describe() to explore your data.",
        starterCode: "# Display first 5 rows\ndf.head()",
        task: "Explore your DataFrame's structure",
        expectedOutput: "Summary of data shape and types",
        hint: "Try df.info() and df.describe()",
      },
    ],
  },

  "matplotlib-visualization": {
    title: "Data Visualization with Matplotlib",
    lessons: [
      {
        title: "Basic Line Plot",
        explanation: "Create your first line plot with matplotlib.",
        starterCode:
          "import matplotlib.pyplot as plt\n\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.show()",
        task: "Create a line plot with your own data",
        expectedOutput: "A line plot visualization",
        hint: "Use plt.xlabel() and plt.ylabel() for labels",
      },
    ],
  },
};
```

---

# Implementation Timeline

## Phase 1: Core Fix (Week 1)

**Priority**: CRITICAL

- [ ] Fix context retention in `datalayerChatParticipant.ts`
  - [ ] Add `convertHistoryToMessages()` method
  - [ ] Modify message array building (lines 66-68)
  - [ ] Test multi-turn conversations
  - [ ] Verify tools still work correctly

**Testing**:

```
Turn 1: "@datalayer my favorite color is blue"
Turn 2: "@datalayer what is my favorite color?"
Expected: Should respond "blue"
```

## Phase 2: Basic Agent Mode (Week 2-3)

**Priority**: HIGH

- [ ] Create `DatalayerAgent` class
  - [ ] Implement workflow planning
  - [ ] Implement step execution
  - [ ] Add error recovery logic
- [ ] Add agent mode detection in chat participant
- [ ] Test with 2-3 simple workflows
  - [ ] "agent: create a data analysis notebook"
  - [ ] "agent: add visualization to current notebook"

**Testing**:

```
User: "agent: create a complete data analysis notebook"
Expected: Agent creates notebook with title, imports, data loading template, analysis cells
```

## Phase 3: Workflow Templates (Week 4)

**Priority**: MEDIUM

- [ ] Implement pre-built workflow templates
  - [ ] Data analysis template
  - [ ] Quality checker template
- [ ] Add template execution to agent
- [ ] Test template workflows

## Phase 4: Proactive Assistance (Week 5)

**Priority**: MEDIUM

- [ ] Add error detection & auto-fix
  - [ ] ModuleNotFoundError handler
  - [ ] NameError handler
  - [ ] FileNotFoundError handler
- [ ] Implement notebook quality analyzer
- [ ] Add best practices suggestions

## Phase 5: Agent SDK Integration (Week 6)

**Priority**: LOW (depends on VS Code API availability)

- [ ] Check for Agent SDK availability
- [ ] Register agent with SDK (if available)
- [ ] Test agent mode UI toggle
- [ ] Document agent capabilities

---

# Testing Strategy

## Unit Tests

### Context Retention Tests

```typescript
// test/chat/contextRetention.test.ts

suite("Context Retention", () => {
  test("Should preserve conversation history", async () => {
    const participant = new DatalayerChatParticipant(context);

    // Turn 1
    const turn1History: vscode.ChatContext = { history: [] };
    await participant.handleChatRequest(
      { prompt: "my name is Alice" },
      turn1History,
      mockStream,
      token,
    );

    // Turn 2 - add turn 1 to history
    const turn2History: vscode.ChatContext = {
      history: [
        { prompt: "my name is Alice" } as vscode.ChatRequestTurn,
        {
          response: [
            /* mock response */
          ],
        } as vscode.ChatResponseTurn,
      ],
    };

    await participant.handleChatRequest(
      { prompt: "what is my name?" },
      turn2History,
      mockStream,
      token,
    );

    // Assert: response should mention "Alice"
  });
});
```

### Agent Workflow Tests

```typescript
// test/chat/agent.test.ts

suite("Agent Workflows", () => {
  test("Should plan workflow from task description", async () => {
    const agent = new DatalayerAgent(context);
    const plan = await agent["planWorkflow"](
      "create data analysis notebook",
      token,
    );

    assert.ok(plan);
    assert.ok(plan.steps.length > 0);
    assert.ok(plan.requiredTools.includes("createNotebook"));
  });

  test("Should execute workflow steps", async () => {
    const agent = new DatalayerAgent(context);
    const step: WorkflowStep = {
      description: "Create notebook",
      toolCalls: ["datalayer_createNotebook"],
    };

    const result = await agent["executeStep"](step, mockStream, token);
    assert.strictEqual(result.success, true);
  });
});
```

## Integration Tests

### End-to-End Agent Workflow

```typescript
suite("E2E Agent Workflows", () => {
  test("Create complete data analysis notebook", async () => {
    const agent = new DatalayerAgent(context);

    await agent.executeWorkflow(
      "Create a complete data analysis notebook named test_analysis.ipynb",
      mockStream,
      token,
    );

    // Verify notebook was created
    // Verify cells were added
    // Verify structure is correct
  });
});
```

## Manual Testing

### Test Plan

1. **Context Retention**:

   ```
   Turn 1: @datalayer I'm working on a machine learning project
   Turn 2: @datalayer What am I working on?
   Expected: Should remember "machine learning project"
   ```

2. **Basic Agent Mode**:

   ```
   @datalayer agent: create a data analysis notebook
   Expected: Agent plans and executes workflow autonomously
   ```

3. **Error Recovery**:

   ```
   @datalayer agent: create notebook and run all cells
   Scenario: No kernel available
   Expected: Agent detects error, offers to select kernel
   ```

4. **Quality Checker**:
   ```
   @datalayer agent: analyze the quality of this notebook
   Expected: Agent provides quality score and suggestions
   ```

---

# Success Criteria

## Part 1: Context Retention

✅ **Must Have**:

- [ ] Model remembers information from previous turns
- [ ] System prompt only added on first turn
- [ ] Active document context refreshed on each turn
- [ ] All 22 tools continue working correctly
- [ ] No performance degradation with long conversations

## Part 2: Agent Mode

✅ **Must Have**:

- [ ] Agent can plan multi-step workflows from task descriptions
- [ ] Agent executes steps autonomously without constant user confirmation
- [ ] Error recovery works for at least 2 common error types
- [ ] At least 2 pre-built workflow templates functional

✅ **Nice to Have**:

- [ ] VS Code Agent SDK integration (if available)
- [ ] Proactive error detection and fixes
- [ ] Notebook quality analysis with actionable suggestions
- [ ] Interactive tutorial mode

---

# Risk Assessment

## Risk 1: Token Limits with Long Conversations

**Symptom**: Model requests fail with "context too long"

**Mitigation**:

- Add history truncation (keep last N turns)
- Implement conversation summarization for older turns

```typescript
const MAX_HISTORY_TURNS = 15;
const recentHistory = _context.history.slice(-MAX_HISTORY_TURNS);
```

## Risk 2: Agent Mode Too Autonomous

**Symptom**: Agent makes unwanted changes

**Mitigation**:

- Always show workflow plan before execution
- Add confirmation step for destructive operations
- Provide undo mechanism

## Risk 3: LLM Planning Failures

**Symptom**: Agent cannot create valid workflow plans

**Mitigation**:

- Fallback to pre-built templates when planning fails
- Provide clear error messages
- Allow user to guide planning process

## Risk 4: Tool Invocation Errors

**Symptom**: Agent workflow fails mid-execution

**Mitigation**:

- Robust error recovery logic
- Clear error messages to user
- Allow workflow continuation after fix

---

# Documentation Updates

## User-Facing Documentation

### README.md

Add section:

```markdown
## 🤖 Datalayer Agent Mode

The Datalayer extension includes an autonomous agent for complex data science workflows.

### Using Agent Mode

Prefix your message with `agent:` to activate autonomous mode:
```

@datalayer agent: create a complete data analysis notebook

```

The agent will:
1. Plan the workflow
2. Show you the plan
3. Execute all steps autonomously
4. Handle errors and recovery

### Example Workflows

**Create Data Analysis Notebook**:
```

@datalayer agent: create a data analysis notebook with imports, data loading, and visualization sections

```

**Analyze Notebook Quality**:
```

@datalayer agent: analyze the quality of this notebook and suggest improvements

```

```

### DEVELOPMENT.md

Add section:

```markdown
## Agent Mode Architecture

The Datalayer agent consists of:

- **DatalayerAgent** (`src/chat/datalayerAgent.ts`): Core autonomous agent engine
- **Workflow Templates** (`src/chat/workflows/`): Pre-built workflow definitions
- **Quality Analyzer** (`src/chat/workflows/notebookQuality.ts`): Code quality checker

### Adding New Workflows

1. Define workflow template in `src/chat/workflows/templates.ts`
2. Implement template logic
3. Add to agent planning knowledge
4. Test with manual invocations
```

---

# Future Enhancements

## Phase 6+ (Post-MVP)

- [ ] **Collaboration Features**
  - Multi-user notebook editing with agent assistance
  - Agent suggests improvements during pair programming

- [ ] **Performance Optimization Agent**
  - Profile notebook execution
  - Suggest performance improvements
  - Auto-apply safe optimizations

- [ ] **Data Pipeline Builder**
  - Agent constructs complete data pipelines
  - Automated testing and validation
  - Deploy to production environments

- [ ] **Interactive Tutorials**
  - Guided learning for pandas, matplotlib, sklearn
  - Real-time feedback on exercises
  - Adaptive difficulty based on user skill

- [ ] **Cloud Integration**
  - Agent deploys notebooks to Datalayer cloud
  - Manages remote execution
  - Handles scaling and resource allocation

---

# Appendix

## VS Code APIs Used

- `vscode.chat.createChatParticipant()` - Chat participant registration
- `vscode.lm.tools` - Access to registered tools
- `vscode.lm.invokeTool()` - Tool invocation
- `vscode.lm.selectChatModels()` - Model selection
- `vscode.ChatContext.history` - Conversation history (Part 1)
- `(vscode as any).agent.registerAgent()` - Agent SDK (if available)

## Tool Reference

All 22 Datalayer tools available to the agent:

### VS Code Operations (3)

- `datalayer_getActiveDocument`
- `datalayer_createNotebook`
- `datalayer_createLexical`

### Kernel Management (3)

- `datalayer_listKernels`
- `datalayer_selectKernel`
- `datalayer_executeCode`

### Notebook Cell Operations (7)

- `datalayer_insertCell`
- `datalayer_updateCell`
- `datalayer_deleteCells`
- `datalayer_readCell`
- `datalayer_readAllCells`
- `datalayer_runCell`
- `datalayer_runAllCells`

### Lexical Block Operations (9)

- `datalayer_insertBlock`
- `datalayer_insertBlocks`
- `datalayer_updateBlock`
- `datalayer_deleteBlocks`
- `datalayer_readBlock`
- `datalayer_readAllBlocks`
- `datalayer_runBlock`
- `datalayer_runAllBlocks`
- `datalayer_listAvailableBlocks`

---

**Last Updated**: 2026-02-01

**Plan Version**: 1.0

**Status**: Ready for Implementation
