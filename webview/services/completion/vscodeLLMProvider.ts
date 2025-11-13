/*
 * Copyright (c) 2024-2025 Datalayer, Inc.
 *
 * MIT License
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Type definitions for inline completion (not exported from published package)
interface IInlineCompletionProvider<T = any> {
  readonly name: string;
  readonly schema?: any;
  fetch(request: any, context: any): Promise<IInlineCompletionList<T>>;
}

interface IInlineCompletionContext {
  widget?: any;
  triggerKind?: any;
}

interface IInlineCompletionItem {
  insertText: string;
  [key: string]: any;
}

interface IInlineCompletionList<T = IInlineCompletionItem> {
  items: T[];
}

import { vsCodeAPI } from "../messageHandler";

/**
 * VS Code LLM-powered inline completion provider for Jupyter notebooks.
 *
 * Uses VS Code's Language Model API (Copilot and other registered LLM providers)
 * to provide intelligent code completions in notebook cells.
 */
export class VSCodeLLMProvider
  implements IInlineCompletionProvider<IInlineCompletionItem>
{
  readonly name = "VS Code Copilot";
  readonly identifier = "@vscode/llm-copilot";

  get schema() {
    return {
      default: {
        debouncerDelay: 200, // 200ms debounce (same as notebook-intelligence)
        timeout: 15000, // 15s timeout
      },
    };
  }

  /**
   * Fetch inline completion suggestions.
   *
   * @param request - Completion request with text and cursor offset
   * @param context - Completion context (notebook panel, active cell, etc.)
   * @returns Promise resolving to list of completion items
   */
  async fetch(
    request: any, // CompletionHandler.IRequest
    context: IInlineCompletionContext,
  ): Promise<IInlineCompletionList<IInlineCompletionItem>> {
    try {
      // Extract context from notebook cells
      const { prefix, suffix, language } = this.extractContext(
        request,
        context,
      );

      // Call VS Code Language Model API
      const completion = await this.getLLMCompletion(prefix, suffix, language);

      if (!completion) {
        return { items: [] };
      }

      // Extract only the NEW text (remove the prefix that's already typed)
      // The LLM returns the full completion, but we only want the part after the cursor
      let insertText = completion;

      // If completion starts with the prefix, remove the prefix
      if (completion.startsWith(prefix)) {
        insertText = completion.slice(prefix.length);
      } else {
        // Try to find where the completion overlaps with the prefix
        // This handles cases where LLM returns partial prefix + new text
        let overlap = 0;
        for (let i = 1; i <= Math.min(prefix.length, completion.length); i++) {
          if (prefix.endsWith(completion.substring(0, i))) {
            overlap = i;
          }
        }
        if (overlap > 0) {
          insertText = completion.slice(overlap);
        }
      }

      return {
        items: [
          {
            insertText,
          },
        ],
      };
    } catch (error) {
      console.error("[VSCodeLLMProvider] Error in fetch():", error);
      return { items: [] };
    }
  }

  /**
   * Extract context from notebook cells.
   *
   * Includes ALL cells before and after the active cell to provide maximum context.
   * Markdown cells are converted to comments.
   *
   * @param request - Completion request
   * @param context - Completion context
   * @returns Prefix, suffix, and language for LLM prompt
   */
  private extractContext(
    request: any, // CompletionHandler.IRequest
    context: IInlineCompletionContext,
  ): { prefix: string; suffix: string; language: string } {
    let prefix = "";
    let suffix = "";
    let language = "python";

    const preCursor = request.text.substring(0, request.offset);
    const postCursor = request.text.substring(request.offset);

    // Check if this is a notebook
    if (
      context.widget &&
      typeof context.widget === "object" &&
      "content" in context.widget &&
      context.widget.content &&
      typeof context.widget.content === "object" &&
      "widgets" in context.widget.content
    ) {
      const notebook = context.widget as any; // NotebookPanel
      const activeCell = notebook.content.activeCell;

      if (!activeCell) {
        return { prefix: preCursor, suffix: postCursor, language };
      }

      // Detect language from active cell
      if (activeCell.model.sharedModel.cell_type === "markdown") {
        language = "markdown";
      }

      let activeCellReached = false;

      // Include ALL cells (same as notebook-intelligence)
      for (const cell of notebook.content.widgets as any[]) {
        if (cell === activeCell) {
          activeCellReached = true;
        } else if (!activeCellReached) {
          // Cells ABOVE active cell
          prefix += this.cellToText(cell) + "\n";
        } else {
          // Cells BELOW active cell
          suffix += "\n" + this.cellToText(cell);
        }
      }

      // Add current cell content
      prefix += preCursor;
      suffix = postCursor + suffix;
    } else {
      // File editor (not notebook)
      prefix = preCursor;
      suffix = postCursor;
    }

    return { prefix, suffix, language };
  }

  /**
   * Convert cell to text for LLM context.
   *
   * Code cells are included as-is.
   * Markdown cells are converted to comments.
   *
   * @param cell - Notebook cell
   * @returns Cell content as text
   */
  private cellToText(cell: any): string {
    const cellModel = cell.model.sharedModel;
    const source = cellModel.source;

    if (cellModel.cell_type === "code") {
      return source;
    } else if (cellModel.cell_type === "markdown") {
      // Convert markdown to comments (same as notebook-intelligence)
      return source
        .split("\n")
        .map((line: string) => `# ${line}`)
        .join("\n");
    }

    return "";
  }

  /**
   * Get LLM completion via message passing to extension.
   *
   * @param prefix - Code before cursor
   * @param suffix - Code after cursor
   * @param language - Programming language
   * @returns Completion string or null if no models available
   */
  private async getLLMCompletion(
    prefix: string,
    suffix: string,
    language: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      // Generate request ID for matching response
      const requestId = Math.random().toString(36).substring(7);

      // Listen for response
      const handler = (event: MessageEvent) => {
        const message = event.data;
        if (
          message.type === "llm-completion-response" &&
          message.requestId === requestId
        ) {
          window.removeEventListener("message", handler);
          resolve(message.completion || null);
        }
      };

      window.addEventListener("message", handler);

      // Send request to extension
      vsCodeAPI.postMessage({
        type: "llm-completion-request",
        requestId,
        prefix,
        suffix,
        language,
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, 15000);
    });
  }
}
