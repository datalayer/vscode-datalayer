/*
 * Copyright (c) 2024-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code Language Model integration for Lexical inline completions.
 * Bridges Lexical webview with VS Code's LLM API (Copilot and other providers).
 *
 * @module webview/services/completion/lexicalLLMProvider
 *
 * @remarks
 * This provider:
 * - Implements IInlineCompletionProvider for use with LexicalInlineCompletionPlugin
 * - Uses message passing to request completions from VS Code extension host
 * - Supports GitHub Copilot and any other registered VS Code language models
 * - Handles prefix overlap detection to extract only new completion text
 * - Times out requests after 15 seconds to prevent hanging
 *
 * @example
 * ```typescript
 * const provider = new LexicalVSCodeLLMProvider();
 * <LexicalInlineCompletionPlugin providers={[provider]} />
 * ```
 */

import { vsCodeAPI } from "../messageHandler";

/**
 * Provider interface for LLM completion services.
 * Matches @datalayer/jupyter-lexical interface.
 */
interface IInlineCompletionProvider {
  readonly name: string;
  fetch(
    request: CompletionRequest,
    context: CompletionContext,
  ): Promise<CompletionList>;
}

/**
 * Completion request sent to provider.
 */
interface CompletionRequest {
  /** Full cell text */
  text: string;
  /** Cursor position in text */
  offset: number;
  /** Programming language (e.g., 'python') */
  language?: string;
}

/**
 * Context information for completion request.
 */
interface CompletionContext {
  /** Text before cursor */
  before: string;
  /** Text after cursor */
  after: string;
}

/**
 * List of completion suggestions from provider.
 */
interface CompletionList {
  /** Array of completion items */
  items: CompletionItem[];
}

/**
 * Single completion suggestion.
 */
interface CompletionItem {
  /** Text to insert if accepted */
  insertText: string;
}

/**
 * VS Code LLM completion provider for Lexical cells.
 * Bridges webview with extension host's Language Model API access.
 *
 * @remarks
 * Communication flow:
 * 1. Lexical plugin calls fetch() with code context
 * 2. Provider sends message to extension host via vsCodeAPI
 * 3. Extension host calls VS Code Language Model API (Copilot)
 * 4. Response sent back via message passing
 * 5. Provider extracts new text (removes prefix overlap)
 * 6. Returns completion to Lexical plugin
 */
export class LexicalVSCodeLLMProvider implements IInlineCompletionProvider {
  /** Provider display name */
  readonly name = "VS Code Copilot (Lexical)";
  /** Provider unique identifier */
  readonly identifier = "@vscode/llm-copilot-lexical";

  constructor() {
    // Provider is ready immediately - no initialization needed
  }

  /**
   * Fetches code completion from VS Code's Language Model API.
   * Handles prefix overlap detection to return only new text.
   *
   * @param request - Code text and cursor position
   * @param context - Code before and after cursor
   * @returns Promise with completion suggestions
   *
   * @remarks
   * The LLM may return full completion including typed prefix.
   * This method extracts only the new text to insert after cursor.
   */
  async fetch(
    request: CompletionRequest,
    context: CompletionContext,
  ): Promise<CompletionList> {
    try {
      // Use the context before/after or extract from request
      const prefix =
        context.before || request.text.substring(0, request.offset);
      const suffix = context.after || request.text.substring(request.offset);
      const language = request.language || "python";

      // Call VS Code Language Model API via message passing
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

      // Remove trailing newlines to prevent extra spacing in ghost text
      // This fixes issue when typing above blank lines
      insertText = insertText.replace(/\n+$/, "");

      return {
        items: [
          {
            insertText,
          },
        ],
      };
    } catch (error) {
      console.error("[LexicalVSCodeLLMProvider] Error in fetch():", error);
      return { items: [] };
    }
  }

  /**
   * Requests completion from extension host via message passing.
   * Implements request/response pattern with timeout protection.
   *
   * @param prefix - Code before cursor
   * @param suffix - Code after cursor
   * @param language - Programming language identifier
   * @returns Completion text or null if timeout/error
   *
   * @remarks
   * Uses request ID matching to correlate responses.
   * Times out after 15 seconds to prevent hanging webview.
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
