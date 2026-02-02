import * as vscode from "vscode";
import { DatalayerAgent } from "./datalayerAgent";

/**
 * Chat participant that provides context from Datalayer notebooks and lexical documents
 *
 * Supports two modes:
 * 1. **Chat Mode** (default): Interactive assistance with tool invocation
 * 2. **Agent Mode**: Autonomous multi-step workflow execution (use "agent:" prefix)
 *
 * Uses Datalayer tools to interact with notebooks and lexical documents.
 * Always calls getActiveDocument first, then listAvailableBlocks for lexical documents.
 *
 * @example
 * ```
 * @datalayer connect to pyodide, insert a fibonacci cell, and run all cells
 * @datalayer explain this notebook
 * @datalayer what cells are in this document?
 * @datalayer agent: create a complete data analysis notebook with pandas
 * ```
 */
export class DatalayerChatParticipant {
  private participant: vscode.ChatParticipant | undefined;
  private agent: DatalayerAgent;

  constructor(private context: vscode.ExtensionContext) {
    this.agent = new DatalayerAgent(context);
  }

  public register(): vscode.Disposable {
    // Create the chat participant
    this.participant = vscode.chat.createChatParticipant(
      "datalayer",
      this.handleChatRequest.bind(this),
    );

    // Use the same icon as the sidebar
    this.participant.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "images",
      "datalayer-sidebar-icon.svg",
    );

    // No followup suggestions - keep chat simple
    // User can type their own requests

    return this.participant;
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // Check for agent mode activation
    const agentModePrefix = "agent:";
    const isAgentMode = request.prompt.toLowerCase().startsWith(agentModePrefix);

    if (isAgentMode) {
      // Route to autonomous agent
      const task = request.prompt.substring(agentModePrefix.length).trim();
      return await this.agent.executeWorkflow(task, stream, token);
    }

    // Check for proactive analysis command
    if (
      request.prompt.toLowerCase().includes("analyze") &&
      request.prompt.toLowerCase().includes("suggest")
    ) {
      return await this.agent.analyzeAndSuggest(stream, token);
    }

    // Standard chat mode (existing logic)
    // Select the Copilot model
    const [model] = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o",
    });

    if (!model) {
      stream.markdown("Copilot model not available.");
      return;
    }

    // Get all registered Datalayer tools
    const allTools = vscode.lm.tools;
    const datalayerTools = allTools.filter((tool) =>
      tool.name.startsWith("datalayer_"),
    );

    // Convert conversation history to messages
    const historyMessages = this.convertHistoryToMessages(_context.history);

    // Build messages array with history
    const messages: vscode.LanguageModelChatMessage[] = [];
    if (historyMessages.length === 0) {
      // First turn - add system prompt
      const systemPrompt = this.buildSimpleSystemPrompt();
      messages.push(vscode.LanguageModelChatMessage.User(systemPrompt));
    } else {
      // Subsequent turns - include history
      messages.push(...historyMessages);
    }

    try {
      // STEP 1: Always call getActiveDocument first
      stream.progress("Getting active document...");
      const activeDocResult = await vscode.lm.invokeTool(
        "datalayer_getActiveDocument",
        {
          input: {},
          toolInvocationToken: request.toolInvocationToken,
        },
        token,
      );

      // Parse the active document result
      const activeDocContent = activeDocResult.content[0] as
        | string
        | vscode.LanguageModelTextPart;
      const activeDocText =
        typeof activeDocContent === "string"
          ? activeDocContent
          : activeDocContent.value;

      let documentType: string | undefined;
      try {
        const activeDocData = JSON.parse(activeDocText);
        documentType = activeDocData.type;
      } catch {
        // If parsing fails, continue without type detection
      }

      // Add active document context to messages
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `Active document information:\n${activeDocText}`,
        ),
      );

      // STEP 2: If it's a lexical document, call listAvailableBlocks
      if (documentType === "lexical") {
        stream.progress("Listing available blocks for Lexical document...");
        try {
          const availableBlocksResult = await vscode.lm.invokeTool(
            "datalayer_listAvailableBlocks",
            {
              input: { type: "all" },
              toolInvocationToken: request.toolInvocationToken,
            },
            token,
          );

          const blocksContent = availableBlocksResult.content[0] as
            | string
            | vscode.LanguageModelTextPart;
          const blocksText =
            typeof blocksContent === "string"
              ? blocksContent
              : blocksContent.value;

          // Add available blocks context to messages
          messages.push(
            vscode.LanguageModelChatMessage.User(
              `Available block types:\n${blocksText}`,
            ),
          );
        } catch (error) {
          // If listAvailableBlocks fails, continue without it
          console.warn("Failed to get available blocks:", error);
        }
      }

      // STEP 3: Add user's request
      messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

      // STEP 4: Send request with tools enabled
      await this.processModelResponse(
        model,
        messages,
        datalayerTools,
        stream,
        request,
        token,
      );
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        stream.markdown(`Error: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Process model response and handle tool calls in a loop
   */
  private async processModelResponse(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    tools: vscode.LanguageModelChatTool[],
    stream: vscode.ChatResponseStream,
    request: vscode.ChatRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const chatResponse = await model.sendRequest(messages, { tools }, token);

    // Process response stream, handling tool calls
    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

    for await (const part of chatResponse.stream) {
      if (part instanceof vscode.LanguageModelToolCallPart) {
        // Tool call detected - collect it
        toolCalls.push(part);
        stream.progress(`Calling tool: ${part.name}...`);
      } else if (part instanceof vscode.LanguageModelTextPart) {
        // Regular text response
        stream.markdown(part.value);
      }
    }

    // If we got tool calls, execute them and continue the conversation
    if (toolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push(vscode.LanguageModelChatMessage.Assistant(toolCalls));

      // Execute all tool calls
      const toolResults: vscode.LanguageModelToolResultPart[] = [];
      for (const toolCall of toolCalls) {
        try {
          const toolResult = await vscode.lm.invokeTool(
            toolCall.name,
            {
              input: toolCall.input,
              toolInvocationToken: request.toolInvocationToken,
            },
            token,
          );

          toolResults.push(
            new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              toolResult.content,
            ),
          );

          stream.markdown(`\n\n✅ Tool ${toolCall.name} executed\n\n`);
        } catch (toolError) {
          const errorMessage =
            toolError instanceof Error ? toolError.message : String(toolError);
          stream.markdown(
            `\n\n❌ Tool ${toolCall.name} failed: ${errorMessage}\n\n`,
          );

          // Add error as tool result (wrap string in array)
          toolResults.push(
            new vscode.LanguageModelToolResultPart(toolCall.callId, [
              `Error: ${errorMessage}`,
            ]),
          );
        }
      }

      // Add tool results to conversation
      messages.push(vscode.LanguageModelChatMessage.User(toolResults));

      // Get final response from model with tool results (recursive)
      await this.processModelResponse(
        model,
        messages,
        tools,
        stream,
        request,
        token,
      );
    }
  }

  /**
   * Convert VS Code chat history to language model messages.
   * Extracts user prompts and assistant responses from previous turns.
   */
  private convertHistoryToMessages(
    history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>,
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
            ]),
          );
        }
      }
    }

    return messages;
  }

  /**
   * Build a simple system prompt that instructs the model to use Datalayer tools
   */
  private buildSimpleSystemPrompt(): string {
    return `You are a Datalayer assistant helping with Jupyter Notebooks (.ipynb) and Lexical Documents (.dlex).

CRITICAL INFORMATION ABOUT DATALAYER DOCUMENT TYPES:

1. **Jupyter Notebooks (.ipynb files)**:
   - Traditional notebook format with cells (code/markdown)
   - Use tools like: insertCell, updateCell, deleteCells, runCell, readAllCells
   - Does NOT support jupyter-cell blocks (cells are the native format)

2. **Lexical Documents (.dlex files)**:
   - Rich document format with multiple block types
   - IMPORTANT: Lexical documents CAN contain EXECUTABLE JUPYTER CELLS via jupyter-cell blocks
   - Use tools like: insertBlock, updateBlock, deleteBlocks, runBlock, readAllBlocks
   - Block types include: paragraph, heading, code (non-executable), **jupyter-cell (executable)**, table, collapsible, quote, list, equation, image, youtube, horizontalrule
   - To insert executable code: use insertBlock with type="jupyter-cell" (NOT insertCell)

ALWAYS use Datalayer tools when working with these documents.`;
  }
}
