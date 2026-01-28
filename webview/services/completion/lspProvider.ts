/*
 * Copyright (c) 2025 Datalayer, Inc.
 * MIT License
 */

/**
 * LSP completion provider for Python and Markdown cells.
 * Communicates with extension host to get LSP completions from Pylance and Markdown language servers.
 *
 * @module webview/services/completion/lspProvider
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vsCodeAPI } from "../messageHandler";

/**
 * Provider interface for inline code completions (from jupyter-ui).
 */
interface IInlineCompletionProvider<T = any> {
  readonly name: string;
  readonly identifier?: string;
  readonly schema?: any;
  fetch(request: any, context: any): Promise<IInlineCompletionList<T>>;
}

/**
 * List of completion items returned by a provider.
 */
interface IInlineCompletionList<T = IInlineCompletionItem> {
  items: T[];
}

/**
 * Individual completion item to be displayed as inline suggestion.
 */
interface IInlineCompletionItem {
  insertText: string;
  filterText?: string;
  isSnippet?: boolean;
  [key: string]: any;
}

/**
 * Context information for inline completion requests.
 */
interface IInlineCompletionContext {
  widget?: any;
  triggerKind?: any;
}

/**
 * Cell language type
 */
type CellLanguage = "python" | "markdown" | "unknown";

/**
 * LSP completion provider for notebook cells.
 * Supports Python (via Pylance) and Markdown (via built-in VS Code markdown LSP).
 */
export class LSPCompletionProvider implements IInlineCompletionProvider<IInlineCompletionItem> {
  /** Human-readable name displayed in UI */
  readonly name = "LSP (Python & Markdown)";

  /** Unique identifier for this completion provider */
  readonly identifier = "@datalayer/lsp-provider";

  /** Map of pending requests (requestId -> resolve function) */
  private pendingRequests = new Map<string, (items: any[]) => void>();

  /** Request counter for generating unique IDs */
  private requestCounter = 0;

  constructor() {
    // Listen for LSP responses from extension host
    window.addEventListener("message", this.handleMessage.bind(this));
  }

  get schema() {
    return {
      default: {
        debouncerDelay: 100, // 100ms debounce for LSP (faster than LLM)
        timeout: 1000, // 1s timeout for LSP
      },
    };
  }

  /**
   * Handle messages from extension host.
   */
  private handleMessage(event: MessageEvent): void {
    const message = event.data;

    if (message.type === "lsp-completion-response") {
      const resolver = this.pendingRequests.get(message.requestId);
      if (resolver) {
        resolver(message.completions || []);
        this.pendingRequests.delete(message.requestId);
      }
    } else if (message.type === "lsp-error") {
      // Error from extension - resolver will handle it
      const resolver = this.pendingRequests.get(message.requestId);
      if (resolver) {
        resolver([]); // Return empty on error
        this.pendingRequests.delete(message.requestId);
      }
    }
  }

  /**
   * Fetch completion suggestions from LSP.
   *
   * @param request - Completion request with text and cursor position
   * @param context - Completion context
   * @returns Promise resolving to list of completion items
   */
  async fetch(
    request: any, // CompletionHandler.IRequest
    context: IInlineCompletionContext,
  ): Promise<IInlineCompletionList<IInlineCompletionItem>> {
    try {
      // Detect cell language
      const language = this.detectCellLanguage(context);

      // Only provide LSP completions for Python and Markdown cells
      if (language === "unknown") {
        return { items: [] };
      }

      // Get cell ID from context
      const cellId = this.getCellId(context);
      if (!cellId) {
        return { items: [] };
      }

      // Get cursor position from request
      // The request provides an offset (character position in text), convert to line/character
      const position = this.offsetToPosition(
        request.text || "",
        request.offset || 0,
      );

      // Request completions from extension host
      const completions = await this.requestCompletions(
        cellId,
        language,
        position,
      );

      // Convert LSP completions to inline completion items
      // For inline completions, we need to extract just the SUFFIX (remaining text to type)
      // not the full completion text
      const items: IInlineCompletionItem[] = completions
        .map((item: any) => {
          let insertText = item.insertText || item.label;

          // Check if there's a textEdit with range information
          if (item.textEdit && item.textEdit.range) {
            const range = item.textEdit.range;
            const newText = item.textEdit.newText || insertText;

            // If the range starts before the cursor, we only want the suffix
            if (range.start.character < request.offset) {
              // Calculate how many characters are already typed
              const alreadyTyped = request.offset - range.start.character;
              // Extract just the suffix (remaining characters to insert)
              insertText = newText.substring(alreadyTyped);
            } else {
              insertText = newText;
            }
          }

          return {
            insertText,
            filterText: item.filterText || item.label,
            isSnippet: item.insertTextFormat === 2, // InsertTextFormat.Snippet
            detail: item.detail,
            documentation: item.documentation,
          };
        })
        .filter((item) => item.insertText.length > 0); // Filter out empty completions

      return { items };
    } catch (error) {
      return { items: [] };
    }
  }

  /**
   * Detect the language of the cell from the context.
   */
  private detectCellLanguage(context: IInlineCompletionContext): CellLanguage {
    const widget = context.widget;

    if (!widget || !widget.content || !widget.content.activeCell) {
      return "unknown";
    }

    const cell = widget.content.activeCell;

    // Check cell type
    if (cell.model.type === "markdown") {
      return "markdown";
    } else if (cell.model.type === "code") {
      // Check mime type for Python
      const mimeType = cell.model.mimeType;
      if (
        mimeType === "text/x-python" ||
        mimeType === "text/python" ||
        mimeType === "python" ||
        mimeType === "text/x-ipython" // IPython/Jupyter notebook cells
      ) {
        return "python";
      }
    }

    return "unknown";
  }

  /**
   * Get the cell ID from the context.
   */
  private getCellId(context: IInlineCompletionContext): string | null {
    const widget = context.widget;

    if (!widget || !widget.content || !widget.content.activeCell) {
      return null;
    }

    const cell = widget.content.activeCell;
    return cell.model.id || null;
  }

  /**
   * Convert character offset to line/character position.
   * @param text - The full text content
   * @param offset - Character offset in the text
   * @returns Line and character position (0-indexed)
   */
  private offsetToPosition(
    text: string,
    offset: number,
  ): { line: number; character: number } {
    let line = 0;
    let character = 0;

    for (let i = 0; i < offset && i < text.length; i++) {
      if (text[i] === "\n") {
        line++;
        character = 0;
      } else {
        character++;
      }
    }

    return { line, character };
  }

  /**
   * Request completions from extension host via postMessage.
   */
  private async requestCompletions(
    cellId: string,
    language: CellLanguage,
    position: { line: number; character: number },
  ): Promise<any[]> {
    const requestId = `lsp-${++this.requestCounter}`;

    // Send request to extension host
    const message = {
      type: "lsp-completion-request",
      requestId,
      cellId,
      language,
      position,
    };

    vsCodeAPI.postMessage(message);

    // Wait for response with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve([]);
      }, 15000); // 15 second timeout (Pylance needs time to analyze files)

      this.pendingRequests.set(requestId, (completions: any[]) => {
        clearTimeout(timeout);
        resolve(completions);
      });
    });
  }

  /**
   * Dispose of the provider and clean up resources.
   */
  dispose(): void {
    // Clear all pending requests
    this.pendingRequests.clear();
    window.removeEventListener("message", this.handleMessage.bind(this));
  }
}
