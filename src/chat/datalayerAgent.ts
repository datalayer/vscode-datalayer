import * as vscode from "vscode";

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  /** Step description shown to user */
  description: string;
  /** Tools to invoke for this step */
  toolCalls: string[];
  /** Indices of steps this depends on */
  dependencies: number[];
  /** Step parameters (optional) */
  params?: Record<string, unknown>;
}

/**
 * Workflow plan
 */
export interface WorkflowPlan {
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Required tool names */
  requiredTools: string[];
  /** Estimated complexity (low/medium/high) */
  complexity: "low" | "medium" | "high";
}

/**
 * Step execution result
 */
export interface StepResult {
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Step output data */
  output?: unknown;
}

/**
 * Error recovery result
 */
export interface RecoveryResult {
  /** Recovery success */
  success: boolean;
  /** Alternative step to try */
  alternativeStep?: WorkflowStep;
  /** Recovery message */
  message?: string;
}

/**
 * Autonomous agent for multi-turn workflow execution
 *
 * Provides autonomous execution capabilities for complex tasks that require
 * multiple tool invocations and decision-making without user intervention.
 *
 * @example
 * ```typescript
 * const agent = new DatalayerAgent(context);
 * await agent.executeWorkflow(
 *   "Create a data analysis notebook with pandas",
 *   stream,
 *   token
 * );
 * ```
 */
export class DatalayerAgent {
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Execute a high-level task autonomously across multiple steps
   *
   * @param taskDescription - Natural language task description
   * @param stream - Chat response stream for progress updates
   * @param token - Cancellation token
   */
  async executeWorkflow(
    taskDescription: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    stream.markdown(`## 🤖 Agent Mode: Autonomous Workflow\n\n`);
    stream.markdown(
      `Analyzing task: *${taskDescription.substring(0, 100)}${taskDescription.length > 100 ? "..." : ""}*\n\n`,
    );

    // Step 1: Plan the workflow
    stream.progress("Planning workflow...");
    const plan = await this.planWorkflow(taskDescription, stream, token);

    if (!plan) {
      stream.markdown(
        `\n❌ Unable to create workflow plan. Task may be too complex or ambiguous.\n`,
      );
      return;
    }

    // Step 2: Show plan to user
    stream.markdown(`### 📋 Workflow Plan (${plan.steps.length} steps)\n\n`);
    plan.steps.forEach((step, i) => {
      stream.markdown(`${i + 1}. ${step.description}\n`);
    });
    stream.markdown(
      `\n**Complexity**: ${plan.complexity} | **Tools**: ${plan.requiredTools.join(", ")}\n\n`,
    );

    // Step 3: Execute each step autonomously
    let completedSteps = 0;
    for (let i = 0; i < plan.steps.length; i++) {
      if (token.isCancellationRequested) {
        stream.markdown(`\n⚠️ Workflow cancelled by user.\n`);
        return;
      }

      const step = plan.steps[i];
      stream.progress(`Step ${i + 1}/${plan.steps.length}: ${step.description}`);
      stream.markdown(`\n---\n### Step ${i + 1}: ${step.description}\n\n`);

      const result = await this.executeStep(step, stream, token);

      if (!result.success) {
        stream.markdown(`\n⚠️ Step failed: ${result.error}\n\n`);

        // Attempt recovery
        stream.progress("Attempting error recovery...");
        const recovery = await this.attemptRecovery(step, result.error || "");

        if (!recovery.success) {
          stream.markdown(
            `\n❌ Cannot recover from error. Workflow stopped at step ${i + 1}.\n`,
          );
          stream.markdown(
            `\n**Completed**: ${completedSteps}/${plan.steps.length} steps\n`,
          );
          return;
        }

        stream.markdown(`\n💡 Recovery: ${recovery.message}\n`);

        // Retry with alternative approach
        if (recovery.alternativeStep) {
          const retryResult = await this.executeStep(
            recovery.alternativeStep,
            stream,
            token,
          );
          if (!retryResult.success) {
            stream.markdown(`\n❌ Recovery failed. Stopping workflow.\n`);
            return;
          }
        }
      }

      completedSteps++;
      stream.markdown(`\n✅ Step ${i + 1} completed\n`);
    }

    // Workflow complete
    stream.markdown(
      `\n---\n## ✅ Workflow Completed Successfully!\n\n**Completed**: ${completedSteps}/${plan.steps.length} steps\n`,
    );
  }

  /**
   * Plan a workflow by decomposing task into steps
   *
   * Uses LLM to analyze the task and generate a structured plan with tool invocations.
   *
   * @param task - Natural language task description
   * @param stream - Chat response stream
   * @param token - Cancellation token
   * @returns Workflow plan or null if planning fails
   */
  private async planWorkflow(
    task: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<WorkflowPlan | null> {
    try {
      // Get available tools
      const datalayerTools = vscode.lm.tools.filter((t) =>
        t.name.startsWith("datalayer_"),
      );

      // Select planning model
      const [model] = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4o",
      });

      if (!model) {
        return null;
      }

      // Create planning prompt
      const planningPrompt = this.buildPlanningPrompt(task, datalayerTools);
      const messages = [vscode.LanguageModelChatMessage.User(planningPrompt)];

      // Request plan from LLM
      const response = await model.sendRequest(messages, {}, token);

      let planText = "";
      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          planText += part.value;
        }
      }

      // Parse the plan (expect JSON format)
      return this.parsePlan(planText, datalayerTools);
    } catch (error) {
      console.error("[DatalayerAgent] Planning failed:", error);
      return null;
    }
  }

  /**
   * Build a prompt for workflow planning
   */
  private buildPlanningPrompt(
    task: string,
    tools: vscode.LanguageModelChatTool[],
  ): string {
    const toolList = tools
      .map((t) => `- ${t.name.replace("datalayer_", "")}: ${t.description}`)
      .join("\n");

    return `You are a workflow planning assistant. Decompose this task into executable steps using available Datalayer tools.

**Task**: ${task}

**Available Tools**:
${toolList}

**Instructions**:
1. Break the task into 3-8 clear, sequential steps
2. Each step should use specific Datalayer tools
3. Consider dependencies between steps
4. Return a JSON object with this structure:

\`\`\`json
{
  "steps": [
    {
      "description": "Step description",
      "toolCalls": ["tool_name_1", "tool_name_2"],
      "dependencies": []
    }
  ],
  "complexity": "low|medium|high"
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
  }

  /**
   * Parse workflow plan from LLM response
   */
  private parsePlan(
    planText: string,
    tools: vscode.LanguageModelChatTool[],
  ): WorkflowPlan | null {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = planText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : planText;

      const parsed = JSON.parse(jsonText);

      // Validate plan structure
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        return null;
      }

      // Extract required tools
      const requiredTools = new Set<string>();
      for (const step of parsed.steps) {
        if (step.toolCalls) {
          step.toolCalls.forEach((tool: string) =>
            requiredTools.add(tool.replace("datalayer_", "")),
          );
        }
      }

      return {
        steps: parsed.steps,
        requiredTools: Array.from(requiredTools),
        complexity: parsed.complexity || "medium",
      };
    } catch (error) {
      console.error("[DatalayerAgent] Failed to parse plan:", error);
      return null;
    }
  }

  /**
   * Execute a single workflow step
   *
   * @param step - Step to execute
   * @param stream - Chat response stream
   * @param token - Cancellation token
   * @returns Execution result
   */
  private async executeStep(
    step: WorkflowStep,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<StepResult> {
    try {
      // Execute tool calls for this step
      for (const toolName of step.toolCalls) {
        const fullToolName = toolName.startsWith("datalayer_")
          ? toolName
          : `datalayer_${toolName}`;

        stream.markdown(`Calling tool: \`${toolName}\`...\n`);

        const toolResult = await vscode.lm.invokeTool(
          fullToolName,
          {
            input: step.params || {},
            toolInvocationToken: undefined as any, // Agent mode doesn't have token
          },
          token,
        );

        // Extract result text
        const resultText = toolResult.content
          .map((c) =>
            typeof c === "string"
              ? c
              : c instanceof vscode.LanguageModelTextPart
                ? c.value
                : "",
          )
          .join("\n");

        stream.markdown(`Result: ${resultText.substring(0, 200)}\n`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Attempt to recover from step failure
   *
   * @param failedStep - Step that failed
   * @param error - Error message
   * @returns Recovery result with alternative approach
   */
  private async attemptRecovery(
    failedStep: WorkflowStep,
    error: string,
  ): Promise<RecoveryResult> {
    // Simple recovery strategies
    // TODO: Use LLM to generate more sophisticated recovery plans

    // Strategy 1: If kernel/runtime not found, suggest starting one
    if (error.includes("kernel") || error.includes("runtime")) {
      return {
        success: true,
        message:
          "Kernel not available. Please connect to a kernel or start a runtime first.",
        alternativeStep: {
          description: "Connect to available kernel",
          toolCalls: ["listKernels", "selectKernel"],
          dependencies: [],
        },
      };
    }

    // Strategy 2: If document not found, suggest creating one
    if (error.includes("document") || error.includes("not found")) {
      return {
        success: true,
        message: "Document not found. Consider creating a new document first.",
        alternativeStep: {
          description: "Create new notebook",
          toolCalls: ["createNotebook"],
          dependencies: [],
        },
      };
    }

    // Strategy 3: No recovery available
    return {
      success: false,
      message: `Unable to recover from error: ${error}`,
    };
  }

  /**
   * Analyze notebook and suggest improvements (proactive assistance)
   *
   * @param stream - Chat response stream
   * @param token - Cancellation token
   */
  async analyzeAndSuggest(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    stream.markdown(`## 🔍 Proactive Analysis\n\n`);
    stream.progress("Analyzing current document...");

    try {
      // Get active document
      const docResult = await vscode.lm.invokeTool(
        "datalayer_getActiveDocument",
        { input: {}, toolInvocationToken: undefined as any },
        token,
      );

      const docContent = docResult.content[0];
      const docText =
        typeof docContent === "string" ? docContent : docContent.value;

      // Parse document info
      let docData: any;
      try {
        docData = JSON.parse(docText);
      } catch {
        stream.markdown(`No active document to analyze.\n`);
        return;
      }

      // Provide suggestions based on document state
      stream.markdown(`### Suggestions\n\n`);

      if (docData.type === "notebook") {
        stream.markdown(`📓 **Notebook Tips**:\n`);
        stream.markdown(
          `- Add markdown cells to document your analysis\n- Use meaningful variable names\n- Consider splitting long cells into smaller ones\n`,
        );
      } else if (docData.type === "lexical") {
        stream.markdown(`📝 **Lexical Document Tips**:\n`);
        stream.markdown(
          `- Use headings to structure your document\n- Add jupyter-cell blocks for executable code\n- Consider using collapsible blocks for long content\n`,
        );
      }

      if (!docData.hasKernel) {
        stream.markdown(`\n⚠️ **No kernel connected** - Connect to run code\n`);
      }
    } catch (error) {
      console.error("[DatalayerAgent] Analysis failed:", error);
      stream.markdown(`Analysis unavailable.\n`);
    }
  }
}
