import * as vscode from "vscode";
import { getActiveCustomEditorUri } from "../utils/activeDocument";

/**
 * Chat participant that provides context from Datalayer notebooks and lexical documents
 *
 * @example
 * ```
 * @datalayer explain this notebook
 * @datalayer what cells are in this document?
 * ```
 */
export class DatalayerChatParticipant {
  private participant: vscode.ChatParticipant | undefined;

  constructor(private context: vscode.ExtensionContext) {}

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

    // Add followup provider for better UX
    this.participant.followupProvider = {
      provideFollowups: async () => {
        return [
          {
            prompt: "Explain the structure of this document",
            label: "📄 Explain structure",
          },
          {
            prompt: "What are the main sections or cells?",
            label: "📑 Show sections",
          },
          {
            prompt: "Summarize the content",
            label: "📝 Summarize",
          },
        ];
      },
    };

    return this.participant;
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // Get the active editor/webview content
    const activeContext = await this.getActiveEditorContext();

    if (!activeContext) {
      stream.markdown(
        "No Datalayer notebook or lexical document is currently open.",
      );
      return;
    }

    // Select the Copilot model
    const [model] = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o",
    });

    if (!model) {
      stream.markdown("Copilot model not available.");
      return;
    }

    // Build the prompt with context
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are assisting with a ${activeContext.type}. Here is the current content:\n\n${activeContext.content}`,
      ),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    try {
      const chatResponse = await model.sendRequest(messages, {}, token);

      // Stream the response
      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        stream.markdown(`Error: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get context from the currently active Datalayer editor
   */
  private async getActiveEditorContext(): Promise<
    | { type: "notebook" | "lexical"; content: string; uri: vscode.Uri }
    | undefined
  > {
    const uri = getActiveCustomEditorUri();
    if (!uri) {
      return undefined;
    }

    // Check if it's a Datalayer notebook
    if (uri.path.endsWith(".ipynb")) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const notebook = JSON.parse(new TextDecoder().decode(content));

        // Extract cells content for context
        const cellsText = notebook.cells
          .map(
            (
              cell: { cell_type?: string; source?: string | string[] },
              index: number,
            ) => {
              const cellType = cell.cell_type;
              const source = Array.isArray(cell.source)
                ? cell.source.join("")
                : cell.source;
              return `Cell ${index + 1} (${cellType}):\n${source}`;
            },
          )
          .join("\n\n");

        return {
          type: "notebook",
          content: cellsText,
          uri,
        };
      } catch (error) {
        console.error("Failed to read notebook:", error);
        return undefined;
      }
    }

    // Check if it's a lexical document
    if (uri.path.endsWith(".lexical")) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const lexicalData = JSON.parse(new TextDecoder().decode(content));

        // Extract text content from lexical structure
        // This is a simplified version - you'd need to adapt based on your lexical structure
        const textContent = this.extractTextFromLexical(lexicalData);

        return {
          type: "lexical",
          content: textContent,
          uri,
        };
      } catch (error) {
        console.error("Failed to read lexical document:", error);
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Extract plain text from lexical JSON structure
   */
  private extractTextFromLexical(data: unknown): string {
    // This is a placeholder - you'll need to implement based on your lexical structure
    // For now, just stringify it
    if (typeof data === "string") {
      return data;
    }

    if (data && typeof data === "object") {
      // Try to extract text from common lexical structure
      const lexicalData = data as { root?: { children?: unknown[] } };
      if (lexicalData.root && lexicalData.root.children) {
        return this.extractTextFromNodes(lexicalData.root.children);
      }
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Recursively extract text from lexical nodes
   */
  private extractTextFromNodes(nodes: unknown[]): string {
    if (!Array.isArray(nodes)) {
      return "";
    }

    return nodes
      .map((node) => {
        const lexNode = node as { text?: string; children?: unknown[] };
        if (lexNode.text) {
          return lexNode.text;
        }
        if (lexNode.children) {
          return this.extractTextFromNodes(lexNode.children);
        }
        return "";
      })
      .join(" ");
  }
}
