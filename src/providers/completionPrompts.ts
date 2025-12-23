/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * LLM prompt templates for inline completions.
 * Provides different prompts for code vs prose content types.
 *
 * @module providers/completionPrompts
 */

/**
 * Variables for code completion prompts.
 */
export interface CodeCompletionVars {
  /** Programming language (e.g., 'python', 'javascript') */
  language: string;
  /** Code before cursor */
  prefix: string;
  /** Code after cursor */
  suffix: string;
}

/**
 * Variables for prose completion prompts.
 */
export interface ProseCompletionVars {
  /** Text before cursor */
  prefix: string;
  /** Text after cursor */
  suffix: string;
}

/**
 * Generate prompt for code completions.
 * Focuses on completing code at cursor position.
 *
 * @param vars - Code context variables
 * @returns Formatted prompt string
 *
 * @example
 * ```typescript
 * const prompt = getCodeCompletionPrompt({
 *   language: 'python',
 *   prefix: 'def calculate_sum(a, b):\n    ',
 *   suffix: '\n    return result'
 * });
 * ```
 */
export function getCodeCompletionPrompt(vars: CodeCompletionVars): string {
  return `Complete the following ${vars.language} code. Only return the completion, no explanations or markdown.

\`\`\`${vars.language}
${vars.prefix}<CURSOR>${vars.suffix}
\`\`\`

Complete the code at <CURSOR>:`;
}

/**
 * Generate prompt for prose/writing completions.
 * Focuses on natural language continuation.
 *
 * @param vars - Prose context variables
 * @returns Formatted prompt string
 *
 * @example
 * ```typescript
 * const prompt = getProseCompletionPrompt({
 *   prefix: 'The main objective of this research is to',
 *   suffix: 'using machine learning techniques.'
 * });
 * ```
 */
export function getProseCompletionPrompt(vars: ProseCompletionVars): string {
  return `You are a writing assistant. Continue the following text naturally at <CURSOR>.

Your response should:
- Flow naturally from the existing text
- Match the tone and style of the context
- Be concise (1-3 sentences maximum)
- Only provide the text to insert (no explanations, no markdown formatting, no code blocks)

Context:
${vars.prefix}<CURSOR>${vars.suffix}

Suggested completion:`;
}

/**
 * Get appropriate prompt based on content type.
 *
 * @param contentType - 'code' or 'prose'
 * @param vars - Context variables (language for code, prefix/suffix for both)
 * @returns Formatted prompt string
 */
export function getPromptForContentType(
  contentType: "code" | "prose",
  vars: { language?: string; prefix: string; suffix: string },
): string {
  if (contentType === "code") {
    return getCodeCompletionPrompt({
      language: vars.language || "python",
      prefix: vars.prefix,
      suffix: vars.suffix,
    });
  } else {
    return getProseCompletionPrompt({
      prefix: vars.prefix,
      suffix: vars.suffix,
    });
  }
}
