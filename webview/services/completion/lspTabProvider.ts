/*
 * Copyright (c) 2025 Datalayer, Inc.
 * MIT License
 */

/**
 * LSP Tab completion provider for Python and Markdown cells.
 * Shows dropdown menu with completion suggestions from Pylance and Markdown language servers.
 * This is separate from inline (ghost text) completions.
 *
 * @module webview/services/completion/lspTabProvider
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { CompletionHandler } from "@jupyterlab/completer";
import { vsCodeAPI, MessageHandler, Disposable } from "../messageHandler";

/**
 * Cell language type
 */
type CellLanguage = "python" | "markdown" | "unknown";

/**
 * LSP Tab completion provider for notebook cells.
 * Provides dropdown menu completions (triggered by Tab key).
 * Supports Python (via Pylance) and Markdown (via built-in VS Code markdown LSP).
 */
export class LSPTabCompletionProvider {
  /** Unique identifier for this provider */
  readonly identifier = "@datalayer/lsp-tab-provider";

  /** Human-readable name displayed in UI */
  readonly name = "LSP (Python & Markdown)";

  /** Provider rank - higher rank = higher priority (600 > kernel's 550) */
  readonly rank = 600;

  /** Map of pending requests (requestId -> resolve function) */
  private pendingRequests = new Map<string, (items: any[]) => void>();

  /** Request counter for generating unique IDs */
  private requestCounter = 0;

  /** Message handler disposable for cleanup */
  private messageHandlerDisposable: Disposable;

  /** Cache of in-flight requests to avoid duplicates (cacheKey -> Promise) */
  private inflightCache = new Map<string, Promise<any[]>>();

  constructor() {
    // Register with central MessageHandler instead of window.addEventListener
    // This is CRITICAL - MessageHandler.instance is the singleton that receives all messages
    this.messageHandlerDisposable = MessageHandler.instance.on(
      this.handleMessage.bind(this),
    );

    console.log(
      "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Registered with MessageHandler",
    );
  }

  /**
   * Check if this provider is applicable to the current context.
   * Returns true for Python and Markdown cells (LSP works without kernel).
   *
   * @param context - Completion context with widget, editor, session
   * @returns Promise resolving to true if provider should be used
   */
  async isApplicable(context: any): Promise<boolean> {
    // LSP completions work without a kernel, unlike KernelCompleterProvider
    // Just check if we have a valid cell with supported language
    const language = this.detectCellLanguage(context);
    const isSupported = language === "python" || language === "markdown";

    console.log(
      `🔍🔍🔍 [LSP-DEBUG-TabProvider] isApplicable called: language=${language}, supported=${isSupported}`,
    );

    return isSupported;
  }

  /**
   * Handle messages from extension host.
   * Called by MessageHandler with the message data directly (not MessageEvent).
   */
  private handleMessage(message: any): void {
    // Log ALL messages to see what's coming through
    if (message.type?.startsWith("lsp-")) {
      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Received message from extension:",
        {
          type: message.type,
          requestId: message.requestId,
          completionsCount: message.completions?.length,
          completionLabels: message.completions?.map((c: any) => c.label),
        },
      );
    }

    if (message.type === "lsp-completion-response") {
      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Looking for resolver:",
        message.requestId,
      );
      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Pending requests:",
        Array.from(this.pendingRequests.keys()),
      );

      const resolver = this.pendingRequests.get(message.requestId);
      if (resolver) {
        console.log(
          "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Resolving with completions:",
          message.completions,
        );
        resolver(message.completions || []);
        this.pendingRequests.delete(message.requestId);
      } else {
        console.warn(
          "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] No resolver found for requestId:",
          message.requestId,
        );
      }
    } else if (message.type === "lsp-error") {
      console.error(
        `🔍🔍🔍 [LSP-DEBUG-TabProvider] Error from extension: ${message.error}`,
      );
      const resolver = this.pendingRequests.get(message.requestId);
      if (resolver) {
        resolver([]); // Return empty on error
        this.pendingRequests.delete(message.requestId);
      }
    }
  }

  /**
   * Fetch completion suggestions from LSP for dropdown menu.
   *
   * @param request - Completion request with text and cursor position
   * @param context - Completion context with widget, editor, session
   * @returns Promise resolving to completion reply for dropdown
   */
  async fetch(
    request: CompletionHandler.IRequest,
    context: any,
  ): Promise<CompletionHandler.ICompletionItemsReply> {
    console.log("🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] fetch() called", {
      offset: request.offset,
      text: request.text,
    });

    try {
      // Detect cell language
      const language = this.detectCellLanguage(context);
      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Detected language:",
        language,
      );

      // Only provide LSP completions for Python and Markdown cells
      if (language === "unknown") {
        console.log(
          "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Skipping: unknown language",
        );
        return { start: request.offset, end: request.offset, items: [] };
      }

      // Get cell ID from context
      const cellId = this.getCellId(context);
      if (!cellId) {
        console.log(
          "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Skipping: no cell ID",
        );
        return { start: request.offset, end: request.offset, items: [] };
      }

      // Get cursor position from request
      const position = this.offsetToPosition(
        request.text || "",
        request.offset || 0,
      );

      console.log(
        `🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Requesting completions for cell ${cellId} (${language}) at ${position.line}:${position.character}`,
      );

      // Request completions from extension host
      const completions = await this.requestCompletions(
        cellId,
        language,
        position,
      );

      console.log(
        `🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Received ${completions.length} completions:`,
        completions.map((c: any) => c.label),
      );

      // Convert LSP completions to JupyterLab dropdown format
      const items = completions.map((item: any) => {
        // Extract insert text
        const insertText = item.insertText || item.label;

        // Determine range for replacement
        let start = request.offset;
        let end = request.offset;

        if (item.textEdit && item.textEdit.range) {
          // Use textEdit range if available
          const range = item.textEdit.range;
          start = this.positionToOffset(request.text, range.start);
          end = this.positionToOffset(request.text, range.end);
        } else {
          // Calculate the start of the current word being completed
          // Look backward from cursor to find where the word starts
          const text = request.text || "";
          let wordStart = request.offset;

          // Find the start of the current word (alphanumeric + underscore)
          while (wordStart > 0 && /[a-zA-Z0-9_]/.test(text[wordStart - 1])) {
            wordStart--;
          }

          start = wordStart;
          end = request.offset;

          console.log(
            "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Calculated word range:",
            {
              text: text.substring(
                Math.max(0, wordStart - 10),
                request.offset + 10,
              ),
              wordStart,
              offset: request.offset,
              word: text.substring(wordStart, request.offset),
            },
          );
        }

        return {
          label: item.label,
          insertText: insertText,
          type: this.convertCompletionKind(item.kind),
          documentation: item.documentation,
          detail: item.detail,
          sortText: item.sortText,
          filterText: item.filterText || item.label,
          start,
          end,
        };
      });

      // Return in JupyterLab format
      // Use the minimum start and maximum end from all items
      const minStart =
        items.length > 0
          ? Math.min(...items.map((i) => i.start))
          : request.offset;
      const maxEnd =
        items.length > 0
          ? Math.max(...items.map((i) => i.end))
          : request.offset;

      const result = {
        start: minStart,
        end: maxEnd,
        items: items,
      };

      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Returning completion reply:",
        {
          start: result.start,
          end: result.end,
          itemCount: result.items.length,
          itemLabels: result.items.map((i: any) => i.label),
          firstItemFull: items[0], // Log FULL first item for debugging
        },
      );

      // Auto-apply single completion results
      if (items.length === 1 && context.editor) {
        console.log(
          "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Single completion - auto-applying:",
          items[0].label,
        );

        // Declare variables outside try block for catch block access
        const editor = context.editor;
        const model = editor.model;
        const text = request.text || "";
        const beforeCompletion = text.substring(0, minStart);
        const afterCompletion = text.substring(maxEnd);
        const expectedText =
          beforeCompletion + items[0].insertText + afterCompletion;

        try {
          const cursorPos = editor.getCursorPosition();

          // Get current text from model (may have changed since request started)
          const currentText = model.sharedModel.getSource();

          // Check if completion is already applied (prevents duplicate application from racing fetch() calls)
          if (currentText === expectedText) {
            console.log(
              "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Completion already applied, skipping",
            );
            return { start: request.offset, end: request.offset, items: [] };
          }

          console.log(
            "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Applying completion:",
            {
              beforeCompletion,
              insertText: items[0].insertText,
              afterCompletion,
              expectedText,
              currentText,
              oldCursorPos: cursorPos,
            },
          );

          // Update the model
          model.sharedModel.setSource(expectedText);

          // Set cursor position after the inserted text
          // Calculate new column position on the same line
          const charsAdded = items[0].insertText.length;

          // Find the column offset of minStart on the current line
          const lineStartOffset = text.lastIndexOf("\n", minStart) + 1;
          const columnOffsetOfMinStart = minStart - lineStartOffset;

          // New column = where we started replacing + length of inserted text
          const newColumn = columnOffsetOfMinStart + charsAdded;

          const newPosition = { line: cursorPos.line, column: newColumn };

          console.log(
            "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Setting cursor position:",
            {
              oldPosition: cursorPos,
              minStart,
              maxEnd,
              lineStartOffset,
              columnOffsetOfMinStart,
              charsAdded,
              newColumn,
              newPosition,
            },
          );

          // Try to set cursor position, but don't fail if it errors
          // The text update is what matters most
          try {
            editor.setCursorPosition(newPosition);
          } catch (cursorError) {
            console.error(
              "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Cursor positioning failed (text was still updated):",
              cursorError,
            );
          }

          // CRITICAL: Return empty items even if cursor positioning failed
          // The text was updated, so we must prevent dropdown from showing
          return { start: request.offset, end: request.offset, items: [] };
        } catch (error) {
          console.error(
            "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Error auto-applying completion:",
            error,
          );
          // Only fall through if the text update itself failed
          // Check if text was updated anyway (race condition)
          const currentText = model.sharedModel.getSource();
          const expectedText =
            beforeCompletion + items[0].insertText + afterCompletion;
          if (currentText === expectedText) {
            // Text was updated despite error, return empty to prevent dropdown
            console.log(
              "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Text was updated despite error, preventing dropdown",
            );
            return { start: request.offset, end: request.offset, items: [] };
          }
          // Fall through to return the result normally
        }
      }

      return result;
    } catch (error) {
      console.error(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Error fetching completions:",
        error,
      );
      return { start: request.offset, end: request.offset, items: [] };
    }
  }

  /**
   * Convert VS Code CompletionItemKind to JupyterLab completion type.
   */
  private convertCompletionKind(kind: number | undefined): string {
    if (!kind) {
      return "text";
    }

    // VS Code CompletionItemKind enum values
    // https://code.visualstudio.com/api/references/vscode-api#CompletionItemKind
    switch (kind) {
      case 0: // Text
        return "text";
      case 1: // Method
        return "method";
      case 2: // Function
        return "function";
      case 3: // Constructor
        return "constructor";
      case 4: // Field
        return "field";
      case 5: // Variable
        return "variable";
      case 6: // Class
        return "class";
      case 7: // Interface
        return "interface";
      case 8: // Module
        return "module";
      case 9: // Property
        return "property";
      case 10: // Unit
        return "unit";
      case 11: // Value
        return "value";
      case 12: // Enum
        return "enum";
      case 13: // Keyword
        return "keyword";
      case 14: // Snippet
        return "snippet";
      case 15: // Color
        return "color";
      case 16: // File
        return "file";
      case 17: // Reference
        return "reference";
      case 18: // Folder
        return "folder";
      case 19: // EnumMember
        return "enum-member";
      case 20: // Constant
        return "constant";
      case 21: // Struct
        return "struct";
      case 22: // Event
        return "event";
      case 23: // Operator
        return "operator";
      case 24: // TypeParameter
        return "type-parameter";
      default:
        return "text";
    }
  }

  /**
   * Detect the language of the active cell from context.
   */
  private detectCellLanguage(context: any): CellLanguage {
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
      console.warn(
        `🔍🔍🔍 [LSP-DEBUG-TabProvider] Code cell with unsupported mimeType: ${mimeType}`,
      );
    }

    return "unknown";
  }

  /**
   * Get the cell ID from the context.
   */
  private getCellId(context: any): string | null {
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
   * Convert line/character position to character offset.
   * @param text - The full text content
   * @param position - Line and character position
   * @returns Character offset in the text
   */
  private positionToOffset(
    text: string,
    position: { line: number; character: number },
  ): number {
    let offset = 0;
    let currentLine = 0;

    for (let i = 0; i < text.length; i++) {
      if (currentLine === position.line) {
        return offset + position.character;
      }
      if (text[i] === "\n") {
        currentLine++;
      }
      offset++;
    }

    // If we reached the end, return the last position
    return text.length;
  }

  /**
   * Request completions from extension host via postMessage.
   * Deduplicates identical requests to avoid spamming Pylance.
   */
  private async requestCompletions(
    cellId: string,
    language: CellLanguage,
    position: { line: number; character: number },
  ): Promise<any[]> {
    // Create cache key to deduplicate identical requests
    const cacheKey = `${cellId}:${position.line}:${position.character}`;

    // Check if we already have an in-flight request for this exact position
    const cachedPromise = this.inflightCache.get(cacheKey);
    if (cachedPromise) {
      console.log(
        "🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Using cached request for",
        cacheKey,
      );
      return cachedPromise;
    }

    const requestId = `lsp-tab-${++this.requestCounter}`;

    // Send request to extension host
    const message = {
      type: "lsp-completion-request",
      requestId,
      cellId,
      language,
      position,
    };

    console.log(
      "🔍🔍🔍 [LSP-DEBUG-TabProvider] Sending message to extension host:",
      message,
    );
    vsCodeAPI.postMessage(message);

    // Wait for response with timeout
    const promise = new Promise<any[]>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(
          `🔍🔍🔍 [LSP-DEBUG-TabProvider] Request ${requestId} timed out`,
        );
        this.pendingRequests.delete(requestId);
        this.inflightCache.delete(cacheKey); // Clear cache on timeout
        resolve([]);
      }, 15000); // 15 second timeout (Pylance needs time to analyze files)

      this.pendingRequests.set(requestId, (completions: any[]) => {
        clearTimeout(timeout);
        this.inflightCache.delete(cacheKey); // Clear cache after completion
        resolve(completions);
      });
    });

    // Cache the promise to deduplicate concurrent requests
    this.inflightCache.set(cacheKey, promise);

    return promise;
  }

  /**
   * Dispose of the provider and clean up resources.
   */
  dispose(): void {
    console.log("🔥🐛LSP-COMPLETION-DEBUG🐛🔥 [TabProvider] Disposing");
    // Clear all pending requests
    this.pendingRequests.clear();
    // Clear in-flight cache
    this.inflightCache.clear();
    // Unregister from MessageHandler
    this.messageHandlerDisposable.dispose();
  }
}
